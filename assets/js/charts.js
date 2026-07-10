/* charts.js — Chart.js wrappers, theme-aware, palette from CSS variables.
   One y-axis per chart (never dual-axis). Crosshair tooltips on time series. */
(function () {
  'use strict';

  const registry = new Map();   // canvasId -> Chart instance

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  // Read the current theme's tokens fresh each render so theme toggling works.
  function tokens() {
    const s = ['1','2','3','4','5','6','7','8'].map(i => cssVar('--series-' + i));
    return {
      series: s,
      text: cssVar('--text-primary'),
      textSecondary: cssVar('--text-secondary'),
      muted: cssVar('--text-muted'),
      grid: cssVar('--grid'),
      axis: cssVar('--axis'),
      surface: cssVar('--surface'),
    };
  }

  // hex (#rrggbb) -> rgba string with alpha
  function alpha(hex, a) {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map(c => c + c).join('') : h;
    const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), b = parseInt(n.slice(4, 6), 16);
    return `rgba(${r},${g},${b},${a})`;
  }

  function fontFamily() {
    return 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
  }

  // Thin x-axis labels so 100+ monthly points don't collide.
  function tickCallback(labels, targetTicks) {
    const step = Math.max(1, Math.round(labels.length / targetTicks));
    const last = labels.length - 1;
    return function (value, index) {
      if (index === last) return window.fmt.period(labels[index]); // always show latest period
      if (index % step !== 0) return '';
      if (last - index < step * 0.6) return '';                    // suppress ticks that would collide with the last one
      return window.fmt.period(labels[index]);
    };
  }

  function baseOptions(t, labels, opts) {
    opts = opts || {};
    return {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 4, right: 6, bottom: 0, left: 0 } },
      plugins: {
        legend: {
          display: opts.legend !== false,
          position: 'top',
          align: 'start',
          labels: {
            color: t.textSecondary, boxWidth: 11, boxHeight: 11, borderRadius: 3,
            useBorderRadius: true, padding: 14, font: { family: fontFamily(), size: 12.5 },
          },
        },
        tooltip: {
          backgroundColor: t.surface, titleColor: t.text, bodyColor: t.textSecondary,
          borderColor: t.axis, borderWidth: 1, padding: 10, cornerRadius: 8,
          titleFont: { family: fontFamily(), weight: '700', size: 12.5 },
          bodyFont: { family: fontFamily(), size: 12.5 }, boxPadding: 4,
          callbacks: {
            title: (items) => window.fmt.period(items[0].label),
            label: (ctx) => {
              const v = ctx.parsed.y;
              const unit = opts.unit ? ' ' + opts.unit : '';
              return `  ${ctx.dataset.label}: ${window.fmt.int(v)}${unit}`;
            },
          },
        },
      },
      scales: {
        x: {
          stacked: !!opts.stacked,
          grid: { display: false, drawTicks: false },
          border: { color: t.axis },
          ticks: {
            color: t.muted, font: { family: fontFamily(), size: 11 },
            maxRotation: 0, autoSkip: false,
            callback: tickCallback(labels, opts.xTicks || 8),
          },
        },
        y: {
          stacked: !!opts.stacked,
          beginAtZero: opts.beginAtZero !== false,
          grid: { color: t.grid, drawTicks: false },
          border: { display: false },
          ticks: {
            color: t.muted, font: { family: fontFamily(), size: 11 }, padding: 8,
            callback: (v) => window.fmt.compact(v),
          },
        },
      },
    };
  }

  function render(canvasId, config) {
    const el = document.getElementById(canvasId);
    if (!el) return null;
    if (registry.has(canvasId)) { registry.get(canvasId).destroy(); registry.delete(canvasId); }
    const chart = new Chart(el.getContext('2d'), config);
    registry.set(canvasId, chart);
    return chart;
  }

  // --- public chart builders ------------------------------------------------

  // Multi-line time series. series = [{label, data, slot}]
  function line(canvasId, labels, series, opts) {
    const t = tokens();
    const datasets = series.map((s) => {
      const c = t.series[(s.slot ?? 0) % 8];
      return {
        label: s.label, data: s.data, borderColor: c,
        backgroundColor: opts && opts.fill ? alpha(c, 0.12) : c,
        fill: !!(opts && opts.fill), tension: 0.25, borderWidth: 2,
        pointRadius: 0, pointHoverRadius: 5, pointHoverBackgroundColor: c,
        pointHoverBorderColor: t.surface, pointHoverBorderWidth: 2,
      };
    });
    return render(canvasId, { type: 'line', data: { labels, datasets }, options: baseOptions(t, labels, opts) });
  }

  // Stacked area — magnitude composition over time.
  function stackedArea(canvasId, labels, series, opts) {
    const t = tokens();
    const datasets = series.map((s) => {
      const c = t.series[(s.slot ?? 0) % 8];
      return {
        label: s.label, data: s.data, borderColor: c, backgroundColor: alpha(c, 0.55),
        fill: true, tension: 0.2, borderWidth: 1.5, pointRadius: 0, pointHoverRadius: 4,
      };
    });
    const o = Object.assign({ stacked: true }, opts);
    return render(canvasId, { type: 'line', data: { labels, datasets }, options: baseOptions(t, labels, o) });
  }

  // Vertical bars (single or grouped). series = [{label, data, slot}]
  function bar(canvasId, labels, series, opts) {
    const t = tokens();
    const datasets = series.map((s) => {
      const c = t.series[(s.slot ?? 0) % 8];
      return {
        label: s.label, data: s.data, backgroundColor: c, borderColor: c,
        borderRadius: 4, borderSkipped: 'bottom', maxBarThickness: 26,
        borderWidth: { top: 0, right: 2, bottom: 0, left: 2 },
      };
    });
    return render(canvasId, { type: 'bar', data: { labels, datasets }, options: baseOptions(t, labels, opts) });
  }

  // Stacked bars.
  function stackedBar(canvasId, labels, series, opts) {
    const o = Object.assign({ stacked: true }, opts);
    const t = tokens();
    const datasets = series.map((s) => {
      const c = t.series[(s.slot ?? 0) % 8];
      return { label: s.label, data: s.data, backgroundColor: c, borderColor: t.surface,
               borderWidth: 1, borderRadius: 2, maxBarThickness: 40 };
    });
    return render(canvasId, { type: 'bar', data: { labels, datasets }, options: baseOptions(t, labels, o) });
  }

  // Horizontal bars — e.g. capacity by region. items = [{label, value, slot}]
  function hbar(canvasId, items, opts) {
    opts = opts || {};
    const t = tokens();
    const labels = items.map(i => i.label);
    const data = items.map(i => i.value);
    const colors = items.map((i, idx) => t.series[(i.slot ?? idx) % 8]);
    const options = {
      indexAxis: 'y', responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: t.surface, titleColor: t.text, bodyColor: t.textSecondary,
          borderColor: t.axis, borderWidth: 1, padding: 10, cornerRadius: 8,
          callbacks: { label: (ctx) => ` ${window.fmt.int(ctx.parsed.x)}${opts.unit ? ' ' + opts.unit : ''}` },
        },
      },
      scales: {
        x: { beginAtZero: true, grid: { color: t.grid, drawTicks: false }, border: { display: false },
             ticks: { color: t.muted, font: { family: fontFamily(), size: 11 }, callback: (v) => window.fmt.compact(v) } },
        y: { grid: { display: false, drawTicks: false }, border: { color: t.axis },
             ticks: { color: t.textSecondary, font: { family: fontFamily(), size: 12 } } },
      },
    };
    return render(canvasId, {
      type: 'bar',
      data: { labels, datasets: [{ data, backgroundColor: colors, borderRadius: 4, maxBarThickness: 30 }] },
      options,
    });
  }

  function destroyAll() {
    registry.forEach((c) => c.destroy());
    registry.clear();
  }

  window.LumberCharts = { line, stackedArea, bar, stackedBar, hbar, destroyAll, seriesColors: () => tokens().series };
})();
