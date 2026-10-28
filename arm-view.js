"use strict";

/* Robottikäsivarren näkymä kinematiikkatyökaluille: varjostettu Three.js-näkymä (oletus) tai kevyt
   rautalankanäkymä (View3). Molemmilla on sama rajapinta (draw, project, unproject, setView, el), joten
   työkalujen raahauslogiikka toimii kummassakin. Valinta muistetaan selaimessa kaikille käsivarsityökaluille. */

// Jokainen linkki omalla värillään, jotta käsivarren rakenne hahmottuu
const ARM_COLORS = ["#4c8dff", "#f5913a", "#3ecf8e", "#e05cc5", "#f5c33b", "#22b8cf", "#f2555a", "#a78bfa"];
const JOINT_COLOR = "#3b414d";

const ArmPref = {
  get() {
    try { return { mode: "shaded", shadows: true, ...JSON.parse(localStorage.getItem("robolab-arm-view") || "{}") }; }
    catch { return { mode: "shaded", shadows: true }; }
  },
  set(p) { try { localStorage.setItem("robolab-arm-view", JSON.stringify({ ...ArmPref.get(), ...p })); } catch {} },
};

// Käsivarren murtoviiva: välipiste d:n (klassinen DH) tai a:n (modifioitu) jälkeen, jotta siirtymät näkyvät oikein
// base: valinnainen 4×4-kantamuunnos (käsivarsi kiinnitettynä toiseen kehykseen)
function armPolyline(chain, q, base = null) {
  const F = base ? Kin.fk(chain, q).map((T) => Kin.mul(base, T)) : Kin.fk(chain, q);
  const mod = chain.convention === "modified";
  const o = (T) => [T[0][3], T[1][3], T[2][3]];
  const c = (T, k) => [T[0][k], T[1][k], T[2][k]];
  const add = (p, v, s) => p.map((x, i) => x + v[i] * s);
  const segs = []; // [{ pts: [...], joint: i }] jokainen linkki erikseen värittämistä varten
  const basePts = [base ? o(base) : [0, 0, 0], o(F[0])];
  chain.joints.forEach((j, i) => {
    const Tp = F[i];
    const mid = mod ? add(o(Tp), c(Tp, 0), j.a) : add(o(Tp), c(Tp, 2), Kin.jointD(j, q[i]));
    segs.push({ pts: [o(Tp), mid, o(F[i + 1])], joint: i });
  });
  const toolSeg = [o(F[F.length - 2]), o(F.at(-1))];
  // Nivelen paikka ja akseli: klassisessa DH:ssa nivel i kiertyy kehyksen i−1 z-akselin ympäri
  const joints = chain.joints.map((j, i) => {
    const T = mod ? F[i + 1] : F[i];
    return { type: j.type, p: o(T), z: c(T, 2), T };
  });
  return { F, segs, basePts, toolSeg, joints };
}

// Näkymän kiertokeskipisteen korkeus: tilakäsivarret ulottuvat ylöspäin, joten katse käsivarren keskelle
function armLift(chain) {
  return Kin.isPlanar(chain) ? 0 : Math.max(0.3, Kin.reach(chain).max * 0.75) * 0.35;
}

// Kuinka syvällä lattian (z = 0) alapuolella käsivarren alin kohta on (0 = ei osu lattiaan). Tasomaiset
// käsivarret ovat lattian tasossa, joten niitä ei tarkisteta.
function armBelowFloor(chain, q) {
  if (Kin.isPlanar(chain)) return 0;
  const { segs, toolSeg } = armPolyline(chain, q);
  const zs = [...segs.flatMap((s) => s.pts.slice(1)), toolSeg[1]].map((p) => p[2]);
  return Math.max(0, -Math.min(...zs));
}

// Rautalankanäkymä: jokainen linkki omalla värillään, ja lattiaan piirretään käsivarren "varjo"
// sekä pystyviivat nivelistä, jotta syvyys hahmottuu ilman varjostusta
function drawArm(v, chain, q, { allFrames = false, extent = 1, grid = true, base = null } = {}) {
  const surface = cssColor("var(--surface)"), text3 = cssColor("var(--text-3)"), border = cssColor("var(--border-strong)");
  const add = (p, d, s) => p.map((x, i) => x + d[i] * s);
  const { F, segs, basePts, toolSeg, joints } = armPolyline(chain, q, base);
  if (grid && settings.showGrid) {
    const step = View3.gridStep(extent);
    v.grid(Math.ceil(extent / step) * step, step, cssColor("var(--border)"));
  }
  if (settings.showAxes && !base) v.frame(Kin.identity(4), extent * 0.18, { width: 1.5, alpha: 0.6, labels: settings.frameLabels });

  const flat = (p) => [p[0], p[1], 0];
  const all = [basePts[0], basePts[1], ...segs.flatMap((s) => s.pts.slice(1)), toolSeg[1]];
  if (!Kin.isPlanar(chain)) {
    v.ctx.globalAlpha = 0.35;
    v.poly(all.map(flat), text3, 5);                                            // varjo lattiassa
    joints.forEach((j) => v.line(flat(j.p), j.p, border, 1, [3, 4]));         // pystyviivat
    v.line(flat(toolSeg[1]), toolSeg[1], border, 1, [3, 4]);
    v.ctx.globalAlpha = 1;
  }
  if (Math.hypot(...basePts[1]) > 1e-6) v.poly(basePts, text3, 3);
  segs.forEach(({ pts, joint }) => {
    const color = ARM_COLORS[joint % ARM_COLORS.length];
    v.ctx.globalAlpha = 0.25; v.poly(pts, color, 12);
    v.ctx.globalAlpha = 1; v.poly(pts, color, 4);
  });
  v.poly(toolSeg, ARM_COLORS[chain.joints.length % ARM_COLORS.length], 3);

  // Nivelet ja niiden akselit
  joints.forEach((j, i) => {
    const color = ARM_COLORS[i % ARM_COLORS.length];
    v.line(add(j.p, j.z, -extent * 0.06), add(j.p, j.z, extent * 0.06), text3, 2.5);
    v.dot(j.p, j.type === "P" ? 5 : 6.5, surface, color);
    if (settings.frameLabels) v.text(j.p, "q" + (i + 1), text3, 9, 9);
  });
  v.dot(basePts[0], 4, text3);

  if (allFrames) F.slice(1, -1).forEach((T) => v.frame(T, extent * 0.09, { width: 1.5 }));
  v.frame(F.at(-1), extent * 0.14, { width: 2.5, labels: settings.frameLabels });
  return F;
}

// Varjostettu käsivarsi Three.js-primitiiveillä
function drawArm3d(g, chain, q, { extent = 1, allFrames = false } = {}) {
  const { F, segs, basePts, toolSeg, joints } = armPolyline(chain, q);
  const r = extent * 0.022;
  // Jalusta
  g.cyl([0, 0, 0], [0, 0, extent * 0.03], extent * 0.09, "#5b6270");
  if (Math.hypot(...basePts[1]) > 1e-6) g.cyl(basePts[0], basePts[1], r * 1.2, "#5b6270");
  // Linkit
  segs.forEach(({ pts, joint }) => {
    const color = ARM_COLORS[joint % ARM_COLORS.length];
    for (let k = 1; k < pts.length; k++) g.cyl(pts[k - 1], pts[k], r, color);
    pts.slice(1, -1).forEach((p) => g.sphere(p, r, color)); // pyöristetty mutka
  });
  if (Math.hypot(toolSeg[1][0] - toolSeg[0][0], toolSeg[1][1] - toolSeg[0][1], toolSeg[1][2] - toolSeg[0][2]) > 1e-6) {
    g.cyl(toolSeg[0], toolSeg[1], r * 0.8, ARM_COLORS[(chain.joints.length) % ARM_COLORS.length]);
  }
  // Nivelet: kiertyvä = sylinteri akselinsa suuntaan, liukuva = laatikko
  joints.forEach((j) => {
    const L = extent * 0.075, R = extent * 0.036;
    if (j.type === "P") g.box(j.T, [R * 1.6, R * 1.6, L], JOINT_COLOR);
    else g.cyl(j.p.map((x, i) => x - j.z[i] * L / 2), j.p.map((x, i) => x + j.z[i] * L / 2), R, JOINT_COLOR);
  });
  // Työkalu
  const tip = F.at(-1);
  g.sphere([tip[0][3], tip[1][3], tip[2][3]], r * 1.3, "#e6e8eb");
  g.axes(tip, extent * 0.14);
  if (allFrames) F.slice(1, -1).forEach((T) => g.axes(T, extent * 0.08));
  if (settings.showAxes) g.axes(Kin.identity(4), extent * 0.18);
  return F;
}

class ArmView {
  // opts kuten View3:lla: { extent, az, el, draw(v2d), draw3d(gl), onDown, onDrag, onEnd, hoverable }
  constructor(canvas, opts) {
    this.v2 = new View3(canvas, opts);
    this.opts = this.v2.opts;
    this.cv2 = canvas;
    this.cvGl = document.createElement("canvas");
    this.cvGl.className = canvas.className;
    this.cvGl.style.cssText = canvas.style.cssText;
    this.cvGl.setAttribute("aria-label", canvas.getAttribute("aria-label") || tr("Varjostettu 3D-näkymä robottikäsivarresta. Nuolinäppäimet kääntävät, plus ja miinus zoomaavat, 0 palauttaa.", "Shaded 3D view of the robot arm. Arrow keys rotate, plus and minus zoom, 0 resets."));
    this.cvGl.hidden = true;
    canvas.after(this.cvGl);
    this.pref = ArmPref.get();
    this.gl = null; this.failed = false; this.dead = false;
    // Ensimmäinen piirto vasta, kun työkalu on ehtinyt laskea tilansa (kuten View3:n ResizeObserver)
    requestAnimationFrame(() => this.draw());
  }

  get useGl() { return this.pref.mode === "shaded" && !this.failed; }
  get el() { return this.gl && this.useGl ? this.gl.el : this.v2.el; }

  setRender(mode) { this.pref.mode = mode; ArmPref.set({ mode }); if (mode === "shaded") this.failed = false; this.draw(); }
  setShadows(on) { this.pref.shadows = on; ArmPref.set({ shadows: on }); this.draw(); }

  draw() {
    if (this.dead) return;
    this.cv2.hidden = this.useGl;
    this.cvGl.hidden = !this.useGl;
    if (!this.useGl) { this.v2.draw(); return; }
    if (!this.gl) {
      ThreeView.load().then(() => {
        if (this.dead || this.gl) return;
        const o = this.opts;
        // Three.js:n atsimuutti on peilattu View3:een nähden (malli käännetty Y-ylös-koordinaatteihin)
        this.gl = new ThreeView.Scene(this.cvGl, { up: "Z", az: -(o.az ?? -60), el: Math.min(89, o.el ?? 25), zoom: 1.15, lift: o.lift,
          onDown: o.onDown, onDrag: o.onDrag, onEnd: o.onEnd, hoverable: o.hoverable });
        this.draw();
      }).catch(() => {
        this.failed = true;
        toast(tr("Varjostettua näkymää ei voitu ladata (ei internetyhteyttä?) — näytetään rautalankamalli.", "Could not load the shaded view (no internet?) — showing the wireframe model."));
        this.draw();
      });
      return;
    }
    this.gl.setExtent(this.opts.extent || 1);
    this.gl.beginPrims();
    this.opts.draw3d?.(this.gl);
    this.gl.endPrims({ shadows: this.pref.shadows });
  }

  project(p) { return this.gl && this.useGl ? this.gl.toScreen(p) : this.v2.project(p); }
  unproject(sx, sy, h) { return this.gl && this.useGl ? this.gl.fromScreen(sx, sy, h) : this.v2.unproject(sx, sy, h); }
  setView(az, el) { this.v2.setView(az, el); this.gl?.setView(-az, Math.min(89, el)); }
  destroy() { this.dead = true; this.v2.destroy(); this.gl?.dispose(); this.cvGl.remove(); }
}

// Näkymän yläpalkin painikkeet (piirtotapa, varjot, kuvakulmat) ja niiden kytkentä
function armViewTools(id) {
  const p = ArmPref.get();
  return `<span class="view-tools" id="${id}">
    <span class="seg small" role="group" aria-label="${tr("Piirtotapa", "Render style")}">
      <button data-render="wire" class="${p.mode !== "shaded" ? "on" : ""}" aria-pressed="${p.mode !== "shaded"}">${tr("Rautalanka", "Wireframe")}</button>
      <button data-render="shaded" class="${p.mode === "shaded" ? "on" : ""}" aria-pressed="${p.mode === "shaded"}">${tr("Varjostettu", "Shaded")}</button>
    </span>
    <label class="mini-toggle" ${p.mode === "shaded" ? "" : "hidden"} title="${tr("Kappaleet luovat varjon lattiaan", "Parts cast shadows on the floor")}"><input type="checkbox" data-shadows ${p.shadows ? "checked" : ""}> ${tr("Varjot", "Shadows")}</label>
    <button data-v="3d">3D</button><button data-v="top">${tr("Ylhäältä", "Top")}</button><button data-v="side">${tr("Sivulta", "Side")}</button></span>`;
}
function bindArmViewTools(root, id, view) {
  const bar = root.querySelector("#" + id);
  bar.onclick = (e) => {
    const r = e.target.closest("[data-render]")?.dataset.render;
    if (r) {
      bar.querySelectorAll("[data-render]").forEach((b) => { b.classList.toggle("on", b.dataset.render === r); b.setAttribute("aria-pressed", b.dataset.render === r); });
      bar.querySelector(".mini-toggle").hidden = r !== "shaded";
      view.setRender(r);
      return;
    }
    const v = e.target.dataset.v;
    if (v === "3d") view.setView(-60, 25);
    if (v === "top") view.setView(-90, 89.9);
    if (v === "side") view.setView(-90, 0.1);
  };
  bar.querySelector("[data-shadows]").onchange = (e) => view.setShadows(e.target.checked);
}
