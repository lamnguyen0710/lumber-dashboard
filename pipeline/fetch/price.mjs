// fetch/price.mjs
// -----------------------------------------------------------------------------
// Framing lumber price benchmark (monthly).
//
// SOURCES (pick what we have access to):
//   - Random Lengths Framing Lumber Composite (subscription).
//   - CME Lumber futures (front-month settle) as a free proxy: LBR/LBS.
//   - FRED series (e.g. WPU081) for PPI: Lumber as a public fallback.
//
// Return shape:
//   { unit:'$/mbf', freq:'monthly', series:[{period:'YYYY-MM', framing_composite}] }
// -----------------------------------------------------------------------------

export async function fetchLumberPrice() {
  // TODO: fetch chosen benchmark, normalize to $/mbf monthly.
  return null;
}
