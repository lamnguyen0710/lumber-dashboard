// fetch/index.mjs
// -----------------------------------------------------------------------------
// Real-data orchestrator. Today this is a SCAFFOLD: each source module returns
// null (not yet implemented) and we fall back to placeholder values so the build
// never breaks. Wire the sources up one at a time — as each starts returning
// real data it transparently replaces the placeholder for that section only.
//
// This is the file to focus on when we build out "the pipeline" together.
// -----------------------------------------------------------------------------

import { fetchHousing } from './housing.mjs';
import { fetchCanadaExports } from './exports.mjs';
import { fetchCompanies } from './companies.mjs';
import { fetchLumberPrice } from './price.mjs';
import { fetchIndustryProduction } from './production.mjs';

// Merge a real section over the placeholder section when the real one exists.
function useOrFallback(real, placeholder, label) {
  if (real && (Array.isArray(real.series) ? real.series.length : Object.keys(real).length)) {
    console.log(`[fetch] ${label}: LIVE`);
    return real;
  }
  console.log(`[fetch] ${label}: fallback → placeholder`);
  return placeholder;
}

export async function fetchLiveDataset({ fallback }) {
  const base = fallback();               // full placeholder dataset as a safety net

  const [housing, exports, companies, price, production] = await Promise.all([
    fetchHousing().catch((e) => (console.warn('[fetch] housing error', e.message), null)),
    fetchCanadaExports().catch((e) => (console.warn('[fetch] exports error', e.message), null)),
    fetchCompanies().catch((e) => (console.warn('[fetch] companies error', e.message), null)),
    fetchLumberPrice().catch((e) => (console.warn('[fetch] price error', e.message), null)),
    fetchIndustryProduction().catch((e) => (console.warn('[fetch] production error', e.message), null)),
  ]);

  // Track which sections are backed by live sources (for per-chart provenance).
  const live = { production: false, price: false, housing: false, exports: false, companies: false };

  const industry = { ...base.industry };
  if (production) { industry.production = useOrFallback(production, base.industry.production, 'industry.production'); live.production = !!production; }
  if (price) { industry.price = useOrFallback(price, base.industry.price, 'industry.price'); live.price = !!price; }
  if (housing) {
    industry.housingStarts = useOrFallback(housing.starts, base.industry.housingStarts, 'housingStarts');
    industry.housingPermits = useOrFallback(housing.permits, base.industry.housingPermits, 'housingPermits');
    live.housing = !!housing;
  }
  if (exports) { industry.canadaExports = useOrFallback(exports, base.industry.canadaExports, 'canadaExports'); live.exports = !!exports; }
  live.companies = !!(companies && Object.keys(companies).length);

  const allLive = live.production && live.price && live.housing && live.exports && live.companies;

  const merged = {
    meta: {
      ...base.meta,
      isPlaceholder: !allLive,
      live,   // section-level provenance, consumed by the front-end badges
    },
    industry,
    companies: live.companies ? companies : base.companies,
  };
  return merged;
}
