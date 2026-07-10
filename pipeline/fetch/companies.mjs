// fetch/companies.mjs
// -----------------------------------------------------------------------------
// Per-company production, inventory and revenue by quarter, from public filings.
//
// SOURCES:
//   - US filers (WY, LPX, PCH): SEC EDGAR full-text + XBRL "companyfacts" API
//       https://data.sec.gov/api/xbrl/companyfacts/CIK##########.json
//   - Canadian filers (WFG, CFP, IFP, GFP): SEDAR+ (https://www.sedarplus.ca/)
//       Production volumes usually live in the MD&A tables, not XBRL — these often
//       need a light PDF/table parse per issuer.
//   - Production volumes (board feet) are operational metrics and frequently only
//       in the MD&A / earnings decks, so expect a per-company mapping here.
//
// Return shape: an object keyed by company id, each value matching the company
// schema in generate-placeholder.mjs (production/inventory/revenue series etc.).
// The static company profile fields (hq, segments, regions, description) can stay
// sourced from the placeholder/registry — this fetcher only needs to refresh the
// time series. Return null to keep placeholder companies entirely.
// -----------------------------------------------------------------------------

// CIK / issuer identifiers to get started.
export const ISSUERS = {
  'weyerhaeuser':       { cik: '0000106535', market: 'SEC' },
  'louisiana-pacific':  { cik: '0000060519', market: 'SEC' },
  'potlatchdeltic':     { cik: '0001338613', market: 'SEC' },
  'west-fraser':        { sedar: 'West Fraser Timber Co. Ltd.', market: 'SEDAR' },
  'canfor':             { sedar: 'Canfor Corporation', market: 'SEDAR' },
  'interfor':           { sedar: 'Interfor Corporation', market: 'SEDAR' },
  'greenfirst':         { sedar: 'GreenFirst Forest Products Inc.', market: 'SEDAR' },
};

export async function fetchCompanies() {
  // TODO: for each issuer, pull revenue from XBRL companyfacts and production/
  // inventory from the MD&A tables; merge onto the static registry profile.
  return null;
}
