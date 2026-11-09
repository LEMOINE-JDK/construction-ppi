// Construction spending by market. Pure functions, no I/O.
import { addMonths, monthRange } from './compute.mjs';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pct = (a, b) => (a == null || b == null || b === 0 ? null : Math.round((a / b - 1) * 1000) / 10);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

function lastMonthOf(obs) { return obs && obs.length ? obs[obs.length - 1][0] : null; }

/**
 * @param {object} config parsed spending.json
 * @param {Record<string, Array<[string, number]>>} levels id -> [['YYYY-MM', value]]
 */
export function computeSpending(config, levels, generatedAt = new Date().toISOString()) {
  // Data month: latest month of the nonresidential total (all markets publish together).
  const L = lastMonthOf(levels[config.markets.find((m) => m.key === 'nonres').saar]);
  if (!L) throw new Error('Nonresidential spending series returned no data.');
  const Ly = Number(L.slice(0, 4));
  const months = monthRange(config.historyStart.slice(0, 7), L);
  const get = (id) => new Map((levels[id] || []).filter(([m]) => m <= L));
  const P = get(config.deflator);
  // Last available deflator value at or before the data month, so real dollars are in "latest prices".
  let pL = null, pLMonth = null;
  for (let m = L; m >= months[0]; m = addMonths(m, -1)) if (P.has(m)) { pL = P.get(m); pLMonth = m; break; }
  const real = (map, m) => (map.has(m) && P.has(m) && pL ? (map.get(m) * pL) / P.get(m) : null);

  const ytdNow = monthRange(`${Ly}-01`, L);
  const ytdPrior = ytdNow.map((m) => addMonths(m, -12));
  const sum = (map, ms) => { let s = 0; for (const m of ms) { if (!map.has(m)) return null; s += map.get(m); } return s; };

  function marketBlock(meta, saarMap, nsaMap, privMap, pubMap) {
    const latest = saarMap.get(L) ?? null;
    const ytdCur = nsaMap ? sum(nsaMap, ytdNow) : null;
    const ytdPri = nsaMap ? sum(nsaMap, ytdPrior) : null;
    const realHist = months.map((m) => { const v = real(saarMap, m); return v == null ? null : Math.round(v); });
    const priv = privMap?.get(L), pub = pubMap?.get(L);
    return {
      ...meta,
      latest,
      mom: pct(latest, saarMap.get(addMonths(L, -1))),
      yoy: pct(latest, saarMap.get(addMonths(L, -12))),
      realYoy: pct(real(saarMap, L), real(saarMap, addMonths(L, -12))),
      ytd: ytdCur, ytdPrior: ytdPri, ytdPct: pct(ytdCur, ytdPri),
      privateShare: priv != null && latest ? r1((priv / latest) * 100) : null,
      publicShare: pub != null && latest ? r1((pub / latest) * 100) : null,
      history: months.map((m) => (saarMap.has(m) ? saarMap.get(m) : null)),
      realHistory: realHist,
    };
  }

  const markets = config.markets.map((mk) => {
    const meta = { key: mk.key, name: mk.name, group: mk.group, building: !!mk.building, ids: { saar: mk.saar, nsa: mk.nsa || null, private: mk.private || null, public: mk.public || null } };
    return marketBlock(meta, get(mk.saar), mk.nsa && levels[mk.nsa]?.length ? get(mk.nsa) : null, mk.private ? get(mk.private) : null, mk.public ? get(mk.public) : null);
  });

  // Nonresidential Buildings = sum of building markets, month by month (null if any is missing).
  const bld = config.markets.filter((m) => m.building);
  const sumMaps = (key) => {
    const out = new Map();
    for (const m of months) {
      let s = 0, ok = true;
      for (const b of bld) { const id = b[key]; const v = id ? levels[id] && get(id).get(m) : null; if (v == null) { ok = false; break; } s += v; }
      if (ok) out.set(m, s);
    }
    return out;
  };
  const agg = marketBlock({ key: 'nrbldg', name: 'Nonresidential Buildings (sum of building markets)', group: 'Totals', building: false, computed: true, ids: {} }, sumMaps('saar'), sumMaps('nsa'), null, null);
  markets.splice(2, 0, agg);

  return {
    schema: 1,
    generatedAt,
    dataMonth: L,
    dataMonthLabel: `${MON[Number(L.slice(5, 7)) - 1]} ${Ly}`,
    deflator: { id: config.deflator, month: pLMonth },
    units: 'Millions of dollars, seasonally adjusted annual rate (SAAR). Year-to-date uses actual (not seasonally adjusted) monthly dollars.',
    source: 'U.S. Census Bureau, Value of Construction Put in Place, via FRED (Federal Reserve Bank of St. Louis).',
    months,
    markets,
  };
}
