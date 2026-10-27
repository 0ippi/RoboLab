"use strict";

/* Mobiilirobotin liikemallit ja ohjaimet — puhdasta laskentaa ilman DOMia (testit: tests.html).
   Asento [x, y, θ] metreinä ja radiaaneina. */
const Robot = (() => {
  const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // Yksipyörämalli (unicycle): ẋ = v cos θ, ẏ = v sin θ, θ̇ = ω. Ohjaus vakio askeleen ajan.
  function integrate(p, v, w, dt, method = "rk4") {
    const f = (s) => [v * Math.cos(s[2]), v * Math.sin(s[2]), w];
    if (method === "euler") {
      const d = f(p);
      return [p[0] + d[0] * dt, p[1] + d[1] * dt, wrap(p[2] + d[2] * dt)];
    }
    if (method === "semi") {
      // Semi-implisiittinen: suunta päivitetään ensin, sijainti uudella suunnalla
      const th = p[2] + w * dt;
      return [p[0] + v * Math.cos(th) * dt, p[1] + v * Math.sin(th) * dt, wrap(th)];
    }
    const add = (s, d, h) => [s[0] + d[0] * h, s[1] + d[1] * h, s[2] + d[2] * h];
    const k1 = f(p), k2 = f(add(p, k1, dt / 2)), k3 = f(add(p, k2, dt / 2)), k4 = f(add(p, k3, dt));
    return [
      p[0] + (dt / 6) * (k1[0] + 2 * k2[0] + 2 * k3[0] + k4[0]),
      p[1] + (dt / 6) * (k1[1] + 2 * k2[1] + 2 * k3[1] + k4[1]),
      wrap(p[2] + (dt / 6) * (k1[2] + 2 * k2[2] + 2 * k3[2] + k4[2])),
    ];
  }

  /* ----- Differentiaaliohjaus ----- */
  // Pyörien kulmanopeudet (rad/s) halutusta v:stä ja ω:sta; r = pyörän säde, b = pyörien väli
  const diffToWheels = (v, w, r, b) => [(v - (w * b) / 2) / r, (v + (w * b) / 2) / r];
  const diffFromWheels = (wl, wr, r, b) => [(r * (wl + wr)) / 2, (r * (wr - wl)) / b];

  // Rajoittaa pyöränopeudet säilyttäen kaarevuuden (molempia skaalataan samassa suhteessa)
  function limitWheels(wl, wr, wmax) {
    const m = Math.max(Math.abs(wl), Math.abs(wr));
    return m > wmax ? [(wl * wmax) / m, (wr * wmax) / m] : [wl, wr];
  }

  /* ----- Ackermann-ohjaus (polkupyörämalli, taka-akseli referenssinä) ----- */
  const ackermannOmega = (v, delta, L) => (v * Math.tan(delta)) / L;

  /* ----- Reitinseuranta ----- */

  // Pure Pursuit: etsii reitiltä pisteen katseluetäisyyden päästä ja laskee kaarevuuden sitä kohti
  // visible(p): valinnainen näköyhteystarkistus — kohde siirretään lähemmäs, jos seinä on välissä
  function purePursuit(pose, path, lookahead, fromIdx = 0, visible = null) {
    if (!path.length) return { done: true, idx: 0, curvature: 0, target: null };
    // Lähin reittipiste (vain eteenpäin, ettei robotti palaa taaksepäin)
    let idx = fromIdx, best = Infinity;
    for (let i = fromIdx; i < Math.min(path.length, fromIdx + 50); i++) {
      const d = Math.hypot(path[i][0] - pose[0], path[i][1] - pose[1]);
      if (d < best) { best = d; idx = i; }
    }
    let ti = path.length - 1;
    for (let i = idx; i < path.length; i++) {
      if (Math.hypot(path[i][0] - pose[0], path[i][1] - pose[1]) >= lookahead) { ti = i; break; }
    }
    if (visible) while (ti > idx && !visible(path[ti])) ti--;
    const target = path[ti];
    const dx = target[0] - pose[0], dy = target[1] - pose[1];
    // Kohde robotin koordinaatistossa
    const ly = -Math.sin(pose[2]) * dx + Math.cos(pose[2]) * dy;
    const L2 = dx * dx + dy * dy;
    const end = path[path.length - 1];
    return {
      idx, target,
      curvature: L2 > 1e-12 ? (2 * ly) / L2 : 0,
      headingError: wrap(Math.atan2(dy, dx) - pose[2]),
      distToGoal: Math.hypot(end[0] - pose[0], end[1] - pose[1]),
    };
  }

  // Yksinkertainen PID (ulkoinen tila, jotta useampi ohjain voi käyttää samaa koodia)
  function pid(state, e, dt, kp, ki, kd, iLimit = 10) {
    state.i = Math.max(-iLimit, Math.min(iLimit, (state.i || 0) + e * dt));
    const d = state.prev === undefined ? 0 : (e - state.prev) / dt;
    state.prev = e;
    return kp * e + ki * state.i + kd * d;
  }

  return { wrap, integrate, diffToWheels, diffFromWheels, limitWheels, ackermannOmega, purePursuit, pid };
})();

/* TF-puu ja URDF — muunnokset 4×4-matriiseina (Kin.mul). RPY on ROS-konvention mukaan: R = Rz(yaw)·Ry(pitch)·Rx(roll). */
const TF = (() => {
  function fromXyzRpy(xyz, rpy) {
    const R = Kin.eulerToMat([rpy[2], rpy[1], rpy[0]], "ZYX");
    return [[...R[0], xyz[0]], [...R[1], xyz[1]], [...R[2], xyz[2]], [0, 0, 0, 1]];
  }

  function inverse(T) {
    const Rt = [0, 1, 2].map((i) => [T[0][i], T[1][i], T[2][i]]);
    const p = [T[0][3], T[1][3], T[2][3]];
    const t = Rt.map((r) => -(r[0] * p[0] + r[1] * p[1] + r[2] * p[2]));
    return [[...Rt[0], t[0]], [...Rt[1], t[1]], [...Rt[2], t[2]], [0, 0, 0, 1]];
  }

  // Kierto yksikköakselin ympäri (Rodrigues)
  function axisRotation(axis, q) {
    const R = Kin.quatToMat(Kin.axisAngleToQuat(axis, q));
    return [[...R[0], 0], [...R[1], 0], [...R[2], 0], [0, 0, 0, 1]];
  }

  // Kehykset [{name, parent, xyz, rpy}] → { name: maailmamuunnos }. Palauttaa myös virheet (silmukat, puuttuvat vanhemmat).
  function resolveFrames(frames) {
    const byName = Object.fromEntries(frames.map((f) => [f.name, f]));
    const world = {}, errors = [];
    const visit = (name, stack) => {
      if (world[name]) return world[name];
      const f = byName[name];
      if (!f) return null;
      if (stack.has(name)) { errors.push(tr(`Silmukka kehyksessä "${name}"`, `Loop at frame "${name}"`)); return null; }
      if (!f.parent) return (world[name] = fromXyzRpy(f.xyz, f.rpy));
      stack.add(name);
      const P = byName[f.parent] ? visit(f.parent, stack) : null;
      stack.delete(name);
      if (!P) { if (!byName[f.parent]) errors.push(tr(`Kehyksen "${name}" vanhempaa "${f.parent}" ei ole`, `Parent frame "${f.parent}" of frame "${name}" does not exist`)); return null; }
      return (world[name] = Kin.mul(P, fromXyzRpy(f.xyz, f.rpy)));
    };
    frames.forEach((f) => visit(f.name, new Set()));
    return { world, errors: [...new Set(errors)] };
  }

  /* ----- URDF ----- */
  const nums = (s, n, def = 0) => {
    const a = (s || "").trim().split(/\s+/).filter(Boolean).map(Number);
    return Array.from({ length: n }, (_, i) => (Number.isFinite(a[i]) ? a[i] : def));
  };

  function parseUrdf(text) {
    const doc = new DOMParser().parseFromString(text, "application/xml");
    const perr = doc.querySelector("parsererror");
    if (perr) return { error: tr("XML-virhe: ", "XML error: ") + perr.textContent.split("\n")[0].slice(0, 160) };
    const robot = doc.querySelector("robot");
    if (!robot) return { error: tr("Tiedostosta puuttuu <robot>-elementti.", "The file has no <robot> element.") };

    const materials = {};
    robot.querySelectorAll(":scope > material").forEach((m) => {
      const c = m.querySelector("color");
      if (c) materials[m.getAttribute("name")] = nums(c.getAttribute("rgba"), 4, 1);
    });
    const origin = (el) => {
      const o = el?.querySelector(":scope > origin");
      return { xyz: nums(o?.getAttribute("xyz"), 3), rpy: nums(o?.getAttribute("rpy"), 3) };
    };

    const links = {};
    robot.querySelectorAll(":scope > link").forEach((l) => {
      const visuals = [...l.querySelectorAll(":scope > visual")].map((v) => {
        const g = v.querySelector("geometry > *");
        const matEl = v.querySelector("material");
        let rgba = null;
        if (matEl) rgba = matEl.querySelector("color") ? nums(matEl.querySelector("color").getAttribute("rgba"), 4, 1) : materials[matEl.getAttribute("name")] || null;
        let geom = null;
        if (g?.tagName === "box") geom = { type: "box", size: nums(g.getAttribute("size"), 3) };
        else if (g?.tagName === "cylinder") geom = { type: "cylinder", radius: +g.getAttribute("radius") || 0, length: +g.getAttribute("length") || 0 };
        else if (g?.tagName === "sphere") geom = { type: "sphere", radius: +g.getAttribute("radius") || 0 };
        else if (g?.tagName === "mesh") geom = { type: "mesh", file: g.getAttribute("filename") || "" };
        return { ...origin(v), geom, rgba };
      });
      links[l.getAttribute("name")] = { name: l.getAttribute("name"), visuals };
    });

    const joints = [...robot.querySelectorAll(":scope > joint")].map((j) => {
      const lim = j.querySelector("limit");
      const type = j.getAttribute("type");
      const axis = nums(j.querySelector("axis")?.getAttribute("xyz") || "1 0 0", 3);
      return {
        name: j.getAttribute("name"), type,
        parent: j.querySelector("parent")?.getAttribute("link"),
        child: j.querySelector("child")?.getAttribute("link"),
        ...origin(j), axis,
        lower: lim ? +lim.getAttribute("lower") || 0 : type === "prismatic" ? 0 : -Math.PI,
        upper: lim ? +lim.getAttribute("upper") || 0 : type === "prismatic" ? 0.1 : Math.PI,
      };
    });

    const errors = [];
    for (const j of joints) {
      if (!links[j.parent]) errors.push(tr(`Nivelen "${j.name}" vanhempaa linkkiä "${j.parent}" ei ole.`, `Parent link "${j.parent}" of joint "${j.name}" does not exist.`));
      if (!links[j.child]) errors.push(tr(`Nivelen "${j.name}" lapsilinkkiä "${j.child}" ei ole.`, `Child link "${j.child}" of joint "${j.name}" does not exist.`));
      if (["revolute", "continuous", "prismatic"].includes(j.type) && Math.hypot(...j.axis) < 1e-9) errors.push(tr(`Nivelen "${j.name}" akseli on nolla.`, `Joint "${j.name}" has a zero axis.`));
      if (j.type === "continuous") { j.lower = -Math.PI; j.upper = Math.PI; }
    }
    const children = new Set(joints.map((j) => j.child));
    const roots = Object.keys(links).filter((n) => !children.has(n));
    if (!Object.keys(links).length) return { error: tr("Mallissa ei ole yhtään linkkiä.", "The model has no links.") };
    if (roots.length !== 1) errors.push(roots.length ? tr(`Mallissa on useita juurilinkkejä: ${roots.join(", ")}.`, `The model has multiple root links: ${roots.join(", ")}.`) : tr("Mallissa ei ole juurilinkkiä (silmukka).", "The model has no root link (loop)."));
    return { name: robot.getAttribute("name") || tr("robotti", "robot"), links, joints, root: roots[0], errors };
  }

  // Linkkien maailmamuunnokset nivelarvoilla q = { nivelen nimi: arvo }
  function urdfFk(model, q = {}) {
    const T = { [model.root]: Kin.identity(4) };
    const byParent = {};
    model.joints.forEach((j) => (byParent[j.parent] ||= []).push(j));
    const stack = [model.root];
    const seen = new Set();
    while (stack.length) {
      const p = stack.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      for (const j of byParent[p] || []) {
        let M = Kin.mul(T[p], fromXyzRpy(j.xyz, j.rpy));
        const v = q[j.name] ?? 0;
        if (j.type === "revolute" || j.type === "continuous") M = Kin.mul(M, axisRotation(j.axis, v));
        else if (j.type === "prismatic") {
          const n = Math.hypot(...j.axis) || 1;
          M = Kin.mul(M, [[1, 0, 0, (j.axis[0] / n) * v], [0, 1, 0, (j.axis[1] / n) * v], [0, 0, 1, (j.axis[2] / n) * v], [0, 0, 0, 1]]);
        }
        T[j.child] = M;
        stack.push(j.child);
      }
    }
    return T;
  }

  return { fromXyzRpy, inverse, axisRotation, resolveFrames, parseUrdf, urdfFk };
})();
