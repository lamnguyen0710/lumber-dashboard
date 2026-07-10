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

  function card(title, unit, note, canvasId, opts) {
    opts = opts || {};
    return `<div class="card ${opts.span ? 'span-2' : ''}">
      <div class="card__head">
        <h3 class="card__title">${title}</h3>
        <span class="card__unit">${unit || ''}</span>
      </div>
      ${note ? `<div class="card__note">${note}</div>` : ''}
      <div class="chart-wrap ${opts.tall ? 'tall' : ''}"><canvas id="${canvasId}"></canvas></div>
    </div>`;
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
    const usShareNow = (lastExp.US / exp.destinations.reduce((s, d) => s + lastExp[d], 0)) * 100;
    const expYrAgo = exp.series.at(-5) || exp.series[0];
    const usShareYr = (expYrAgo.US / exp.destinations.reduce((s, d) => s + expYrAgo[d], 0)) * 100;

    const tiles = [
      tile('N.A. lumber production', F.compact(lastProd.na_total), 'MMbf', deltaBadge(F.yoy(prod, 'na_total')), `${F.period(lastProd.period)} · US ${Math.round(lastProd.us_total / lastProd.na_total * 100)}% / CA ${Math.round(lastProd.canada_total / lastProd.na_total * 100)}%`),
      tile('Framing lumber price', F.money(lastPrice.framing_composite), '/mbf', deltaBadge(F.yoy(price, 'framing_composite')), `${F.period(lastPrice.period)} composite`),
      tile('US housing starts', F.int(lastStarts.total), 'K SAAR', deltaBadge(F.yoy(starts, 'total')), `${F.period(lastStarts.period)} · ${Math.round(lastStarts.single_family / lastStarts.total * 100)}% single-family`),
      tile('Canada→US export share', usShareNow.toFixed(0) + '%', '', deltaBadge(usShareNow - usShareYr, { suffix: ' pp' }), `of Canadian softwood exports · ${F.period(lastExp.period)}`),
    ];

    view.innerHTML = `
      <section class="section-head">
        <h2>Industry overview</h2>
        <p>North American softwood lumber — production, pricing, demand (US housing) and Canadian trade flows. Search a company above to drill in.</p>
      </section>
      <div class="tiles">${tiles.join('')}</div>

      <div class="grid" style="margin-top:20px">
        ${card('North American lumber production', 'MMbf / quarter · stacked by origin', 'US vs. Canadian mills. Total ≈ ' + F.compact(lastProd.na_total * 4) + ' MMbf annualized.', 'chProd', { span: true, tall: true })}
        ${card('Framing lumber composite price', '$/mbf · monthly', 'Note the 2021 shortage spike toward $1,500+/mbf and the 2022 rate-shock reversal.', 'chPrice')}
        ${card('US housing — starts vs. permits', 'thousands (SAAR) · monthly', 'The demand side. Permits lead starts; both cooled through the 2022–23 rate cycle.', 'chHousing')}
        ${card('Canadian softwood exports by destination', 'MMbf / quarter · stacked', 'Where the wood goes. Watch US share give way to China / Japan / Europe as duties + tariffs bite.', 'chExports', { span: true, tall: true })}
        ${card('US share of Canadian exports', '% of total · quarterly', 'The trade-diversion story in one line — declining reliance on the US market.', 'chUsShare')}
        ${card('Industry inventory', 'index, 2015 avg = 100 · quarterly', 'Distributor/mill stock levels. Sharp 2021 drawdown, then rebuild.', 'chInv')}
      </div>

      <section class="section-head"><h2>US trade actions on Canadian lumber</h2>
        <p>Duty and tariff milestones that reshape where Canadian producers ship.</p></section>
      <div class="card span-2">
        <ul class="timeline">
          ${ind.tradeActions.map(a => `<li><span class="date">${F.period(a.date)}</span><div><div class="label">${a.label}</div><div class="detail">${a.detail}</div></div></li>`).join('')}
        </ul>
      </div>

      <section class="section-head"><h2>Company comparison</h2>
        <p>Publicly traded lumber producers we track. Click a row for the full company view.</p></section>
      ${companyTable()}
    `;

    // charts
    const qLabels = prod.map(p => p.period);
    C.stackedArea('chProd', qLabels, [
      { label: 'United States', data: prod.map(p => p.us_total), slot: 0 },
      { label: 'Canada', data: prod.map(p => p.canada_total), slot: 1 },
    ], { unit: 'MMbf', xTicks: 8 });

    C.line('chPrice', price.map(p => p.period), [
      { label: 'Framing composite', data: price.map(p => p.framing_composite), slot: 5 },
    ], { unit: '$/mbf', legend: false, xTicks: 7, fill: true });

    C.line('chHousing', starts.map(p => p.period), [
      { label: 'Starts (total)', data: starts.map(p => p.total), slot: 0 },
      { label: 'Permits (total)', data: permits.map(p => p.total), slot: 2 },
    ], { unit: 'K SAAR', xTicks: 7 });

    C.stackedArea('chExports', exp.series.map(p => p.period),
      exp.destinations.map((d, i) => ({ label: d, data: exp.series.map(r => r[d]), slot: i })),
      { unit: 'MMbf', xTicks: 8 });

    C.line('chUsShare', exp.series.map(p => p.period), [
      { label: 'US share', data: exp.series.map(r => +(r.US / exp.destinations.reduce((s, d) => s + r[d], 0) * 100).toFixed(1)), slot: 0 },
    ], { unit: '%', legend: false, xTicks: 8, beginAtZero: false });

    C.line('chInv', ind.inventory.series.map(p => p.period), [
      { label: 'Inventory index', data: ind.inventory.series.map(p => p.index), slot: 1 },
    ], { unit: '', legend: false, xTicks: 8, beginAtZero: false });

    wireTableRows();
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
        ${card('Production by quarter', co.production.unit + ' · quarterly', '', 'coProd', { tall: false })}
        ${card('Revenue by quarter', 'M USD · quarterly', '', 'coRev')}
        ${card('Inventory index', '2015 avg = 100 · quarterly', 'Lower can signal tight supply / strong shipments.', 'coInv')}
        ${regionsWithData.length
          ? card('Lumber capacity by region', 'MMbf/yr', 'Geographic mix — US capacity is not exposed to Canadian duties.', 'coRegions')
          : `<div class="card"><div class="card__head"><h3 class="card__title">Capacity by region</h3></div>
             <div class="card__note">${co.name} reports OSB/siding volumes rather than board-foot lumber capacity, so a regional MMbf breakdown isn't applicable. Operating regions: ${(co.regions || []).map(r => r.region).join(', ')}.</div></div>`}
        ${isBF ? card('Share of North American production', '% of N.A. total · quarterly', 'This producer as a fraction of total N.A. softwood output.', 'coShare', { span: true }) : ''}
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
    if (m.isPlaceholder) {
      document.getElementById('placeholderBanner').hidden = false;
      document.getElementById('placeholderText').textContent =
        ' Charts use synthetic values so the dashboard is fully explorable. The monthly pipeline will replace them with live data on the same schema.';
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
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);
  document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/'; }));
  route();
})();
