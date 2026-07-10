// fetch/exports.mjs   — LIVE (requires free COMTRADE_KEY)
// -----------------------------------------------------------------------------
// Canadian softwood lumber exports by destination country (annual, US$).
// The "where is the wood going?" chart — the core trade-diversion question.
//
// SOURCE: UN Comtrade full data API (keyed, but the key is FREE — sign up at
// comtradedeveloper.un.org and subscribe to the free product). Set the primary
// key as env COMTRADE_KEY (a GitHub Actions secret in CI). The keyless public
// "preview" endpoint returns truncated/inconsistent data and is NOT used.
//
//   GET https://comtradeapi.un.org/data/v1/get/C/A/HS
//       ?reporterCode=124(Canada)&flowCode=X(export)
//       &cmdCode=440711,440712,440713,440714,440719  (softwood sawn lumber)
//       &partnerCode=<0=World,842=US,156=China,392=Japan,+EU>&period=<years>&motCode=0
//   header: Ocp-Apim-Subscription-Key: <COMTRADE_KEY>
//
// Notes learned from the live API:
//   • Data under the current softwood HS codes begins in 2018 (the 2022 HS revision
//     moved most SPF volume into 440713; earlier years return nothing here).
//   • Aggregate (all-modes) rows are motCode===0 && partner2Code===0.
//   • Value = primaryValue (USD). We report it in US$ millions.
//   • "Europe" is approximated by the six largest EU softwood importers; "Other" =
//     World − (US + China + Japan + Europe).
//
// Returns: { unit:'US$ millions', freq:'annual',
//            destinations:['US','China','Japan','Europe','Other'],
//            series:[{period:'YYYY', US, China, Japan, Europe, Other}] }
// Return null (no key, or on error) → build-data falls back to sample data.
// -----------------------------------------------------------------------------

const SOFTWOOD_HS = ['440711', '440712', '440713', '440714', '440719'];
const PARTNER = { World: 0, US: 842, China: 156, Japan: 392 };
const EU = [276, 826, 528, 380, 251, 56]; // Germany, UK, Netherlands, Italy, France, Belgium
const START_YEAR = 2018;

export async function fetchCanadaExports() {
  const key = process.env.COMTRADE_KEY;
  if (!key) { console.warn('[exports] COMTRADE_KEY not set — using sample data'); return null; }

  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = START_YEAR; y <= thisYear; y++) years.push(y);
  const partners = [PARTNER.World, PARTNER.US, PARTNER.China, PARTNER.Japan, ...EU];

  const url = 'https://comtradeapi.un.org/data/v1/get/C/A/HS'
    + '?reporterCode=124&flowCode=X'
    + `&cmdCode=${SOFTWOOD_HS.join(',')}`
    + `&partnerCode=${partners.join(',')}`
    + `&period=${years.join(',')}`
    + '&motCode=0';

  const res = await fetch(url, { headers: { 'Ocp-Apim-Subscription-Key': key } });
  if (!res.ok) throw new Error(`Comtrade: HTTP ${res.status}`);
  const json = await res.json();
  const rows = (json.data || []).filter((r) => r.partner2Code === 0);
  if (!rows.length) throw new Error('Comtrade: no rows');

  // sum primaryValue (USD) per year+partner across the 5 HS codes
  const sum = new Map(); // 'year|partnerCode' -> USD
  for (const r of rows) {
    const k = `${r.refYear}|${r.partnerCode}`;
    sum.set(k, (sum.get(k) || 0) + (r.primaryValue || 0));
  }
  const g = (y, pc) => sum.get(`${y}|${pc}`) || 0;
  const M = (usd) => Math.round(usd / 1e6);

  const series = [];
  for (const y of years) {
    const world = g(y, PARTNER.World);
    if (!world) continue;                              // skip years with no data
    const us = g(y, PARTNER.US), china = g(y, PARTNER.China), japan = g(y, PARTNER.Japan);
    const europe = EU.reduce((s, pc) => s + g(y, pc), 0);
    const other = Math.max(0, world - us - china - japan - europe);
    series.push({ period: String(y), US: M(us), China: M(china), Japan: M(japan), Europe: M(europe), Other: M(other) });
  }
  if (series.length < 3) throw new Error('Comtrade: too few years');

  return { unit: 'US$ millions', freq: 'annual', destinations: ['US', 'China', 'Japan', 'Europe', 'Other'], series };
}

// Manual check:  COMTRADE_KEY=... node pipeline/fetch/exports.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const e = await fetchCanadaExports();
  console.log(e ? `${e.series.length} years, last = ${JSON.stringify(e.series.at(-1))}` : 'null (no key)');
}
