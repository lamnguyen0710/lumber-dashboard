// mills.mjs
// -----------------------------------------------------------------------------
// Builds the sawmill layer for the Fire & Mills map. Two sources, merged:
//
//   1. British Columbia — the official "Major Timber Processing Facilities"
//      geospatial dataset (BC Data Catalogue / BC Geographic Warehouse), pulled
//      LIVE each run via WFS as GeoJSON. Keyless, updated by the province (last
//      refresh 2026-06). BC is the core of Canadian softwood — West Fraser,
//      Canfor, Interfor, Tolko, Weyerhaeuser all mill here — so we take every
//      operating lumber mill it lists.
//
//   2. The rest of Canada — a curated list of the major publicly-traded
//      producers' sawmills OUTSIDE BC (Alberta, the Prairies, Ontario, Quebec,
//      the East), geocoded from company disclosures. Kept in producer-mills.json.
//      BC is already covered comprehensively by source 1, so curated BC entries
//      are dropped to avoid double-counting.
//
// Mills don't move, so this is a slow-changing reference layer (the map's daily
// pulse is the fire layer). Any fetch failure is non-fatal — build-data carries
// forward the previous mills so the map never goes blank.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const BC_OBJECT = 'WHSE_IMAGERY_AND_BASE_MAPS.GSR_TMBR_PRCSSING_FAC_SV';
const BC_WFS =
  `https://openmaps.gov.bc.ca/geo/pub/${BC_OBJECT}/ows?service=WFS&version=2.0.0` +
  `&request=GetFeature&typeName=pub:${BC_OBJECT}&outputFormat=application/json` +
  `&srsName=EPSG:4326&count=1000`;

const UA = { 'User-Agent': 'lumber-dashboard/1.0 (industry map)' };

// Tidy the province's company strings a little for display.
function cleanCompany(s) {
  return String(s || '')
    .replace(/\s+(Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|Industries|Mills|LP|ULP|ULC)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim() || String(s || '').trim();
}

async function fetchBC() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const r = await fetch(BC_WFS, { headers: UA, signal: ctrl.signal });
    const gj = await r.json();
    const feats = gj.features || [];
    const mills = [];
    for (const f of feats) {
      const p = f.properties || {};
      // PRODUCT_CODE 'LBR' = lumber. That's the sawmill filter — it excludes the
      // province's pulp (PLP/PPR), pellet (PLT), veneer/plywood (VNR/PLY), OSB,
      // shake-&-shingle (SS), pole/post (LGH/UTI/PST) and log-home plants.
      if (p.PRODUCT_CODE !== 'LBR') continue;
      const cap = Number(p.EST_AN_CAP_MLN_BOARD_FT) || 0;
      const g = f.geometry || {};
      const lon = g.coordinates && g.coordinates[0];
      const lat = g.coordinates && g.coordinates[1];
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      mills.push({
        name: cleanCompany(p.COMPANY_NAME) + (p.LOCALITY ? ` — ${p.LOCALITY}` : ''),
        company: cleanCompany(p.COMPANY_NAME),
        town: p.LOCALITY || null,
        province: 'BC',
        lat: +lat.toFixed(4),
        lon: +lon.toFixed(4),
        capacityMMbf: cap > 0 ? Math.round(cap) : null,
        status: p.STATUS === 'Op' ? 'operating' : 'unknown',
        source: 'BC Major Timber Processing Facilities',
      });
    }
    return mills;
  } finally {
    clearTimeout(t);
  }
}

function loadProducerMills() {
  try {
    const raw = readFileSync(resolve(__dirname, 'producer-mills.json'), 'utf8');
    const arr = JSON.parse(raw);
    // BC is already covered comprehensively by the official dataset.
    return arr
      .filter((m) => m && m.province && m.province !== 'BC')
      .filter((m) => typeof m.lat === 'number' && typeof m.lon === 'number')
      .map((m) => ({
        name: m.name,
        company: m.company,
        town: m.town || null,
        province: m.province,
        lat: +Number(m.lat).toFixed(4),
        lon: +Number(m.lon).toFixed(4),
        capacityMMbf: m.capacityMMbf != null ? Math.round(m.capacityMMbf) : null,
        status: m.status || 'operating',
        source: m.source || 'Company disclosures',
      }));
  } catch {
    return [];
  }
}

export async function fetchMills() {
  const bc = await fetchBC();                 // may throw → caller handles
  const other = loadProducerMills();          // never throws
  const features = bc.concat(other);
  const byProv = {};
  for (const m of features) byProv[m.province] = (byProv[m.province] || 0) + 1;
  return {
    asOf: new Date().toISOString().slice(0, 10),
    count: features.length,
    byProvince: byProv,
    sources: [
      'BC Data Catalogue — Major Timber Processing Facilities (WFS, live)',
      'Company disclosures — major producers’ mills outside BC (curated)',
    ],
    features,
  };
}
