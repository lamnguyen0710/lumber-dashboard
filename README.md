# Lumber Industry Dashboard

An interactive dashboard for the **softwood lumber** complex — built around our
lumber-producer exposure (primarily Weyerhaeuser). It shows the industry-level
supply/demand picture and lets you drill into individual public companies.

> **Supply / demand is the whole equation in a commodity business.** The goal is
> to see, in one place, what's happening to lumber supply (production, inventory,
> where Canadian wood is shipping under US duties/tariffs) and demand (US housing
> starts & permits) — and to keep it current automatically.

![status](https://img.shields.io/badge/status-housing%20%2B%20price%20LIVE%20%C2%B7%20rest%20sample-2a78d6)

---

## What's in it

**Industry overview** (landing page)
- North American lumber production, quarterly, split US vs. Canada
- Framing lumber composite price ($/mbf), monthly
- US housing **starts vs. permits** (the demand side), monthly
- **Canadian softwood exports by destination** (US / China / Japan / Europe / Other) — the trade-diversion story
- US share of Canadian exports (one line: are they shipping elsewhere?)
- Industry inventory index
- US trade-action timeline (duties + the 35% duty / 10% tariff)
- A sortable company comparison table

**Company view** (search any producer in the top bar)
- Profile: ticker, exchange, HQ, market cap, segments, Canadian-duty exposure
- Production by quarter, revenue by quarter, inventory index
- Lumber capacity by region (US capacity is not duty-exposed)
- The company's share of total North American production

Companies tracked: **Weyerhaeuser, West Fraser, Canfor, Interfor,
Louisiana-Pacific, PotlatchDeltic, GreenFirst**. Add more in one place — see below.

---

## Data provenance — partly live, partly sample

The pipeline comes online **one source at a time**, and each chart is tagged in the
app with a <kbd>LIVE</kbd> or <kbd>SAMPLE</kbd> badge so there's never any doubt:

| Section | Status | Source |
|---|---|---|
| **US housing** (starts & permits) | ✅ **LIVE** | FRED public CSV (keyless), sourced from Census/HUD |
| **Lumber price** ($/mbf) | ✅ **LIVE** | CME Lumber futures `LBR=F` (keyless; history from 2022) |
| N.A. lumber production | ⏳ sample | WWPA / APA / StatCan / FEA — *to wire up* |
| Canadian exports by destination | ⏳ sample | needs a free UN Comtrade key **or** StatCan CIMT extract (see note) |
| Company production / revenue | ⏳ sample | SEC EDGAR / SEDAR+ — *to wire up* |

> **Why exports isn't live yet:** the fully-keyless options don't return complete
> data — UN Comtrade's public "preview" endpoint is truncated, and StatCan's
> softwood-by-country series is an interactive "special extraction," not an API.
> The real path is a **free UN Comtrade API key** (a quick sign-up — I can't create
> accounts) set as the `COMTRADE_KEY` secret, or a one-time CIMT CSV extract.
> `pipeline/fetch/exports.mjs` documents both and is ready to switch on.

"Sample" numbers are **synthetic**, scaled to realistic magnitudes so the whole
dashboard is explorable today. The front-end never changes as sources go live — the
fetchers emit the exact same schema, and `meta.live` drives the badges. When all
sources are live, `meta.isPlaceholder` flips to `false` and the banner disappears.

---

## Run it locally

Requires [Node.js](https://nodejs.org) 18+ (no other dependencies).

```bash
npm run build     # generate data/dataset.js (+ .json) from the pipeline
npm start         # serve at http://localhost:8080
```

Then open **http://localhost:8080**. (The dashboard reads its data from a plain
`<script>`, so it also works if you just open `index.html` directly — but a browser
server like `npm start` is the closest match to how GitHub Pages serves it.)

---

## Deploy to GitHub Pages (with automatic monthly updates)

1. Create a GitHub repo and push this folder to it (see *Push it up* below).
2. In the repo: **Settings → Pages → Build and deployment → Source = GitHub Actions**.
3. That's it. The workflow in [`.github/workflows/update-and-deploy.yml`](.github/workflows/update-and-deploy.yml):
   - runs **daily** (10:00 UTC), plus on every push and on demand,
   - rebuilds the dataset from live sources (`node pipeline/build-data.mjs --live`),
   - commits the refreshed data back to the repo, and
   - publishes the site to your Pages URL.

   (Most series only update monthly at the source, so a daily run just picks up new
   releases the day they post — no wasted effort, and ready for any faster sources.)

Your shareable Chrome link will be `https://<your-user>.github.io/<repo>/`.

To trigger a run by hand: repo **Actions → Update data & deploy → Run workflow**.

### Push it up

```bash
git init
git add .
git commit -m "Lumber industry dashboard v1 (placeholder data)"
git branch -M main
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

*(This repo is initialized with a first commit already — you can skip `git init`
and the first `git commit` if so.)*

---

## The data pipeline (what we build next)

```
pipeline/
  build-data.mjs          orchestrator → writes data/dataset.js + dataset.json
  generate-placeholder.mjs realistic synthetic data (current source)
  serve.mjs               tiny local static server
  fetch/
    index.mjs             merges live sources over placeholder (section by section)
    production.mjs        N.A. softwood production   (WWPA / APA / StatCan / FEA)   ⏳
    price.mjs             lumber price $/mbf         (CME LBR=F futures, keyless)   ✅ LIVE
    housing.mjs           US starts & permits        (FRED public CSV, keyless)     ✅ LIVE
    exports.mjs           Canadian exports by dest.  (UN Comtrade key / CIMT)       ⏳
    companies.mjs         per-company production/rev (SEC EDGAR / SEDAR+)           ⏳
```

**How it's designed to come online gradually:** each fetcher returns `null` today,
so `build-data.mjs --live` falls back to placeholder for any section not yet
implemented. Wire them up one at a time; as each starts returning real data it
replaces *only that section*, and `meta.isPlaceholder` flips to `false` (hiding the
banner) once all of them are live.

Each file's header documents the exact source, endpoint, and the return shape it
must produce. **US housing and lumber price are already live** (`housing.mjs` via
FRED keyless CSV; `price.mjs` via CME `LBR=F` futures) — use them as templates:
fetch → parse → map to the schema. The remaining sources are `exports.mjs` (needs a
free Comtrade key or a CIMT extract — carries the trade-diversion story),
`companies.mjs` (SEC EDGAR / SEDAR+), and `production.mjs` (WWPA / APA / StatCan).

### Data schema (one object, `window.LUMBER_DATA`)

```
meta:      { lastUpdated, dataThrough, isPlaceholder, disclaimer, sources[] }
industry:  production | inventory | price | housingStarts | housingPermits
           | canadaExports{destinations, series} | tradeActions[]
companies: { <id>: { profile…, production, inventory, revenue, capacityByRegion } }
```

Time series are `{ period, …values }` where `period` is `"YYYYQn"` (quarterly) or
`"YYYY-MM"` (monthly). See `pipeline/generate-placeholder.mjs` for the authoritative
shape.

---

## Adding or editing a company

Edit `COMPANY_DEFS` in [`pipeline/generate-placeholder.mjs`](pipeline/generate-placeholder.mjs)
(id, ticker, HQ, capacity, regions, description…), then `npm run build`. The search
box, comparison table, color assignment, and company page all pick it up
automatically. Once `fetch/companies.mjs` is live, the profile stays here and only
the time series get refreshed from filings.

---

## Notes & assumptions

- **Louisiana-Pacific** makes OSB/siding, not dimensional lumber, so its production
  is shown in *MMsf (3/8")* and it has no board-foot capacity or N.A.-share chart.
- **Canadian duty exposure** in the table/company view is derived: US producers =
  none; Canadian producers with US mills = partly hedged; all-Canada mills = high.
- Charts use one y-axis each (no dual-axis), a colorblind-checked categorical
  palette, and a selectable light/dark theme.
- Framing-price and production levels are placeholder; do not trade off these.
