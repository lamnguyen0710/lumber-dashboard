// fetch/regionexports.mjs   — LIVE (keyless)
// -----------------------------------------------------------------------------
// Canadian softwood lumber exports TO THE US, by Canadian region of origin,
// monthly. The supply-side complement to the destination view (Comtrade): shows
// which regions are shipping to the US and how that's shifting (e.g. the BC
// Interior's decline). This is the same data as the internal ICLTF
// `softwood_exports_pivot.csv`, pulled straight from the primary source.
//
// SOURCE: Global Affairs Canada — monthly "Softwood Lumber Exports to the United
// States" reports (export-permit data), one HTML page per month:
//   https://www.eics-scei.gc.ca/report-rapport/SWL%20monthly%20Exports%20Report_YYYYMM.htm
// Values in the report are FBM (board feet); we convert to MBF (÷1000, thousand
// board feet) to match the dashboard convention.
//
// Verified: totals match US imports of Canadian softwood (~11.8B bf in 2024), the
// BC Interior share matches StatCan (~32%), and volume × the live Comtrade $ value
// implies realistic $/mbf ($464 in 2024, $812 in 2021).
//
// Returns: { unit:'MBF', freq:'monthly', regions:[...7 buckets...], series:[{period:'YYYY-MM', ...}] }
// -----------------------------------------------------------------------------

const START = { year: 2020, month: 1 };
const BASE = 'https://www.eics-scei.gc.ca/report-rapport/SWL%20monthly%20Exports%20Report_';

// GAC label -> we sum the small provinces + excluded companies into "Other".
const LABELS = {
  bcCoast: /B\.C\. Coastal\s+([\d,.]+)/,
  bcInterior: /B\.C\. Interior\s+([\d,.]+)/,
  alberta: /Alberta\s+([\d,.]+)/,
  saskatchewan: /Saskatchewan\s+([\d,.]+)/,
  manitoba: /Manitoba\s+([\d,.]+)/,
  ontario: /Ontario\s+([\d,.]+)/,
  quebec: /Quebec\s+([\d,.]+)/,
  maritime: /Maritime Total\s+([\d,.]+)/,
  territory: /Territory Total\s+([\d,.]+)/,
  excluded: /Excluded Companies\s+([\d,.]+)/,
};
const REGIONS = ['BC Interior', 'BC Coast', 'Alberta', 'Ontario', 'Quebec', 'Maritimes', 'Other'];

function parseReport(html) {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ');
  const grabFbm = (re) => { const m = t.match(re); return m ? Number(m[1].replace(/,/g, '')) : null; };
  const v = {};
  for (const [k, re] of Object.entries(LABELS)) v[k] = grabFbm(re);
  if (v.bcInterior == null) return null;                 // report not in expected format
  const mbf = (x) => (x == null ? 0 : Math.round(x / 1000));
  return {
    'BC Interior': mbf(v.bcInterior),
    'BC Coast': mbf(v.bcCoast),
    'Alberta': mbf(v.alberta),
    'Ontario': mbf(v.ontario),
    'Quebec': mbf(v.quebec),
    'Maritimes': mbf(v.maritime),
    'Other': mbf(v.saskatchewan) + mbf(v.manitoba) + mbf(v.territory) + mbf(v.excluded),
  };
}

// concurrency-limited map so we don't hammer the GAC server
async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  async function worker() { while (i < items.length) { const idx = i++; out[idx] = await fn(items[idx]).catch(() => null); } }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function fetchRegionExports() {
  const now = new Date();
  const months = [];
  for (let y = START.year, m = START.month; y < now.getUTCFullYear() || (y === now.getUTCFullYear() && m <= now.getUTCMonth() + 1); m++) {
    if (m > 12) { m = 1; y++; }
    if (y > now.getUTCFullYear()) break;
    months.push({ y, m, ym: `${y}${String(m).padStart(2, '0')}`, period: `${y}-${String(m).padStart(2, '0')}` });
  }

  const rows = await mapLimit(months, 6, async (mo) => {
    const res = await fetch(BASE + mo.ym + '.htm', { headers: { 'User-Agent': 'Mozilla/5.0 (lumber-dashboard)' } });
    if (!res.ok) return null;
    const parsed = parseReport(await res.text());
    return parsed ? { period: mo.period, ...parsed } : null;
  });

  const series = rows.filter(Boolean);
  if (series.length < 6) throw new Error(`GAC region exports: only ${series.length} months parsed`);
  return { unit: 'MBF', freq: 'monthly', regions: REGIONS, series };
}

// Manual check:  node pipeline/fetch/regionexports.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const r = await fetchRegionExports();
  console.log(`${r.series.length} months, ${r.regions.length} regions`);
  console.log('first:', JSON.stringify(r.series[0]));
  console.log('last :', JSON.stringify(r.series.at(-1)));
}
