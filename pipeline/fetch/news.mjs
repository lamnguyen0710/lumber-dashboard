// fetch/news.mjs   — LIVE (keyless)
// -----------------------------------------------------------------------------
// Lumber-industry news board (Bloomberg/Cap IQ style). Two kinds of source:
//
//  1. FEA — Forest Economic Advisors (getfea.com/feed/), a curated forest-products
//     market feed. This is a MAIN-FOCUS source: all its items are guaranteed onto
//     the board and flagged focus:true so the front-end can highlight them.
//  2. Google News RSS — two focused queries (market/policy + the public producers),
//     free and keyless, to broaden coverage.
//
// Everything is merged, de-duplicated, and presented newest-first. Refreshes
// whenever the pipeline runs; the front-end shows relative timestamps.
//
// Returns: { fetchedAt:ISO, items:[{title, url, source, date:ISO, focus?}] }  (or null)
// -----------------------------------------------------------------------------

const FEA_FEED = 'https://getfea.com/feed/';
const GOOGLE_QUERIES = [
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

// Parse RSS <item>s. defaultSource is used when the feed has no <source> tag
// (Google News embeds one; a plain WordPress feed like FEA's does not).
function parseItems(xml, defaultSource) {
  const items = [];
  for (const m of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const b = m[1];
    const pick = (re) => (b.match(re) || [])[1] || '';
    let title = decodeEntities(pick(/<title>([\s\S]*?)<\/title>/));
    const link = decodeEntities(pick(/<link>([\s\S]*?)<\/link>/));
    const source = decodeEntities(pick(/<source[^>]*>([\s\S]*?)<\/source>/)) || defaultSource;
    const pub = pick(/<pubDate>([\s\S]*?)<\/pubDate>/);
    const date = new Date(pub);
    if (!title || !link || isNaN(date)) continue;
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    items.push({ title, url: link, source, date: date.toISOString() });
  }
  return items;
}

async function fetchXml(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (lumber-dashboard)' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const keyOf = (it) => it.title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 60);
function dedup(arr) {
  const seen = new Set(), out = [];
  for (const it of arr) {
    const k = keyOf(it);
    if (!k || seen.has(k)) continue;
    seen.add(k); out.push(it);
  }
  return out;
}

export async function fetchNews({ limit = 30 } = {}) {
  // FEA — main-focus source, always kept.
  let fea = [];
  try {
    fea = parseItems(await fetchXml(FEA_FEED), 'Forest Economic Advisors').map((it) => ({ ...it, focus: true }));
  } catch (e) { console.warn(`[news] FEA ${e.message}`); }

  // Google News — broader coverage.
  const google = [];
  for (const q of GOOGLE_QUERIES) {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=en-US&gl=US&ceid=US:en`;
    try { google.push(...parseItems(await fetchXml(url), '')); }
    catch (e) { console.warn(`[news] ${e.message}`); }
  }
  if (!fea.length && !google.length) return null;

  const feaD = dedup(fea.sort((a, b) => b.date.localeCompare(a.date)));
  const feaKeys = new Set(feaD.map(keyOf));
  const googleD = dedup(google.sort((a, b) => b.date.localeCompare(a.date))).filter((it) => !feaKeys.has(keyOf(it)));

  // FEA leads the board as the main-focus source (its items newest-first), then
  // Google headlines fill below (newest-first) for broader coverage.
  const items = [...feaD, ...googleD].slice(0, limit);
  return { fetchedAt: new Date().toISOString(), items };
}

// Manual check:  node pipeline/fetch/news.mjs
import { pathToFileURL } from 'node:url';
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const n = await fetchNews();
  console.log(`${n.items.length} items (${n.items.filter((i) => i.focus).length} FEA):`);
  for (const it of n.items.slice(0, 12)) console.log(` ${it.focus ? '★' : ' '} ${it.title.slice(0, 70)} — ${it.source} (${it.date.slice(0, 10)})`);
}
