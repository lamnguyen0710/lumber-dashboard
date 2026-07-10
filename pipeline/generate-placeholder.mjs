// generate-placeholder.mjs
// -----------------------------------------------------------------------------
// Produces a realistic, fully-populated PLACEHOLDER dataset so the dashboard
// renders end-to-end before the real data pipeline is wired in.
//
// The numbers here are synthetic but scaled to public, order-of-magnitude
// reality (production in MMbf/quarter, housing starts in thousands SAAR, etc.).
// The REAL pipeline (pipeline/fetch/*) will emit the exact same schema, so the
// front-end never has to change when live data replaces these values.
//
// Run:  node pipeline/generate-placeholder.mjs
// Output is consumed by pipeline/build-data.mjs
// -----------------------------------------------------------------------------

// Deterministic PRNG so regenerating gives stable output (no Math.random noise
// churning the committed data files on every run).
function makeRng(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---- period helpers ---------------------------------------------------------
function quarters(startYear, startQ, count) {
  const out = [];
  let y = startYear, q = startQ;
  for (let i = 0; i < count; i++) {
    out.push(`${y}Q${q}`);
    q++; if (q > 4) { q = 1; y++; }
  }
  return out;
}
function months(startYear, startMonth, count) {
  const out = [];
  let y = startYear, m = startMonth;
  for (let i = 0; i < count; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    m++; if (m > 12) { m = 1; y++; }
  }
  return out;
}
function qIndex(period) { // "2015Q1" -> running quarter index from 2015Q1=0
  const [y, q] = period.split('Q').map(Number);
  return (y - 2015) * 4 + (q - 1);
}
function qSeason(period) { // lumber demand: high in Q2/Q3 (building season)
  const q = Number(period.split('Q')[1]);
  return { 1: -0.06, 2: 0.07, 3: 0.05, 4: -0.06 }[q];
}
function mSeason(period) { // housing: peaks spring/summer
  const m = Number(period.split('-')[1]);
  const table = [-0.14, -0.10, 0.02, 0.09, 0.12, 0.11, 0.08, 0.06, 0.02, -0.02, -0.10, -0.14];
  return table[m - 1];
}
const round = (n, d = 0) => { const f = 10 ** d; return Math.round(n * f) / f; };

// Broad cycle shared by the whole complex: COVID demand spike (2020-21),
// 2022 rate-shock cool-down, gradual 2024-25 stabilization.
function macroCycle(t, totalQ) {
  const covid = 0.16 * Math.exp(-((qIndex(t) - 22) ** 2) / 8);   // ~2020Q3 bump
  const rateShock = -0.10 * Math.exp(-((qIndex(t) - 30) ** 2) / 10); // ~2022Q3 dip
  const trend = 0.04 * Math.sin(qIndex(t) / 6);
  return 1 + covid + rateShock + trend;
}

// =============================================================================
const START_Y = 2015, N_Q = 42;          // 2015Q1 .. 2025Q2
const HOUSE_MONTHS = 126;                 // 2015-01 .. 2025-06
const QS = quarters(START_Y, 1, N_Q);
const MS = months(START_Y, 1, HOUSE_MONTHS);

// ---- INDUSTRY: North American softwood lumber production --------------------
const rng = makeRng(20260710);
function industryProduction() {
  return QS.map((p) => {
    const base = 16200;                          // MMbf / quarter total N.A.
    const v = base * macroCycle(p) * (1 + qSeason(p)) * (1 + (rng() - 0.5) * 0.03);
    const us = v * (0.545 + (rng() - 0.5) * 0.01);
    const canada = v - us;
    return { period: p, na_total: round(v), us_total: round(us), canada_total: round(canada) };
  });
}

// ---- INDUSTRY: distributor / mill inventory (index, 2015 avg = 100) ---------
function industryInventory() {
  return QS.map((p) => {
    // inventories draw down hard in the 2021 shortage, rebuild through 2023.
    const short = -14 * Math.exp(-((qIndex(p) - 24) ** 2) / 6);
    const rebuild = 8 * Math.exp(-((qIndex(p) - 34) ** 2) / 12);
    const v = 100 + short + rebuild + (qIndex(p) * 0.15) + (rng() - 0.5) * 3;
    return { period: p, index: round(v, 1) };
  });
}

// ---- INDUSTRY: Random Lengths framing lumber composite ($/mbf, monthly) -----
function lumberPrice() {
  return MS.map((p) => {
    const [y, m] = p.split('-').map(Number);
    const qi = (y - 2015) * 4 + Math.floor((m - 1) / 3);
    // huge 2021 spike to ~$1500, second 2022 spike, back to ~$400 base.
    const spike1 = 1150 * Math.exp(-((qi - 25) ** 2) / 3);
    const spike2 = 700 * Math.exp(-((qi - 29) ** 2) / 2.5);
    const v = 400 + spike1 + spike2 + qi * 2 + (rng() - 0.5) * 40;
    return { period: p, framing_composite: round(Math.max(300, v)) };
  });
}

// ---- INDUSTRY: US housing starts & permits (thousands, SAAR) ----------------
function housing(kind) {
  // starts run a touch below permits; both climb 2015->2021 then dip in 2022-23.
  return MS.map((p) => {
    const [y] = p.split('-').map(Number);
    const yrs = (y - 2015);
    const trend = 1000 + yrs * 55 - Math.max(0, (y - 2022)) * 120;
    const base = kind === 'permits' ? trend * 1.05 : trend;
    const total = base * (1 + mSeason(p)) * (1 + (rng() - 0.5) * 0.05);
    const single = total * (0.66 + (rng() - 0.5) * 0.03);
    const multi = total - single;
    return { period: p, total: round(total), single_family: round(single), multi_family: round(multi) };
  });
}

// ---- INDUSTRY: Canadian softwood lumber exports by destination --------------
// Story the dashboard should tell: US duties+tariff push Canadian producers to
// diversify -> US share slips, China/Japan/EU pick up some slack. Values in MMbf.
function canadaExports() {
  const dest = ['US', 'China', 'Japan', 'Europe', 'Other'];
  const series = QS.map((p) => {
    const total = 3400 * macroCycle(p) * (1 + qSeason(p)) * (1 + (rng() - 0.5) * 0.03);
    const t = qIndex(p) / (N_Q - 1);            // 0..1 over the window
    // US share declines from ~0.78 to ~0.66 as trade actions bite.
    const usShare = 0.78 - 0.12 * t;
    const chinaShare = 0.08 + 0.05 * t;
    const japanShare = 0.06 + 0.01 * t;
    const euShare = 0.03 + 0.04 * t;
    const otherShare = Math.max(0.02, 1 - usShare - chinaShare - japanShare - euShare);
    const row = { period: p };
    const shares = { US: usShare, China: chinaShare, Japan: japanShare, Europe: euShare, Other: otherShare };
    for (const d of dest) row[d] = round(total * shares[d] * (1 + (rng() - 0.5) * 0.04));
    return row;
  });
  return { destinations: dest, series };
}

// Trade-action annotations the industry charts can mark.
const tradeActions = [
  { date: '2017-04', label: 'Prelim. CVD', detail: 'US Commerce prelim. countervailing duties on Canadian softwood lumber.' },
  { date: '2017-11', label: 'Final duties', detail: 'Combined AD/CVD duties finalized (~20% average).' },
  { date: '2021-11', label: 'Rate ~17.9%', detail: 'AR2 duties roughly doubled the combined rate.' },
  { date: '2023-08', label: 'Rate ~8%', detail: 'AR4 lowered combined duties for many producers.' },
  { date: '2025-03', label: '35% duty + 10% tariff', detail: 'New 35% duty layered with a 10% tariff on Canadian lumber into the US.' },
];

// =============================================================================
// COMPANIES
// =============================================================================
const COMPANY_DEFS = [
  {
    id: 'weyerhaeuser', name: 'Weyerhaeuser', ticker: 'WY', exchange: 'NYSE',
    country: 'US', hq: 'Seattle, WA, USA', marketCapB: 22.0, capacityMMbf: 4700,
    productUnit: 'MMbf', prodBase: 1150, revBase: 2000,
    segments: ['Timberlands', 'Wood Products', 'Real Estate & Energy'],
    regions: [{ region: 'US South', mmbf: 2600 }, { region: 'US West', mmbf: 1500 }, { region: 'Canada (West)', mmbf: 600 }],
    description: 'Largest private timberland owner in the US and a major softwood lumber producer; structured as a REIT. Weyerhaeuser is the primary lumber exposure for this book.',
  },
  {
    id: 'west-fraser', name: 'West Fraser Timber', ticker: 'WFG', exchange: 'TSX / NYSE',
    country: 'Canada', hq: 'Vancouver, BC, Canada', marketCapB: 6.8, capacityMMbf: 6300,
    productUnit: 'MMbf', prodBase: 1480, revBase: 1750,
    segments: ['Lumber', 'North America EWP', 'Pulp & Paper', 'Europe'],
    regions: [{ region: 'US South', mmbf: 3200 }, { region: 'Canada (West)', mmbf: 2100 }, { region: 'Europe', mmbf: 1000 }],
    description: 'The largest lumber producer in North America by capacity, with a large and growing US South footprint that partly hedges Canadian duty exposure.',
  },
  {
    id: 'canfor', name: 'Canfor', ticker: 'CFP', exchange: 'TSX',
    country: 'Canada', hq: 'Vancouver, BC, Canada', marketCapB: 2.4, capacityMMbf: 5200,
    productUnit: 'MMbf', prodBase: 1180, revBase: 1400,
    segments: ['Lumber', 'Pulp & Paper'],
    regions: [{ region: 'US South', mmbf: 2400 }, { region: 'Canada (West)', mmbf: 1400 }, { region: 'Europe', mmbf: 1400 }],
    description: 'Major integrated producer shifting capacity out of high-cost British Columbia toward the US South and Europe. Curtailments in BC have been a recurring theme.',
  },
  {
    id: 'interfor', name: 'Interfor', ticker: 'IFP', exchange: 'TSX',
    country: 'Canada', hq: 'Vancouver, BC, Canada', marketCapB: 1.0, capacityMMbf: 5000,
    productUnit: 'MMbf', prodBase: 900, revBase: 950,
    segments: ['Lumber'],
    regions: [{ region: 'US South', mmbf: 2600 }, { region: 'US West', mmbf: 900 }, { region: 'Canada (West)', mmbf: 1200 }, { region: 'Eastern Canada', mmbf: 300 }],
    description: 'Pure-play lumber producer that has aggressively acquired US South and PNW capacity, reducing reliance on Canadian fibre and duty-exposed volumes.',
  },
  {
    id: 'louisiana-pacific', name: 'Louisiana-Pacific (LP)', ticker: 'LPX', exchange: 'NYSE',
    country: 'US', hq: 'Nashville, TN, USA', marketCapB: 7.0, capacityMMbf: null,
    productUnit: 'MMsf (3/8")', prodBase: 1550, revBase: 700,
    segments: ['Siding', 'OSB', 'LP South America'],
    regions: [{ region: 'US South', mmbf: null }, { region: 'US West', mmbf: null }, { region: 'Canada (East)', mmbf: null }, { region: 'South America', mmbf: null }],
    description: 'Building-products maker focused on engineered wood siding and OSB (not dimensional lumber). Production is reported in MMsf (3/8-inch basis) rather than board feet.',
  },
  {
    id: 'potlatchdeltic', name: 'PotlatchDeltic', ticker: 'PCH', exchange: 'NASDAQ',
    country: 'US', hq: 'Spokane, WA, USA', marketCapB: 3.4, capacityMMbf: 1200,
    productUnit: 'MMbf', prodBase: 285, revBase: 300,
    segments: ['Timberlands', 'Wood Products', 'Real Estate'],
    regions: [{ region: 'US South', mmbf: 800 }, { region: 'US West', mmbf: 400 }],
    description: 'Timberland REIT with a lumber manufacturing segment concentrated in the US South and Idaho. Fully domestic, so no Canadian duty exposure.',
  },
  {
    id: 'greenfirst', name: 'GreenFirst Forest Products', ticker: 'GFP', exchange: 'TSX-V',
    country: 'Canada', hq: 'Toronto, ON, Canada', marketCapB: 0.15, capacityMMbf: 750,
    productUnit: 'MMbf', prodBase: 165, revBase: 110,
    segments: ['Lumber', 'Newsprint'],
    regions: [{ region: 'Eastern Canada', mmbf: 750 }],
    description: 'Smaller Ontario/Quebec producer, highly exposed to Canadian duties given its all-Eastern-Canada mill base. A useful high-beta name for duty/price sensitivity.',
  },
];

function companySeries(def) {
  const seed = def.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const r = makeRng(seed * 7919);
  const prod = QS.map((p) => {
    const v = def.prodBase * macroCycle(p) * (1 + qSeason(p) * 0.8) * (1 + (r() - 0.5) * 0.06);
    return { period: p, value: round(v) };
  });
  // Inventory as days-of-supply-ish index around 100.
  const inv = QS.map((p, i) => {
    const drift = Math.sin((qIndex(p) + seed) / 5) * 8;
    const v = 100 + drift - 10 * Math.exp(-((qIndex(p) - 24) ** 2) / 6) + (r() - 0.5) * 4;
    return { period: p, index: round(v, 1) };
  });
  const rev = QS.map((p) => {
    // revenue tracks price*volume: amplify the 2021 spike.
    const priceKick = 1 + 0.9 * Math.exp(-((qIndex(p) - 25) ** 2) / 4) + 0.4 * Math.exp(-((qIndex(p) - 29) ** 2) / 4);
    const v = def.revBase * macroCycle(p) * priceKick * (1 + (r() - 0.5) * 0.05);
    return { period: p, value: round(v) };
  });
  return { prod, inv, rev };
}

function buildCompanies() {
  const out = {};
  for (const def of COMPANY_DEFS) {
    const { prod, inv, rev } = companySeries(def);
    out[def.id] = {
      id: def.id, name: def.name, ticker: def.ticker, exchange: def.exchange,
      country: def.country, hq: def.hq, marketCapB: def.marketCapB,
      capacityMMbf: def.capacityMMbf, segments: def.segments, regions: def.regions,
      description: def.description,
      production: { unit: def.productUnit, freq: 'quarterly', series: prod },
      inventory: { unit: 'index (2015 avg = 100)', freq: 'quarterly', series: inv },
      revenue: { unit: 'M USD', freq: 'quarterly', series: rev },
      capacityByRegion: def.regions,
    };
  }
  return out;
}

// =============================================================================
export function generateDataset() {
  const exp = canadaExports();
  return {
    meta: {
      lastUpdated: '2026-07-10',
      dataThrough: '2025Q2',
      isPlaceholder: true,
      live: { production: false, price: false, housing: false, exports: false, companies: false },
      disclaimer:
        'PLACEHOLDER DATA — synthetic values scaled to realistic magnitudes so every chart renders. ' +
        'Replace with the live pipeline output (pipeline/fetch/*) before using for analysis.',
      sources: [
        { name: 'US Census — New Residential Construction (starts & permits)', url: 'https://www.census.gov/construction/nrc/' },
        { name: 'Statistics Canada — Softwood lumber exports', url: 'https://www.statcan.gc.ca/' },
        { name: 'Random Lengths — Framing Lumber Composite', url: 'https://www.randomlengths.com/' },
        { name: 'Company quarterly filings (SEC EDGAR / SEDAR+)', url: 'https://www.sec.gov/edgar' },
        { name: 'Internal — ICTLF / softwood_exports_pivot', url: '' },
      ],
    },
    industry: {
      production: { unit: 'MMbf', freq: 'quarterly', series: industryProduction() },
      inventory: { unit: 'index (2015 avg = 100)', freq: 'quarterly', series: industryInventory() },
      price: { unit: '$/mbf', freq: 'monthly', series: lumberPrice() },
      housingStarts: { unit: 'thousands (SAAR)', freq: 'monthly', series: housing('starts') },
      housingPermits: { unit: 'thousands (SAAR)', freq: 'monthly', series: housing('permits') },
      canadaExports: { unit: 'MMbf', freq: 'quarterly', destinations: exp.destinations, series: exp.series },
      tradeActions,
    },
    companies: buildCompanies(),
  };
}

// Allow running directly for a quick sanity check.
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const d = generateDataset();
  console.log('companies:', Object.keys(d.companies).length);
  console.log('industry quarters:', d.industry.production.series.length);
  console.log('housing months:', d.industry.housingStarts.series.length);
}
