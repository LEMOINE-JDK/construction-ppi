// Shared helpers for the LEMOINE construction dashboard pages. No external libraries.
(() => {
  'use strict';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const $ = (s, el = document) => el.querySelector(s);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const sign = (v) => (v > 0 ? '+' : v < 0 ? '−' : '');
  const fmtPct = (v, d = 1) => (v == null || isNaN(v) ? '–' : sign(v) + Math.abs(v).toFixed(d) + '%');
  const fmtPts = (v, d = 1) => (v == null || isNaN(v) ? '–' : sign(v) + Math.abs(v).toFixed(d) + ' pts');
  const fmtIdx = (v) => (v == null ? '–' : v.toFixed(1));
  const fmtNum = (v, d = 0) => (v == null ? '–' : v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmtSigned = (v, d = 1) => (v == null ? '–' : sign(v) + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));
  const fmtMoney = (v) => (v == null ? '–' : v.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
  const fmtBil = (millions, d = 1) => (millions == null ? '–' : '$' + (millions / 1000).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }) + 'B');
  const fmtMonth = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}` : '–');
  const fmtMonthShort = (ym) => (ym ? `${MON[+ym.slice(5, 7) - 1]} '${ym.slice(2, 4)}` : '–');
  const cssVar = (n) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const tone = (v) => (v == null ? '' : v > 0 ? 'pos' : v < 0 ? 'neg' : '');
  const addMonths = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = y * 12 + (m - 1) + n; return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`; };
  const monthDiff = (a, b) => { const [ya, ma] = a.split('-').map(Number); const [yb, mb] = b.split('-').map(Number); return (yb - ya) * 12 + (mb - ma); };

  async function loadJSON(name) {
    if (window.__DATA && window.__DATA[name]) return window.__DATA[name];
    const res = await fetch(name, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`${name} returned ${res.status}`);
    return res.json();
  }

  function setStamp(label, generatedAt) {
    const up = new Date(generatedAt);
    $('#stamp').innerHTML = `<strong>Data through ${esc(label)}</strong>Checked ${up.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;
  }

  function niceTicks(lo, hi, n = 5) {
    const span = hi - lo || Math.abs(hi) || 1; const raw = span / n; const mag = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= n) || 10 * mag;
    const t0 = Math.floor(lo / step) * step, t1 = Math.ceil(hi / step) * step; const ticks = [];
    for (let v = t0; v <= t1 + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    if (ticks.length < 2) ticks.push(t0 + step);
    return ticks;
  }

  function spark(values, n = 25) {
    const h = values.slice(-n);
    const pts = h.map((v, i) => [i, v]).filter(([, v]) => v != null);
    if (pts.length < 2) return '';
    const vs = pts.map((p) => p[1]); const lo = Math.min(...vs), hi = Math.max(...vs); const span = hi - lo || 1;
    const W = 200, H = 34; const X = (i) => (i / (n - 1) * W).toFixed(1); const Y = (v) => (H - 3 - (v - lo) / span * (H - 6)).toFixed(1);
    const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${X(i)},${Y(v)}`).join('');
    const [li, lv] = pts[pts.length - 1];
    return `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${cssVar('--ink-3')}" stroke-width="1.5" vector-effect="non-scaling-stroke"/><circle cx="${X(li)}" cy="${Y(lv)}" r="3" fill="${cssVar('--gold')}"/></svg>`;
  }

  /**
   * Line chart into an <svg>. opts: { months, lines: [{label, values, color, width, dash}], yFmt, tipFmt, zero, keyEl, tipEl }
   */
  function lineChart(svg, opts) {
    const box = svg.getBoundingClientRect(); const W = Math.round(box.width) || 800, H = Math.round(box.height) || 320;
    const m = { l: 58, r: 14, t: 12, b: 28 };
    const { months, lines } = opts;
    const vals = lines.flatMap((l) => l.values).filter((v) => v != null);
    if (!vals.length) { svg.innerHTML = ''; return; }
    let lo = Math.min(...vals), hi = Math.max(...vals);
    if (opts.zero) { lo = Math.min(lo, 0); hi = Math.max(hi, 0); }
    if (opts.baseline != null) { lo = Math.min(lo, opts.baseline); hi = Math.max(hi, opts.baseline); }
    const ticks = niceTicks(lo, hi); lo = ticks[0]; hi = ticks[ticks.length - 1];
    const x = (i) => m.l + (months.length > 1 ? i / (months.length - 1) : 0) * (W - m.l - m.r);
    const y = (v) => m.t + (1 - (v - lo) / (hi - lo || 1)) * (H - m.t - m.b);
    const ink2 = cssVar('--ink-2'), rule = cssVar('--rule'), ink = cssVar('--ink');
    const yFmt = opts.yFmt || ((v) => v);
    const ref = opts.zero ? 0 : opts.baseline;
    let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="transparent"/>`;
    for (const t of ticks) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="${t === ref ? ink : rule}" stroke-width="${t === ref ? 1.2 : 1}"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" font-size="11" fill="${ink2}">${yFmt(t)}</text>`;
    const yearStep = months.length > 96 ? 2 : 1;
    months.forEach((mm, i) => { if (mm.endsWith('-01') && (+mm.slice(0, 4)) % yearStep === 0) g += `<line x1="${x(i)}" x2="${x(i)}" y1="${H - m.b}" y2="${H - m.b + 4}" stroke="${ink2}"/><text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${ink2}">${mm.slice(0, 4)}</text>`; });
    lines.forEach((l) => {
      let d = '', pen = false;
      l.values.forEach((v, i) => { if (v == null) { pen = false; return; } d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      g += `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="${l.width || 2.2}" stroke-linejoin="round"${l.dash ? ` stroke-dasharray="${l.dash}"` : ''}/>`;
      let li = l.values.length - 1; while (li > 0 && l.values[li] == null) li--;
      if (l.values[li] != null) g += `<circle cx="${x(li)}" cy="${y(l.values[li])}" r="3.5" fill="${l.color}"/>`;
    });
    g += `<line class="xh" x1="0" x2="0" y1="${m.t}" y2="${H - m.b}" stroke="${ink2}" stroke-dasharray="3 3" visibility="hidden"/>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = g;
    if (opts.keyEl) opts.keyEl.innerHTML = lines.map((l) => `<span><i style="background:${l.color}"></i>${esc(l.label)}</span>`).join('');
    const tip = opts.tipEl, xh = svg.querySelector('.xh');
    if (!tip) return;
    const tipFmt = opts.tipFmt || yFmt;
    svg.onmousemove = (e) => {
      const r = svg.getBoundingClientRect(); const px = (e.clientX - r.left) * (W / r.width);
      const i = Math.max(0, Math.min(months.length - 1, Math.round((px - m.l) / (W - m.l - m.r) * (months.length - 1))));
      xh.setAttribute('x1', x(i)); xh.setAttribute('x2', x(i)); xh.setAttribute('visibility', 'visible');
      tip.innerHTML = `<b>${fmtMonth(months[i])}</b><br>` + lines.map((l) => `<span style="color:${l.color}">■</span> ${esc(l.short || l.label)}: ${tipFmt(l.values[i])}`).join('<br>');
      tip.style.display = 'block';
      const left = (x(i) / W) * r.width + 12; tip.style.left = Math.max(4, Math.min(left, r.width - tip.offsetWidth - 4)) + 'px'; tip.style.top = '16px';
    };
    svg.onmouseleave = () => { tip.style.display = 'none'; xh.setAttribute('visibility', 'hidden'); };
  }

  // Redraw charts on resize and theme change.
  const redrawers = [];
  const onRedraw = (fn) => redrawers.push(fn);
  let rt; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => redrawers.forEach((f) => f()), 120); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => redrawers.forEach((f) => f()));

  // STICKY PREVIEW: ?sticky=1 turns on the sticky masthead and carries the flag across the page tabs.
  if (new URLSearchParams(location.search).has('sticky')) {
    const root = document.documentElement;
    root.classList.add('sticky');
    document.querySelectorAll('nav.tabs a').forEach((a) => { const u = new URL(a.getAttribute('href'), location.href); u.searchParams.set('sticky', '1'); a.href = u.href; });
    const mast = document.querySelector('.masthead');
    const setH = () => mast && root.style.setProperty('--mast-h', mast.offsetHeight + 'px');
    if (mast && 'ResizeObserver' in window) new ResizeObserver(setH).observe(mast);
    setH();
    // Hysteresis so the header doesn't flicker when it shrinks near the threshold.
    const onScroll = () => { const y = window.scrollY; if (y > 80) root.classList.add('scrolled'); else if (y < 10) root.classList.remove('scrolled'); };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  window.LD = { MON, $, esc, fmtPct, fmtPts, fmtIdx, fmtNum, fmtSigned, fmtMoney, fmtBil, fmtMonth, fmtMonthShort, cssVar, tone, addMonths, monthDiff, loadJSON, setStamp, niceTicks, spark, lineChart, onRedraw };
})();
