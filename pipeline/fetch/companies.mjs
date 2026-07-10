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

// --- Production volumes (board feet) from filing MD&A tables --------------------
// SEC XBRL doesn't carry board-foot volumes, so we parse the operating-statistics
// table out of the 10-Q/10-K document HTML. Per-company because each issuer labels
// its table differently. Value normalized to MMbf. (LP is excluded: it makes OSB /
// siding, reported in MMsf by product line — not dimensional lumber.)
const PRODUCTION = {
  'weyerhaeuser':   { re: /Structural lumber\s*-\s*board feet:\s*Production\s+([\d,]+)/i, scale: 1 },   // already MMbf
  'potlatchdeltic': { re: /Lumber shipments \(MBF\)\s*\d*\s+([\d,]+)/i, scale: 1 / 1000 },              // MBF -> MMbf
};

const stripTags = (h) => h
  .replace(/<[^>]+>/g, ' ').replace(/&#8203;/g, '')
  .replace(/&#160;|&nbsp;/g, ' ').replace(/&#8211;|&#8212;|&mdash;|&ndash;/g, '-')
  .replace(/\s+/g, ' ');
const reportToQuarter = (rep) => { const [y, m] = rep.split('-').map(Number); return `${y}Q${Math.ceil(m / 3)}`; };

async function recentFilings(cikPadded, limit) {
  const res = await fetch(`https://data.sec.gov/submissions/CIK${cikPadded}.json`, { headers: UA });
  if (!res.ok) throw new Error(`submissions ${cikPadded}: HTTP ${res.status}`);
  const r = (await res.json()).filings.recent;
  const cikNum = String(parseInt(cikPadded, 10));
  const out = [];
  for (let i = 0; i < r.form.length && out.length < limit; i++) {
    if (r.form[i] === '10-Q' || r.form[i] === '10-K') {
      const acc = r.accessionNumber[i].replace(/-/g, '');
      out.push({ form: r.form[i], rep: r.reportDate[i], url: `https://www.sec.gov/Archives/edgar/data/${cikNum}/${acc}/${r.primaryDocument[i]}` });
    }
  }
  return out;
}

// 10-Q → the current quarter's volume; 10-K → the full-year figure (used only to
// derive Q4 = annual − Q1..Q3, when the issuer's 10-K table matches).
async function fetchProduction(cikPadded, cfg, startYear) {
  const filings = await recentFilings(cikPadded, 13);
  const quarter = new Map(), annual = new Map();
  for (const f of filings) {
    let txt;
    try { const res = await fetch(f.url, { headers: UA }); if (!res.ok) continue; txt = stripTags(await res.text()); }
    catch { continue; }
    cfg.re.lastIndex = 0;
    const m = cfg.re.exec(txt);
    if (!m) continue;
    const val = Math.round(parseInt(m[1].replace(/,/g, ''), 10) * cfg.scale);
    if (f.form === '10-Q') quarter.set(reportToQuarter(f.rep), val);
    else annual.set(f.rep.slice(0, 4), val);
  }
  for (const [yr, tot] of annual) {
    const q = (n) => quarter.get(`${yr}Q${n}`);
    if (!quarter.has(`${yr}Q4`) && q(1) != null && q(2) != null && q(3) != null && tot > q(1) + q(2) + q(3)) {
      quarter.set(`${yr}Q4`, tot - q(1) - q(2) - q(3));
    }
  }
  return [...quarter.entries()]
    .filter(([p]) => Number(p.slice(0, 4)) >= startYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({ period, value }));
}

export async function fetchCompanies({ startYear = 2015 } = {}) {
  const out = {};
  for (const [id, def] of Object.entries(SEC_FILERS)) {
    const patch = {}, live = {};
    // Revenue (XBRL) — merge both tags for full pre/post-2018 history.
    try {
      let rows = [];
      for (const tag of def.tags) { const r = await fetchConcept(def.cik, tag); if (r) rows = rows.concat(r); }
      const series = rows.length ? toQuarterly(rows, startYear) : [];
      if (series.length >= 4) { patch.revenue = { unit: 'M USD', freq: 'quarterly', series }; live.revenue = true; }
      else console.warn(`[companies] ${id}: too few revenue quarters`);
    } catch (e) { console.warn(`[companies] ${id} revenue: ${e.message}`); }

    // Production (filing MD&A) — only for issuers with a known table format.
    if (PRODUCTION[id]) {
      try {
        const series = await fetchProduction(def.cik, PRODUCTION[id], startYear);
        if (series.length >= 4) { patch.production = { unit: 'MMbf', freq: 'quarterly', series }; live.production = true; }
        else console.warn(`[companies] ${id}: too few production quarters (${series.length})`);
      } catch (e) { console.warn(`[companies] ${id} production: ${e.message}`); }
    }

    if (Object.keys(live).length) { patch.live = live; out[id] = patch; }
  }
  return Object.keys(out).length ? out : null;
}

// Manual check:  node pipeline/fetch/companies.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const c = await fetchCompanies();
  for (const [id, v] of Object.entries(c || {})) {
    const rev = v.revenue ? `rev ${v.revenue.series.length}q (last ${JSON.stringify(v.revenue.series.at(-1))})` : 'rev —';
    const prod = v.production ? `prod ${v.production.series.length}q (last ${JSON.stringify(v.production.series.at(-1))})` : 'prod —';
    console.log(id, '|', rev, '|', prod);
  }
}
