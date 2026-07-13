// stumpage.mjs
// -----------------------------------------------------------------------------
// Current Crown-timber stumpage / dues by Canadian region — one figure each,
// as published by that region (softwood sawlogs, C$/m³). Manually-compiled
// snapshot from official provincial sources (mid-2026), NOT a live feed.
//
// Note: provinces use different pricing systems, so this is an INDICATIVE
// comparison, not a like-for-like one — but the levels all land in a similar
// single-digit-to-low-teens range. Refresh figures manually from the sources.
//   BC:  gov.bc.ca timber pricing (Coast Area avg; Interior forest-zone rates)
//   AB:  alberta.ca timber dues (monthly, formula-indexed)
//   ON:  data.ontario.ca "Crown timber charges" stumpage matrix (XLSX)
//   QC:  BMMB auction (encheres.forets.gouv.qc.ca) — no single published avg
// -----------------------------------------------------------------------------

export function stumpage() {
  return {
    asOf: '2026-07',
    unit: 'C$/m³',
    note: 'Current softwood-sawlog stumpage/dues, one figure per region as each province publishes it. Systems differ (BC appraisal · AB formula dues · ON residual value · QC auction), so this is indicative rather than like-for-like.',
    // sorted high → low
    regions: [
      { region: 'Alberta',     rate: 10.36, detail: 'timber dues, general operator (Jul 2026)' },
      { region: 'Québec',      rate: 7.40,  detail: 'illustrative recent auction — no published avg' },
      { region: 'BC Interior', rate: 6.11,  detail: 'average of 7 published forest-zone rates (Apr 2026)' },
      { region: 'BC Coast',    rate: 5.72,  detail: 'Coast Area average (Jul 2026)' },
      { region: 'Ontario',     rate: 3.56,  detail: 'stumpage (min price; residual value at $0) (Apr 2026)' },
    ],
  };
}
