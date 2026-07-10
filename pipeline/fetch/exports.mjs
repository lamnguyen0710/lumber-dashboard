// fetch/exports.mjs
// -----------------------------------------------------------------------------
// Canadian softwood lumber exports by destination country (quarterly).
// This is the "where is the wood going?" chart — the core trade-diversion story.
//
// SOURCES:
//   - Statistics Canada, Canadian International Merchandise Trade (CIMT):
//       https://www150.statcan.gc.ca/  (HS codes 4407.11 / 4407.12 / 4407.19 softwood)
//       Web Data Service (WDS) API returns JSON vectors.
//   - Internal: the ICTLF folder `softwood_exports_pivot` — likely already has US +
//       other-country columns pivoted by period. Easiest first win: point this at
//       that file (CSV/XLSX export) and reshape it. See loadInternalPivot() below.
//
// Return shape:
//   { unit:'MMbf', freq:'quarterly',
//     destinations:['US','China','Japan','Europe','Other'],
//     series:[{period:'YYYYQn', US, China, Japan, Europe, Other}] }
// -----------------------------------------------------------------------------

export async function fetchCanadaExports() {
  // Option A — internal pivot (fastest to wire up):
  // return loadInternalPivot(process.env.SOFTWOOD_PIVOT_PATH);
  //
  // Option B — StatCan CIMT WDS API by HS code + partner country, converted to MMbf.
  return null;
}

// Placeholder for the ICTLF softwood_exports_pivot ingest. Fill in once we agree
// on the file location and its exact columns.
// eslint-disable-next-line no-unused-vars
async function loadInternalPivot(path) {
  // TODO: read CSV/XLSX at `path`, map columns -> {period, US, China, Japan, Europe, Other}.
  return null;
}
