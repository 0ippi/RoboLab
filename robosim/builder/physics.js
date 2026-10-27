// Fysiikkatesti: pudottaa robotin maahan samalla fysiikalla kuin simulaatio
// (3D: Rapier, 2D: planck.js), jotta näkee, pysyykö se kasassa ja miten moottorit liikkuvat.
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { Robot3D, normalizeModel3D } from '../3d/robot3d.js';
import { buildTerrain3D } from '../3d/terrain3d.js';
import { to2D, to3D } from './model.js';

// Pienimmän normin ratkaisu yhtälölle A·f = b (A: rivit × roottorit): f = Aᵀ (A Aᵀ)⁻¹ b. Palauttaa null, jos ratkaisua ei ole.
function leastNorm(A, b) {
  const k = A.length, m = A[0].length;
  const M = A.map((ri) => A.map((rj) => ri.reduce((s, v, c) => s + v * rj[c], 0)));
  const tr0 = M.reduce((s, row, i) => s + row[i], 0) || 1;
  M.forEach((row, i) => { row[i] += 1e-6 * tr0; row.push(b[i]); }); // pieni lisä: ratkeaa, vaikka rivit olisivat riippuvia
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) return null;
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = M[r][c] / M[c][c];
      for (let x = c; x <= k; x++) M[r][x] -= f * M[c][x];
    }
  }
  const y = M.map((row, i) => row[k] / row[i]);
  return Array.from({ length: m }, (_, j) => A.reduce((s, row, i) => s + row[j] * y[i], 0));
}

let rapierReady = null;
export function initPhysics() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export class PhysicsTest {
  constructor(model, dim) {
    this.dim = dim;
    this.t = 0;
    if (dim === '2d') {
      const m = RS.normalizeModel(to2D(model));
      this.world = new planck.World({ gravity: RS.V(0, -10) });
      const terrain = RS.buildTerrain(this.world, 'flat', RS.rng(1));
      this.robot = new RS.Robot(this.world, m);
      this.robot.terrain = terrain;
      // 2D-kappaleella on oma kulma, joten piirrossa osan sisäinen kierto on nolla.
      this.bodies = this.robot.parts.map((p) => {
        const src = model.bodies.find((b) => b.id === p.spec.id);
        return { ...src, rot: [0, 0, 0] };
      });
      this.motors = this.robot.motors.map((mo) => ({
        label: `${mo.spec.a} – ${mo.spec.b}`, kind: 'speed'
      }));
    } else {
      const m = normalizeModel3D(to3D(model));
      this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      this.world.timestep = 1 / 60;
      const terrain = buildTerrain3D(RAPIER, this.world, 'flat', RS.rng(1));
      this.robot = new Robot3D(RAPIER, this.world, m, terrain);
      this.bodies = this.robot.parts.map((p) => model.bodies.find((b) => b.id === p.spec.id));
      // Robot3D luo moottorit samassa järjestyksessä kuin moottorilliset nivelet ovat mallissa.
      const motorJoints = m.joints.filter((j) => j.motor !== false);
      this.motors = this.robot.motors.map((mo, i) => ({
        label: `${motorJoints[i].a} – ${motorJoints[i].b}`,
        kind: mo.control === 'position' && mo.limited ? 'angle' : 'speed'
      }));
    }
    // Roottorit saavat omat liukusäätimensä moottorien perään (sama järjestys kuin neuroverkon ulostuloissa)
    (this.robot.thrusters || []).forEach((_, i) => this.motors.push({ label: tr(`Roottori ${i + 1}`, `Rotor ${i + 1}`), kind: 'thrust' }));
    this.actions = new Array(this.motors.length).fill(0);
    // Lentoavustin käsin testaamiseen: ilman säätöä roottorirobotti kääntyy heti ympäri, koska mikään ei pidä sitä
    // vaakatasossa (simulaatiossa neuroverkko oppii tämän itse). climb = nousu/lasku, pitch/roll = kallistus.
    this.assist = (this.robot.thrusters || []).length > 0;
    this.cmd = { climb: 0, pitch: 0, roll: 0 };
  }

  step() {
    if (this.assist && this.robot.thrusters.length) this.autopilot();
    this.robot.act(this.actions);
    if (this.dim === '2d') this.world.step(1 / 60, 8, 3);
    else this.world.step();
    this.t += 1 / 60;
  }

  poses() {
    if (this.dim === '2d') {
      return this.robot.parts.map(({ body }) => {
        const p = body.getPosition(), a = body.getAngle();
        return { x: p.x, y: p.y, z: 0, qx: 0, qy: 0, qz: Math.sin(a / 2), qw: Math.cos(a / 2) };
      });
    }
    return this.robot.parts.map(({ body }) => {
      const p = body.translation(), r = body.rotation();
      return { x: p.x, y: p.y, z: p.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
    });
  }

  // Laskee roottoreille tehot: kokonaisvoima pitää nousunopeuden käskyssä ja voimien erot kääntävät robotin
  // haluttuun kallistukseen (PD-säätö). Voimat jaetaan pienimmän neliösumman ratkaisulla, joten roottorien
  // paikat saavat olla mitä tahansa. Vain ylöspäin työntävät roottorit osallistuvat.
  autopilot() {
    const r = this.robot, th = r.thrusters, n = r.motors.length, is2d = this.dim === '2d', g = is2d ? 10 : 9.81;
    let mass = 0, inertia = 0;
    const com = new THREE.Vector3();
    const parts = r.parts.map(({ body }) => {
      const m = is2d ? body.getMass() : body.mass();
      const c = is2d ? body.getWorldCenter() : (body.worldCom ? body.worldCom() : body.translation());
      mass += m; com.x += c.x * m; com.y += c.y * m; com.z += (c.z || 0) * m;
      return { body, m, c: new THREE.Vector3(c.x, c.y, c.z || 0) };
    });
    if (!(mass > 0)) return;
    com.divideScalar(mass);
    // Nopeus painopisteen paikan muutoksesta: fysiikkamoottorin ilmoittama nopeus voi poiketa toteutuneesta liikkeestä
    // painovoiman askeleen verran, jolloin leijuva robotti ryömisi hitaasti ylös
    const moved = this.prevCom ? com.clone().sub(this.prevCom).multiplyScalar(60) : null;
    this.prevCom = com.clone();
    for (const p of parts) {
      let own;
      if (is2d) { const lc = p.body.getLocalCenter(); own = p.body.getInertia() - p.m * (lc.x * lc.x + lc.y * lc.y); }
      else { const pi = p.body.principalInertia?.(); own = pi ? (pi.x + pi.y + pi.z) / 3 : p.m * 0.05; }
      inertia += Math.max(own, 1e-4) + p.m * p.c.distanceToSquared(com);
    }
    const cmd = this.cmd, kp = 16, kd = 7;
    const clamp = (v, a) => Math.max(-a, Math.min(a, v));
    // Pystysuunta: nopeuskäsky (1,5 m/s täydellä liukusäätimellä) PI-säädöllä, jotta leijunta ei ryömi
    const climb = (vy) => {
      const e = cmd.climb * 1.5 - vy;
      if (Math.abs(e) < 0.3) this.vInt = clamp((this.vInt || 0) + e / 60, 2); // ei kerry nousun aikana (ei ryömintää jälkeenpäin)
      return g + 4 * e + 3 * (this.vInt || 0);
    };
    // Vaakasuunta: kallistus valitaan niin, että nopeus lähestyy käskyä (2 m/s täydellä), enintään noin 23°
    const tilt = (want, v) => clamp(0.3 * (want * 2 - v), 0.4);
    const rows = [], b = [], lift = [];
    if (is2d) {
      const root = r.root, ang = Math.atan2(Math.sin(root.getAngle()), Math.cos(root.getAngle()));
      const upY = Math.cos(ang), v = moved || root.getLinearVelocity();
      const want = -tilt(cmd.pitch, v.x); // kallistus eteen = myötäpäivään, jolloin työntö vie eteenpäin
      const err = Math.atan2(Math.sin(want - ang), Math.cos(want - ang));
      const T = Math.max(0, mass * climb(v.y) / Math.max(0.4, upY));
      const tau = inertia * (kp * err - kd * root.getAngularVelocity());
      const r0 = [], r1 = [];
      th.forEach((t, i) => {
        const d = t.body.getWorldVector(t.dir), up = { x: -Math.sin(ang), y: Math.cos(ang) };
        if (d.x * up.x + d.y * up.y < 0.7) return;
        const p = t.body.getWorldPoint(t.local), rx = p.x - com.x, ry = p.y - com.y;
        lift.push(i); r0.push(1); r1.push(rx * d.y - ry * d.x);
      });
      rows.push(r0, r1); b.push(T, tau);
    } else {
      const root = r.root, q = new THREE.Quaternion().copy(root.rotation()), qi = q.clone().invert();
      const upB = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
      const flat = (v) => { v.y = 0; return v.lengthSq() > 1e-6 ? v.normalize() : v; };
      const fwd = flat(new THREE.Vector3(1, 0, 0).applyQuaternion(q)), side = flat(new THREE.Vector3(0, 0, 1).applyQuaternion(q));
      const lv = moved || root.linvel(), vel = new THREE.Vector3(lv.x, lv.y, lv.z);
      const want = new THREE.Vector3(0, 1, 0).addScaledVector(fwd, tilt(cmd.pitch, vel.dot(fwd))).addScaledVector(side, tilt(cmd.roll, vel.dot(side))).normalize();
      const err = new THREE.Vector3().crossVectors(upB, want).applyQuaternion(qi);
      const w = root.angvel(), wb = new THREE.Vector3(w.x, w.y, w.z).applyQuaternion(qi);
      const T = Math.max(0, mass * climb(lv.y) / Math.max(0.4, upB.y));
      const r0 = [], r1 = [], r2 = [];
      th.forEach((t, i) => {
        const pb = t.part.body, pq = new THREE.Quaternion().copy(pb.rotation()), pt = pb.translation();
        const d = t.dir.clone().applyQuaternion(pq);
        if (d.dot(upB) < 0.7) return;
        const rr = t.local.clone().applyQuaternion(pq).add(new THREE.Vector3(pt.x, pt.y, pt.z)).sub(com).applyQuaternion(qi);
        const tq = new THREE.Vector3().crossVectors(rr, d.clone().applyQuaternion(qi));
        lift.push(i); r0.push(1); r1.push(tq.x); r2.push(tq.z);
      });
      rows.push(r0, r1, r2); b.push(T, inertia * (kp * err.x - kd * wb.x), inertia * (kp * err.z - kd * wb.z));
    }
    if (!lift.length) return;
    const f = leastNorm(rows, b) || lift.map(() => b[0] / lift.length);
    lift.forEach((i, k) => {
      const level = Math.min(1, Math.max(0, f[k] / th[i].max));
      this.actions[n + i] = level * 2 - 1;
    });
  }

  fallen() {
    return this.robot.isFallen();
  }

  rootHeight() {
    const r = this.robot.root;
    return this.dim === '2d' ? r.getPosition().y : r.translation().y;
  }

  // Päärungon paikka vaakasuunnassa: kurssit mittaavat tästä, kuinka pitkälle robotti on ajanut
  rootX() {
    const r = this.robot.root;
    return this.dim === '2d' ? r.getPosition().x : r.translation().x;
  }

  free() {
    if (this.dim === '3d') this.world.free();
  }
}
