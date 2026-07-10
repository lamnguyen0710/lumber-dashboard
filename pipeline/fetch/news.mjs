// fetch/news.mjs   — LIVE (keyless)
// -----------------------------------------------------------------------------
// Lumber-industry news board (Bloomberg/Cap IQ style). Pulls headlines from
// Google News RSS — free, no API key. Two focused queries (market/policy + the
// public producers) are merged, de-duplicated, and sorted newest-first.
//
//   https://news.google.com/rss/search?q=<query>&hl=en-US&gl=US&ceid=US:en
//
// Refreshes whenever the pipeline runs (daily by default; bump the workflow cron
// for more frequent updates). The front-end shows relative timestamps computed at
// view time, so "3h ago" stays accurate between builds.
//
// Returns: { fetchedAt:ISO, items:[{title, url, source, date:ISO}] }  (or null)
// -----------------------------------------------------------------------------

const QUERIES = [
  '"softwood lumber" OR "lumber prices" OR "lumber futures" OR "lumber tariff" OR "lumber duty" OR "sawmill output" OR "lumber market"',
  '(Weyerhaeuser OR "West Fraser" OR Canfor OR Interfor OR "Louisiana-Pacific" OR PotlatchDeltic OR GreenFirst) (lumber OR mill OR earnings OR production)',
];

function decodeEntities(s) {
  return s
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&').replace(/&#0*39;|&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchFeed(query) {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (lumber-dashboard)' } });
  if (!res.ok) throw new Error(`news HTTP ${res.status}`);
  const xml = await res.text();
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const pick = (re) => (b.match(re) || [])[1] || '';
    let title = decodeEntities(pick(/<title>([\s\S]*?)<\/title>/));
    const link = decodeEntities(pick(/<link>([\s\S]*?)<\/link>/));
    const source = decodeEntities(pick(/<source[^>]*>([\s\S]*?)<\/source>/));
    const pub = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const date = new Date(pub);
    if (!title || !link || isNaN(date)) continue;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3)); // de-dupe source suffix
    items.push({ title, url: link, source, date: date.toISOString() });
  }
  return items;
}

export async function fetchNews({ limit = 30 } = {}) {
  const all = [];
  for (const q of QUERIES) {
    try { all.push(...await fetchFeed(q)); }
    catch (e) { console.warn(`[news] ${e.message}`); }
  }
  if (!all.length) return null;

  all.sort((a, b) => b.date.localeCompare(a.date));
  const seen = new Set(), out = [];
  for (const it of all) {
    const key = it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return { fetchedAt: new Date().toISOString(), items: out.slice(0, limit) };
}

// Manual check:  node pipeline/fetch/news.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = await fetchNews();
  console.log(`${n.items.length} items:`);
  for (const it of n.items.slice(0, 8)) console.log(' •', it.title, '—', it.source, '(' + it.date.slice(0, 10) + ')');
}
