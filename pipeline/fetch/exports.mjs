// fetch/exports.mjs   — NOT YET LIVE (see findings below)
// -----------------------------------------------------------------------------
// Canadian softwood lumber exports by destination country (quarterly / annual).
// The "where is the wood going?" chart — the core trade-diversion story
// (US duties + tariff → are Canadian producers shipping to China/Japan/Europe?).
//
// Softwood sawn lumber = HS 4407.11 (pine), 4407.12 (fir/spruce),
// 4407.13 (SPF mix, new in HS2022), 4407.14 (hem-fir), 4407.19 (other coniferous).
//
// FINDINGS (2026-07) on keyless online sources — both current keyless paths fail
// for *complete* data, so this needs one of the two real options below:
//
//   ✗ UN Comtrade "preview" endpoint (comtradeapi.un.org/public/v1/preview/...) is
//     keyless but returns TRUNCATED/partial data — Canada→US spruce came back as
//     ~56k m³ vs. the tens of millions actually shipped. Not usable.
//   ✗ StatCan CIMT (the authoritative source) is an interactive web app; the
//     softwood-by-country series is a "special extraction", not a documented API.
//
//   ✓ OPTION A — UN Comtrade full API with a free key.
//       Register a free subscription key at https://comtradedeveloper.un.org/ ,
//       set it as env COMTRADE_KEY (repo secret), then call:
//         https://comtradeapi.un.org/data/v1/get/C/A/HS?reporterCode=124
//           &flowCode=X&cmdCode=440711,440712,440713,440714,440719
//           &partnerCode=842,156,392,0&period=2015,2016,...&includeDesc=true
//         header: { 'Ocp-Apim-Subscription-Key': process.env.COMTRADE_KEY }
//       Take the aggregate rows only: motCode===0 && partner2Code===0.
//       Bucket partners → US(842) / China(156) / Japan(392) / Europe(sum of EU
//       members) / Other(World − named). Value in USD (primaryValue) or volume
//       (qty, m³ → MMbf ×0.42378). (A key is required because I can't create
//        accounts — that's a quick sign-up on your side.)
//
//   ✓ OPTION B — StatCan CIMT special extraction (no key, manual).
//       Pull the softwood-by-partner table from the CIMT web app once, drop the
//       CSV in the repo, and parse it here (like the old internal-pivot plan).
//
// Return shape (unchanged): { unit, freq, destinations:[...], series:[{period, <dest>...}] }
// Return null (current behavior) to keep the sample data + SAMPLE badge.
// -----------------------------------------------------------------------------

export const SOFTWOOD_HS = ['440711', '440712', '440713', '440714', '440719'];
export const PARTNERS = { US: 842, China: 156, Japan: 392, World: 0 };

export async function fetchCanadaExports() {
  // Wire up Option A once COMTRADE_KEY is available (see header). Until then,
  // returning null keeps the realistic sample series in place.
  if (!process.env.COMTRADE_KEY) return null;
  // TODO: implement the keyed Comtrade pull described above.
  return null;
}
