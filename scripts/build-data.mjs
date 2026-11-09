// Pulls every series used by the site from the FRED API and writes the page data files:
//   site/data.json      PPI (series.json)
//   site/spending.json  Census construction spending (spending.json)
//   site/labor.json     Labor and productivity (labor.json)
// Requires Node 20+ (built-in fetch) and FRED_API_KEY. No npm packages.
// A dataset with too many failed series is skipped (its published file stays as-is) and the run exits non-zero,
// so GitHub emails the owner; the other datasets still publish.
import { readFile, writeFile } from 'node:fs/promises';
import { computeDashboard } from './compute.mjs';
import { computeSpending } from './compute-spending.mjs';
import { computeLabor } from './compute-labor.mjs';

const ROOT = new URL('..', import.meta.url);
const KEY = process.env.FRED_API_KEY;
const MAX_FAILURES = 3;

if (!KEY) {
  console.error('FRED_API_KEY is not set. Add it as a repository secret (Settings > Secrets and variables > Actions).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJson = async (p) => JSON.parse(await readFile(new URL(p, ROOT), 'utf8'));
const readPrev = async (p) => { try { return await readJson(p); } catch { return null; } };

async function fred(path, params) {
  const url = new URL(`https://api.stlouisfed.org/fred/${path}`);
  for (const [k, v] of Object.entries({ ...params, api_key: KEY, file_type: 'json' })) url.searchParams.set(k, v);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'construction-ppi-dashboard' } });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 400 || res.status === 404) break;
    } catch (e) { lastErr = e; }
    await sleep(1500 * attempt);
  }
  throw lastErr;
}

const levels = {};
const titles = {};
const failed = new Set();

async function pull(id, start, withTitle) {
  if (levels[id] || failed.has(id)) return;
  try {
    const obs = await fred('series/observations', { series_id: id, observation_start: start });
    levels[id] = obs.observations.filter((o) => o.value !== '.' && o.value !== '').map((o) => [o.date.slice(0, 7), Number(o.value)]);
    if (withTitle) titles[id] = (await fred('series', { series_id: id })).seriess?.[0]?.title ?? null;
  } catch (e) {
    failed.add(id);
    console.warn(`  ${id}: ${e.message}`);
  }
  await sleep(450); // stay well under FRED's 120 requests/minute
}

const ppiCfg = await readJson('series.json');
const spCfg = await readJson('spending.json');
const lbCfg = await readJson('labor.json');
const prev = { ppi: await readPrev('site/data.json'), spending: await readPrev('site/spending.json'), labor: await readPrev('site/labor.json') };

for (const s of ppiCfg.series) await pull(s.id, ppiCfg.historyStart, true);
const spIds = [...new Set(spCfg.markets.flatMap((m) => [m.saar, m.nsa, m.private, m.public]).filter(Boolean)), spCfg.deflator];
for (const id of spIds) await pull(id, spCfg.historyStart, false);
for (const s of lbCfg.series) await pull(s.id, lbCfg.historyStart, true);

const optional = new Set(spCfg.markets.flatMap((m) => (m.optional || []).map((k) => m[k])));
const failedIn = (ids) => ids.filter((id) => failed.has(id) && !optional.has(id));
let skipped = 0;
const strip = (d) => d && JSON.stringify({ ...d, generatedAt: null });
const now = new Date().toISOString();

async function publish(name, file, ids, build) {
  const bad = failedIn(ids);
  if (bad.length > MAX_FAILURES) {
    console.error(`${name}: ${bad.length} series failed (${bad.join(', ')}). Keeping the published ${file} unchanged.`);
    skipped++;
    return null;
  }
  const data = build();
  data.failedSeries = bad;
  if (strip(prev[name]) === strip(data)) console.log(`${name}: no new data (${data.dataMonthLabel}).`);
  else { await writeFile(new URL(file, ROOT), JSON.stringify(data)); console.log(`${name}: updated ${file}, latest ${data.dataMonthLabel}.`); }
  return data;
}

// PPI: fall back to last published history for a failed series so one bad pull doesn't blank a row.
for (const s of ppiCfg.series) {
  if (!levels[s.id] && prev.ppi) {
    const p = prev.ppi.series.find((x) => x.id === s.id);
    if (p) { levels[s.id] = prev.ppi.months.map((m, i) => [m, p.history[i]]).filter(([, v]) => v != null); titles[s.id] = p.title; }
  }
}
await publish('ppi', 'site/data.json', ppiCfg.series.map((s) => s.id), () => computeDashboard(ppiCfg, levels, titles, now));
const spending = await publish('spending', 'site/spending.json', spIds, () => computeSpending(spCfg, levels, now));
await publish('labor', 'site/labor.json', lbCfg.series.map((s) => s.id), () => {
  const d = computeLabor(lbCfg, levels, spending ?? prev.spending, now);
  d.series.forEach((s) => { s.title = titles[s.id] ?? null; });
  return d;
});

await writeFile(new URL('last-checked.txt', ROOT), `${now}\n`);
if (failed.size) console.warn(`Series that failed this run: ${[...failed].join(', ')}`);
if (skipped) process.exit(1);
