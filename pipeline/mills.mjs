// mills.mjs
// -----------------------------------------------------------------------------
// Builds the sawmill layer for the Fire & Mills map as a COMPREHENSIVE national
// census (not just the major producers), so mill density reflects reality rather
// than a data-sourcing artifact. Sources, best-available per province:
//
//   LIVE (fetched each run, keyless, machine-readable official datasets):
//     • BC  — BC Data Catalogue "Major Timber Processing Facilities" WFS,
//             PRODUCT_CODE=LBR (lumber). ~115 mills. Coords: exact.
//     • QC  — MRNF "Usines de transformation primaire du bois" CSV
//             (Données Québec), category 2 = bois de sciage. ~146 mills. Exact.
//
//   BAKED (pipeline/mills-census.json — provinces without a Node-friendly live
//   feed; refreshed occasionally, committed to the repo):
//     • ON  — Ontario MNRF "Forest resource mills" (xlsx), Sawmill-* types. 77. Exact.
//     • AB  — no open coordinate dataset exists; curated major producers. 13. Town.
//     • NB/NS/SK/NL/MB — no open coordinate datasets; curated major softwood
//             mills geocoded to town. 17. Town.
//
// Marker size tier (lg/md/sm) is derived from each source's native capacity so
// large mills read large across provinces; the popup shows capacity in native
// units (BC: MMbf lumber output; QC: permitted m³ roundwood — NOT the same unit,
// so we don't fabricate a single cross-province number).
//
// Any fetch failure is non-fatal; build-data carries the previous mills forward.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const UA = { 'User-Agent': 'lumber-dashboard/1.0 (industry map)' };

const tierMMbf = (c) => (c == null ? 'un' : c >= 100 ? 'lg' : c >= 30 ? 'md' : c > 0 ? 'sm' : 'un');

function cleanCompany(s) {
  return String(s || '')
    .replace(/\s+(Ltd\.?|Limited|Inc\.?|Corp\.?|Corporation|Industries|LP|ULP|ULC|ltée|inc\.?)\b\.?/gi, '')
    .replace(/\s{2,}/g, ' ').trim() || String(s || '').trim();
}

// ---- BC: WFS GeoJSON (live) -------------------------------------------------
const BC_OBJECT = 'WHSE_IMAGERY_AND_BASE_MAPS.GSR_TMBR_PRCSSING_FAC_SV';
const BC_WFS =
  `https://openmaps.gov.bc.ca/geo/pub/${BC_OBJECT}/ows?service=WFS&version=2.0.0` +
  `&request=GetFeature&typeName=pub:${BC_OBJECT}&outputFormat=application/json` +
  `&srsName=EPSG:4326&count=1000`;

async function fetchBC() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const gj = await (await fetch(BC_WFS, { headers: UA, signal: ctrl.signal })).json();
    const out = [];
    for (const f of gj.features || []) {
      const p = f.properties || {};
      if (p.PRODUCT_CODE !== 'LBR') continue;                 // lumber sawmills only
      const g = f.geometry || {};
      const lon = g.coordinates && g.coordinates[0], lat = g.coordinates && g.coordinates[1];
      if (typeof lat !== 'number' || typeof lon !== 'number') continue;
      const cap = Number(p.EST_AN_CAP_MLN_BOARD_FT) || 0;
      out.push({
        province: 'BC', company: cleanCompany(p.COMPANY_NAME), town: p.LOCALITY || null,
        lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        sizeTier: tierMMbf(cap || null), capacityMMbf: cap > 0 ? Math.round(cap) : null,
        capacityLabel: cap > 0 ? `${Math.round(cap)} MMbf/yr` : null,
        status: p.STATUS === 'Op' ? 'operating' : 'not reporting',
        coordAccuracy: 'exact', source: 'BC Major Timber Processing Facilities (live)',
      });
    }
    return out;
  } finally { clearTimeout(t); }
}

// ---- QC: MRNF CSV (live) ----------------------------------------------------
const QC_CSV = 'https://diffusion.mffp.gouv.qc.ca/Diffusion/DonneeGratuite/Foret/' +
  'TRANSFORMATION_BOIS/Usines_transformation_primaire/usinestransfo1.csv';

// Minimal quote-aware CSV line splitter (fields may be double-quoted with commas).
function splitCsv(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

async function fetchQC() {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const buf = Buffer.from(await (await fetch(QC_CSV, { headers: UA, signal: ctrl.signal })).arrayBuffer());
    const lines = buf.toString('utf8').split(/\r?\n/).filter(Boolean);
    const head = splitCsv(lines[0]).map((s) => s.trim());
    const ix = (k) => head.indexOf(k);
    const iCat = ix('catcomplet'), iName = ix('usicomplet'), iMun = ix('muncomplet'),
      iLat = ix('latitude'), iLon = ix('longitude'), iRes = ix('volresper'), iFeu = ix('volfeuper'), iDft = ix('qtedftde');
    const out = [];
    for (let i = 1; i < lines.length; i++) {
      const c = splitCsv(lines[i]);
      if (!(c[iCat] || '').trim().startsWith('2')) continue;   // 2 = bois de sciage (sawmills)
      const lat = parseFloat(c[iLat]), lon = parseFloat(c[iLon]);
      if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
      const m3 = Math.max((parseFloat(c[iRes]) || 0) + (parseFloat(c[iFeu]) || 0), parseFloat(c[iDft]) || 0);
      const tier = m3 >= 150000 ? 'lg' : m3 >= 40000 ? 'md' : m3 > 0 ? 'sm' : 'un';
      out.push({
        province: 'QC', company: (c[iName] || '').trim(),
        town: (c[iMun] || '').replace(/\s*\(\d+\)\s*$/, '').trim() || null,
        lat: +lat.toFixed(4), lon: +lon.toFixed(4),
        sizeTier: tier, capacityMMbf: null,
        capacityLabel: m3 > 0 ? `permitted ${Math.round(m3 / 1000)}k m³/yr (roundwood)` : null,
        status: 'operating', coordAccuracy: 'exact',
        source: 'MRNF Québec — Usines de transformation primaire (live)',
      });
    }
    return out;
  } finally { clearTimeout(t); }
}

// ---- ON / AB / Atlantic+Prairie: baked census (committed JSON) ---------------
function loadBaked() {
  try {
    const arr = JSON.parse(readFileSync(resolve(__dirname, 'mills-census.json'), 'utf8'));
    return arr.filter((m) => typeof m.lat === 'number' && typeof m.lon === 'number')
      .map((m) => ({
        province: m.province, company: m.company, town: m.town,
        lat: +Number(m.lat).toFixed(4), lon: +Number(m.lon).toFixed(4),
        sizeTier: m.sizeTier || tierMMbf(m.capacityMMbf), capacityMMbf: m.capacityMMbf ?? null,
        capacityLabel: m.capacityLabel || null, status: m.status || 'operating',
        coordAccuracy: m.coordAccuracy || 'town', source: m.source,
      }));
  } catch { return []; }
}

export async function fetchMills() {
  // Live provinces settle independently; a failure of one doesn't sink the rest.
  const [bcR, qcR] = await Promise.allSettled([fetchBC(), fetchQC()]);
  const bc = bcR.status === 'fulfilled' ? bcR.value : [];
  const qc = qcR.status === 'fulfilled' ? qcR.value : [];
  if (bcR.status === 'rejected') console.warn('[mills] BC fetch failed:', bcR.reason?.message);
  if (qcR.status === 'rejected') console.warn('[mills] QC fetch failed:', qcR.reason?.message);
  const features = [...bc, ...qc, ...loadBaked()];
  if (!features.length) throw new Error('no mills from any source');

  // All Canadian mills are western-hemisphere (lon < 0); guard the odd source
  // sign error (e.g. Ontario's Rickard Cedar is stored as +82.36 in the xlsx).
  for (const m of features) if (m.lon > 0) m.lon = -m.lon;

  const byProvince = {};
  for (const m of features) byProvince[m.province] = (byProvince[m.province] || 0) + 1;
  return {
    asOf: new Date().toISOString().slice(0, 10),
    count: features.length,
    live: { BC: bc.length, QC: qc.length },
    byProvince,
    note: 'Comprehensive census where an official geodataset exists (BC, QC, ON); ' +
      'major producers geocoded to town where none does (AB and the Atlantic/Prairie provinces).',
    sources: [
      'BC Data Catalogue — Major Timber Processing Facilities (live WFS)',
      'MRNF Québec — Usines de transformation primaire du bois (live CSV)',
      'Ontario MNRF — Forest resource mills (xlsx, baked)',
      'Company disclosures — AB + Atlantic/Prairie majors (town-level, baked)',
    ],
    features,
  };
}
