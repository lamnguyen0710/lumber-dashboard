/* app.js — routing, rendering, search, theme.  Data comes from window.LUMBER_DATA. */
(function () {
  'use strict';

  const DATA = window.LUMBER_DATA;
  const C = window.LumberCharts;
  const F = window.fmt;
  const view = document.getElementById('view');

  if (!DATA) {
    view.innerHTML = '<p style="padding:40px">Data failed to load. Run <code>node pipeline/build-data.mjs</code> to generate <code>data/dataset.js</code>.</p>';
    return;
  }

  // Stable company ordering → stable color slot per entity (color follows entity).
  const COMPANIES = Object.values(DATA.companies);
  const slotOf = {};
  COMPANIES.forEach((c, i) => { slotOf[c.id] = i % 8; });

  // ---- small helpers -------------------------------------------------------
  const seriesColors = C.seriesColors();
  const colorFor = (id) => seriesColors[slotOf[id]];
  // NB: Windows Chrome has no country-flag glyphs, so we use text, not emoji.
  const flag = (country) => (country === 'Canada' ? 'Canada' : country === 'US' ? 'United States' : country);
  const ccode = (country) => (country === 'Canada' ? 'CA' : 'US');

  function dutyExposure(co) {
    if (co.country === 'US') return { key: 'none', label: 'No CA duty exposure' };
    const hasUS = (co.regions || []).some(r => /US/.test(r.region));
    return hasUS ? { key: 'mixed', label: 'Partly duty-exposed' } : { key: 'high', label: 'High duty exposure' };
  }
  const pillClass = { none: 'pill--none', mixed: 'pill--mixed', high: 'pill--high' };

  function deltaBadge(pct, opts) {
    opts = opts || {};
    if (pct == null) return '<span class="tile__delta flat">—</span>';
    const good = opts.inverse ? pct < 0 : pct > 0;
    const cls = Math.abs(pct) < 0.05 ? 'flat' : good ? 'up' : 'down';
    const arrow = pct > 0 ? '▲' : pct < 0 ? '▼' : '•';
    const label = opts.label || 'YoY';
    const suffix = opts.suffix != null ? opts.suffix : '%';
    return `<span class="tile__delta ${cls}">${arrow} ${Math.abs(pct).toFixed(1)}${suffix} <span style="color:var(--text-muted);font-weight:500">${label}</span></span>`;
  }

  function tile(label, value, unit, delta, sub) {
    return `<div class="tile">
      <div class="tile__label">${label}</div>
      <div class="tile__value">${value}${unit ? `<span class="unit">${unit}</span>` : ''}</div>
      ${delta || ''}
      ${sub ? `<div class="tile__sub">${sub}</div>` : ''}
    </div>`;
  }

  const LIVE = (DATA.meta && DATA.meta.live) || {};
  function provBadgeBool(isLive) {
    return `<span class="prov ${isLive ? 'prov--live' : 'prov--sample'}" title="${isLive ? 'Live data from source' : 'Placeholder / sample data'}">${isLive ? 'LIVE' : 'SAMPLE'}</span>`;
  }
  const provBadge = (section) => provBadgeBool(!!LIVE[section]);

  function card(title, unit, note, canvasId, opts) {
    opts = opts || {};
    // opts.badge (boolean) wins; else opts.section looks up global provenance.
    const badge = opts.badge !== undefined ? provBadgeBool(opts.badge)
      : opts.section ? provBadge(opts.section) : '';
    return `<div class="card ${opts.span ? 'span-2' : ''}">
      <div class="card__head">
        <h3 class="card__title">${title} ${badge}</h3>
        <span class="card__unit">${unit || ''}</span>
      </div>
      ${note ? `<div class="card__note">${note}</div>` : ''}
      <div class="chart-wrap ${opts.tall ? 'tall' : ''}"><canvas id="${canvasId}"></canvas></div>
    </div>`;
  }

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function relTime(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 3600) return `${Math.max(1, Math.round(s / 60))}m ago`;
    if (s < 86400) return `${Math.round(s / 3600)}h ago`;
    if (s < 7 * 86400) return `${Math.round(s / 86400)}d ago`;
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  function newsSection(news) {
    const items = (news && news.items) || [];
    if (!items.length) {
      return `<section class="section-head"><h2>Lumber industry news</h2>
        <p>Live headlines populate when the data pipeline runs.</p></section>
        <div class="card span-2"><div class="card__note">No headlines yet — run <code>node pipeline/build-data.mjs</code> to fetch the feed.</div></div>`;
    }
    const updated = news.fetchedAt ? ` · updated ${relTime(news.fetchedAt)}` : '';
    const rows = items.map((n) => `<li class="news-item">
        <a class="news-title" href="${esc(n.url)}" target="_blank" rel="noopener">${esc(n.title)}</a>
        <div class="news-meta">${n.source ? `<span class="news-source">${esc(n.source)}</span>` : ''}<span class="news-time" data-date="${esc(n.date)}"></span></div>
      </li>`).join('');
    return `<section class="section-head"><h2>Lumber industry news <span class="news-live" title="Refreshes with the data pipeline">● LIVE</span></h2>
        <p>Latest across the softwood complex — prices, tariffs, mills and the public producers${updated}.</p></section>
      <div class="card span-2"><ul class="newsfeed">${rows}</ul></div>`;
  }
  function hydrateNewsTimes() {
    document.querySelectorAll('.news-time[data-date]').forEach((el) => { el.textContent = relTime(el.dataset.date); });
  }

  // Add a "download data" (CSV → Excel) button to every rendered chart card.
  const DL_ICON = '<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v11"/><path d="m7.5 10 4.5 4 4.5-4"/><path d="M5 20h14"/></svg>';
  function addChartExports() {
    C.chartIds().forEach((id) => {
      const canvas = document.getElementById(id);
      const head = canvas && canvas.closest('.card') && canvas.closest('.card').querySelector('.card__head');
      if (!head || head.querySelector('.card__export')) return;
      const title = ((head.querySelector('.card__title') || {}).textContent || id).replace(/\s+(LIVE|SAMPLE)\s*$/, '').trim();
      const fname = (title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || id).slice(0, 60);
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'card__export';
      btn.title = 'Download data (CSV — opens in Excel)';
      btn.innerHTML = DL_ICON;
      btn.addEventListener('click', () => C.exportChartCSV(id, fname));
      head.appendChild(btn);
    });
  }

  // =========================================================================
  // FIRE & SAWMILL MAP  (Leaflet — active fires over Canadian sawmills)
  // =========================================================================
  function renderFireMillMap() {
    const el = document.getElementById('fireMillMap');
    if (!el || !window.L || el._leaflet_id) return;           // no map, or already built
    const L = window.L;
    const mills = (DATA.mills && DATA.mills.features) || [];
    const fires = (DATA.fires && DATA.fires.points) || [];

    const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, minZoom: 3, maxZoom: 12 })
      .setView([57, -100], 4);
    // Scroll-wheel zoom only after a click, so the page still scrolls past the map.
    map.on('focus', () => map.scrollWheelZoom.enable());
    map.on('blur', () => map.scrollWheelZoom.disable());

    const dark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (dark) {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 12 }).addTo(map);
    } else {
      L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
        { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 12 }).addTo(map);
    }

    // ---- sawmills ---------------------------------------------------------
    const millLayer = L.layerGroup();
    // Marker size by capacity tier (derived per source from native capacity).
    const rTier = { lg: 8, md: 5.5, sm: 3.5, un: 4 };
    mills.forEach((m) => {
      const off = m.status !== 'operating';
      L.circleMarker([m.lat, m.lon], {
        radius: rTier[m.sizeTier] || 4,
        color: off ? '#8a8f98' : '#1f9d61',
        weight: 1, fillColor: off ? '#b9bec6' : '#37c884', fillOpacity: 0.72,
      }).bindPopup(
        `<b>${esc(m.company)}</b><br>${esc(m.town || '')}, ${esc(m.province)}` +
        `${m.capacityLabel ? `<br>${esc(m.capacityLabel)}` : ''}` +
        `<br><span style="color:${off ? '#a00' : '#0a0'}">${esc(m.status)}</span>` +
        `${m.coordAccuracy === 'town' ? '<br><small style="color:#888">approx. (town-level)</small>' : ''}` +
        `<br><small style="color:#888">${esc(m.source)}</small>`
      ).addTo(millLayer);
    });

    // ---- active fires (canvas renderer — handles thousands of points) -----
    const fireCanvas = L.canvas({ padding: 0.5 });
    const fireLayer = L.layerGroup();
    fires.forEach((p) => {
      const [lat, lon, frp, high] = p;
      L.circleMarker([lat, lon], {
        renderer: fireCanvas, radius: high ? 3.2 : 2.2, stroke: false,
        fillColor: high ? '#e53935' : '#fb8c00', fillOpacity: high ? 0.85 : 0.6,
      }).addTo(fireLayer);
    });

    millLayer.addTo(map);
    if (fires.length) fireLayer.addTo(map);
    const overlays = {};
    overlays[`Sawmills (${mills.length})`] = millLayer;
    if (fires.length) overlays[`Active fires 24h (${fires.length})`] = fireLayer;
    L.control.layers(null, overlays, { collapsed: false, position: 'topright' }).addTo(map);

    // ---- note under the title --------------------------------------------
    const note = document.getElementById('mapNote');
    if (note) {
      const millTxt = DATA.mills
        ? `${mills.length} lumber sawmills — official provincial censuses for BC, Québec &amp; Ontario, major producers geocoded to town elsewhere (as of ${DATA.mills.asOf}); marker size ≈ mill capacity`
        : '';
      const fireTxt = DATA.fires
        ? `${DATA.fires.count.toLocaleString()} active-fire detections in the last 48h${DATA.fires.capped ? ` (strongest ${DATA.fires.count.toLocaleString()} of ${DATA.fires.total.toLocaleString()} shown)` : ''}, updated ${relTime(DATA.fires.asOf)}`
        : 'fire layer activates once a FIRMS key is configured';
      note.innerHTML = [millTxt, fireTxt].filter(Boolean).join(' · ') +
        '. Click the map to zoom; toggle layers top-right.';
    }
    setTimeout(() => map.invalidateSize(), 0);   // ensure correct sizing after layout
  }

  // =========================================================================
  // INDUSTRY OVERVIEW
  // =========================================================================
  function renderIndustry() {
    const ind = DATA.industry;
    const prod = ind.production.series;
    const price = ind.price.series;
    const starts = ind.housingStarts.series;
    const permits = ind.housingPermits.series;
    const exp = ind.canadaExports;

    const lastProd = prod.at(-1);
    const lastPrice = price.at(-1);
    const lastStarts = starts.at(-1);
    const lastExp = exp.series.at(-1);
    const expFreq = exp.freq || 'quarterly';
    const expUnit = exp.unit || 'MMbf';
    const expPer = expFreq === 'annual' ? 'year' : 'quarter';
    const expShare = (row) => (row.US / exp.destinations.reduce((s, d) => s + row[d], 0)) * 100;
    const usShareNow = expShare(lastExp);
    const expYrAgo = exp.series.at(expFreq === 'annual' ? -2 : -5) || exp.series[0];
    const usShareYr = expShare(expYrAgo);

    // Latest Canada→US export volume from the live GAC region data (MBF → MMbf).
    const reg = ind.exportsByRegion;
    const regSum = (row) => (reg ? reg.regions.reduce((s, r) => s + (row[r] || 0), 0) : 0);
    const lastReg = reg && reg.series.at(-1);
    const lastRegTotal = lastReg ? regSum(lastReg) : 0;
    const regYrAgo = reg && reg.series.at(-13);
    const regYoY = regYrAgo ? (lastRegTotal - regSum(regYrAgo)) / regSum(regYrAgo) * 100 : null;

    const tiles = [
      reg
        ? tile('Canada→US lumber exports', F.int(Math.round(lastRegTotal / 1000)), 'MMbf', deltaBadge(regYoY), `${F.period(lastReg.period)} · to the US, all regions (GAC)`)
        : tile('N.A. lumber production', F.compact(lastProd.na_total), 'MMbf', deltaBadge(F.yoy(prod, 'na_total')), `${F.period(lastProd.period)} · US ${Math.round(lastProd.us_total / lastProd.na_total * 100)}% / CA ${Math.round(lastProd.canada_total / lastProd.na_total * 100)}%`),
      tile('Lumber price (CME)', F.money(lastPrice.framing_composite), '/mbf', deltaBadge(F.yoy(price, 'framing_composite')), `${F.period(lastPrice.period)} · front-month futures`),
      tile('US housing starts', F.int(lastStarts.total), 'K SAAR', deltaBadge(F.yoy(starts, 'total')), `${F.period(lastStarts.period)} · ${Math.round(lastStarts.single_family / lastStarts.total * 100)}% single-family`),
      tile('Canada→US export share', usShareNow.toFixed(0) + '%', '', deltaBadge(usShareNow - usShareYr, { suffix: ' pp' }), `of Canadian softwood exports · ${F.period(lastExp.period)}`),
    ];

    view.innerHTML = `
      <section class="section-head">
        <h2>Industry overview</h2>
        <p>North American softwood lumber — production, pricing, demand (US housing) and Canadian trade flows. Search a company above to drill in.</p>
      </section>
      <div class="tiles">${tiles.join('')}</div>

      <!-- Exports story (destination, origin, US share) on top; demand/price indicators below. -->
      <div class="grid" style="margin-top:20px">
        ${exp.volume
          ? `<div class="card span-2">
              <div class="card__head">
                <h3 class="card__title">Canadian softwood exports by destination ${provBadge('exports')}</h3>
                <div class="seg" id="expToggle">
                  <button type="button" data-metric="value" class="seg__btn is-active">$ Value</button>
                  <button type="button" data-metric="volume" class="seg__btn">Volume</button>
                </div>
              </div>
              <div class="card__note" id="expNote"></div>
              <div class="chart-wrap tall"><canvas id="chExports"></canvas></div>
            </div>`
          : card('Canadian softwood exports by destination', `${expUnit} / ${expPer} · stacked`, 'Where Canadian softwood lumber ships.', 'chExports', { span: true, tall: true, section: 'exports' })}
        ${ind.exportsByRegion ? card('Canada → US exports by region of origin', `${ind.exportsByRegion.unit} (thousand bd ft) / month · stacked`, 'Which Canadian regions mill the lumber going to the US (Global Affairs Canada export-permit data). The BC Interior\'s volumes have fallen sharply — mill curtailments and beetle-kill timber decline.', 'chRegionExports', { span: true, tall: true, section: 'regionExports' }) : ''}
        ${(ind.exportsByRegion && ind.exportsByRegion.forecast) ? `<div class="card span-2">
            <div class="card__head"><h3 class="card__title">Total Canada → US exports — 3-month forecast</h3><span class="card__unit">MBF / month · SARIMAX + permits &amp; lumber price</span></div>
            <div class="card__note">Total monthly exports (sum of regions) with a 3-month SARIMAX forecast (dashed) + 80% band (shaded), re-fit every pipeline run. Backtest (60-mo window, testing the recent declining regime): 1-month MAPE ≈ ${ind.exportsByRegion.forecast.backtestMAPE.h1}% is reliable; 3-month ≈ ${ind.exportsByRegion.forecast.backtestMAPE.h3}% (vs ${ind.exportsByRegion.forecast.backtestMAPE.naive}% naive) is directional and its band understates uncertainty — read the near month with more confidence.</div>
            <div class="chart-wrap tall"><canvas id="chExportForecast"></canvas></div>
          </div>` : ''}
        ${DATA.homebuilders ? `<div class="card span-2">
            <div class="card__head">
              <h3 class="card__title">Top-10 US homebuilder deliveries</h3>
              <span class="card__unit">homes / fiscal year · stacked · 2026E = guidance</span>
            </div>
            <div class="card__note">Homes delivered by the 10 largest US builders (SEC 10-Ks) — demand ≈ lumber consumed. 2026E uses management guidance (range midpoints); builders that give no guidance are held flat at their 2025 actual.</div>
            <div class="chart-wrap tall"><canvas id="chBuilders"></canvas></div>
          </div>` : ''}
        ${card('US share of Canadian exports', `% of total · ${expFreq}`, 'How reliant Canadian softwood is on the US market, by export value. The duties have squeezed volumes and prices more than they have redirected the wood elsewhere.', 'chUsShare', { span: true, section: 'exports' })}
        ${card('Lumber price — CME futures', '$/mbf · monthly', 'CME front-month lumber futures (LBR). The current contract launched in 2022, so this live series starts then.', 'chPrice', { section: 'price' })}
        ${card('US housing — starts vs. permits', 'thousands (SAAR) · monthly', 'The demand side. Permits lead starts; both cooled through the 2022–23 rate cycle.', 'chHousing', { section: 'housing' })}
        ${ind.newHomeSupply
          ? card("Months' supply of new homes", 'months · monthly', 'Unsold new-home inventory relative to the sales pace — a housing supply/demand balance gauge. Above ~6 months signals soft demand and less lumber buying.', 'chSupply', { section: 'housing' })
          : card('Industry inventory', 'index, 2015 avg = 100 · quarterly', 'Distributor/mill stock levels.', 'chInv', { section: 'production' })}
        ${ind.newHomeSales
          ? `<div class="card">
              <div class="card__head">
                <h3 class="card__title">US new home sales ${provBadge('housing')}</h3>
                <div class="seg" id="salesToggle">
                  <button type="button" data-mode="levels" class="seg__btn is-active">Levels</button>
                  <button type="button" data-mode="growth" class="seg__btn">YoY %</button>
                </div>
              </div>
              <div class="card__note" id="salesNote"></div>
              <div class="chart-wrap"><canvas id="chSales"></canvas></div>
            </div>`
          : ''}
        ${ind.activeListings ? card('US homes for sale — active listings', 'homes on the market · monthly', 'Existing unsold-home inventory (Realtor.com active listings). Crashed to ~350–500K in the 2021–22 shortage; back above 1.1M as supply normalizes — more inventory competes with new construction.', 'chListings', { span: true, section: 'housing' }) : ''}
        ${ind.multifamily ? card('Multi-family construction — starts vs. permits (5+ units)', 'thousands (SAAR) · monthly', 'New multi-family (5+ unit) starts and permits — Census via FRED. A secondary lumber-demand signal: mid/high-rise multi-family is less lumber-intensive than single-family, but low-rise/garden apartments are wood-framed.', 'chMFStartsPermits', { span: true, section: 'housing' }) : ''}
        ${ind.multifamily ? card('Multi-family under construction (5+ units)', 'thousands of units · monthly', 'Units in 5+ unit buildings currently under construction — the pipeline backlog, near multi-decade highs. As it works off it sustains (then eventually reduces) multi-family lumber demand.', 'chMFUnderConstruction', { section: 'housing' }) : ''}
        ${DATA.stumpage ? `<div class="card span-2">
            <div class="card__head"><h3 class="card__title">Canadian stumpage by region</h3><span class="card__unit">C$/m³ · softwood sawlogs · ${esc(DATA.stumpage.asOf)}</span></div>
            <div class="card__note">${esc(DATA.stumpage.note)}</div>
            <div class="chart-wrap"><canvas id="chStumpage"></canvas></div>
          </div>` : ''}
      </div>

      ${(DATA.mills || DATA.fires) ? `
      <section class="section-head"><h2>Wildfire &amp; sawmill map ${DATA.fires ? '<span class="news-live" title="Fires refresh with the data pipeline">● LIVE</span>' : ''}</h2>
        <p>Active fire detections (NASA FIRMS, last 48h) over Canada's lumber sawmills. Fire season disrupts log supply, rail and mill operations across the softwood basket — proximity of fire to mills is a real supply-risk signal.</p></section>
      <div class="card span-2">
        <div class="card__head">
          <h3 class="card__title">Active fires &amp; sawmills</h3>
          <div class="map-legend">
            <span class="mlg"><i class="dot dot--fire-h"></i>Fire (high conf.)</span>
            <span class="mlg"><i class="dot dot--fire"></i>Fire</span>
            <span class="mlg"><i class="dot dot--mill"></i>Sawmill</span>
            <span class="mlg"><i class="dot dot--mill-off"></i>Curtailed / n/r</span>
          </div>
        </div>
        <div class="card__note" id="mapNote"></div>
        <div id="fireMillMap" class="map-wrap"></div>
      </div>` : ''}

      ${newsSection(ind.news)}

      <section class="section-head"><h2>Company comparison</h2>
        <p>Publicly traded lumber producers we track. Click a row for the full company view.</p></section>
      ${companyTable()}
    `;

    // charts
    C.line('chPrice', price.map(p => p.period), [
      { label: 'Framing composite', data: price.map(p => p.framing_composite), slot: 5 },
    ], { unit: '$/mbf', legend: false, xTicks: 7, fill: true });

    C.line('chHousing', starts.map(p => p.period), [
      { label: 'Starts (total)', data: starts.map(p => p.total), slot: 0 },
      { label: 'Permits (total)', data: permits.map(p => p.total), slot: 2 },
    ], { unit: 'K SAAR', xTicks: 7 });

    const expLabels = exp.series.map(p => p.period);
    const expTicks = expFreq === 'annual' ? exp.series.length : 8;

    // Draw the destination chart in the chosen metric ($ value or volume), and
    // wire the toggle. Annual (few points) reads better as stacked bars.
    const expNoteFor = (metric) => {
      const unit = metric === 'volume' ? 'MMbf (million bd ft) / year · stacked' : 'US$ millions / year · stacked';
      const tail = metric === 'volume'
        ? 'Physical volume shipped. The US stays the dominant destination; Japan is the largest non-US buyer.'
        : 'Export value. Even through the US duties + tariff, the US stays ~85% of value; Japan is the largest non-US buyer.';
      return `${unit} — ${tail}`;
    };
    function drawExports(metric) {
      const src = (metric === 'volume' && exp.volume) ? exp.volume : exp;
      const datasets = exp.destinations.map((d, i) => ({ label: d, data: src.series.map(r => r[d]), slot: i }));
      const labels = src.series.map(p => p.period);
      if (expFreq === 'annual') C.stackedBar('chExports', labels, datasets, { unit: src.unit, xTicks: expTicks });
      else C.stackedArea('chExports', labels, datasets, { unit: src.unit, xTicks: expTicks });
      const noteEl = document.getElementById('expNote');
      if (noteEl) noteEl.textContent = expNoteFor(metric);
    }
    drawExports('value');
    const expTog = document.getElementById('expToggle');
    if (expTog) expTog.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-metric]');
      if (!btn) return;
      expTog.querySelectorAll('.seg__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
      drawExports(btn.dataset.metric);
    });

    if (ind.exportsByRegion) {
      const reg = ind.exportsByRegion;
      C.stackedArea('chRegionExports', reg.series.map(p => p.period),
        reg.regions.map((r, i) => ({ label: r, data: reg.series.map(row => row[r]), slot: i })),
        { unit: reg.unit, xTicks: 9 });

      // Companion: total Canada→US exports with the 3-month SARIMAX forecast.
      if (reg.forecast && reg.forecast.series) {
        const fc = reg.forecast;
        const actual = reg.series.map(row => reg.regions.reduce((s, r) => s + row[r], 0));
        C.forecastLine('chExportForecast', reg.series.map(p => p.period), actual,
          { series: fc.series, connect: fc.lastActual.value }, { unit: reg.unit });
      }
    }

    C.line('chUsShare', expLabels, [
      { label: 'US share', data: exp.series.map(r => +expShare(r).toFixed(1)), slot: 0 },
    ], { unit: '%', legend: false, xTicks: expTicks, beginAtZero: false });

    if (ind.newHomeSupply) {
      C.line('chSupply', ind.newHomeSupply.series.map(p => p.period), [
        { label: "Months' supply", data: ind.newHomeSupply.series.map(p => p.value), slot: 1 },
      ], { unit: 'months', legend: false, xTicks: 7, beginAtZero: false });
    } else {
      C.line('chInv', ind.inventory.series.map(p => p.period), [
        { label: 'Inventory index', data: ind.inventory.series.map(p => p.index), slot: 1 },
      ], { unit: '', legend: false, xTicks: 8, beginAtZero: false });
    }

    // New home sales — Levels ⇄ YoY-growth toggle.
    if (ind.newHomeSales) {
      const hs = ind.newHomeSales.series;
      const salesLabels = hs.map(p => p.period);
      const yoy = hs.map((p, i) => (i >= 12 && hs[i - 12].value ? +(((p.value - hs[i - 12].value) / hs[i - 12].value) * 100).toFixed(1) : null));
      const salesNoteFor = (mode) => mode === 'growth'
        ? 'Year-over-year % change in new single-family home sales — the growth signal for new-construction lumber demand.'
        : 'New single-family homes sold, thousands (SAAR) — Census. A direct new-construction demand signal for lumber.';
      function drawSales(mode) {
        if (mode === 'growth') {
          C.line('chSales', salesLabels, [{ label: 'New home sales YoY', data: yoy, slot: 3 }], { unit: '%', legend: false, xTicks: 7, beginAtZero: false });
        } else {
          C.line('chSales', salesLabels, [{ label: 'New home sales', data: hs.map(p => p.value), slot: 3 }], { unit: 'K SAAR', legend: false, xTicks: 7, fill: true });
        }
        const el = document.getElementById('salesNote');
        if (el) el.textContent = salesNoteFor(mode);
      }
      drawSales('levels');
      const salesTog = document.getElementById('salesToggle');
      if (salesTog) salesTog.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-mode]');
        if (!btn) return;
        salesTog.querySelectorAll('.seg__btn').forEach((b) => b.classList.toggle('is-active', b === btn));
        drawSales(btn.dataset.mode);
      });
    }

    if (ind.activeListings) {
      C.line('chListings', ind.activeListings.series.map(p => p.period), [
        { label: 'Active listings', data: ind.activeListings.series.map(p => p.value), slot: 5 },
      ], { unit: 'homes', legend: false, xTicks: 8, beginAtZero: false, fill: true });
    }

    if (ind.multifamily) {
      const mfc = ind.multifamily.construction.series;
      C.line('chMFStartsPermits', mfc.map(p => p.period), [
        { label: 'Starts (5+)', data: mfc.map(p => p.starts), slot: 0 },
        { label: 'Permits (5+)', data: mfc.map(p => p.permits), slot: 2 },
      ], { unit: 'K SAAR', xTicks: 7, beginAtZero: false });
      const mfu = ind.multifamily.underConstruction.series;
      C.line('chMFUnderConstruction', mfu.map(p => p.period), [
        { label: 'Under construction (5+)', data: mfu.map(p => p.value), slot: 4 },
      ], { unit: 'K units', legend: false, xTicks: 7, beginAtZero: false, fill: true });
    }

    if (DATA.stumpage && DATA.stumpage.regions) {
      C.hbar('chStumpage', DATA.stumpage.regions.map((r) => ({ label: r.region, value: r.rate, slot: 0 })), { unit: 'C$/m³' });
    }

    // Homebuilder deliveries — stacked bar by fiscal year (top 7 builders + Other),
    // with a final "2026E" bar from management guidance.
    if (DATA.homebuilders && DATA.homebuilders.builders) {
      const hb = DATA.homebuilders;
      const labels = hb.years.map(String).concat(['2026E']);
      const series = (b) => [...b.deliveries, b.expected2026];
      const top = hb.builders.slice(0, 7);
      const rest = hb.builders.slice(7);
      const datasets = top.map((b, i) => ({ label: b.ticker, data: series(b), slot: i }));
      if (rest.length) datasets.push({ label: 'Other', data: labels.map((_, idx) => rest.reduce((s, b) => s + series(b)[idx], 0)), slot: 7 });
      C.stackedBar('chBuilders', labels, datasets, { unit: 'homes', xTicks: labels.length });
    }

    wireTableRows();
    hydrateNewsTimes();
    renderFireMillMap();
  }

  function companyTable() {
    const rows = COMPANIES.map((co) => {
      const prod = co.production.series;
      const last = prod.at(-1);
      const yoy = F.yoy(prod);
      const de = dutyExposure(co);
      const yoyTxt = yoy == null ? '—' : `<span style="color:${yoy >= 0 ? 'var(--good)' : 'var(--bad)'}">${F.signed(yoy)}%</span>`;
      return `<tr data-co="${co.id}">
        <td class="name"><span class="co-dot" style="background:${colorFor(co.id)}"></span>${co.name}</td>
        <td>${co.ticker}</td>
        <td>${ccode(co.country)}</td>
        <td>${F.int(last.value)} <span style="color:var(--text-muted)">${co.production.unit}</span></td>
        <td>${yoyTxt}</td>
        <td>${co.capacityMMbf ? F.int(co.capacityMMbf) : '—'}</td>
        <td>${co.marketCapB != null ? F.money(co.marketCapB, 1) + 'B' : '—'}</td>
        <td><span class="pill ${pillClass[de.key]}">${de.key === 'none' ? 'None' : de.key === 'mixed' ? 'Mixed' : 'High'}</span></td>
      </tr>`;
    }).join('');
    return `<div class="table-wrap"><table class="cmp">
      <thead><tr>
        <th class="name">Company</th><th>Ticker</th><th>Country</th>
        <th>Latest prod.</th><th>YoY</th><th>Capacity (MMbf)</th><th>Mkt cap</th><th>CA duty</th>
      </tr></thead>
      <tbody>${rows}</tbody></table></div>`;
  }

  function wireTableRows() {
    document.querySelectorAll('table.cmp tbody tr').forEach((tr) => {
      tr.addEventListener('click', () => { location.hash = '#/company/' + tr.dataset.co; });
    });
  }

  // =========================================================================
  // COMPANY DETAIL
  // =========================================================================
  function renderCompany(id) {
    const co = DATA.companies[id];
    if (!co) { location.hash = '#/'; return; }

    const prod = co.production.series;
    const rev = co.revenue.series;
    const inv = co.inventory.series;
    const de = dutyExposure(co);
    const lastProd = prod.at(-1), lastRev = rev.at(-1);
    const regionsWithData = (co.capacityByRegion || []).filter(r => r.mmbf != null);
    const isBF = /MMbf/.test(co.production.unit);
    const revLive = !!(co.live && co.live.revenue);
    const prodLive = !!(co.live && co.live.production);
    const ind = DATA.industry.production.series;

    view.innerHTML = `
      <button class="btn btn--back" id="backBtn">← Industry overview</button>
      <div class="co-head">
        <div class="co-badge" style="background:${colorFor(co.id)}">${co.ticker}</div>
        <div class="co-head__main">
          <h2>${co.name}</h2>
          <div class="co-head__tags">
            <span class="chip chip--flag">${co.ticker} · ${co.exchange}</span>
            <span class="chip">${flag(co.country)}</span>
            <span class="chip">${co.hq}</span>
            ${co.marketCapB != null ? `<span class="chip">Mkt cap ${F.money(co.marketCapB, 1)}B</span>` : ''}
            <span class="pill ${pillClass[de.key]}">${de.label}</span>
          </div>
          <p class="co-desc">${co.description}</p>
          <div class="co-head__tags">${(co.segments || []).map(s => `<span class="chip">${s}</span>`).join('')}</div>
        </div>
      </div>

      <div class="tiles" style="margin-top:22px">
        ${tile('Latest production', F.int(lastProd.value), co.production.unit.replace('MMbf', 'MMbf').replace('MMsf (3/8")', 'MMsf'), deltaBadge(F.yoy(prod)), F.period(lastProd.period))}
        ${tile('Latest revenue', F.money(lastRev.value), 'M', deltaBadge(F.yoy(rev)), F.period(lastRev.period))}
        ${tile('Lumber capacity', co.capacityMMbf ? F.int(co.capacityMMbf) : 'n/a', co.capacityMMbf ? 'MMbf/yr' : '', '', co.capacityMMbf ? 'nameplate' : 'not a dimensional-lumber producer')}
        ${tile('Inventory index', inv.at(-1).index.toFixed(0), '', deltaBadge(F.yoy(inv, 'index'), { inverse: true }), '2015 avg = 100')}
      </div>

      <div class="grid" style="margin-top:20px">
        ${card('Production by quarter', co.production.unit + ' · quarterly', prodLive ? 'Live from SEC filings — lumber volume parsed from the 10-Q/10-K MD&A tables.' : '', 'coProd', { tall: false, badge: prodLive })}
        ${card('Revenue by quarter', 'M USD · quarterly', revLive ? 'Live from SEC EDGAR (us-gaap Revenues, XBRL).' : '', 'coRev', { badge: revLive })}
        ${card('Inventory index', '2015 avg = 100 · quarterly', 'Lower can signal tight supply / strong shipments.', 'coInv', { badge: false })}
        ${regionsWithData.length
          ? card('Lumber capacity by region', 'MMbf/yr', 'Geographic mix — US capacity is not exposed to Canadian duties.', 'coRegions', { badge: false })
          : `<div class="card"><div class="card__head"><h3 class="card__title">Capacity by region ${provBadgeBool(false)}</h3></div>
             <div class="card__note">${co.name} reports OSB/siding volumes rather than board-foot lumber capacity, so a regional MMbf breakdown isn't applicable. Operating regions: ${(co.regions || []).map(r => r.region).join(', ')}.</div></div>`}
        ${isBF ? card('Share of North American production', '% of N.A. total · quarterly', 'This producer as a fraction of total N.A. softwood output.', 'coShare', { span: true, badge: false }) : ''}
      </div>
    `;

    document.getElementById('backBtn').addEventListener('click', () => { location.hash = '#/'; });

    const qLabels = prod.map(p => p.period);
    C.bar('coProd', qLabels, [{ label: co.name, data: prod.map(p => p.value), slot: slotOf[co.id] }], { unit: co.production.unit, legend: false, xTicks: 8 });
    C.bar('coRev', rev.map(p => p.period), [{ label: 'Revenue', data: rev.map(p => p.value), slot: 2 }], { unit: 'M USD', legend: false, xTicks: 8 });
    C.line('coInv', inv.map(p => p.period), [{ label: 'Inventory index', data: inv.map(p => p.index), slot: 1 }], { legend: false, xTicks: 8, beginAtZero: false });
    if (regionsWithData.length) {
      C.hbar('coRegions', regionsWithData.map((r, i) => ({ label: r.region, value: r.mmbf, slot: i })), { unit: 'MMbf/yr' });
    }
    if (isBF) {
      const byPeriod = Object.fromEntries(ind.map(r => [r.period, r.na_total]));
      C.line('coShare', qLabels, [{
        label: 'Share of N.A. production',
        data: prod.map(p => byPeriod[p.period] ? +(p.value / byPeriod[p.period] * 100).toFixed(2) : null),
        slot: slotOf[co.id],
      }], { unit: '%', legend: false, xTicks: 8, beginAtZero: false });
    }
  }

  // =========================================================================
  // SEARCH
  // =========================================================================
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');
  let activeIdx = -1, matches = [];

  function runSearch(q) {
    q = q.trim().toLowerCase();
    matches = !q ? COMPANIES.slice() : COMPANIES.filter(c =>
      c.name.toLowerCase().includes(q) || c.ticker.toLowerCase().includes(q) || c.country.toLowerCase().includes(q));
    activeIdx = -1;
    if (!matches.length) {
      searchResults.innerHTML = '<li class="empty">No companies match.</li>';
    } else {
      searchResults.innerHTML = matches.map((c, i) =>
        `<li role="option" data-idx="${i}" data-co="${c.id}">
          <span class="tick" style="background:${colorFor(c.id)}"></span>
          <span class="name">${c.name}</span>
          <span class="meta">${c.ticker} · ${ccode(c.country)}</span>
        </li>`).join('');
    }
    searchResults.hidden = false;
    searchResults.querySelectorAll('li[data-co]').forEach((li) => {
      li.addEventListener('mousedown', (e) => { e.preventDefault(); go(li.dataset.co); });
    });
  }
  function go(id) {
    searchResults.hidden = true; searchInput.value = ''; location.hash = '#/company/' + id;
  }
  function highlight() {
    searchResults.querySelectorAll('li').forEach((li, i) => li.setAttribute('aria-selected', i === activeIdx));
  }
  searchInput.addEventListener('input', () => runSearch(searchInput.value));
  searchInput.addEventListener('focus', () => runSearch(searchInput.value));
  searchInput.addEventListener('keydown', (e) => {
    if (searchResults.hidden) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); activeIdx = Math.min(activeIdx + 1, matches.length - 1); highlight(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); activeIdx = Math.max(activeIdx - 1, 0); highlight(); }
    else if (e.key === 'Enter' && matches.length) { e.preventDefault(); go(matches[Math.max(0, activeIdx)].id); }
    else if (e.key === 'Escape') { searchResults.hidden = true; }
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('search').contains(e.target)) searchResults.hidden = true;
  });

  // =========================================================================
  // THEME
  // =========================================================================
  const themeToggle = document.getElementById('themeToggle');
  function applyTheme(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    try { localStorage.setItem('lumber-theme', mode); } catch (e) {}
  }
  themeToggle.addEventListener('click', () => {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    route(); // re-render so Chart.js picks up new theme tokens
  });
  (function initTheme() {
    let saved = null;
    try { saved = localStorage.getItem('lumber-theme'); } catch (e) {}
    if (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) saved = 'dark';
    applyTheme(saved || 'light');
  })();

  // =========================================================================
  // CHROME (banner, footer) + ROUTER
  // =========================================================================
  (function initChrome() {
    const m = DATA.meta || {};
    const live = m.live || {};
    const NAMES = { production: 'N.A. industry production', price: 'lumber price', housing: 'US housing', exports: 'Canadian exports', regionExports: 'exports by region of origin', companies: 'company revenue + production (US filers)' };
    const keys = Object.keys(NAMES);
    const liveNames = keys.filter(k => live[k]).map(k => NAMES[k]);
    const sampleNames = keys.filter(k => !live[k]).map(k => NAMES[k]);
    const banner = document.getElementById('placeholderBanner');
    if (!m.isPlaceholder) {
      banner.hidden = true;
    } else if (liveNames.length) {
      banner.hidden = false;
      banner.innerHTML = `<strong>Partially live.</strong> Live now: <strong>${liveNames.join(', ')}</strong>. ` +
        `Still sample data: ${sampleNames.join(', ')} — synthetic until each pipeline source is wired up. Charts are tagged <span class="prov prov--live">LIVE</span> / <span class="prov prov--sample">SAMPLE</span>.`;
    } else {
      banner.hidden = false;
      banner.innerHTML = `<strong>Sample data.</strong> All charts use synthetic values so the dashboard is fully explorable. The daily pipeline will replace them with live data on the same schema.`;
    }
    document.getElementById('footerMeta').textContent =
      `Data through ${m.dataThrough || '—'} · updated ${m.lastUpdated || '—'}`;
    document.getElementById('footerSources').innerHTML =
      'Sources: ' + (m.sources || []).map(s => s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.name.split(' — ')[0]}</a>` : s.name.split(' — ')[0]).join(', ');
  })();

  function route() {
    C.destroyAll();
    const hash = location.hash || '#/';
    if (hash.startsWith('#/company/')) renderCompany(decodeURIComponent(hash.replace('#/company/', '')));
    else renderIndustry();
    addChartExports();
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);
  document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/'; }));
  route();
})();
