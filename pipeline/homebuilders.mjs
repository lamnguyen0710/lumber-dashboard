// homebuilders.mjs
// -----------------------------------------------------------------------------
// Top 10 US homebuilders by home deliveries — the demand side of the lumber
// equation (deliveries ≈ lumber consumed). Annual homes delivered/closed for
// FY2018–FY2025, plus (for later) the latest full-year FY2026 guidance.
//
// MANUALLY-COMPILED SNAPSHOT, not a live feed. Home deliveries aren't in XBRL —
// every figure below was pulled from the company's own SEC 10-K filings and
// cross-checked across overlapping filings (each 10-K restates 2–3 prior years).
// Guidance is forward-looking prose from earnings releases.
//
// TO REFRESH each year: append the new fiscal year to `years` and each builder's
// `deliveries` array (from the latest 10-K), and bump `asOf`.
// -----------------------------------------------------------------------------

export function homebuilders() {
  return {
    asOf: '2026-07',
    unit: 'homes delivered',
    years: [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
    note: 'Total company-wide homes delivered/closed per fiscal year, from SEC 10-K filings. Fiscal-year ends differ by company. FY2026 guidance is forward-looking (refreshed manually).',
    // sorted by FY2025 deliveries, descending. deliveries[] aligns to years[].
    builders: [
      { name: 'D.R. Horton',      ticker: 'DHI',  fye: 'Sep 30', deliveries: [51857, 56975, 65388, 81965, 82744, 82917, 89690, 84863], guidance: '86,000–87,500', guidanceAsOf: 'Q2 FY26 · Apr 2026' },
      { name: 'Lennar',           ticker: 'LEN',  fye: 'Nov 30', deliveries: [45627, 51491, 52925, 59825, 66399, 73087, 80210, 82583], guidance: '≈ 85,000', guidanceAsOf: 'FY25 report · Dec 2025' },
      { name: 'PulteGroup',       ticker: 'PHM',  fye: 'Dec 31', deliveries: [23107, 23232, 24624, 28894, 29111, 28603, 31219, 29572], guidance: '28,500–29,000', guidanceAsOf: 'Q4 FY25 call · Jan 2026' },
      { name: 'NVR',              ticker: 'NVR',  fye: 'Dec 31', deliveries: [18447, 19668, 19766, 21540, 22732, 20662, 22836, 21915], guidance: null, guidanceNote: 'No guidance (company policy)' },
      { name: 'Meritage Homes',   ticker: 'MTH',  fye: 'Dec 31', deliveries: [8531, 9267, 11834, 12801, 14106, 13976, 15611, 15026], guidance: 'within ~5% of 2025', guidanceAsOf: 'Q1 FY26 · Apr 2026' },
      { name: 'Taylor Morrison',  ticker: 'TMHC', fye: 'Dec 31', deliveries: [8760, 9964, 12524, 13699, 12647, 11495, 12896, 12997], guidance: '≈ 11,000', guidanceAsOf: 'Q1 FY26 · Apr 2026' },
      { name: 'KB Home',          ticker: 'KBH',  fye: 'Nov 30', deliveries: [11317, 11871, 10672, 13472, 13738, 13236, 14169, 12902], guidance: '10,500–11,000', guidanceAsOf: 'Q2 FY26 · Jun 2026' },
      { name: 'Toll Brothers',    ticker: 'TOL',  fye: 'Oct 31', deliveries: [8265, 8107, 8496, 9986, 10515, 9597, 10813, 11292], guidance: '10,400–10,700', guidanceAsOf: 'Q2 FY26 · May 2026' },
      { name: 'M/I Homes',        ticker: 'MHO',  fye: 'Dec 31', deliveries: [5778, 6296, 7709, 8638, 8366, 8112, 9055, 8921], guidance: null, guidanceNote: 'No numeric guidance' },
      { name: 'Tri Pointe Homes', ticker: 'TPH',  fye: 'Dec 31', deliveries: [5071, 4921, 5123, 6188, 6063, 5274, 6460, 4947], guidance: null, guidanceNote: 'No guidance (acquisition pending)' },
    ],
  };
}
