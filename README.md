# Lumber Industry Dashboard

An interactive dashboard for the **softwood lumber** complex — built around our
lumber-producer exposure (primarily Weyerhaeuser). It shows the industry-level
supply/demand picture and lets you drill into individual public companies.

> **Supply / demand is the whole equation in a commodity business.** The goal is
> to see, in one place, what's happening to lumber supply (production, inventory,
> where Canadian wood is shipping under US duties/tariffs) and demand (US housing
> starts & permits) — and to keep it current automatically.

![status](https://img.shields.io/badge/status-housing%20%C2%B7%20price%20%C2%B7%20exports%20%C2%B7%20company%20rev%20%2B%20prod%20LIVE-2a78d6)

---

## What's in it

**Industry overview** (landing page)
- Lumber price — CME front-month futures ($/mbf), monthly
- US housing **starts vs. permits** (the demand side), monthly
- **Canadian softwood exports by destination** (US / China / Japan / Europe / Other) with a **$ value ⇄ volume** toggle (Comtrade reports both) — the trade-diversion story
- US share of Canadian exports (one line: are they shipping elsewhere?)
- Months' supply of new homes (housing supply/demand balance, FRED)
- US new home sales with a **Levels ⇄ YoY-growth** toggle (Census, FRED)
- Live lumber-industry **news board** (Google News RSS, keyless) — headlines, source, relative timestamps
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
| **Company revenue** (quarterly) | ✅ **LIVE** | SEC EDGAR XBRL (keyless) — US filers WY, LPX, PCH |
| **Company production** (quarterly) | ✅ **LIVE** | parsed from EDGAR 10-Q/10-K MD&A tables — WY, PCH (lumber MMbf) |
| **Canadian exports by destination** | ✅ **LIVE** | UN Comtrade full API (free key `COMTRADE_KEY`) |
| **Canada→US exports by region of origin** | ✅ **LIVE** | Global Affairs Canada monthly export-permit reports (keyless) |
| Company inventory | ⏳ sample | not consistently disclosed as a machine-readable figure |
| LP production | ⏳ sample | LP makes OSB/siding (MMsf) by product line, not dimensional lumber |
| N.A. industry production | ⏳ sample | WWPA / APA / FEA are paid; no free API |

Everything live is free — all keyless except exports, which uses a **free** UN
Comtrade key (`COMTRADE_KEY`). What remains sample, and why:

> **Company production** is parsed from the operating-statistics tables in each
> company's EDGAR 10-Q/10-K (SEC XBRL doesn't carry board-foot volumes). This is
> HTML-table scraping — more fragile than the structured feeds — so if an issuer
> changes its table format, `pipeline/fetch/companies.mjs` falls back to sample for
> that company. WY reports "Structural lumber – board feet: Production"; PCH reports
> "Lumber shipments (MBF)". **LP** is excluded because it makes OSB/siding (MMsf by
> product line), not dimensional lumber. History runs ~3 years (as far back as the
> recent filings parse cleanly); WY has a Q4 gap because its 10-K reports capacity,
> not annual production, in that table.
>
> **N.A. industry-total production** and **company inventory** have no free
> machine-readable source — the industry aggregates (WWPA/APA/FEA) are paid. These
> stay sample, badged per-chart.

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
   - runs **every 6 hours**, plus on every push and on demand,
   - rebuilds the dataset from live sources (`node pipeline/build-data.mjs --live`),
   - commits the refreshed data back to the repo, and
   - publishes the site to your Pages URL.

   (The data series update at most daily/monthly at the source; the 6-hour cadence
   keeps the news board fresh. Adjust the `cron` in the workflow to taste.)

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
    price.mjs             lumber price $/mbf         (CME LBR=F futures, keyless)   ✅ LIVE
    housing.mjs           US starts & permits        (FRED public CSV, keyless)     ✅ LIVE
    companies.mjs         per-company revenue + prod (SEC EDGAR XBRL + filings)     ✅ LIVE (US filers)
    exports.mjs           Canadian exports by dest.  (UN Comtrade, free key)        ✅ LIVE
    regionexports.mjs     Canada→US exports by region (Global Affairs Canada, keyless) ✅ LIVE
    news.mjs              lumber industry news board (Google News RSS, keyless)     ✅ LIVE
    production.mjs        N.A. industry production   (WWPA / APA / FEA — paid)      ⏳
```

**How it's designed to come online gradually:** each fetcher returns `null` today,
so `build-data.mjs --live` falls back to placeholder for any section not yet
implemented. Wire them up one at a time; as each starts returning real data it
replaces *only that section*, and `meta.isPlaceholder` flips to `false` (hiding the
banner) once all of them are live.

Each file's header documents the exact source, endpoint, and the return shape it
must produce. **Three sources are already live and keyless** — `housing.mjs` (FRED
CSV), `price.mjs` (CME `LBR=F` futures), and `companies.mjs` (SEC EDGAR XBRL
revenue) — use them as templates: fetch → parse → map to the schema. The two that
remain sample (`exports.mjs`, `production.mjs`) have no keyless-complete source; see
the provenance note above for what each would take.

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
