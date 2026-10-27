"use strict";

/* Kevyt viivakuvaaja canvakselle. Värit luetaan teeman CSS-muuttujista, joten kuvaaja seuraa teemaa. */
const PALETTES = {
  default: ["var(--accent)", "#f5913a", "#3ecf8e", "#e05cc5", "#f5c33b", "#22b8cf"],
  okabe: ["#0072b2", "#e69f00", "#009e73", "#cc79a7", "#56b4e9", "#d55e00"],
  mono: ["var(--text)", "var(--text-2)", "var(--text-3)", "var(--text)", "var(--text-2)", "var(--text-3)"],
};

function cssColor(c) {
  const m = /^var\((--[\w-]+)\)$/.exec(c);
  return m ? getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim() : c;
}

function seriesColor(i) {
  const pal = PALETTES[settings.plotPalette] || PALETTES.default;
  return cssColor(pal[i % pal.length]);
}

function niceTicks(min, max, count = 5) {
  // Lähes yhtä suuret arvot (liukulukujen pyöristys) eivät saa tuottaa liian pientä askelta
  const span = Math.max(max - min, Math.abs(max) * 1e-9, 1e-12);
  const raw = span / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  const step = (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
  const ticks = [];
  // Kokonaislukulaskuri: v += step ei etene, jos step on alle liukuluvun tarkkuuden
  const k0 = Math.ceil(min / step), k1 = Math.floor(max / step + 1e-9);
  for (let k = k0; k <= k1 && ticks.length < 50; k++) ticks.push(+(k * step).toFixed(12));
  return { ticks, step };
}

// series: [{ x: number[], y: number[], label, color?, dash?, width? }]
// marks: [{ x, label }] pystyviivat tapahtumille (esim. maaston vaihtuminen koulutuksessa)
function drawPlot(canvas, { series, xLabel = "", yMin, yMax, marks = [] }) {
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.clientWidth, H = canvas.clientHeight;
  if (!W || !H) return;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const text3 = cssColor("var(--text-3)"), border = cssColor("var(--border)");
  const font = `11px ${getComputedStyle(document.body).fontFamily}`;
  const pad = { l: 52, r: 12, t: 26, b: xLabel ? 42 : 28 };
  const pw = W - pad.l - pad.r, ph = H - pad.t - pad.b;

  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (const s of series) {
    for (let i = 0; i < s.x.length; i++) {
      const x = s.x[i], y = s.y[i];
      if (!Number.isFinite(y)) continue;
      if (x < xmin) xmin = x; if (x > xmax) xmax = x;
      if (y < ymin) ymin = y; if (y > ymax) ymax = y;
    }
  }
  if (!Number.isFinite(xmin)) { xmin = 0; xmax = 1; ymin = 0; ymax = 1; }
  if (yMin !== undefined) ymin = Math.min(ymin, yMin);
  if (yMax !== undefined) ymax = Math.max(ymax, yMax);
  const ym = (ymax - ymin) * 0.08 || Math.abs(ymax) * 0.1 || 1;
  ymin -= ym; ymax += ym;
  if (xmax === xmin) xmax = xmin + 1;

  const X = (x) => pad.l + ((x - xmin) / (xmax - xmin)) * pw;
  const Y = (y) => pad.t + ph - ((y - ymin) / (ymax - ymin)) * ph;

  ctx.font = font; ctx.lineWidth = 1;
  ctx.fillStyle = text3;
  ctx.textAlign = "right"; ctx.textBaseline = "middle";
  const yt = niceTicks(ymin, ymax, Math.max(2, Math.floor(ph / 40)));
  for (const v of yt.ticks) {
    ctx.strokeStyle = border; ctx.beginPath(); ctx.moveTo(pad.l, Y(v)); ctx.lineTo(W - pad.r, Y(v)); ctx.stroke();
    ctx.fillText(fmtTick(v, yt.step), pad.l - 8, Y(v));
  }
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const xt = niceTicks(xmin, xmax, Math.max(2, Math.floor(pw / 80)));
  for (const v of xt.ticks) ctx.fillText(fmtTick(v, xt.step), X(v), pad.t + ph + 8);
  if (xLabel) { ctx.textAlign = "right"; ctx.fillText(xLabel, W - pad.r, pad.t + ph + 24); }

  ctx.save();
  ctx.beginPath(); ctx.rect(pad.l, pad.t, pw, ph); ctx.clip();
  ctx.lineJoin = "round";
  let labelEnd = -Infinity; // nimet eivät saa mennä päällekkäin: liian lähellä edellistä oleva jätetään pois
  for (const m of marks) {
    if (!(m.x >= xmin && m.x <= xmax)) continue;
    ctx.strokeStyle = text3; ctx.globalAlpha = 0.6; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    ctx.beginPath(); ctx.moveTo(X(m.x), pad.t); ctx.lineTo(X(m.x), pad.t + ph); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (m.label && X(m.x) + 4 > labelEnd) {
      ctx.fillStyle = text3; ctx.textAlign = "left"; ctx.textBaseline = "top";
      ctx.fillText(m.label, X(m.x) + 4, pad.t + 4);
      labelEnd = X(m.x) + 4 + ctx.measureText(m.label).width + 6;
    }
  }
  series.forEach((s, si) => {
    ctx.strokeStyle = s.color || seriesColor(si);
    ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    // Harvennus: korkeintaan ~2 pistettä pikseliä kohden
    const stepI = Math.max(1, Math.floor(s.x.length / (pw * 2)));
    let started = false;
    for (let i = 0; i < s.x.length; i += stepI) {
      const y = s.y[i];
      if (!Number.isFinite(y)) { started = false; continue; }
      if (!started) { ctx.moveTo(X(s.x[i]), Y(y)); started = true; } else ctx.lineTo(X(s.x[i]), Y(y));
    }
    ctx.stroke();
  });
  ctx.restore();
  ctx.setLineDash([]);

  // Selite
  let lx = pad.l;
  ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.font = font;
  series.forEach((s, si) => {
    if (!s.label) return;
    ctx.strokeStyle = s.color || seriesColor(si);
    ctx.lineWidth = 2; ctx.setLineDash(s.dash || []);
    ctx.beginPath(); ctx.moveTo(lx, 11); ctx.lineTo(lx + 16, 11); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = cssColor("var(--text-2)");
    ctx.fillText(s.label, lx + 22, 11);
    lx += 22 + ctx.measureText(s.label).width + 18;
  });
}

function fmtTick(v, step) {
  const d = Math.max(0, -Math.floor(Math.log10(step)));
  const s = v.toFixed(Math.min(d, 6));
  return settings.decimalSep === "," ? s.replace(".", ",") : s;
}
