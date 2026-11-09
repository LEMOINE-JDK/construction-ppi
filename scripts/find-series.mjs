// Utility: search FRED for series IDs. Prints ID, title, frequency, seasonal adjustment and last observation.
// Usage: FRED_API_KEY=... node scripts/find-series.mjs "construction spending health care" "job openings construction"
const KEY = process.env.FRED_API_KEY;
if (!KEY) { console.error('FRED_API_KEY is not set.'); process.exit(1); }
const queries = process.argv.slice(2).flatMap((q) => q.split('|')).map((q) => q.trim()).filter(Boolean);
for (const q of queries) {
  const url = new URL('https://api.stlouisfed.org/fred/series/search');
  for (const [k, v] of Object.entries({ search_text: q, api_key: KEY, file_type: 'json', limit: '15', order_by: 'popularity', sort_order: 'desc' })) url.searchParams.set(k, v);
  const res = await fetch(url);
  const j = await res.json();
  console.log(`\n=== ${q} (${j.count ?? 0} matches)`);
  for (const s of j.seriess || []) console.log(`${s.id.padEnd(24)} ${s.frequency_short} ${s.seasonal_adjustment_short.padEnd(5)} ${s.observation_end}  ${s.title}`);
  await new Promise((r) => setTimeout(r, 700));
}
