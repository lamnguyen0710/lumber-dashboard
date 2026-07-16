// fires.mjs
// -----------------------------------------------------------------------------
// Builds the active-fire layer for the Fire & Mills map from NASA FIRMS —
// the same near-real-time satellite hotspot feed behind firms.modaps.eosdis.nasa.gov.
//
// Uses the FIRMS Area API (CSV), pulling the most recent 24h of VIIRS 375 m
// detections over a Canada + adjacent-US bounding box. VIIRS_NOAA20 and
// VIIRS_SNPP are fetched and merged for fuller coverage. Detections land within
// ~60 min of satellite overpass, so a 6-hour pipeline cadence stays current.
//
// Needs a free FIRMS MAP_KEY (env FIRMS_KEY); without it the step no-ops and the
// build carries forward the previous fires. Low-confidence hits are dropped and
// the set is capped to the strongest by fire radiative power to bound payload
// size — Canadian fire season can produce many thousands of detections a day.
//
//   FIRMS_KEY=xxxx node pipeline/fires.mjs      # standalone test
// -----------------------------------------------------------------------------

// Canada (plus a little of the northern US border) — west,south,east,north.
const BBOX = '-141,41,-52,71';
const SOURCES = ['VIIRS_NOAA20_NRT', 'VIIRS_SNPP_NRT'];
// 2-day window, NOT 1. FIRMS "1 day" returns only the current UTC day, which is
// barely processed early in the day — a cron firing ~06:00 UTC once returned just
// 124 detections for all of Canada while a midday pull had 8,486. Two days always
// captures at least one fully-processed day, so the count is stable regardless of
// when the scheduled build runs.
const DAY_RANGE = 2;
// Safety ceiling only — not a FIRMS limit. We keep ALL credible (nominal/high-
// confidence, de-duplicated) detections; this bound just prevents a pathological
// peak-fire-season day (Canada has topped 40k detections/day) from bloating
// data/dataset.js, which every page load downloads. On a normal/heavy day every
// fire is shown; only an extreme day is trimmed to the strongest by FRP.
const MAX_POINTS = 25000;

const UA = { 'User-Agent': 'lumber-dashboard/1.0 (industry map)' };

function parseCsv(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const head = lines[0].split(',').map((s) => s.trim());
  const iLat = head.indexOf('latitude');
  const iLon = head.indexOf('longitude');
  const iConf = head.indexOf('confidence');
  const iFrp = head.indexOf('frp');
  const iDate = head.indexOf('acq_date');
  if (iLat < 0 || iLon < 0) return [];   // not a data CSV (e.g. an error message)
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = lines[i].split(',');
    const lat = parseFloat(c[iLat]);
    const lon = parseFloat(c[iLon]);
    if (Number.isNaN(lat) || Number.isNaN(lon)) continue;
    // VIIRS confidence is l/n/h — drop low-confidence noise.
    const conf = iConf >= 0 ? String(c[iConf]).trim().toLowerCase() : 'n';
    if (conf === 'l' || conf === 'low') continue;
    const frp = iFrp >= 0 ? parseFloat(c[iFrp]) : 0;
    out.push({ lat, lon, frp: Number.isNaN(frp) ? 0 : frp, high: conf === 'h' || conf === 'high', date: iDate >= 0 ? c[iDate] : null });
  }
  return out;
}

async function fetchSource(key, source) {
  const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/${source}/${BBOX}/${DAY_RANGE}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 45000);
  try {
    const r = await fetch(url, { headers: UA, signal: ctrl.signal });
    const txt = await r.text();
    if (/Invalid|error|MAP_KEY/i.test(txt.slice(0, 200)) && !/latitude/i.test(txt.slice(0, 200))) {
      throw new Error(`FIRMS ${source}: ${txt.slice(0, 120)}`);
    }
    return parseCsv(txt);
  } finally {
    clearTimeout(t);
  }
}

export async function fetchFires(key) {
  if (!key) return null;
  const all = [];
  for (const src of SOURCES) {
    try {
      const rows = await fetchSource(key, src);
      all.push(...rows);
    } catch (e) {
      console.warn(`[fires] ${src} failed: ${e.message}`);
    }
  }
  if (!all.length) return null;

  // De-dup NOAA20/SNPP overlap by ~1 km grid cell, keeping the higher FRP.
  const grid = new Map();
  for (const p of all) {
    const k = `${p.lat.toFixed(2)},${p.lon.toFixed(2)}`;
    const cur = grid.get(k);
    if (!cur || p.frp > cur.frp) grid.set(k, p);
  }
  let pts = [...grid.values()].sort((a, b) => b.frp - a.frp);
  const total = pts.length;
  if (pts.length > MAX_POINTS) pts = pts.slice(0, MAX_POINTS);

  // Compact: [lat, lon, frp(rounded), high?1:0] — keeps dataset.js small.
  const points = pts.map((p) => [
    +p.lat.toFixed(3), +p.lon.toFixed(3), Math.round(p.frp), p.high ? 1 : 0,
  ]);

  return {
    asOf: new Date().toISOString(),
    source: 'NASA FIRMS — VIIRS 375m (NOAA-20 + S-NPP), last 48h',
    dayRange: DAY_RANGE,
    total,                 // detections before the payload cap
    count: points.length,  // detections actually stored
    capped: total > MAX_POINTS,
    fields: ['lat', 'lon', 'frp', 'high'],
    points,
  };
}

// Standalone test: FIRMS_KEY=xxxx node pipeline/fires.mjs
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('fires.mjs')) {
  fetchFires(process.env.FIRMS_KEY).then((f) => {
    if (!f) { console.log('[fires] no data (missing FIRMS_KEY?)'); return; }
    console.log(`[fires] ${f.count} points (of ${f.total}) — strongest FRP ${f.points[0]?.[2]}`);
  }).catch((e) => console.error('[fires]', e.message));
}
