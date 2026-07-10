// fetch/production.mjs
// -----------------------------------------------------------------------------
// Industry-wide North American softwood lumber production (quarterly).
//
// SOURCES:
//   - WWPA (Western Wood Products Association) and SFPA regional production reports.
//   - APA – The Engineered Wood Association (structural panels).
//   - Statistics Canada Table 16-10-0017 (sawmills) for the Canadian half.
//   - FEA / Forest Economic Advisors (subscription) is the common street source.
//
// Return shape:
//   { unit:'MMbf', freq:'quarterly',
//     series:[{period:'YYYYQn', na_total, us_total, canada_total}] }
// -----------------------------------------------------------------------------

export async function fetchIndustryProduction() {
  // TODO: aggregate US + Canada regional production into the shape above.
  return null;
}
