// fetch/companies.mjs   — LIVE (revenue, US filers)
// -----------------------------------------------------------------------------
// Per-company quarterly REVENUE from SEC EDGAR XBRL (keyless — SEC only asks for a
// descriptive User-Agent). This refreshes the revenue series on the sample company
// profiles; production & inventory stay sample (board-foot volumes are operational
// metrics reported in MD&A tables, not XBRL, so they aren't machine-readable here).
//
// Coverage: US filers report clean calendar-quarter us-gaap:Revenues —
//   Weyerhaeuser (WY), Louisiana-Pacific (LPX), PotlatchDeltic (PCH).
// The Canadian names are foreign private issuers (West Fraser 40-F/IFRS) or TSX-only
// (Canfor, Interfor, GreenFirst) and do NOT expose quarterly XBRL, so their revenue
// stays sample. Each returned company carries live:{revenue:true} so the front-end
// badges only the genuinely-live charts.
//
//   https://data.sec.gov/api/xbrl/companyconcept/CIK##########/us-gaap/<tag>.json
//
// Returns: { <companyId>: { revenue:{unit:'M USD',freq:'quarterly',series:[...]},
//                           live:{revenue:true} }, ... }  (only for companies with live data)
// Return null / {} to keep all companies on sample data.
// -----------------------------------------------------------------------------

const UA = { 'User-Agent': 'LumberDashboard/1.0 (contact: lam.nguyen1@ufl.edu)' };

// SEC filers with clean quarterly us-gaap revenue. Tags tried in order.
const SEC_FILERS = {
  'weyerhaeuser':      { cik: '0000106535', tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'] },
  'louisiana-pacific': { cik: '0000060519', tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'] },
  'potlatchdeltic':    { cik: '0001338749', tags: ['Revenues', 'RevenueFromContractWithCustomerExcludingAssessedTax'] },
};

const dayspan = (a, b) => (new Date(b) - new Date(a)) / 864e5;
const endToQuarter = (end) => {
  const [y, m] = end.split('-').map(Number);
  return `${y}Q${Math.ceil(m / 3)}`;
};

async function fetchConcept(cik, tag) {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/CIK${cik}/us-gaap/${tag}.json`;
  const res = await fetch(url, { headers: UA });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`EDGAR ${cik}/${tag}: HTTP ${res.status}`);
  const json = await res.json();
  return json.units && json.units.USD ? json.units.USD : null;
}

// Turn raw XBRL USD rows into a clean quarterly revenue series (with Q4 derived
// from annual − Q1..Q3 when Q4 isn't separately tagged).
function toQuarterly(rows, startYear) {
  const quarter = new Map();   // 'YYYYQn' -> value (USD)
  const annual = new Map();    // 'YYYY'   -> value (USD)

  for (const r of rows) {
    const span = dayspan(r.start, r.end);
    const frame = r.frame || '';
    if (/^CY\d{4}Q\d$/.test(frame)) {                     // clean tagged quarter
      quarter.set(frame.slice(2), r.val);                 // 'CY2024Q2' -> '2024Q2'
    } else if (/^CY\d{4}$/.test(frame) || (span >= 350 && span <= 380)) {
      const yr = (frame ? frame.slice(2, 6) : r.end.slice(0, 4));
      annual.set(yr, r.val);
    } else if (span >= 80 && span <= 95) {                // untagged ~quarter
      const key = endToQuarter(r.end);
      if (!quarter.has(key) || r.form === '10-Q') quarter.set(key, r.val);
    }
  }

  // Derive Q4 = annual − (Q1+Q2+Q3) where possible and missing.
  for (const [yr, tot] of annual) {
    const q4 = `${yr}Q4`;
    const q1 = quarter.get(`${yr}Q1`), q2 = quarter.get(`${yr}Q2`), q3 = quarter.get(`${yr}Q3`);
    if (!quarter.has(q4) && q1 != null && q2 != null && q3 != null) {
      quarter.set(q4, tot - q1 - q2 - q3);
    }
  }

  return [...quarter.entries()]
    .filter(([p]) => Number(p.slice(0, 4)) >= startYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, val]) => ({ period, value: Math.round(val / 1e6) }));   // -> $M
}

export async function fetchCompanies({ startYear = 2015 } = {}) {
  const out = {};
  for (const [id, def] of Object.entries(SEC_FILERS)) {
    try {
      // Merge ALL tags — US filers switched from us-gaap:Revenues to the ASC-606
      // RevenueFromContractWithCustomer tag around 2018, so both are needed for
      // full history. toQuarterly dedupes by calendar quarter.
      let rows = [];
      for (const tag of def.tags) { const r = await fetchConcept(def.cik, tag); if (r) rows = rows.concat(r); }
      if (!rows.length) { console.warn(`[companies] ${id}: no revenue concept`); continue; }
      const series = toQuarterly(rows, startYear);
      if (series.length < 4) { console.warn(`[companies] ${id}: too few quarters`); continue; }
      out[id] = { revenue: { unit: 'M USD', freq: 'quarterly', series }, live: { revenue: true } };
    } catch (e) {
      console.warn(`[companies] ${id}: ${e.message}`);
    }
  }
  return Object.keys(out).length ? out : null;
}

// Manual check:  node pipeline/fetch/companies.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = await fetchCompanies();
  for (const [id, v] of Object.entries(c || {})) {
    console.log(id, v.revenue.series.length, 'quarters, last =', JSON.stringify(v.revenue.series.at(-1)));
  }
}
