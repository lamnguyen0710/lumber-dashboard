/* format.js — small number/label helpers shared across the app. */
(function () {
  'use strict';

  const fmt = {
    // 15450 -> "15,450"
    int(n) { return n == null ? '—' : Math.round(n).toLocaleString('en-US'); },

    // compact large numbers: 15450 -> "15.5K", 2200000 -> "2.2M"
    compact(n) {
      if (n == null) return '—';
      const abs = Math.abs(n);
      if (abs >= 1e9) return (n / 1e9).toFixed(1) + 'B';
      if (abs >= 1e6) return (n / 1e6).toFixed(1) + 'M';
      if (abs >= 1e3) return (n / 1e3).toFixed(1) + 'K';
      return String(Math.round(n));
    },

    money(n, d = 0) { return n == null ? '—' : '$' + Number(n).toLocaleString('en-US', { maximumFractionDigits: d }); },
    pct(n, d = 1) { return n == null ? '—' : (n >= 0 ? '' : '') + n.toFixed(d) + '%'; },
    signed(n, d = 1) { return (n >= 0 ? '+' : '') + n.toFixed(d); },

    // "2024Q3" -> "Q3 '24" ;  "2024-07" -> "Jul '24"
    period(p) {
      if (!p) return '';
      if (p.includes('Q')) { const [y, q] = p.split('Q'); return `Q${q} '${y.slice(2)}`; }
      if (p.includes('-')) {
        const [y, m] = p.split('-');
        const mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][Number(m) - 1];
        return `${mon} '${y.slice(2)}`;
      }
      return p;
    },

    // year-over-year % change on a quarterly series (4 back) or monthly (12 back)
    yoy(series, key = 'value') {
      if (!series || series.length < 2) return null;
      const back = series[0].period.includes('Q') ? 4 : 12;
      if (series.length <= back) return null;
      const last = series.at(-1)[key];
      const prior = series.at(-1 - back)[key];
      if (prior == null || prior === 0) return null;
      return ((last - prior) / prior) * 100;
    },
  };

  window.fmt = fmt;
})();
