"use strict";

/* Jaettu ruudukkokartta (projektin työkalutila "map"): reittisuunnittelu muokkaa, varauskartta ja
   myöhemmin mobiilirobotti käyttävät samaa karttaa. */
const GridMap = (() => {
  const W = 48, H = 30;

  function defaultMap() {
    const occ = new Uint8Array(W * H);
    const rect = (x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) occ[y * W + x] = 1; };
    rect(12, 0, 13, 19); rect(24, 10, 25, 29); rect(36, 0, 37, 19); rect(28, 5, 33, 6); rect(4, 23, 10, 24);
    return { w: W, h: H, cell: 0.1, occ: encode(occ), start: [3, 3], goal: [44, 26] };
  }

  // Tallennus merkkijonona ("0"/"1"), jotta projektin JSON pysyy luettavana ja pienenä
  const encode = (occ) => Array.from(occ, (v) => (v ? "1" : "0")).join("");
  const decode = (s, n) => { const a = new Uint8Array(n); for (let i = 0; i < n; i++) a[i] = s.charCodeAt(i) === 49 ? 1 : 0; return a; };

  function load() {
    const m = getToolState("map", defaultMap());
    return { ...m, grid: { w: m.w, h: m.h, occ: decode(m.occ, m.w * m.h) } };
  }
  function save(m) {
    saveToolState("map", { w: m.w, h: m.h, cell: m.cell, occ: encode(m.grid.occ), start: m.start, goal: m.goal });
  }

  function clearAround(m, p) {
    m.grid.occ[p[1] * m.w + p[0]] = 0;
  }

  function randomize(m, seed, density = 0.28) {
    const r = Plan.rng(seed);
    for (let i = 0; i < m.grid.occ.length; i++) m.grid.occ[i] = r() < density ? 1 : 0;
    clearAround(m, m.start); clearAround(m, m.goal);
  }

  // Sokkelo: satunnainen syvyyshaku parittomissa soluissa
  function maze(m, seed) {
    const r = Plan.rng(seed), { w, h } = m, occ = m.grid.occ;
    occ.fill(1);
    const stack = [[1, 1]];
    occ[w + 1] = 0;
    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const dirs = [[2, 0], [-2, 0], [0, 2], [0, -2]].filter(([dx, dy]) => {
        const nx = x + dx, ny = y + dy;
        return nx > 0 && ny > 0 && nx < w - 1 && ny < h - 1 && occ[ny * w + nx];
      });
      if (!dirs.length) { stack.pop(); continue; }
      const [dx, dy] = dirs[Math.floor(r() * dirs.length)];
      occ[(y + dy / 2) * w + x + dx / 2] = 0;
      occ[(y + dy) * w + x + dx] = 0;
      stack.push([x + dx, y + dy]);
    }
    // Muutama oikotie, jotta reittejä on useampia
    for (let k = 0; k < (w * h) / 40; k++) {
      const x = 1 + Math.floor(r() * (w - 2)), y = 1 + Math.floor(r() * (h - 2));
      occ[y * w + x] = 0;
    }
    m.start = [1, 1];
    m.goal = [w % 2 ? w - 2 : w - 3, h % 2 ? h - 2 : h - 3];
  }

  // Kartan koon vaihto: päällekkäinen alue säilyy, lähtö ja maali pidetään kartan sisällä
  const SIZES = { small: [32, 20], normal: [48, 30], large: [80, 50], huge: [120, 75] };
  function resize(m, w, h) {
    const occ = new Uint8Array(w * h);
    for (let y = 0; y < Math.min(h, m.h); y++) for (let x = 0; x < Math.min(w, m.w); x++) occ[y * w + x] = m.grid.occ[y * m.w + x];
    const clampP = (p) => [Math.min(w - 1, p[0]), Math.min(h - 1, p[1])];
    const out = { ...m, w, h, grid: { w, h, occ }, start: clampP(m.start), goal: clampP(m.goal) };
    if (out.goal[0] === out.start[0] && out.goal[1] === out.start[1]) out.goal = [w - 2, h - 2];
    clearAround(out, out.start); clearAround(out, out.goal);
    return out;
  }
  const sizeKey = (m) => Object.keys(SIZES).find((k) => SIZES[k][0] === m.w && SIZES[k][1] === m.h) || "custom";

  return { defaultMap, load, save, randomize, maze, clearAround, resize, SIZES, sizeKey };
})();

/* Ruudukkonäkymä canvakselle: sovittaa kartan, muuntaa koordinaatit ja välittää hiiren/kosketuksen. */
class GridView {
  // opts: { draw(gv), onPointer(cell, phase, ev) }  phase: "down" | "move" | "up"
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.w = 1; this.h = 1;
    let down = false;
    const cell = (e) => {
      const r = canvas.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      const x = (px - this.ox) / this.cs, y = this.h - (py - this.oy) / this.cs; // y kasvaa ylöspäin (ROS-tyyli)
      return { x, y, i: Math.floor(x), j: Math.floor(y), inside: x >= 0 && y >= 0 && x < this.w && y < this.h };
    };
    canvas.addEventListener("pointerdown", (e) => { down = true; canvas.setPointerCapture(e.pointerId); opts.onPointer?.(cell(e), "down", e); });
    canvas.addEventListener("pointermove", (e) => { if (down) opts.onPointer?.(cell(e), "move", e); else opts.onHover?.(cell(e)); });
    const up = (e) => { if (down) { down = false; opts.onPointer?.(cell(e), "up", e); } };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);

    // Näppäimistö: nuolet siirtävät kohdistinta, Enter/välilyönti klikkaa solua (Shift = 5 solua kerralla).
    // opts.keyboard === false jättää nuolet työkalulle (esim. robotin ajaminen nuolilla).
    this.cursor = null;
    if (opts.onPointer) {
      if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;
      if (!canvas.hasAttribute("aria-label")) {
        canvas.setAttribute("aria-label", tr("Ruudukko. Nuolinäppäimet siirtävät kohdistinta, Enter tai välilyönti valitsee solun.",
          "Grid. Arrow keys move the cursor, Enter or Space selects the cell."));
      }
      const cellAt = ([i, j]) => ({ x: i + 0.5, y: j + 0.5, i, j, inside: true });
      const center = () => [Math.floor(this.w / 2), Math.floor(this.h / 2)];
      canvas.addEventListener("keydown", (e) => {
        if (opts.keyboard === false || (typeof opts.keyboard === "function" && !opts.keyboard())) return;
        const mv = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }[e.key];
        if (mv) {
          const n = e.shiftKey ? 5 : 1;
          const c = this.cursor || center();
          this.cursor = [Math.max(0, Math.min(this.w - 1, c[0] + mv[0] * n)), Math.max(0, Math.min(this.h - 1, c[1] + mv[1] * n))];
          this.announce?.(this.cursor);
          this.draw();
        } else if (e.key === "Enter" || e.key === " ") {
          this.cursor ||= center();
          opts.onPointer(cellAt(this.cursor), "down", e);
          opts.onPointer(cellAt(this.cursor), "up", e);
          this.draw();
        } else return;
        e.preventDefault();
        e.stopPropagation();
      });
      canvas.addEventListener("focus", () => this.draw());
      canvas.addEventListener("blur", () => this.draw());
    }
  }

  setSize(w, h) {
    this.w = w; this.h = h;
    this.canvas.style.aspectRatio = `${w} / ${h}`;
  }

  destroy() { this.ro.disconnect(); }

  draw() {
    const cv = this.canvas, dpr = window.devicePixelRatio || 1;
    const Wp = cv.clientWidth, Hp = cv.clientHeight;
    if (!Wp || !Hp) return;
    if (cv.width !== Math.round(Wp * dpr) || cv.height !== Math.round(Hp * dpr)) { cv.width = Wp * dpr; cv.height = Hp * dpr; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, Wp, Hp);
    this.cs = Math.min(Wp / this.w, Hp / this.h);
    this.ox = (Wp - this.cs * this.w) / 2;
    this.oy = (Hp - this.cs * this.h) / 2;
    this.ctx = ctx;
    this.opts.draw(this);
    // Näppäimistökohdistin näkyy vain, kun ruudukossa on fokus
    const kb = typeof this.opts.keyboard === "function" ? this.opts.keyboard() : this.opts.keyboard !== false;
    if (this.cursor && document.activeElement === cv && kb) {
      const [x, y] = this.px(this.cursor[0], this.cursor[1] + 1);
      ctx.strokeStyle = cssColor("var(--warn)"); ctx.lineWidth = 2.5; ctx.setLineDash([]);
      ctx.strokeRect(x + 1, y + 1, this.cs - 2, this.cs - 2);
    }
  }

  // Jatkuva soluyksikköpiste → pikselit
  px(x, y) { return [this.ox + x * this.cs, this.oy + (this.h - y) * this.cs]; }

  fillCell(i, j, color) {
    const [x, y] = this.px(i, j + 1);
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, this.cs + 0.5, this.cs + 0.5);
  }

  // Koko ruudukko yhdellä kertaa ImageDatana (nopea myös suurille kartoille)
  image(colorAt) {
    const off = this._off || (this._off = document.createElement("canvas"));
    off.width = this.w; off.height = this.h;
    const octx = off.getContext("2d");
    const img = octx.createImageData(this.w, this.h);
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      const c = colorAt(i, j), k = ((this.h - 1 - j) * this.w + i) * 4;
      img.data[k] = c[0]; img.data[k + 1] = c[1]; img.data[k + 2] = c[2]; img.data[k + 3] = c[3] ?? 255;
    }
    octx.putImageData(img, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    this.ctx.drawImage(off, this.ox, this.oy, this.w * this.cs, this.h * this.cs);
  }

  gridLines(color) {
    if (this.cs < 7) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i <= this.w; i++) { const [x] = this.px(i, 0); ctx.moveTo(x + 0.5, this.oy); ctx.lineTo(x + 0.5, this.oy + this.h * this.cs); }
    for (let j = 0; j <= this.h; j++) { const [, y] = this.px(0, j); ctx.moveTo(this.ox, y + 0.5); ctx.lineTo(this.ox + this.w * this.cs, y + 0.5); }
    ctx.stroke();
  }

  polyline(pts, color, width = 2, dash) {
    if (pts.length < 2) return;
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.setLineDash(dash || []);
    ctx.beginPath();
    pts.forEach((p, k) => { const [x, y] = this.px(p[0], p[1]); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
    ctx.stroke();
    ctx.setLineDash([]);
  }

  marker(x, y, color, label) {
    const ctx = this.ctx, [px, py] = this.px(x, y), r = Math.max(5, this.cs * 0.42);
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill();
    if (label && r >= 7) {
      ctx.fillStyle = "#fff"; ctx.font = `600 ${Math.round(r * 1.1)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(label, px, py + 0.5);
    }
  }
}

// CSS-väri → [r, g, b] (ImageDataa varten)
function rgbOf(cssVar) {
  const c = cssColor(cssVar);
  const ctx = (rgbOf._c ||= document.createElement("canvas").getContext("2d"));
  ctx.fillStyle = "#000"; ctx.fillStyle = c;
  const hex = ctx.fillStyle;
  if (hex.startsWith("#")) return [1, 3, 5].map((k) => parseInt(hex.slice(k, k + 2), 16));
  const m = hex.match(/[\d.]+/g) || [0, 0, 0];
  return m.slice(0, 3).map(Number);
}
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
