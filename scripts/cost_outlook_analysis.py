"""Construction Cost Outlook: monthly analysis of the LEMOINE Construction Dashboards data.

Usage: python3 cost_outlook_analysis.py <path to construction-ppi repo clone>
Prints one JSON object of facts for the monthly newsletter. Reads only the repo's published data files:
  site/data.json (BLS PPI), site/spending.json (Census spending), site/labor.json (BLS jobs),
  data/zarenski-indices-*.json (Construction Analytics index table; latest file by name).
Every number in the newsletter must come from this output. No external libraries beyond numpy.
"""
import glob, json, os, sys
import numpy as np

repo = sys.argv[1] if len(sys.argv) > 1 else '.'
J = lambda p: json.load(open(os.path.join(repo, p)))
r1 = lambda v: None if v is None or (isinstance(v, float) and np.isnan(v)) else round(float(v), 1)

d = J('site/data.json'); M = d['months']; by = {s['id']: s for s in d['series']}
arr = lambda id: np.array([np.nan if v is None else v for v in by[id]['history']], float)
def yoy(a):
    r = np.full_like(a, np.nan); r[12:] = (a[12:] / a[:-12] - 1) * 100; return r
ann3 = lambda a: ((a[-1] / a[-4]) ** 4 - 1) * 100

bl, inp = arr('WPU801'), arr('WPUIP231200')
yb, yi = yoy(bl), yoy(inp)
gap = yi - yb
# Widest gap since: last earlier month whose gap was at least as large
since = next((M[i] for i in range(len(M) - 2, -1, -1) if not np.isnan(gap[i]) and gap[i] >= gap[-1]), None)

# Lead-lag: correlation of inputs YoY (t) with buildings YoY (t+k)
lag = {}
for k in range(0, 13):
    a, b = (yi[:-k], yb[k:]) if k else (yi, yb)
    ok = ~np.isnan(a) & ~np.isnan(b)
    lag[k] = float(np.corrcoef(a[ok], b[ok])[0, 1])
best = max(lag, key=lag.get)
a, b = yi[:-best], yb[best:]; ok = ~np.isnan(a) & ~np.isnan(b)
fit = np.polyfit(a[ok], b[ok], 1)
ex = [i for i in range(len(a)) if ok[i] and not ('2020-06' <= M[i] <= '2023-06')]
fit2 = np.polyfit(a[ex], b[ex], 1)
corr_ex = float(np.corrcoef(a[ex], b[ex])[0, 1])
implied = sorted([float(np.polyval(fit, yi[-1])), float(np.polyval(fit2, yi[-1]))])

mats = [s for s in d['series'] if s['kind'] == 'material' and s['cols']['latest'] is not None]
steady = [s for s in mats if not s['volatile'] and not s['id'].startswith('WPUIP')]
def m(s):
    a = arr(s['id']); return {'id': s['id'], 'name': s['name'], 'yoy': s['cols']['latest'], 'ann3': r1(ann3(a)), 'ytd': s['cols']['ytd']}
top = [m(s) for s in sorted(steady, key=lambda s: -s['cols']['latest'])[:6]]
bottom = [m(s) for s in sorted(steady, key=lambda s: s['cols']['latest'])[:4]]
accel = [m(s) for s in sorted(steady, key=lambda s: -ann3(arr(s['id'])))[:4]]
volatile = [m(s) for s in mats if s['volatile']]
bt = [{'id': s['id'], 'name': s['name'], 'kind': s['kind'], 'yoy': s['cols']['latest'], 'ytd': s['cols']['ytd'], 'mom': s['mom']}
      for s in d['series'] if s['kind'] in ('building', 'trade')]
stale = [s['name'] for s in d['series'] if s['staleSince']]

# Construction Analytics forecast (latest table)
zf = sorted(glob.glob(os.path.join(repo, 'data/zarenski-indices-*.json')))[-1]
z = json.load(open(zf)); yrs = z['years']
zs = {s['name']: s['values'] for g in z['groups'] for s in g['series']}
def zg(name, y):
    v = zs.get(name); i = yrs.index(y) if y in yrs else None
    return r1((v[i] / v[i - 1] - 1) * 100) if v and i and v[i] and v[i - 1] else None
L = d['dataMonth']; Ly = int(L[:4])
ca = {'file': os.path.basename(zf), 'source': z['source'],
      'nonres_bldg': {str(y): zg('CA Nonresidential Bldgs', y) for y in (Ly, Ly + 1)},
      'ppi_inputs': {str(y): zg('PPI Inputs to Nonres Bldgs', y) for y in (Ly, Ly + 1)}}

# Spending
sp = J('site/spending.json'); SM = sp['months']
def mk(x):
    h = np.array([np.nan if v is None else v for v in x['history']]); r = np.array([np.nan if v is None else v for v in x['realHistory']])
    rp = int(np.nanargmax(r))
    return {'key': x['key'], 'name': x['name'], 'group': x['group'], 'saar_bil': r1(x['latest'] / 1000), 'mom': x['mom'], 'yoy': x['yoy'],
            'real_yoy': x['realYoy'], 'ytd_pct': x['ytdPct'], 'real_peak': SM[rp], 'real_off_peak': r1((r[-1] / r[rp] - 1) * 100),
            'last3_vs_prior3': r1((np.nanmean(h[-3:]) / np.nanmean(h[-6:-3]) - 1) * 100)}
spend = [mk(x) for x in sp['markets']]

# Labor
lb = J('site/labor.json'); LM = lb['months']; lby = {x['id']: x for x in lb['series']}
P = lb['productivity']; pwi = [v for v in P['perWorkerIndex'] if v is not None]
# Peak since 2021, skipping the 2020 pandemic spike (jobs fell faster than spending)
pwa = np.array([np.nan if v is None or LM[i] < '2021-01' else v for i, v in enumerate(P['perWorkerIndex'])], float)
pk = int(np.nanargmax(pwa))
def ls(id):
    x = lby.get(id)
    if not x: return None
    h = np.array([np.nan if v is None else v for v in x['history']]); i = np.where(~np.isnan(h))[0][-1]
    return {'name': x['name'], 'month': LM[i], 'latest': r1(h[i]), 'mom_abs': x.get('momAbs'), 'yoy_pct': x.get('yoyPct'),
            'yoy_abs': x.get('yoyAbs'), 'two_yr_pct': r1((h[i] / h[i - 24] - 1) * 100) if i >= 24 else None}
labor = {k: ls(v) for k, v in {'us_jobs_k': 'USCONS', 'nonres_bldg_jobs_k': 'CES2023620001', 'nonres_trade_jobs_k': 'CES2023800201',
         'hourly_earnings': 'CES2000000003', 'openings_rate': 'JTS2300JOR', 'quits_rate': 'JTS2300QUR', 'unemployment_nsa': 'LNU04032231',
         'louisiana_k': 'LACONS', 'baton_rouge_k': 'SMU22129402000000001SA', 'new_orleans_k': 'SMU22353802000000001SA',
         'lafayette_k': 'SMU22291802000000001SA'}.items()}
labor['productivity'] = {'month': P['latestMonth'], 'jobs_yoy': P['jobsYoy'], 'real_volume_yoy': P['volumeYoy'], 'per_worker_yoy': P['perWorkerYoy'],
                         'per_worker_index': r1(pwi[-1]), 'per_worker_peak_index': r1(P['perWorkerIndex'][pk]), 'per_worker_peak_month': LM[pk]}

out = {
    'data_months': {'ppi': d['dataMonthLabel'], 'spending': sp['dataMonthLabel'], 'labor': lb['dataMonthLabel'], 'checked': d['generatedAt'][:10]},
    'prices': {'buildings_yoy': r1(yb[-1]), 'buildings_mom': by['WPU801']['mom'], 'buildings_ytd': by['WPU801']['cols']['ytd'], 'buildings_ann3': r1(ann3(bl)),
               'inputs_yoy': r1(yi[-1]), 'inputs_mom': by['WPUIP231200']['mom'], 'inputs_ytd': by['WPUIP231200']['cols']['ytd'], 'inputs_ann3': r1(ann3(inp)),
               'gap_pts': r1(gap[-1]), 'gap_prior_month_pts': r1(gap[-2]), 'gap_widest_since': since,
               'trade_avg_yoy': d['tradeAvg']['latest'], 'materials_up': d['summary']['up'], 'materials_down': d['summary']['down'],
               'materials_count': d['summary']['materialCount'], 'materials_median_yoy': d['summary']['medianLatest']},
    'lead_lag': {'best_lead_months': best, 'corr': round(lag[best], 2), 'corr_excl_2020_23': round(corr_ex, 2),
                 'implied_buildings_yoy_range': [r1(implied[0]), r1(implied[1])], 'implied_for_month': None,
                 'note': 'Simple regression of buildings YoY on inputs YoY lagged; an estimate of direction, not a forecast.'},
    'construction_analytics_forecast': ca,
    'materials_top': top, 'materials_bottom': bottom, 'materials_accelerating': accel, 'volatile': volatile,
    'buildings_and_trades': bt, 'no_new_price': stale,
    'spending': spend, 'labor': labor,
}
y, mo = map(int, L.split('-')); t = y * 12 + mo - 1 + best
out['lead_lag']['implied_for_month'] = f"{t // 12}-{t % 12 + 1:02d}"
print(json.dumps(out, indent=1))
