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
      </div>

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

    wireTableRows();
    hydrateNewsTimes();
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
    window.scrollTo({ top: 0 });
  }
  window.addEventListener('hashchange', route);
  document.querySelectorAll('[data-nav]').forEach(a => a.addEventListener('click', (e) => { e.preventDefault(); location.hash = '#/'; }));
  route();
})();
