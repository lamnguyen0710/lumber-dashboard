// fetch/housing.mjs   — LIVE
// -----------------------------------------------------------------------------
// US new residential construction: housing starts & building permits (monthly).
// The demand side of the lumber equation.
//
// SOURCE: FRED (Federal Reserve Bank of St. Louis) public CSV download endpoint —
//   https://fred.stlouisfed.org/graph/fredgraph.csv?id=<SERIES>
// This endpoint is keyless (it's what the FRED charts use for "Download CSV"), so
// the pipeline needs no API key or account. FRED sources these series directly
// from the US Census Bureau / HUD New Residential Construction release.
//
//   HOUST    Housing Starts: Total,           thousands of units, SAAR
//   HOUST1F  Housing Starts: 1-Unit (single-family)
//   PERMIT   New Private Housing Units Authorized by Building Permits: Total
//   PERMIT1  Building Permits: 1-Unit (single-family)
//
// multi_family is derived as total − single_family.
//
// Returns:
//   { starts:  { unit, freq:'monthly', series:[{period:'YYYY-MM', total, single_family, multi_family}] },
//     permits: { unit, freq:'monthly', series:[{period, total, single_family, multi_family}] } }
// -----------------------------------------------------------------------------

const FRED_CSV = (id) => `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${id}`;

// Fetch one FRED series → Map<'YYYY-MM', number>.
async function fredSeries(id) {
  const res = await fetch(FRED_CSV(id), { headers: { 'User-Agent': 'lumber-dashboard/1.0' } });
  if (!res.ok) throw new Error(`FRED ${id}: HTTP ${res.status}`);
  const text = await res.text();
  const map = new Map();
  for (const line of text.trim().split(/\r?\n/).slice(1)) {   // skip header row
    const [date, value] = line.split(',');
    if (!date || value == null || value === '' || value === '.') continue;
    map.set(date.slice(0, 7), Number(value));                // 'YYYY-MM-DD' -> 'YYYY-MM'
  }
  if (!map.size) throw new Error(`FRED ${id}: no rows parsed`);
  return map;
}

function assemble(totalMap, singleMap, startYear) {
  const periods = [...totalMap.keys()].filter((p) => Number(p.slice(0, 4)) >= startYear).sort();
  const round1 = (n) => Math.round(n * 10) / 10;
  return {
    unit: 'thousands (SAAR)',
    freq: 'monthly',
    series: periods.map((p) => {
      const total = totalMap.get(p);
      const single = singleMap.get(p);
      const multi = (total != null && single != null) ? round1(total - single) : null;
      return { period: p, total: total ?? null, single_family: single ?? null, multi_family: multi };
    }).filter((r) => r.total != null),
  };
}

// Single-value monthly FRED series -> { unit, freq, series:[{period, value}] }
function assembleSingle(map, unit, startYear) {
  const series = [...map.entries()]
    .filter(([p]) => Number(p.slice(0, 4)) >= startYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, value]) => ({ period, value }));
  return { unit, freq: 'monthly', series };
}

export async function fetchHousing({ startYear = 2015 } = {}) {
  const [houst, houst1f, permit, permit1, supply] = await Promise.all([
    fredSeries('HOUST'), fredSeries('HOUST1F'), fredSeries('PERMIT'), fredSeries('PERMIT1'),
    fredSeries('MSACSR'),   // Monthly Supply of New Houses (months) — housing supply/demand balance
  ]);
  return {
    starts: assemble(houst, houst1f, startYear),
    permits: assemble(permit, permit1, startYear),
    supply: assembleSingle(supply, 'months', startYear),
  };
}

// Manual check:  node pipeline/fetch/housing.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const h = await fetchHousing();
  console.log('starts:', h.starts.series.length, 'months, last =', JSON.stringify(h.starts.series.at(-1)));
  console.log('permits:', h.permits.series.length, 'months, last =', JSON.stringify(h.permits.series.at(-1)));
}
