# LEMOINE Construction PPI Dashboard

A static website that tracks Producer Price Index (PPI) changes for construction materials, new nonresidential building types, and trade contractors. It updates itself from FRED with no manual steps.

## How it works

| Piece | What it does |
|---|---|
| `series.json` | The list of tracked series (FRED IDs, display names, groups). Edit this to add or drop a series. |
| `scripts/build-data.mjs` | Pulls monthly index levels for every series from the FRED API and writes `site/data.json`. |
| `scripts/compute.mjs` | All the math. Pure functions, no I/O. |
| `site/index.html` | The dashboard page. Reads `data.json`. No build step and no external libraries. |
| `.github/workflows/update.yml` | Runs the pull twice a week, commits any new data, and publishes `site/` to GitHub Pages. |

**Schedule.** Mondays and Thursdays at 15:17 UTC. BLS releases PPI around mid-month, so new data appears within a few days of release. Every run commits `last-checked.txt`, which also stops GitHub from disabling the schedule for inactivity.

**Method.** Every percent change compares averages of raw index levels (avg/avg), never FRED's pre-computed year-over-year figures.

| Column | Calculation |
|---|---|
| Annual (4 most recent full years) | Calendar-year average index vs the prior year's average |
| YTD | Average from January through the latest month vs the same months a year earlier |
| Last 3 months | Average of the latest 3 months vs the same 3 months a year earlier |
| Latest month | Latest month's index vs the same month a year earlier |
| MoM | Latest month vs the prior month |

Columns roll forward automatically when a new year's data arrives.

**Flags.** A series with an identical index value for 3 or more straight months is marked "No new price," since that usually means BLS carried a value forward.

## Setup (one time)

1. Repo **Settings > Secrets and variables > Actions > New repository secret**: name `FRED_API_KEY`, value = a FRED API key (free at fred.stlouisfed.org/docs/api/api_key.html).
2. Repo **Settings > Pages > Build and deployment > Source: GitHub Actions**.
3. **Actions** tab > "Update PPI data and publish" > **Run workflow**.

## Routine tasks

- **Force an update now:** Actions tab > "Update PPI data and publish" > Run workflow.
- **Add or remove a series:** edit `series.json` and commit. The push triggers a rebuild.
- **A run failed:** GitHub emails the repo owner. Open the run log. One to three failed series fall back to the last published values and are listed on the site; more than three stops the run and leaves the published site unchanged. A missing or expired key fails immediately with a clear message.
- **Rotate the API key:** update the `FRED_API_KEY` secret. No code change.

## Moving to another host

The site is plain files. Copy `site/` to any static web host and schedule `node scripts/build-data.mjs` (Node 20+, `FRED_API_KEY` set) to run before each publish. To move to a LEMOINE GitHub organization, use Settings > Transfer ownership; the workflow and secret setup stay the same, but the new owner must re-add the secret and re-enable Pages.

## Run locally

```
FRED_API_KEY=your_key node scripts/build-data.mjs
npx serve site     # or any static file server, then open the printed URL
```

## Sources

U.S. Bureau of Labor Statistics Producer Price Index, retrieved through FRED, Federal Reserve Bank of St. Louis. Table layout adapted from Ed Zarenski's PPI tables (edzarenski.com).
