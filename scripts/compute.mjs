// Pure calculation module. No I/O, so the same code runs in the GitHub Action and in a browser check.
// Method: every % change compares averages of raw index levels (avg/avg), never FRED's pre-computed YoY.

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function addMonths(ym, n) {
  const [y, m] = ym.split('-').map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
}

export function monthRange(from, to) {
  const out = [];
  for (let m = from; m <= to; m = addMonths(m, 1)) out.push(m);
  return out;
}

const shortYr = (y) => `'${String(y).slice(2)}`;
const monLabel = (ym) => MON[Number(ym.slice(5, 7)) - 1];

function avgOf(map, months) {
  let s = 0;
  for (const m of months) {
    const v = map.get(m);
    if (v == null) return null;
    s += v;
  }
  return s / months.length;
}

function pct(a, b) {
  if (a == null || b == null || b === 0) return null;
  return Math.round((a / b - 1) * 1000) / 10;
}

function median(xs) {
  const v = xs.filter((x) => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return Math.round((v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2) * 10) / 10;
}

// The data month is the latest month reported by most material series.
function pickLatestMonth(levels, ids) {
  const counts = {};
  for (const id of ids) {
    const obs = levels[id] || [];
    if (!obs.length) continue;
    const last = obs[obs.length - 1][0];
    counts[last] = (counts[last] || 0) + 1;
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? 1 : -1))[0]?.[0] ?? null;
}

// Months at the end of the series with an identical value: BLS carry-forward rather than real stability.
function staleSince(obs) {
  if (obs.length < 3) return null;
  const last = obs[obs.length - 1][1];
  let i = obs.length - 1;
  while (i > 0 && obs[i - 1][1] === last) i--;
  const run = obs.length - i;
  return run >= 3 ? obs[i][0] : null;
}

/**
 * @param {object} config  parsed series.json
 * @param {Record<string, Array<[string, number]>>} levels  id -> [['YYYY-MM', value], ...] ascending
 * @param {Record<string, string>} titles  id -> official FRED title (optional)
 * @param {string} generatedAt  ISO timestamp
 */
export function computeDashboard(config, levels, titles = {}, generatedAt = new Date().toISOString()) {
  const materialIds = config.series.filter((s) => s.kind === 'material').map((s) => s.id);
  const L = pickLatestMonth(levels, materialIds);
  if (!L) throw new Error('No material series returned data.');
  const Ly = Number(L.slice(0, 4));
  const Lm = Number(L.slice(5, 7));

  const ytdNow = monthRange(`${Ly}-01`, L);
  const ytdPrior = ytdNow.map((m) => addMonths(m, -12));
  const q3Now = monthRange(addMonths(L, -2), L);
  const q3Prior = q3Now.map((m) => addMonths(m, -12));
  const years = [Ly - 4, Ly - 3, Ly - 2, Ly - 1];

  const columns = [
    ...years.map((y) => ({ key: `y${y}`, label: String(y), group: 'Annual', desc: `${y} average index vs ${y - 1} average` })),
    { key: 'ytd', label: Lm === 1 ? `Jan ${shortYr(Ly)}` : `YTD ${shortYr(Ly)}`, group: 'Current', desc: `Average of Jan–${monLabel(L)} ${Ly} vs Jan–${monLabel(L)} ${Ly - 1}` },
    { key: 'q3', label: `${monLabel(q3Now[0])}–${monLabel(L)} ${shortYr(Ly)}`, group: 'Current', desc: `Average of ${monLabel(q3Now[0])} ${q3Now[0].slice(0, 4)}–${monLabel(L)} ${Ly} vs the same 3 months a year earlier` },
    { key: 'latest', label: `${monLabel(L)} ${shortYr(Ly)}`, group: 'Current', desc: `${monLabel(L)} ${Ly} index vs ${monLabel(L)} ${Ly - 1}` },
  ];

  const historyStart = config.historyStart.slice(0, 7);
  const months = monthRange(historyStart, L);

  const series = config.series.map((s) => {
    const obs = (levels[s.id] || []).filter(([m]) => m <= L);
    const map = new Map(obs);
    const cols = {};
    for (const y of years) {
      const cur = monthRange(`${y}-01`, `${y}-12`);
      cols[`y${y}`] = pct(avgOf(map, cur), avgOf(map, cur.map((m) => addMonths(m, -12))));
    }
    cols.ytd = pct(avgOf(map, ytdNow), avgOf(map, ytdPrior));
    cols.q3 = pct(avgOf(map, q3Now), avgOf(map, q3Prior));
    cols.latest = pct(map.get(L), map.get(addMonths(L, -12)));
    const last = obs[obs.length - 1];
    return {
      id: s.id,
      name: s.name,
      short: s.short || s.name,
      title: titles[s.id] || null,
      group: s.group,
      kind: s.kind,
      note: s.note || null,
      volatile: !!s.volatile,
      cols,
      mom: pct(map.get(L), map.get(addMonths(L, -1))),
      lastMonth: last ? last[0] : null,
      lastValue: last ? last[1] : null,
      staleSince: staleSince(obs),
      history: months.map((m) => (map.has(m) ? map.get(m) : null)),
    };
  });

  // Simple average of the four trade contractor rows, column by column.
  const trades = series.filter((s) => s.kind === 'trade');
  const tradeAvg = {};
  for (const c of columns) {
    const vals = trades.map((t) => t.cols[c.key]);
    tradeAvg[c.key] = vals.some((v) => v == null) ? null : Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  const mats = series.filter((s) => s.kind === 'material' && s.cols.latest != null);
  const ranked = [...mats].sort((a, b) => b.cols.latest - a.cols.latest);
  const summary = {
    materialCount: mats.length,
    medianLatest: median(mats.map((s) => s.cols.latest)),
    medianYtd: median(mats.map((s) => s.cols.ytd)),
    up: mats.filter((s) => s.cols.latest > 0).length,
    down: mats.filter((s) => s.cols.latest < 0).length,
    gainers: ranked.slice(0, 5).map((s) => s.id),
    decliners: ranked.slice(-5).reverse().map((s) => s.id),
  };

  return {
    schema: 1,
    generatedAt,
    dataMonth: L,
    dataMonthLabel: `${MON[Lm - 1]} ${Ly}`,
    method: 'Percent change in average index level (avg/avg), computed from FRED monthly PPI index values.',
    source: 'U.S. Bureau of Labor Statistics Producer Price Index, via FRED (Federal Reserve Bank of St. Louis).',
    columns,
    months,
    series,
    tradeAvg,
    summary,
  };
}
