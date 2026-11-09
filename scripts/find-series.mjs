// Utility: search FRED (and Census construction spending) for series IDs.
// Usage: FRED_API_KEY=... CENSUS_API_KEY=... node scripts/find-series.mjs "construction spending health care|census:data center|census-data:A0DAT"
//   plain text       -> FRED series search (ID, frequency, seasonal adjustment, last observation, title)
//   census:<text>    -> Census construction spending (EITS VIP) category and data-type codes whose labels match
//   census-data:<cc> -> latest 6 months of values for a VIP category code, every data type
const KEY = process.env.FRED_API_KEY;
const CKEY = process.env.CENSUS_API_KEY;
const queries = process.argv.slice(2).flatMap((q) => q.split('|')).map((q) => q.trim()).filter(Boolean);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIP = 'https://api.census.gov/data/timeseries/eits/vip';

async function fredSearch(q) {
  const url = new URL('https://api.stlouisfed.org/fred/series/search');
  for (const [k, v] of Object.entries({ search_text: q, api_key: KEY, file_type: 'json', limit: '15', order_by: 'popularity', sort_order: 'desc' })) url.searchParams.set(k, v);
  const j = await (await fetch(url)).json();
  console.log(`\n=== ${q} (${j.count ?? 0} matches)`);
  for (const s of j.seriess || []) console.log(`${s.id.padEnd(24)} ${s.frequency_short} ${s.seasonal_adjustment_short.padEnd(5)} ${s.observation_end}  ${s.title}`);
}

async function censusCodes(text) {
  console.log(`\n=== census codes matching "${text}"`);
  for (const v of ['category_code', 'data_type_code']) {
    const res = await fetch(`${VIP}/variables/${v}.json`);
    if (!res.ok) { console.log(`${v}: HTTP ${res.status}`); continue; }
    const j = await res.json();
    const items = j.values?.item || {};
    const hits = Object.entries(items).filter(([code, label]) => !text || `${code} ${label}`.toLowerCase().includes(text.toLowerCase()));
    console.log(`${v}: ${Object.keys(items).length} codes, ${hits.length} match`);
    for (const [code, label] of hits) console.log(`  ${code.padEnd(14)} ${label}`);
  }
}

async function censusData(cc) {
  const url = new URL(VIP);
  url.searchParams.set('get', 'cell_value,data_type_code,category_code,seasonally_adj,time_slot_id,error_data');
  url.searchParams.set('category_code', cc);
  url.searchParams.set('time', 'from 2026-01');
  if (CKEY) url.searchParams.set('key', CKEY);
  const res = await fetch(url);
  console.log(`\n=== census data ${cc}: HTTP ${res.status}`);
  if (!res.ok) { console.log((await res.text()).slice(0, 300)); return; }
  const rows = await res.json();
  console.log(rows[0].join(' | '));
  for (const r of rows.slice(1).sort((a, b) => (a.at(-1) < b.at(-1) ? 1 : -1)).slice(0, 40)) console.log(r.join(' | '));
}

for (const q of queries) {
  if (q.startsWith('census:')) await censusCodes(q.slice(7).trim());
  else if (q.startsWith('census-data:')) await censusData(q.slice(12).trim());
  else if (KEY) await fredSearch(q);
  await sleep(700);
}
