// fetch/price.mjs   — LIVE
// -----------------------------------------------------------------------------
// Lumber price benchmark (monthly), in US$ per thousand board feet.
//
// SOURCE: CME Lumber Futures (front-month continuous), ticker LBR=F, via Yahoo
// Finance's keyless chart endpoint. This is the tradeable price a lumber desk
// actually watches. History starts 2022 (when the current CME Lumber contract
// replaced the old Random-Length Lumber contract).
//
//   https://query1.finance.yahoo.com/v8/finance/chart/LBR=F?range=max&interval=1mo
//
// Robustness: Yahoo is an unofficial feed with no SLA (and may rate-limit CI IPs).
// On any failure this returns null and build-data falls back to sample data, so a
// bad price fetch never breaks the dashboard — it just reverts that one chart.
//
// Alternative if you want a bulletproof official feed (an index, not $/mbf):
//   FRED PPI "Lumber" WPU0811 via https://fred.stlouisfed.org/graph/fredgraph.csv?id=WPU0811
//
// Returns: { unit:'$/mbf', freq:'monthly', series:[{period:'YYYY-MM', framing_composite}] }
// (Key kept as `framing_composite` so the front-end schema is unchanged.)
// -----------------------------------------------------------------------------

const YAHOO = 'https://query1.finance.yahoo.com/v8/finance/chart/LBR=F?range=max&interval=1mo';

export async function fetchLumberPrice({ startYear = 2015 } = {}) {
  const res = await fetch(YAHOO, { headers: { 'User-Agent': 'Mozilla/5.0 (lumber-dashboard)' } });
  if (!res.ok) throw new Error(`Yahoo LBR=F: HTTP ${res.status}`);
  const json = await res.json();
  const result = json?.chart?.result?.[0];
  const ts = result?.timestamp;
  const close = result?.indicators?.quote?.[0]?.close;
  if (!ts || !close) throw new Error('Yahoo LBR=F: unexpected payload');

  // Bucket to one value per calendar month (last available close in the month).
  const byMonth = new Map();
  for (let i = 0; i < ts.length; i++) {
    const v = close[i];
    if (v == null) continue;
    const period = new Date(ts[i] * 1000).toISOString().slice(0, 7); // YYYY-MM
    byMonth.set(period, Math.round(v));
  }
  const series = [...byMonth.entries()]
    .filter(([p]) => Number(p.slice(0, 4)) >= startYear)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([period, framing_composite]) => ({ period, framing_composite }));

  if (!series.length) throw new Error('Yahoo LBR=F: no monthly points');
  return { unit: '$/mbf', freq: 'monthly', series };
}

// Manual check:  node pipeline/fetch/price.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const p = await fetchLumberPrice();
  console.log('price months:', p.series.length, '| first', p.series[0], '| last', p.series.at(-1));
}
