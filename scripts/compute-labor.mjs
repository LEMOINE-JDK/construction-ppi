// Construction labor and productivity. Pure functions, no I/O.
import { addMonths, monthRange } from './compute.mjs';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pct = (a, b) => (a == null || b == null || b === 0 ? null : Math.round((a / b - 1) * 1000) / 10);
const r = (v, d = 1) => (v == null ? null : Math.round(v * 10 ** d) / 10 ** d);
const label = (ym) => `${MON[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

/**
 * @param {object} config parsed labor.json
 * @param {Record<string, Array<[string, number]>>} levels
 * @param {object} spending output of computeSpending (for Nonresidential Buildings volume)
 */
export function computeLabor(config, levels, spending, generatedAt = new Date().toISOString()) {
  const lastMonths = config.series.map((s) => (levels[s.id] || []).at(-1)?.[0]).filter(Boolean).sort();
  const end = lastMonths.at(-1);
  if (!end) throw new Error('No labor series returned data.');
  const months = monthRange(config.historyStart.slice(0, 7), end);

  const series = config.series.map((s) => {
    const map = new Map(levels[s.id] || []);
    const obs = levels[s.id] || [];
    const last = obs.at(-1);
    const L = last?.[0] ?? null;
    const v = last?.[1] ?? null;
    const prev = L ? map.get(addMonths(L, -1)) : null;
    const yago = L ? map.get(addMonths(L, -12)) : null;
    return {
      id: s.id, name: s.name, group: s.group, unit: s.unit, nsa: !!s.nsa,
      lastMonth: L, latest: v,
      // Rates change in points; levels change in percent (jobs also in absolute thousands).
      momAbs: v != null && prev != null ? r(v - prev, s.unit === 'usd' ? 2 : 1) : null,
      yoyAbs: v != null && yago != null ? r(v - yago, s.unit === 'usd' ? 2 : 1) : null,
      yoyPct: s.unit === 'pct' ? null : pct(v, yago),
      history: months.map((m) => (map.has(m) ? map.get(m) : null)),
    };
  });

  // Productivity: real Nonresidential Buildings put-in-place (SAAR, latest prices) per nonres worker.
  const nonresIds = config.series.filter((s) => s.nonresJobs).map((s) => s.id);
  const jobsMaps = nonresIds.map((id) => new Map(levels[id] || []));
  const bld = spending?.markets.find((m) => m.key === 'nrbldg');
  const volMap = new Map((spending?.months || []).map((m, i) => [m, bld?.realHistory[i] ?? null]));
  const prod = { months: [], jobs: [], volume: [], perWorker: [] };
  for (const m of months) {
    const jobs = jobsMaps.every((mp) => mp.has(m)) ? jobsMaps.reduce((a, mp) => a + mp.get(m), 0) : null;
    const vol = volMap.get(m) ?? null;
    prod.months.push(m);
    prod.jobs.push(jobs == null ? null : r(jobs, 1));
    prod.volume.push(vol);
    // $ millions SAAR / thousands of workers = $ thousands per worker per year.
    prod.perWorker.push(jobs && vol ? r(vol / jobs, 1) : null);
  }
  const base = (arr) => { // average of 2019 values = 100
    const idx = prod.months.map((m, i) => (m.startsWith('2019-') ? arr[i] : null)).filter((x) => x != null);
    return idx.length === 12 ? idx.reduce((a, b) => a + b, 0) / 12 : null;
  };
  const toIndex = (arr) => { const b = base(arr); return arr.map((x) => (x == null || !b ? null : r((x / b) * 100, 1))); };
  let li = prod.perWorker.length - 1; while (li > 0 && prod.perWorker[li] == null) li--;
  const productivity = {
    jobsIndex: toIndex(prod.jobs),
    volumeIndex: toIndex(prod.volume),
    perWorkerIndex: toIndex(prod.perWorker),
    perWorker: prod.perWorker,
    latestMonth: prod.perWorker[li] != null ? prod.months[li] : null,
    latestPerWorker: prod.perWorker[li] ?? null,
    perWorkerYoy: li >= 12 ? pct(prod.perWorker[li], prod.perWorker[li - 12]) : null,
    jobsYoy: li >= 12 ? pct(prod.jobs[li], prod.jobs[li - 12]) : null,
    volumeYoy: li >= 12 ? pct(prod.volume[li], prod.volume[li - 12]) : null,
    method: `Real Nonresidential Buildings spending (Census SAAR, restated in ${spending?.deflator?.month ? label(spending.deflator.month) : 'latest'} prices with PPI ${spending?.deflator?.id ?? 'WPU801'}) divided by nonresidential building plus nonresidential specialty trade jobs (BLS). Indexes: 2019 average = 100.`,
  };

  return {
    schema: 1,
    generatedAt,
    dataMonth: end,
    dataMonthLabel: label(end),
    source: 'U.S. Bureau of Labor Statistics (Current Employment Statistics, JOLTS, State and Metro Area Employment, CPS) and U.S. Census Bureau, via FRED.',
    months,
    series,
    productivity,
  };
}
