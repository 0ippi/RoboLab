"use strict";

/* Kevyt ortografinen 3D-näkymä canvakselle: kierto vetämällä, zoom rullalla, tuplaklikkaus palauttaa.
   Ei ulkoisia kirjastoja — riittää koordinaatistoille, robottikäsivarsille ja kohteiden raahaukselle. */
class View3 {
  // opts: { up: "Z"|"Y", az, el (asteina), extent (m), draw(view), onDown(sx, sy) → true jos kohde napattiin, onDrag(sx, sy) }
  constructor(canvas, opts) {
    this.canvas = canvas;
    this.opts = opts;
    this.home = { az: opts.az ?? -60, el: opts.el ?? 25 };
    this.az = this.home.az; this.el = this.home.el; this.zoom = 1;
    this.setUp(opts.up || "Z");
    // Kiertokeskipiste: oletuksena origo, nostettuna (opts.lift) korkeiden käsivarsien keskelle
    this.homeCenter = this.U.map((u) => u * (opts.lift || 0));
    this.center = [...this.homeCenter];

    let mode = null, lx = 0, ly = 0;
    const pos = (e) => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    // Kosketus: kahden sormen nipistys zoomaa ja yhteinen liike siirtää kiertokeskistä
    const touches = new Map();
    let pinch = null;
    const pinchState = () => { const [a, b] = [...touches.values()]; return { d: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), m: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2] }; };
    // Vasen = kierrä (tai raahaa kohdetta), oikea / keski / Shift+vasen = siirrä kiertokeskistä (panorointi)
    canvas.addEventListener("pointerdown", (e) => {
      if (e.pointerType === "touch") {
        touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (touches.size >= 2) {
          if (mode === "drag") opts.onEnd?.(); // toinen sormi: kohteen raahaus loppuu, alkaa nipistys
          mode = null;
          pinch = { ...pinchState(), zoom: this.zoom };
          canvas.setPointerCapture(e.pointerId);
          return;
        }
      }
      const [x, y] = pos(e);
      const pan = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
      mode = pan ? "pan" : opts.onDown && opts.onDown(x, y, e) ? "drag" : "orbit";
      lx = e.clientX; ly = e.clientY;
      canvas.setPointerCapture(e.pointerId);
      canvas.style.cursor = mode === "drag" ? "grabbing" : mode === "pan" ? "grabbing" : "move";
      if (pan) e.preventDefault();
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    canvas.addEventListener("pointermove", (e) => {
      if (pinch && touches.has(e.pointerId)) {
        touches.set(e.pointerId, [e.clientX, e.clientY]);
        if (touches.size < 2) return;
        const p = pinchState(), { right, up } = this.cam;
        this.zoom = Math.max(0.2, Math.min(8, pinch.zoom * (p.d / pinch.d)));
        const dx = p.m[0] - pinch.m[0], dy = p.m[1] - pinch.m[1];
        this.center = this.center.map((c, i) => c - (right[i] * dx - up[i] * dy) / this.s);
        pinch.m = p.m;
        this.draw();
        return;
      }
      if (!mode) {
        if (opts.hoverable) { const [x, y] = pos(e); canvas.style.cursor = opts.hoverable(x, y) ? "grab" : ""; }
        return;
      }
      if (mode === "drag") { const [x, y] = pos(e); opts.onDrag(x, y, e); return; }
      const dx = e.clientX - lx, dy = e.clientY - ly;
      lx = e.clientX; ly = e.clientY;
      if (mode === "pan") {
        const { right, up } = this.cam;
        this.center = this.center.map((c, i) => c - (right[i] * dx - up[i] * dy) / this.s);
      } else {
        this.az -= dx * 0.4;
        this.el = Math.max(-89.9, Math.min(89.9, this.el + dy * 0.4));
      }
      this.draw();
    });
    const end = (e) => {
      touches.delete(e.pointerId);
      if (pinch) { if (touches.size < 2) pinch = null; mode = null; return; } // nipistyksen jälkeen ei jatketa kiertoa
      const was = mode; mode = null; canvas.style.cursor = ""; if (was === "drag" || was === "orbit") opts.onEnd?.();
    };
    canvas.addEventListener("pointerup", end);
    canvas.addEventListener("pointercancel", end);
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      this.zoom = Math.max(0.2, Math.min(8, this.zoom * Math.exp(-e.deltaY * 0.0015)));
      this.draw();
    }, { passive: false });
    canvas.addEventListener("dblclick", () => this.reset());

    // Näppäimistö: nuolet kääntävät, +/- zoomaa, 0 palauttaa. Työkalu voi ottaa näppäimen itselleen (onKey → true).
    if (!canvas.hasAttribute("tabindex")) canvas.tabIndex = 0;
    if (!canvas.hasAttribute("aria-label")) {
      canvas.setAttribute("aria-label", tr("3D-näkymä. Nuolinäppäimet kääntävät, plus ja miinus zoomaavat, 0 palauttaa näkymän.",
        "3D view. Arrow keys rotate, plus and minus zoom, 0 resets the view."));
    }
    canvas.setAttribute("role", "img");
    canvas.addEventListener("keydown", (e) => {
      if (opts.onKey && opts.onKey(e)) { e.preventDefault(); return; }
      const step = e.shiftKey ? 2 : 10;
      if (e.key === "ArrowLeft") this.az += step;
      else if (e.key === "ArrowRight") this.az -= step;
      else if (e.key === "ArrowUp") this.el = Math.min(89.9, this.el + step);
      else if (e.key === "ArrowDown") this.el = Math.max(-89.9, this.el - step);
      else if (e.key === "+" || e.key === "=") this.zoom = Math.min(8, this.zoom * 1.2);
      else if (e.key === "-") this.zoom = Math.max(0.2, this.zoom / 1.2);
      else if (e.key === "0" || e.key === "Home") { this.reset(); e.preventDefault(); return; }
      else return;
      e.preventDefault();
      e.stopPropagation();
      this.draw();
    });

    this.ro = new ResizeObserver(() => this.draw());
    this.ro.observe(canvas);
  }

  setUp(up) {
    // Vaakasuorat akselit H1, H2 ja pystyakseli U oikeakätisesti: H1 × H2 = U
    this.U = up === "Y" ? [0, 1, 0] : [0, 0, 1];
    this.H1 = up === "Y" ? [0, 0, 1] : [1, 0, 0];
    this.H2 = up === "Y" ? [1, 0, 0] : [0, 1, 0];
  }

  setView(az, el) { this.az = az; this.el = el; this.draw(); }
  reset() { this.az = this.home.az; this.el = this.home.el; this.zoom = 1; this.center = [...this.homeCenter]; this.draw(); }
  destroy() { this.ro.disconnect(); }

  camera() {
    const r = (d) => (d * Math.PI) / 180;
    const ca = Math.cos(r(this.az)), sa = Math.sin(r(this.az)), ce = Math.cos(r(this.el)), se = Math.sin(r(this.el));
    const c = [0, 1, 2].map((i) => ce * (ca * this.H1[i] + sa * this.H2[i]) + se * this.U[i]);
    const right = norm(cross(this.U, c));
    const f = c.map((v) => -v);
    const up = cross(right, f);
    return { c, f, right, up };
  }

  project(p) {
    const { right, up } = this.cam;
    const q = [p[0] - this.center[0], p[1] - this.center[1], p[2] - this.center[2]];
    return [this.cx + this.s * dot(q, right), this.cy - this.s * dot(q, up)];
  }

  // Näytön piste → maailman piste tasolla, jonka korkeus pystyakselilla on h
  unproject(sx, sy, h = 0) {
    const { right, up, f } = this.cam;
    const a = (sx - this.cx) / this.s, b = -(sy - this.cy) / this.s;
    const P0 = [0, 1, 2].map((i) => this.center[i] + a * right[i] + b * up[i]);
    const fu = dot(f, this.U);
    if (Math.abs(fu) < 0.08) return null; // katse liian vaakasuora tasoon nähden
    const t = (h - dot(P0, this.U)) / fu;
    return P0.map((v, i) => v + t * f[i]);
  }

  draw() {
    const cv = this.canvas, dpr = window.devicePixelRatio || 1;
    const W = cv.clientWidth, H = cv.clientHeight;
    if (!W || !H) return;
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = W * dpr; cv.height = H * dpr; }
    const ctx = cv.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    this.ctx = ctx; this.W = W; this.H = H;
    this.cx = W / 2; this.cy = H / 2;
    this.s = (Math.min(W, H) / (2.2 * (this.opts.extent || 1))) * this.zoom;
    this.cam = this.camera();
    this.opts.draw(this);
  }

  /* ----- Piirtoapurit ----- */
  line(a, b, color, width = 2, dash) {
    const ctx = this.ctx, p = this.project(a), q = this.project(b);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(q[0], q[1]); ctx.stroke();
    ctx.setLineDash([]);
  }
  poly(points, color, width = 2, dash) {
    const ctx = this.ctx;
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash || []); ctx.lineJoin = "round"; ctx.lineCap = "round";
    ctx.beginPath();
    points.forEach((pt, i) => { const p = this.project(pt); i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]); });
    ctx.stroke();
    ctx.setLineDash([]);
  }
  dot(p, r, fill, stroke) {
    const ctx = this.ctx, s = this.project(p);
    ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }
  text(p, str, color, dx = 6, dy = -6) {
    const ctx = this.ctx, s = this.project(p);
    ctx.fillStyle = color; ctx.font = `11px ${getComputedStyle(document.body).fontFamily}`;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(str, s[0] + dx, s[1] + dy);
  }
  // Ympyrä tasossa, jonka normaali on pystyakseli
  circle(center, radius, color, width = 1, dash) {
    const pts = [];
    for (let i = 0; i <= 72; i++) {
      const t = (i / 72) * Math.PI * 2;
      pts.push([0, 1, 2].map((k) => center[k] + radius * (Math.cos(t) * this.H1[k] + Math.sin(t) * this.H2[k])));
    }
    this.poly(pts, color, width, dash);
  }
  // Ruudukon väli näkymän koon mukaan: enintään noin 24 viivaa suuntaansa (iso käsivarsi ei jäädytä piirtoa)
  static gridStep(extent) {
    for (const s of [0.1, 0.5, 1, 5, 10, 50, 100, 500]) if ((extent * 2) / s <= 24) return s;
    return 1000;
  }
  grid(size, step, color) {
    for (let v = -size; v <= size + 1e-9; v += step) {
      const a = (u, w) => [0, 1, 2].map((k) => u * this.H1[k] + w * this.H2[k]);
      this.line(a(v, -size), a(v, size), color, 1);
      this.line(a(-size, v), a(size, v), color, 1);
    }
  }
  /* ----- Rautalankamuodot paikallisessa koordinaatistossa T (4×4), kuten URDF:ssä ----- */
  box(T, [sx, sy, sz], color, width = 1.5) {
    const c = [];
    for (const x of [-sx / 2, sx / 2]) for (const y of [-sy / 2, sy / 2]) for (const z of [-sz / 2, sz / 2]) c.push(xform(T, [x, y, z]));
    for (const [a, b] of [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]]) this.line(c[a], c[b], color, width);
  }
  // Sylinterin akseli on paikallinen z (URDF-konventio)
  cylinder(T, r, len, color, width = 1.5) {
    const ring = (z) => Array.from({ length: 25 }, (_, i) => { const t = (i / 24) * Math.PI * 2; return xform(T, [r * Math.cos(t), r * Math.sin(t), z]); });
    const a = ring(-len / 2), b = ring(len / 2);
    this.poly(a, color, width); this.poly(b, color, width);
    for (const i of [0, 6, 12, 18]) this.line(a[i], b[i], color, width);
  }
  sphere(T, r, color, width = 1.5) {
    for (const [u, v] of [[0, 1], [1, 2], [0, 2]]) {
      this.poly(Array.from({ length: 25 }, (_, i) => {
        const t = (i / 24) * Math.PI * 2, p = [0, 0, 0];
        p[u] = r * Math.cos(t); p[v] = r * Math.sin(t);
        return xform(T, p);
      }), color, width);
    }
  }

  // Koordinaatiston akselit 4×4- tai 3×3-matriisista
  frame(T, len, { width = 2, labels = false, alpha = 1, colors } = {}) {
    const o = T.length === 4 ? [T[0][3], T[1][3], T[2][3]] : [0, 0, 0];
    const cols = colors || [0, 1, 2].map(axisColor);
    const names = ["x", "y", "z"];
    this.ctx.globalAlpha = alpha;
    for (let k = 0; k < 3; k++) {
      const tip = [o[0] + T[0][k] * len, o[1] + T[1][k] * len, o[2] + T[2][k] * len];
      this.line(o, tip, cols[k], width);
      if (labels) this.text(tip, names[k], cols[k], 3, 0);
    }
    this.ctx.globalAlpha = 1;
  }
}

// Yhteinen ohjeteksti 3D-näkymien alle
function viewHint() {
  return tr("Vasen veto kääntää · oikea veto (tai Shift+veto) siirtää kiertokeskistä · rulla zoomaa · tuplaklikkaus palauttaa.",
    "Left-drag rotates · right-drag (or Shift+drag) moves the pivot · scroll zooms · double-click resets.");
}

function xform(T, p) {
  return [0, 1, 2].map((i) => T[i][0] * p[0] + T[i][1] * p[1] + T[i][2] * p[2] + T[i][3]);
}
function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a) { const n = Math.hypot(...a) || 1; return a.map((v) => v / n); }
