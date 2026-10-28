"use strict";

/* Rotaatiot ja kinematiikka — puhdasta matematiikkaa ilman DOMia (testit: tests.html).
   Kulmat radiaaneina, pituudet metreinä. Matriisit rivitaulukkoina [[...],[...],...].
   Kvaterniot järjestyksessä [x, y, z, w]. */
const Kin = (() => {
  const { sin, cos, atan2, sqrt, PI, abs, acos, hypot } = Math;
  const AX = { X: 0, Y: 1, Z: 2 };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const wrap = (a) => { a = ((a + PI) % (2 * PI) + 2 * PI) % (2 * PI) - PI; return a === -PI ? PI : a; };

  /* ===== Matriisit ===== */
  function mul(A, B) {
    const n = A.length, m = B[0].length, k = B.length;
    const C = Array.from({ length: n }, () => new Array(m).fill(0));
    for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
      let s = 0;
      for (let t = 0; t < k; t++) s += A[i][t] * B[t][j];
      C[i][j] = s;
    }
    return C;
  }
  const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));
  const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
  const det3 = (R) =>
    R[0][0] * (R[1][1] * R[2][2] - R[1][2] * R[2][1]) -
    R[0][1] * (R[1][0] * R[2][2] - R[1][2] * R[2][0]) +
    R[0][2] * (R[1][0] * R[2][1] - R[1][1] * R[2][0]);

  // Ratkaisee Ax = b Gaussin eliminoinnilla (pienet järjestelmät)
  function solve(A, b) {
    const n = b.length;
    const M = A.map((r, i) => [...r, b[i]]);
    for (let c = 0; c < n; c++) {
      let p = c;
      for (let r = c + 1; r < n; r++) if (abs(M[r][c]) > abs(M[p][c])) p = r;
      [M[c], M[p]] = [M[p], M[c]];
      if (abs(M[c][c]) < 1e-14) return null;
      for (let r = 0; r < n; r++) {
        if (r === c) continue;
        const f = M[r][c] / M[c][c];
        for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
      }
    }
    return M.map((r, i) => r[n] / r[i]);
  }

  /* ===== Rotaatiot ===== */
  function rotAxis(axis, t) {
    const c = cos(t), s = sin(t);
    if (axis === 0) return [[1, 0, 0], [0, c, -s], [0, s, c]];
    if (axis === 1) return [[c, 0, s], [0, 1, 0], [-s, 0, c]];
    return [[c, -s, 0], [s, c, 0], [0, 0, 1]];
  }

  // Sisäinen (intrinsic) "ZYX": R = Rz(a)·Ry(b)·Rx(c). Ulkoinen (extrinsic) "XYZ": R = Rz(c)·Ry(b)·Rx(a).
  function eulerToMat(angles, order, frame = "intrinsic") {
    const R = [0, 1, 2].map((i) => rotAxis(AX[order[i]], angles[i]));
    return frame === "intrinsic" ? mul(mul(R[0], R[1]), R[2]) : mul(mul(R[2], R[1]), R[0]);
  }

  // Bernardes & Viollet (2022): yleinen kvaternio → Euler mille tahansa järjestykselle
  function matToEuler(R, order, frame = "intrinsic") {
    if (frame === "extrinsic") return matToEuler(R, [...order].reverse().join(""), "intrinsic").reverse();

    // Algoritmi on muotoiltu ulkoisille kierroille: sisäinen järjestys käännetään ja kulmat vaihdetaan lopuksi
    let [i, j, k] = [...order].reverse().map((c) => AX[c]);
    const proper = i === k;
    if (proper) k = 3 - i - j;
    const sign = ((i - j) * (j - k) * (k - i)) / 2;
    const q = matToQuat(R);
    let a, b, c, d;
    if (proper) { a = q[3]; b = q[i]; c = q[j]; d = q[k] * sign; }
    else { a = q[3] - q[j]; b = q[i] + q[k] * sign; c = q[j] + q[3]; d = q[k] * sign - q[i]; }
    const n2 = a * a + b * b + c * c + d * d;
    const ang = [0, acos(clamp((2 * (a * a + b * b)) / n2 - 1, -1, 1)), 0];
    const hs = atan2(b, a), hd = atan2(-d, c);
    ang[0] = hs + hd; ang[2] = hs - hd;
    const degenerate = abs(ang[1]) < 1e-6 || abs(ang[1] - PI) < 1e-6;
    if (!proper) { ang[2] *= sign; ang[1] -= PI / 2; }
    [ang[0], ang[2]] = [ang[2], ang[0]];

    if (degenerate) {
      // Kardaanilukko: ensimmäinen kulma 0, kolmas ratkaistaan jäljelle jäävästä kierrosta
      ang[0] = 0;
      const M = mul(transpose(rotAxis(AX[order[1]], ang[1])), R);
      ang[2] = axisAngleOf(M, AX[order[2]]);
    }
    return ang.map(wrap);
  }

  // Kiertokulma, kun M on kierto akselin ympäri
  function axisAngleOf(M, axis) {
    const p = (axis + 1) % 3, r = (axis + 2) % 3;
    return atan2(M[r][p], M[p][p]);
  }

  // Euler-kulmien kardaanilukko: Tait–Bryan ±90°, aito Euler 0°/180°
  function gimbalLocked(angles, order) {
    const mid = angles[1];
    return order[0] === order[2]
      ? abs(sin(mid)) < 0.01
      : abs(cos(mid)) < 0.01;
  }

  function matToQuat(R) {
    const tr = R[0][0] + R[1][1] + R[2][2];
    let x, y, z, w;
    if (tr > 0) {
      const s = sqrt(tr + 1) * 2;
      w = 0.25 * s; x = (R[2][1] - R[1][2]) / s; y = (R[0][2] - R[2][0]) / s; z = (R[1][0] - R[0][1]) / s;
    } else if (R[0][0] > R[1][1] && R[0][0] > R[2][2]) {
      const s = sqrt(1 + R[0][0] - R[1][1] - R[2][2]) * 2;
      w = (R[2][1] - R[1][2]) / s; x = 0.25 * s; y = (R[0][1] + R[1][0]) / s; z = (R[0][2] + R[2][0]) / s;
    } else if (R[1][1] > R[2][2]) {
      const s = sqrt(1 + R[1][1] - R[0][0] - R[2][2]) * 2;
      w = (R[0][2] - R[2][0]) / s; x = (R[0][1] + R[1][0]) / s; y = 0.25 * s; z = (R[1][2] + R[2][1]) / s;
    } else {
      const s = sqrt(1 + R[2][2] - R[0][0] - R[1][1]) * 2;
      w = (R[1][0] - R[0][1]) / s; x = (R[0][2] + R[2][0]) / s; y = (R[1][2] + R[2][1]) / s; z = 0.25 * s;
    }
    const q = quatNormalize([x, y, z, w]);
    return q[3] < 0 ? q.map((v) => -v) : q; // kanoninen muoto: w ≥ 0
  }

  function quatNormalize(q) {
    const n = hypot(...q);
    return n < 1e-12 ? [0, 0, 0, 1] : q.map((v) => v / n);
  }

  function quatToMat(q) {
    const [x, y, z, w] = quatNormalize(q);
    return [
      [1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
      [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
      [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)],
    ];
  }

  function quatToAxisAngle(q) {
    let [x, y, z, w] = quatNormalize(q);
    if (w < 0) { x = -x; y = -y; z = -z; w = -w; }
    const angle = 2 * acos(clamp(w, -1, 1));
    const s = sqrt(1 - w * w);
    return s < 1e-9 ? { axis: [1, 0, 0], angle: 0 } : { axis: [x / s, y / s, z / s], angle };
  }

  function axisAngleToQuat(axis, angle) {
    const n = hypot(...axis);
    if (n < 1e-12) return [0, 0, 0, 1];
    const s = sin(angle / 2) / n;
    return [axis[0] * s, axis[1] * s, axis[2] * s, cos(angle / 2)];
  }

  // Kuinka kaukana matriisi on aidosta rotaatiosta (0 = täydellinen)
  function orthoError(R) {
    const E = mul(transpose(R), R);
    let e = abs(det3(R) - 1);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) e = Math.max(e, abs(E[i][j] - (i === j ? 1 : 0)));
    return e;
  }

  /* ===== Denavit–Hartenberg ===== */

  // Klassinen: Rz(θ)·Tz(d)·Tx(a)·Rx(α)
  function dhClassic(t, d, a, al) {
    const ct = cos(t), st = sin(t), ca = cos(al), sa = sin(al);
    return [[ct, -st * ca, st * sa, a * ct], [st, ct * ca, -ct * sa, a * st], [0, sa, ca, d], [0, 0, 0, 1]];
  }
  // Modifioitu (Craig): Rx(α)·Tx(a)·Rz(θ)·Tz(d)
  function dhModified(t, d, a, al) {
    const ct = cos(t), st = sin(t), ca = cos(al), sa = sin(al);
    return [[ct, -st, 0, a], [st * ca, ct * ca, -sa, -sa * d], [st * sa, ct * sa, ca, ca * d], [0, 0, 0, 1]];
  }

  const jointTheta = (j, q) => j.theta + (j.type === "R" ? q : 0);
  const jointD = (j, q) => j.d + (j.type === "P" ? q : 0);

  // Palauttaa kaikki koordinaatistot: [kanta, nivel 1 … n, työkalu]
  function fk(chain, q) {
    const f = chain.convention === "modified" ? dhModified : dhClassic;
    // Kantasiirtymä syntyy, kun modifioitu ketju muunnetaan klassiseksi (ks. toClassic)
    let T = chain.base ? dhModified(0, 0, chain.base.a, chain.base.alpha) : identity(4);
    const frames = [T];
    chain.joints.forEach((j, i) => {
      T = mul(T, f(jointTheta(j, q[i]), jointD(j, q[i]), j.a, j.alpha));
      frames.push(T);
    });
    const tool = chain.tool || { a: 0, alpha: 0 };
    frames.push(mul(T, dhModified(0, 0, tool.a, tool.alpha)));
    return frames;
  }

  // Muunnokset säilyttävät työkalun asennon: klassisen rivin (a, α) siirtyy seuraavalle modifioidulle riville
  function toModified(chain) {
    if (chain.convention === "modified") return chain;
    const J = chain.joints, base = chain.base || { a: 0, alpha: 0 };
    const joints = J.map((j, i) => ({ ...j, a: i ? J[i - 1].a : base.a, alpha: i ? J[i - 1].alpha : base.alpha }));
    const last = J[J.length - 1] || { a: 0, alpha: 0 };
    return { ...chain, convention: "modified", joints, tool: { a: last.a, alpha: last.alpha }, base: undefined };
  }
  function toClassic(chain) {
    if (chain.convention !== "modified") return chain;
    const J = chain.joints, tool = chain.tool || { a: 0, alpha: 0 };
    const joints = J.map((j, i) => ({ ...j, a: i < J.length - 1 ? J[i + 1].a : tool.a, alpha: i < J.length - 1 ? J[i + 1].alpha : tool.alpha }));
    // Modifioidun ensimmäisen rivin (a₀, α₀) kantasiirtymää ei voi esittää klassisessa muodossa ilman kantamuunnosta
    return { ...chain, convention: "classic", joints, tool: { a: 0, alpha: 0 }, base: { a: J[0]?.a || 0, alpha: J[0]?.alpha || 0 } };
  }

  /* ===== Käänteiskinematiikka ===== */

  // Tasomainen ketju: kaikki nivelet kiertyviä ja kaikki z-akselit yhdensuuntaisia
  function isPlanar(chain) {
    const flat = (al) => abs(sin(al)) < 1e-9 && cos(al) > 0;
    return chain.joints.length > 0 && chain.joints.every((j) => j.type === "R" && flat(j.alpha))
      && flat((chain.tool || {}).alpha || 0) && flat((chain.base || {}).alpha || 0);
  }

  function task(chain, q, mode) {
    const T = fk(chain, q).at(-1);
    if (mode === "pos3") return [T[0][3], T[1][3], T[2][3]];
    if (mode === "planarOri") return [T[0][3], T[1][3], atan2(T[1][0], T[0][0])];
    return [T[0][3], T[1][3]];
  }

  function jacobian(chain, q, mode) {
    const h = 1e-6, f0 = task(chain, q, mode);
    const J = f0.map(() => new Array(q.length).fill(0));
    for (let i = 0; i < q.length; i++) {
      const qp = [...q]; qp[i] += h;
      const qm = [...q]; qm[i] -= h;
      const fp = task(chain, qp, mode), fm = task(chain, qm, mode);
      for (let r = 0; r < f0.length; r++) {
        let df = fp[r] - fm[r];
        if (mode === "planarOri" && r === 2) df = wrap(df);
        J[r][i] = df / (2 * h);
      }
    }
    return J;
  }

  // Manipuloitavuus √det(J·Jᵀ): lähellä nollaa = singulariteetti
  function manipulability(chain, q, mode) {
    const J = jacobian(chain, q, mode === "planarOri" ? "planar" : mode);
    const A = mul(J, transpose(J));
    const d = A.length === 2 ? A[0][0] * A[1][1] - A[0][1] * A[1][0] : det3(A);
    return sqrt(Math.max(0, d));
  }

  const clampJoint = (j, v) => clamp(v, j.min ?? -Infinity, j.max ?? Infinity);

  // Vaimennettu pienimmän neliösumman menetelmä (DLS): dq = Jᵀ(J·Jᵀ + λ²I)⁻¹·e
  function ikDls(chain, q0, target, { mode = "pos3", lambda = 0.05, maxIter = 200, tol = 1e-5 } = {}) {
    let q = chain.joints.map((j, i) => clampJoint(j, q0[i] ?? 0));
    let err = Infinity, iters = 0;
    for (; iters < maxIter; iters++) {
      const f = task(chain, q, mode);
      const e = target.map((t, r) => (mode === "planarOri" && r === 2 ? wrap(t - f[r]) : t - f[r]));
      err = hypot(...e);
      if (err < tol) break;
      const J = jacobian(chain, q, mode);
      const A = mul(J, transpose(J));
      for (let r = 0; r < A.length; r++) A[r][r] += lambda * lambda;
      const y = solve(A, e);
      if (!y) break;
      let dq = q.map((_, i) => J.reduce((s, row, r) => s + row[i] * y[r], 0));
      const big = Math.max(...dq.map(abs));
      if (big > 0.3) dq = dq.map((v) => (v * 0.3) / big); // rajoitetaan askelta, jotta iterointi pysyy vakaana
      q = q.map((v, i) => clampJoint(chain.joints[i], v + dq[i]));
    }
    return { q, err, iters, converged: err < tol };
  }

  // Analyyttinen 2R-ratkaisu klassiselle tasomaiselle ketjulle. elbowUp: kyynärpää kohteen ja kannan välisen suoran yläpuolella.
  function ik2R(chain, x, y, elbowUp = true) {
    const [j1, j2] = chain.joints;
    x -= (chain.base || {}).a || 0;
    const a1 = j1.a, a2 = j2.a;
    const r2 = x * x + y * y;
    // Nollapituinen linkki: käytännössä 1R-ketju, jonka kärki on etäisyydellä a1 + a2. Toinen kulma ei vaikuta.
    if (a1 * a2 === 0) {
      const L = abs(a1 + a2);
      return { q: [wrap(atan2(y, x) - j1.theta), wrap(-j2.theta)], reachable: abs(sqrt(r2) - L) < 1e-6 * Math.max(1, L) };
    }
    let c2 = (r2 - a1 * a1 - a2 * a2) / (2 * a1 * a2);
    const reachable = c2 >= -1 - 1e-12 && c2 <= 1 + 1e-12;
    c2 = clamp(c2, -1, 1);
    const s2 = (elbowUp ? -1 : 1) * sqrt(1 - c2 * c2);
    const t2 = atan2(s2, c2);
    const t1 = atan2(y, x) - atan2(a2 * s2, a1 + a2 * c2);
    return { q: [wrap(t1 - j1.theta), wrap(t2 - j2.theta)], reachable };
  }

  function reach(chain) {
    const c = toClassic(chain);
    const total = c.joints.reduce((s, j) => s + abs(j.a), 0) + abs((c.base || {}).a || 0);
    if (isPlanar(chain) && c.joints.length === 2) {
      // Linkin pituus on |a| (negatiivinen a vain kääntää linkin suunnan; esim. UR-tyyppinen käsivarsi)
      const a1 = abs(c.joints[0].a), a2 = abs(c.joints[1].a);
      return { min: abs(a1 - a2), max: a1 + a2 };
    }
    return { min: 0, max: total + c.joints.reduce((s, j) => s + abs(j.d) + (j.type === "P" ? Math.max(abs(j.min || 0), abs(j.max || 0)) : 0), 0) };
  }

  return {
    jointTheta, jointD,
    mul, transpose, identity, det3, solve, wrap, rotAxis,
    eulerToMat, matToEuler, gimbalLocked, matToQuat, quatToMat, quatNormalize, quatToAxisAngle, axisAngleToQuat, orthoError,
    dhClassic, dhModified, fk, toModified, toClassic,
    isPlanar, task, jacobian, manipulability, ikDls, ik2R, reach,
  };
})();
