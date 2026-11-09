// Pulls every series in series.json from the FRED API and writes site/data.json.
// Requires Node 20+ (built-in fetch) and the FRED_API_KEY environment variable. No npm packages.
import { readFile, writeFile } from 'node:fs/promises';
import { computeDashboard } from './compute.mjs';

const ROOT = new URL('..', import.meta.url);
const KEY = process.env.FRED_API_KEY;
const MAX_FAILURES = 3; // above this, stop and keep the published data as-is

if (!KEY) {
  console.error('FRED_API_KEY is not set. Add it as a repository secret (Settings > Secrets and variables > Actions).');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fred(path, params) {
  const url = new URL(`https://api.stlouisfed.org/fred/${path}`);
  for (const [k, v] of Object.entries({ ...params, api_key: KEY, file_type: 'json' })) url.searchParams.set(k, v);
  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'construction-ppi-dashboard' } });
      if (res.ok) return await res.json();
      lastErr = new Error(`HTTP ${res.status}`);
      if (res.status === 400 || res.status === 404) break; // bad series id: retrying won't help
    } catch (e) {
      lastErr = e;
    }
    await sleep(1500 * attempt);
  }
  throw lastErr;
}

async function loadPrevious() {
  try {
    return JSON.parse(await readFile(new URL('site/data.json', ROOT), 'utf8'));
  } catch {
    return null;
  }
}

const config = JSON.parse(await readFile(new URL('series.json', ROOT), 'utf8'));
const previous = await loadPrevious();
const levels = {};
const titles = {};
const failures = [];

for (const s of config.series) {
  try {
    const [obs, meta] = await Promise.all([
      fred('series/observations', { series_id: s.id, observation_start: config.historyStart }),
      fred('series', { series_id: s.id }),
    ]);
    levels[s.id] = obs.observations
      .filter((o) => o.value !== '.' && o.value !== '')
      .map((o) => [o.date.slice(0, 7), Number(o.value)]);
    titles[s.id] = meta.seriess?.[0]?.title ?? null;
  } catch (e) {
    failures.push(`${s.id}: ${e.message}`);
    // Fall back to last published history so one bad pull doesn't blank a row.
    const prev = previous?.series.find((p) => p.id === s.id);
    if (prev) {
      levels[s.id] = previous.months.map((m, i) => [m, prev.history[i]]).filter(([, v]) => v != null);
      titles[s.id] = prev.title;
    }
  }
  await sleep(600); // stay well under FRED's 120 requests/minute
}

if (failures.length) console.warn(`Series that failed to update:\n  ${failures.join('\n  ')}`);
if (failures.length > MAX_FAILURES) {
  console.error(`${failures.length} series failed. Keeping the published data unchanged.`);
  process.exit(1);
}

const data = computeDashboard(config, levels, titles, new Date().toISOString());
data.failedSeries = failures.map((f) => f.split(':')[0]);

// Only rewrite data.json when the numbers changed, so the history shows real data updates.
const strip = (d) => d && JSON.stringify({ ...d, generatedAt: null });
if (strip(previous) === strip(data)) {
  console.log(`No new data. Latest month is still ${data.dataMonthLabel}.`);
} else {
  await writeFile(new URL('site/data.json', ROOT), JSON.stringify(data));
  console.log(`Updated data.json. Latest month: ${data.dataMonthLabel}.`);
}
await writeFile(new URL('last-checked.txt', ROOT), `${new Date().toISOString()}\n`);
