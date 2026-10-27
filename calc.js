"use strict";

/* Puhdas laskentalogiikka — ei DOM-riippuvuuksia, jotta sitä voi testata erikseen (tests.html).
   Kaikki sisäiset arvot SI-yksiköissä. */
const Calc = (() => {
  const G = 9.81;
  const RHO_CU = 1.724e-8; // kuparin resistiivisyys, Ω·m
  const TORQUE_TO_NM = { Nm: 1, Nmm: 0.001, kgfcm: 0.0980665, ozin: 0.00706155 };
  const TORQUE_LABEL = { Nm: "N·m", Nmm: "N·mm", kgfcm: "kgf·cm", ozin: "oz·in" };

  /* ===== PID ===== */

  // Simuloi suljetun silmukan askelvasteen. Laitos: 1. kertaluvun (K, tau) tai massa + vaimennus (m, b).
  function simulatePid(p) {
    // Säätimen askel ei saa riippua simulaation kestosta: enintään 1 ms ja 1/20 laitoksen aikavakiosta.
    // Tallennetaan enintään ~2000 pistettä kuvaajaa varten.
    const plantTau = p.plant === "mass" ? (p.b > 0 ? p.m / p.b : Infinity) : p.tau;
    const dt = Math.max(p.T / 200000, Math.min(p.T / 2000, 0.001, plantTau / 20)); // yläraja laskennalle
    const n = Math.ceil(p.T / dt), keep = Math.max(1, Math.floor(n / 2000));
    const sub = 10, h = dt / sub;
    const umax = p.umax > 0 ? p.umax : Infinity;
    const alpha = p.dTau > 0 ? dt / (p.dTau + dt) : 1;
    let y = 0, v = 0, I = 0, prevY = 0, d = 0;
    const t = [], ys = [], us = [], rs = [];
    for (let i = 0; i <= n; i++) {
      const time = i * dt, r = p.setpoint, e = r - y;
      // Derivaatta mittauksesta, ei virheestä: välttää askeleen aiheuttaman piikin
      const dRaw = i === 0 ? 0 : -(y - prevY) / dt;
      d += alpha * (dRaw - d);
      const uRaw = p.kp * e + p.ki * I + p.kd * d;
      const u = Math.max(-umax, Math.min(umax, uRaw));
      if (!p.antiWindup || u === uRaw || Math.sign(e) !== Math.sign(uRaw)) I += e * dt;
      if (i % keep === 0 || i === n) { t.push(time); ys.push(y); us.push(u); rs.push(r); }
      prevY = y;
      const dist = p.distMag && p.distT > 0 && time >= p.distT ? p.distMag : 0; // 0 = ei häiriötä
      for (let k = 0; k < sub; k++) {
        if (p.plant === "mass") { v += ((u + dist - p.b * v) / p.m) * h; y += v * h; }
        else y += (h * (p.K * (u + dist) - y)) / p.tau;
      }
      if (!Number.isFinite(y) || Math.abs(y) > 1e6) return { t, y: ys, u: us, r: rs, unstable: true };
    }
    const unstable = Math.abs(ys[ys.length - 1]) > 10 * Math.abs(p.setpoint);
    // Lyhyessä simulaatiossa karkaaminen ei vielä näy loppuarvossa, joten tarkistetaan myös lineaarinen
    // stabiilisuus suoraan: suljetun piirin karakteristinen polynomi ja Routh–Hurwitz (ilman rajoitusta).
    const growing = !unstable && !pidStable(p);
    return { t, y: ys, u: us, r: rs, unstable, growing };
  }

  // Laitos 1/(m s² + b s) tai K/(τ s + 1) ja säädin Kp + Ki/s + Kd s → s·nimittäjä + osoittaja·säädin
  function pidStable(p) {
    const c = p.plant === "mass"
      ? [p.m, p.b + p.kd, p.kp, p.ki]                         // m s³ + (b+Kd) s² + Kp s + Ki
      : [p.tau + p.K * p.kd, 1 + p.K * p.kp, p.K * p.ki];      // (τ+K·Kd) s² + (1+K·Kp) s + K·Ki
    while (c.length > 1 && Math.abs(c.at(-1)) < 1e-12) c.pop(); // s-tekijä (esim. Ki = 0) ei ole epästabiilisuutta
    // Nolla välissä (esim. massa ilman vaimennusta ja D-termiä) = rajatapaus: värähtely ei koskaan vaimene
    if (c.some((x) => x <= 0)) return false;
    if (c.length === 4) return c[1] * c[2] > c[0] * c[3];
    return true;
  }

  // Askelvasteen tunnusluvut kuten oppikirjoissa: nousuaika 10–90 %, ylitys ja 2 %:n asettumisaika
  // lasketaan loppuarvosta (ei asetusarvosta), jotta myös pysyvän virheen jättävä P-säätö saa ne.
  // Pysyvä virhe = asetusarvo − loppuarvo. Vaste katsotaan asettuneeksi vain, jos se pysyy kaistalla
  // simulaation loppuun ja kaistalla vietetty aika on vähintään 5 % kestosta (muuten simulaatio loppui kesken).
  // Jos vaste ei asetu, loppuarvo on sattumanvarainen heilahduksen kohta, joten nousuaika ja ylitys lasketaan silloin asetusarvosta.
  function stepMetrics({ t, y }, r) {
    const yf = y[y.length - 1];
    const fin = Math.abs(yf) > 1e-9 ? yf : r;
    const band = 0.02 * Math.abs(fin), T = t[t.length - 1] - t[0];
    let settling = t[0];
    for (let i = y.length - 1; i >= 0; i--) {
      if (Math.abs(y[i] - fin) > band) { settling = i === y.length - 1 ? null : t[i + 1]; break; }
    }
    if (settling !== null && t[t.length - 1] - settling < 0.05 * T) settling = null;
    const ref = settling === null ? r : fin;
    let t10 = null, t90 = null, peak = -Infinity;
    for (let i = 0; i < y.length; i++) {
      if (t10 === null && y[i] >= 0.1 * ref) t10 = t[i];
      if (t90 === null && y[i] >= 0.9 * ref) t90 = t[i];
      if (y[i] > peak) peak = y[i];
    }
    return {
      rise: t10 !== null && t90 !== null ? t90 - t10 : null,
      overshoot: Math.max(0, ((peak - ref) / Math.abs(ref)) * 100),
      settling,
      sse: r - yf,
    };
  }

  /* ===== Moottori ja voimansiirto ===== */

  // Lineaarinen DC-moottorimalli: momentti laskee lineaarisesti nollasta jumiin kierrosnopeuden kasvaessa.
  function motor(p) {
    const k = p.vBat / p.vNom;                 // nopeus ja momentti skaalautuvat jännitteen mukana
    const r = p.wheelD / 2;
    const w0 = ((p.rpm * k) / p.ratio) * (2 * Math.PI / 60);
    const tStallWheel = p.stallTorque * k * p.ratio * p.eff;
    const iStall = p.stallCurrent * k, i0 = p.noLoadCurrent * k;
    const v0 = w0 * r;
    const Fs = (p.motors * tStallWheel) / r;
    const th = (p.slopeDeg * Math.PI) / 180;
    const W = p.mass * G;
    const Fres = W * (p.crr * Math.cos(th) + Math.sin(th));
    const Ftrac = p.mu * W * Math.cos(th) * p.driveShare;
    const Fmax = Math.min(Fs, Ftrac);
    const load = Fres / Fs;
    const moves = Fres < Fmax;
    const vOp = moves ? v0 * (1 - load) : 0;
    const tau = (p.mass * v0) / Fs;

    const slopeFor = (F) => {
      const x = F / W, c = Math.hypot(1, p.crr);
      return x >= c ? 90 : Math.max(0, (Math.asin(x / c) - Math.atan(p.crr)) * 180 / Math.PI);
    };
    const tractionSlope = Math.atan(Math.max(0, p.mu * p.driveShare - p.crr)) * 180 / Math.PI;

    // Pito loppuu ennen moottorin voimaa: pyörät sutivat, joten moottori ei ole jumissa vaan kuormana on pitovoima
    const slipping = !moves && Ftrac < Fres && Fres < Fs;
    const iMotor = moves ? i0 + (iStall - i0) * load : slipping ? i0 + (iStall - i0) * (Ftrac / Fs) : iStall;
    const iTotal = p.motors * iMotor;
    return {
      v0, Fs, Ftrac, Fres, load, moves, vOp,
      tStallWheel,
      torqueWheelOp: (Fres * r) / p.motors,
      accel0: moves ? (Fmax - Fres) / p.mass : 0,
      t90: moves ? tau * Math.log(10) : null,
      maxSlope: Math.min(slopeFor(Fs), tractionSlope),
      contSlope: Math.min(slopeFor(0.3 * Fs), tractionSlope),
      tractionLimited: Ftrac < Fs, slipping,
      iMotor, iTotal, iStallTotal: p.motors * iStall, iStall,
      pEl: p.vBat * iTotal,
      pMech: Fres * vOp,
    };
  }

  // Robottikäsivarren nivel (pahin tapaus: varsi vaakasuorassa). Kuorma kärjessä, varren massa tasaisesti
  // jakautuneena. Painovoiman momentti on jatkuva (pito), kiihdytys lisää hetkellisen piikin.
  function jointMotor(p) {
    const k = p.vBat / p.vNom;
    const L = p.length;
    const tGrav = G * (p.payload * L + (p.armMass * L) / 2);
    const J = p.payload * L * L + (p.armMass * L * L) / 3;
    const tDyn = J * p.accel;
    const tPeak = tGrav + tDyn;
    const tStallJoint = p.stallTorque * k * p.ratio * p.eff;
    const w0 = ((p.rpm * k) / p.ratio) * (2 * Math.PI / 60);
    const holdLoad = tGrav / tStallJoint, peakLoad = tPeak / tStallJoint;
    const iStall = p.stallCurrent * k, i0 = p.noLoadCurrent * k;
    const cur = (load) => i0 + (iStall - i0) * Math.min(1, load);
    // Nopeus suurimmalla kuormalla (lineaarinen momentti–nopeus-käyrä)
    const wAtPeak = Math.max(0, w0 * (1 - peakLoad));
    // Välityssuhde, jolla pito jää 30 %:iin jumimomentista (jatkuva käyttö)
    const ratioFor30 = (p.ratio * holdLoad) / 0.3;
    return {
      tGrav, tDyn, tPeak, J, tStallJoint, w0, wAtPeak, holdLoad, peakLoad,
      canHold: holdLoad < 1, canMove: peakLoad < 1,
      speedOk: wAtPeak >= p.speed,
      ratioFor30,
      iHold: cur(holdLoad), iPeak: cur(peakLoad), iStall,
      pPeak: p.vBat * cur(peakLoad),
    };
  }

  /* ===== Sähköjärjestelmä ===== */

  function power(p) {
    const b = p.battery, reg = p.reg;
    let regAvg = 0, regPeak = 0, batAvg = 0, batPeak = 0;
    for (const l of p.loads) {
      const a = (l.qty * l.avg) / 1000, pk = (l.qty * l.peak) / 1000;
      if (l.rail === "reg") { regAvg += a; regPeak += pk; } else { batAvg += a; batPeak += pk; }
    }
    // Säätimen tulovirta akun puolella
    const regIn = (iOut) => reg.type === "linear" ? iOut : (reg.vOut * iOut) / (reg.eff * b.v);
    const regLoss = (iOut) => reg.type === "linear" ? (b.v - reg.vOut) * iOut : reg.vOut * iOut * (1 / reg.eff - 1);

    const totAvg = batAvg + regIn(regAvg);
    const totPeak = batPeak + regIn(regPeak);
    const capAh = (b.mAh / 1000) * b.usable;
    const contA = (b.cRate * b.mAh) / 1000;
    const burstA = (b.burstC * b.mAh) / 1000;
    const rWire = wireResistance(p.wire.length * 2, p.wire.area);

    const res = {
      totAvg, totPeak, regAvg, regPeak, batAvg, batPeak,
      runtimeH: totAvg > 0 ? capAh / totAvg : Infinity,
      contA, burstA,
      regLossAvg: regLoss(regAvg), regLossPeak: regLoss(regPeak),
      rWire, dropPeak: rWire * totPeak, dropAvg: rWire * totAvg,
      warnings: [],
    };
    const w = (level, text) => res.warnings.push({ level, text });

    if (totAvg > contA) w("err", tr(`Keskivirta ${totAvg.toFixed(2)} A ylittää akun jatkuvan purkuvirran ${contA.toFixed(1)} A.`, `Average current ${totAvg.toFixed(2)} A exceeds the battery's continuous discharge rating of ${contA.toFixed(1)} A.`));
    if (totPeak > burstA) w("err", tr(`Huippuvirta ${totPeak.toFixed(2)} A ylittää akun hetkellisen purkuvirran ${burstA.toFixed(1)} A.`, `Peak current ${totPeak.toFixed(2)} A exceeds the battery's burst discharge rating of ${burstA.toFixed(1)} A.`));
    else if (totPeak > contA) w("warn", tr(`Huippuvirta ylittää akun jatkuvan rajan — kestää vain lyhyitä piikkejä.`, `Peak current exceeds the battery's continuous rating — it can only sustain short bursts.`));

    if (regAvg + regPeak > 0) {
      if (regPeak > reg.maxA) w("err", tr(`Säätimen huippukuorma ${regPeak.toFixed(2)} A ylittää sen enimmäisvirran ${reg.maxA} A.`, `Regulator peak load ${regPeak.toFixed(2)} A exceeds its maximum current of ${reg.maxA} A.`));
      else if (regAvg > 0.8 * reg.maxA) w("warn", tr(`Säädin toimii yli 80 % kuormalla — lämpenee ja jättää vähän varaa.`, `Regulator runs above 80 % load — it will heat up and leave little headroom.`));
      if (reg.type === "linear") {
        if (b.v < reg.vOut + reg.dropout) w("err", tr(`Lineaarisäädin tarvitsee vähintään ${(reg.vOut + reg.dropout).toFixed(1)} V tulojännitteen (lähtö + pudotusjännite).`, `Linear regulator needs at least ${(reg.vOut + reg.dropout).toFixed(1)} V input voltage (output + dropout).`));
        if (res.regLossAvg > 1) w("warn", tr(`Lineaarisäädin hukkaa ${res.regLossAvg.toFixed(1)} W lämmöksi — tarvitsee jäähdytyksen tai vaihda hakkuriin.`, `Linear regulator dissipates ${res.regLossAvg.toFixed(1)} W as heat — add a heatsink or switch to a buck converter.`));
      } else if (b.v <= reg.vOut) {
        w("err", tr(`Buck-hakkuri ei pysty nostamaan jännitettä: akku ${b.v} V ≤ lähtö ${reg.vOut} V.`, `A buck converter cannot step up voltage: battery ${b.v} V ≤ output ${reg.vOut} V.`));
      }
    }

    const dropPct = (res.dropPeak / b.v) * 100;
    if (dropPct > 10) w("err", tr(`Johtojen jännitehäviö huipulla ${dropPct.toFixed(1)} % — paksumpi tai lyhyempi johto.`, `Wire voltage drop at peak is ${dropPct.toFixed(1)} % — use thicker or shorter wire.`));
    else if (dropPct > 5) w("warn", tr(`Johtojen jännitehäviö huipulla ${dropPct.toFixed(1)} %.`, `Wire voltage drop at peak is ${dropPct.toFixed(1)} %.`));

    const motors = p.loads.filter((l) => l.kind === "motor");
    if (motors.length) {
      const d = p.driver;
      for (const m of motors) {
        if (m.avg / 1000 > d.contA) w("err", tr(`${m.name}: jatkuva virta ${(m.avg / 1000).toFixed(2)} A ylittää moottoriohjaimen ${d.contA} A/kanava.`, `${m.name}: continuous current ${(m.avg / 1000).toFixed(2)} A exceeds the motor driver's ${d.contA} A/channel.`));
        if (m.peak / 1000 > d.peakA) w("warn", tr(`${m.name}: käynnistys-/jumivirta ${(m.peak / 1000).toFixed(2)} A ylittää ohjaimen huippuvirran ${d.peakA} A.`, `${m.name}: start-up/stall current ${(m.peak / 1000).toFixed(2)} A exceeds the driver's peak current of ${d.peakA} A.`));
        if (m.rail === "reg") w("warn", tr(`${m.name} on kytketty säätimen perään — moottorit kannattaa syöttää suoraan akusta.`, `${m.name} is connected after the regulator — motors should be powered directly from the battery.`));
      }
      // Litiumakku on täyteen ladattuna noin 4,2/3,7 kertaa nimellisjännitteensä (esim. 3S: 11,1 V → 12,6 V)
      const cells = Math.round(b.v / 3.7), lipo = cells >= 1 && Math.abs(b.v - cells * 3.7) < 0.15;
      const vFull = lipo ? cells * 4.2 : b.v;
      if (b.v > d.maxV) w("err", tr(`Akun jännite ${b.v} V ylittää moottoriohjaimen enimmäisjännitteen ${d.maxV} V.`, `Battery voltage ${b.v} V exceeds the motor driver's maximum voltage of ${d.maxV} V.`));
      else if (vFull > d.maxV) w("warn", tr(`Täyteen ladattu ${cells}S-litiumakku antaa noin ${vFull.toFixed(1)} V, mikä ylittää moottoriohjaimen enimmäisjännitteen ${d.maxV} V.`, `A fully charged ${cells}S lithium pack gives about ${vFull.toFixed(1)} V, which exceeds the motor driver's maximum of ${d.maxV} V.`));
    }
    return res;
  }

  function wireResistance(totalLength, areaMm2) {
    return (RHO_CU * totalLength) / (areaMm2 * 1e-6);
  }

  /* ===== Sarjaportti ===== */

  const NUM = /^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i;

  // Tulkitsee rivin: "a:1, b=2" → {a:1, b:2}; "1 2.5 3" → {ch1:1, ch2:2.5, ch3:3}
  function parseLine(line) {
    const out = {};
    const parts = line.trim().replace(/\s*([:=])\s*/g, "$1").split(/[,;\t ]+/).filter(Boolean);
    let idx = 0;
    for (const part of parts) {
      const m = part.match(/^([A-Za-z_][\w.]*)[:=](.+)$/);
      if (m && NUM.test(m[2])) out[m[1]] = parseFloat(m[2]);
      else if (NUM.test(part)) out["ch" + ++idx] = parseFloat(part);
    }
    return out;
  }

  return { G, TORQUE_TO_NM, TORQUE_LABEL, simulatePid, stepMetrics, motor, jointMotor, power, wireResistance, parseLine };
})();
