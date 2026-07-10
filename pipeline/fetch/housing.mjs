// fetch/housing.mjs
// -----------------------------------------------------------------------------
// US new residential construction: housing starts & building permits (monthly).
//
// SOURCE: US Census Bureau — New Residential Construction.
//   - Time-series API:  https://www.census.gov/econ/currentdata/  (program RESCONST)
//   - Series of interest: total starts, 1-unit starts; total permits, 1-unit permits.
//   - A free Census API key helps with rate limits: https://api.census.gov/data/key_signup.html
//
// Return shape (must match the placeholder schema exactly):
//   {
//     starts:  { unit:'thousands (SAAR)', freq:'monthly', series:[{period:'YYYY-MM', total, single_family, multi_family}] },
//     permits: { unit:'thousands (SAAR)', freq:'monthly', series:[{period:'YYYY-MM', total, single_family, multi_family}] },
//   }
// Return null (or throw) to fall back to placeholder data.
// -----------------------------------------------------------------------------

export async function fetchHousing() {
  // TODO: call Census RESCONST, map to the shape above.
  // const key = process.env.CENSUS_API_KEY;
  // const res = await fetch(`https://api.census.gov/data/timeseries/eits/resconst?...&key=${key}`);
  return null;
}
