# LEMOINE Construction Dashboards

A static website with four pages that update themselves from FRED, with no manual steps:

| Page | File | Data |
|---|---|---|
| Producer Prices | `site/index.html` | `site/data.json`, built from `series.json` (BLS PPI) |
| Escalation Planner | `site/escalation.html` | `site/data.json` (selling-price indexes) |
| Spending & Markets | `site/spending.html` | `site/spending.json`, built from `spending.json` (Census construction spending) |
| Labor & Productivity | `site/labor.html` | `site/labor.json`, built from `labor.json` (BLS jobs, pay, openings) |

## How it works

| Piece | What it does |
|---|---|
| `series.json`, `spending.json`, `labor.json` | The tracked series (FRED IDs, display names, groups). Edit these to add or drop a series. |
| `scripts/build-data.mjs` | Pulls every series from the FRED API and writes the three data files. |
| `scripts/compute*.mjs` | All the math. Pure functions, no I/O. |
| `site/assets/` | Shared styles, chart code and the LEMOINE logo (approved file, unaltered). No external libraries. |
| `.github/workflows/update.yml` | Runs the pull twice a week, commits any new data, and publishes `site/` to GitHub Pages. |
| `.github/workflows/find-series.yml`, `scripts/find-series.mjs` | Manual utility to look up FRED series IDs and Census spending codes. |

**Schedule.** Mondays and Thursdays at 15:17 UTC. BLS releases PPI mid-month, jobs on the first Friday, and Census spending on the first business day, so new data appears within a few days. Every run commits `last-checked.txt`, which also stops GitHub from disabling the schedule for inactivity.

## Method

**PPI.** Every percent change compares averages of raw index levels (avg/avg), never FRED's pre-computed year-over-year figures.

| Column | Calculation |
|---|---|
| Annual (4 most recent full years) | Calendar-year average index vs the prior year's average |
| YTD | Average from January through the latest month vs the same months a year earlier |
| Last 3 months | Average of the latest 3 months vs the same 3 months a year earlier |
| Latest month | Latest month's index vs the same month a year earlier |
| Quarterly view | Average of each complete quarter vs the same quarter a year earlier, plus the latest quarter vs the prior quarter |

**Cost vs selling price.** Material PPIs are cost indexes and exclude labor, overhead and margin. Building-type and trade-contractor PPIs are selling-price indexes. The Escalation Planner defaults to selling-price indexes and labels material indexes as cost only.

**Escalation Planner.** Midpoint = start + half the duration. Factor = (1 + annual rate) ^ (months from pricing date to midpoint ÷ 12). Trailing rates are compound annual changes between 12-month average index levels.

**Spending.** Census value put in place, seasonally adjusted annual rate. Year to date sums the not-seasonally-adjusted monthly values. Constant dollars restate each month in the latest month's prices using PPI WPU801 (new nonresidential building construction, a selling-price index). Nonresidential Buildings is the sum of the building markets.

**Productivity.** Real Nonresidential Buildings spending divided by nonresidential building plus nonresidential specialty trade jobs. Indexes use 2019 average = 100.

**Flags.** A PPI series with an identical index value for 3 or more straight months is marked "No new price," since that usually means BLS carried a value forward.

## Setup (one time)

1. Repo **Settings > Secrets and variables > Actions**: add `FRED_API_KEY` (free at fred.stlouisfed.org/docs/api/api_key.html). `CENSUS_API_KEY` is optional and used only by the lookup utility.
2. Repo **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. **Actions** tab > "Update PPI data and publish" > **Run workflow**.

## Routine tasks

- **Force an update now:** Actions > "Update PPI data and publish" > Run workflow.
- **Add or remove a series:** edit the matching `.json` config and commit. The push triggers a rebuild.
- **Find a series ID:** Actions > "Find FRED series" > Run workflow, and enter search phrases separated by `|`. The results are in the run log.
- **A run failed:** GitHub emails the repo owner. Open the run log. Each data file is built independently. A file with one to three failed series still publishes and lists them on its page; more than three leaves that file unchanged while the others publish.
- **Rotate an API key:** update the secret. No code change.

## Moving to another host

The site is plain files. Copy `site/` to any static web host and schedule `node scripts/build-data.mjs` (Node 20+, `FRED_API_KEY` set) before each publish. To move to a LEMOINE GitHub organization, use Settings > Transfer ownership; the new owner re-adds the secrets and re-enables Pages.

## Run locally

```
FRED_API_KEY=your_key node scripts/build-data.mjs
npx serve site     # or any static file server, then open the printed URL
```

## Sources

U.S. Bureau of Labor Statistics (Producer Price Index, Current Employment Statistics, JOLTS, State and Metro Area Employment) and U.S. Census Bureau (Value of Construction Put in Place), retrieved through FRED, Federal Reserve Bank of St. Louis. PPI table layout adapted from Ed Zarenski's tables (edzarenski.com).
