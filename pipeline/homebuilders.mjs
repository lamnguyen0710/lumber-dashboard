// homebuilders.mjs
// -----------------------------------------------------------------------------
// Top 10 US homebuilders by home deliveries — the demand side of the lumber
// equation (deliveries ≈ lumber consumed; full-year guidance ≈ forward demand).
//
// This is a MANUALLY-COMPILED SNAPSHOT, not a live feed. Home deliveries aren't
// in XBRL, and full-year guidance is forward-looking prose in earnings releases —
// neither is auto-scrapeable reliably. Figures were pulled from each company's
// most recent earnings release / SEC 8-K as of the `asOf` date below.
//
// TO REFRESH (do this each quarter): update `fy2025`/`guidance`/`guidanceAsOf`
// from the latest earnings releases and bump `asOf`. Sources are kept per row.
// -----------------------------------------------------------------------------

export function homebuilders() {
  return {
    asOf: '2026-07',
    unit: 'homes delivered',
    note: 'Latest completed fiscal-year deliveries (actual) and management\'s full-year FY2026 delivery guidance, from company earnings releases. Fiscal years differ by company. Guidance is forward-looking and refreshed manually each quarter.',
    // sorted by latest full-year deliveries, descending
    builders: [
      { name: 'D.R. Horton',      ticker: 'DHI',  fye: 'Sep 30', fy2025: 84863, guidance: '86,000–87,500', guidanceAsOf: 'Q2 FY26 · Apr 2026', src: 'https://investor.drhorton.com' },
      { name: 'Lennar',           ticker: 'LEN',  fye: 'Nov 30', fy2025: 82583, guidance: '≈ 85,000',      guidanceAsOf: 'FY25 report · Dec 2025', src: 'https://newsroom.lennar.com/2025-12-16-Lennar-Reports-Fourth-Quarter-and-Fiscal-2025-Results' },
      { name: 'PulteGroup',       ticker: 'PHM',  fye: 'Dec 31', fy2025: 29572, guidance: '28,500–29,000', guidanceAsOf: 'Q4 FY25 call · Jan 2026', src: 'https://newsroom.pultegroup.com' },
      { name: 'NVR',              ticker: 'NVR',  fye: 'Dec 31', fy2025: 21915, guidance: null, guidanceNote: 'No guidance (company policy)', src: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0000906163&type=8-K' },
      { name: 'Meritage Homes',   ticker: 'MTH',  fye: 'Dec 31', fy2025: 15026, guidance: 'within ~5% of 2025', guidanceAsOf: 'Q1 FY26 · Apr 2026', src: 'https://investors.meritagehomes.com' },
      { name: 'Taylor Morrison',  ticker: 'TMHC', fye: 'Dec 31', fy2025: 12997, guidance: '≈ 11,000',      guidanceAsOf: 'Q1 FY26 · Apr 2026', src: 'https://newsroom.taylormorrison.com' },
      { name: 'KB Home',          ticker: 'KBH',  fye: 'Nov 30', fy2025: 12902, guidance: '10,500–11,000', guidanceAsOf: 'Q2 FY26 · Jun 2026', src: 'https://www.prnewswire.com/news-releases/kb-home-reports-2026-second-quarter-results-302807061.html' },
      { name: 'Toll Brothers',    ticker: 'TOL',  fye: 'Oct 31', fy2025: 11292, guidance: '10,400–10,700', guidanceAsOf: 'Q2 FY26 · May 2026', src: 'https://www.sec.gov/Archives/edgar/data/794170/000079417026000083/tol-4302026x8kexh991.htm' },
      { name: 'M/I Homes',        ticker: 'MHO',  fye: 'Dec 31', fy2025: 8921,  guidance: null, guidanceNote: 'No numeric guidance', src: 'https://www.prnewswire.com/news-releases/mi-homes-reports-fourth-quarter-and-year-end-results-302671742.html' },
      { name: 'Tri Pointe Homes', ticker: 'TPH',  fye: 'Dec 31', fy2025: 4947,  guidance: null, guidanceNote: 'No guidance (acquisition pending)', src: 'https://www.sec.gov/Archives/edgar/data/1561680/000156168026000004/tphex991q42025.htm' },
    ],
  };
}
