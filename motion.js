"use strict";

/* Liikeprofiilit (trajektorit) — puhdasta laskentaa ilman DOMia (testit: tests.html).
   Jokainen profiili palauttaa { T, sample(t) → [paikka, nopeus, kiihtyvyys, nykäys], ...tiedot }. */
const Motion = (() => {
  /* ----- Polynomit: annettu kesto T ----- */

  function cubic(q0, q1, T, v0 = 0, v1 = 0) {
    const h = q1 - q0;
    const c2 = (3 * h - (2 * v0 + v1) * T) / (T * T);
    const c3 = (-2 * h + (v0 + v1) * T) / (T * T * T);
    return {
      T,
      sample(t) {
        t = Math.max(0, Math.min(T, t));
        return [q0 + v0 * t + c2 * t * t + c3 * t ** 3, v0 + 2 * c2 * t + 3 * c3 * t * t, 2 * c2 + 6 * c3 * t, 6 * c3];
      },
    };
  }

  function quintic(q0, q1, T, v0 = 0, v1 = 0, a0 = 0, a1 = 0) {
    const h = q1 - q0;
    const c2 = a0 / 2;
    const c3 = (20 * h - (8 * v1 + 12 * v0) * T - (3 * a0 - a1) * T * T) / (2 * T ** 3);
    const c4 = (-30 * h + (14 * v1 + 16 * v0) * T + (3 * a0 - 2 * a1) * T * T) / (2 * T ** 4);
    const c5 = (12 * h - 6 * (v1 + v0) * T + (a1 - a0) * T * T) / (2 * T ** 5);
    return {
      T,
      sample(t) {
        t = Math.max(0, Math.min(T, t));
        return [
          q0 + v0 * t + c2 * t * t + c3 * t ** 3 + c4 * t ** 4 + c5 * t ** 5,
          v0 + 2 * c2 * t + 3 * c3 * t * t + 4 * c4 * t ** 3 + 5 * c5 * t ** 4,
          2 * c2 + 6 * c3 * t + 12 * c4 * t * t + 20 * c5 * t ** 3,
          6 * c3 + 24 * c4 * t + 60 * c5 * t * t,
        ];
      },
    };
  }

  /* ----- Rajoitetut profiilit: kesto lasketaan rajoista ----- */

  // Paloittain vakio nykäys; segmentin a-kenttä asettaa kiihtyvyyden hyppäyksellisesti (trapetsiprofiili)
  function fromSegments(q0, sign, segs) {
    const starts = [];
    let t = 0, p = 0, v = 0, a = 0;
    for (const s of segs) {
      if (s.a !== undefined) a = s.a;
      starts.push({ t, p, v, a, j: s.j || 0, dur: s.dur });
      const d = s.dur, j = s.j || 0;
      p += v * d + (a * d * d) / 2 + (j * d ** 3) / 6;
      v += a * d + (j * d * d) / 2;
      a += j * d;
      t += d;
    }
    const T = t, pEnd = p;
    return {
      T,
      sample(tt) {
        if (tt >= T) return [q0 + sign * pEnd, 0, 0, 0];
        if (tt <= 0) return [q0, 0, 0, 0];
        let s = starts[0];
        for (const x of starts) { if (x.t <= tt) s = x; else break; }
        const d = tt - s.t;
        return [
          q0 + sign * (s.p + s.v * d + (s.a * d * d) / 2 + (s.j * d ** 3) / 6),
          sign * (s.v + s.a * d + (s.j * d * d) / 2),
          sign * (s.a + s.j * d),
          sign * s.j,
        ];
      },
    };
  }

  // Trapetsiprofiili: kiihdytys amax:lla, tasainen vmax, jarrutus. Lyhyellä matkalla kolmioprofiili.
  function trapezoid(q0, q1, vmax, amax) {
    const h = Math.abs(q1 - q0), sign = Math.sign(q1 - q0) || 1;
    if (h === 0) return { ...fromSegments(q0, sign, []), triangle: false, vPeak: 0 };
    let Ta = vmax / amax, vPeak = vmax;
    const triangle = h < (vmax * vmax) / amax;
    if (triangle) { Ta = Math.sqrt(h / amax); vPeak = amax * Ta; }
    const Tv = triangle ? 0 : (h - vPeak * Ta) / vPeak;
    const prof = fromSegments(q0, sign, [{ dur: Ta, a: amax }, { dur: Tv, a: 0 }, { dur: Ta, a: -amax }]);
    return { ...prof, triangle, vPeak };
  }

  // Kaksois-S-profiili (Biagiotti & Melchiorri), lepotilasta lepotilaan: rajoitettu nykäys, kiihtyvyys ja nopeus
  function scurve(q0, q1, vmax, amax, jmax) {
    const h = Math.abs(q1 - q0), sign = Math.sign(q1 - q0) || 1;
    if (h === 0) return { ...fromSegments(q0, sign, []), vPeak: 0, aPeak: 0, reachedV: false, reachedA: false };
    let Tj, Ta, Tv;
    if (vmax * jmax >= amax * amax) { Tj = amax / jmax; Ta = Tj + vmax / amax; }
    else { Tj = Math.sqrt(vmax / jmax); Ta = 2 * Tj; }
    Tv = h / vmax - Ta;
    let reachedV = Tv >= 0;
    if (!reachedV) {
      Tv = 0;
      Tj = amax / jmax;
      Ta = (amax * amax / jmax + Math.sqrt((amax ** 4) / (jmax * jmax) + 4 * h * amax)) / (2 * amax);
      if (Ta < 2 * Tj) { Tj = Math.cbrt(h / (2 * jmax)); Ta = 2 * Tj; }
    }
    const aPeak = jmax * Tj;
    const Tc = Ta - 2 * Tj; // vakiokiihtyvyyden kesto
    const segs = [
      { dur: Tj, j: jmax }, { dur: Tc, j: 0 }, { dur: Tj, j: -jmax },
      { dur: Tv, j: 0 },
      { dur: Tj, j: -jmax }, { dur: Tc, j: 0 }, { dur: Tj, j: jmax },
    ];
    const prof = fromSegments(q0, sign, segs);
    return { ...prof, vPeak: aPeak * (Ta - Tj), aPeak, reachedV, reachedA: Tc > 1e-12 };
  }

  // Näytteistää profiilin kuvaajia varten ja laskee huippuarvot
  function sampleProfile(prof, n = 400) {
    const t = [], p = [], v = [], a = [], j = [];
    let vMax = 0, aMax = 0, jMax = 0;
    for (let i = 0; i <= n; i++) {
      const ti = (prof.T * i) / n;
      const s = prof.sample(ti);
      t.push(ti); p.push(s[0]); v.push(s[1]); a.push(s[2]); j.push(s[3]);
      vMax = Math.max(vMax, Math.abs(s[1])); aMax = Math.max(aMax, Math.abs(s[2])); jMax = Math.max(jMax, Math.abs(s[3]));
    }
    return { t, p, v, a, j, vMax, aMax, jMax };
  }

  return { cubic, quintic, trapezoid, scurve, sampleProfile };
})();
