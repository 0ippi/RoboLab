// 3D-robotin rakentaminen mallista, sensorit ja moottorit (Rapier).
// Three.js koko osoitteella (sama kuin index.html:n import mapissa, joten sivulla moduuli on yksi ja sama):
// rinnakkaiskoulutuksen Web Worker ei näe sivun import mapia.
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js';

export const ROBOT_GROUPS = 0x00020001; // jäsen: ryhmä 2, törmää vain maahan (ryhmä 1)

const vec = (a, d = [0, 0, 0]) => (Array.isArray(a) ? [a[0] || 0, a[1] || 0, a[2] || 0] : d.slice());
const toQuat = (rotDeg) => new THREE.Quaternion().setFromEuler(
  new THREE.Euler(RS.deg(rotDeg[0]), RS.deg(rotDeg[1]), RS.deg(rotDeg[2])));

// Tarkistaa mallin ja muuttaa sen sisäiseen muotoon (jokaisella osalla shapes-lista).
export function normalizeModel3D(input) {
  const m = RS.clone(input);
  if (!Array.isArray(m.bodies) || m.bodies.length === 0) throw new Error(tr('Mallissa ei ole osia (bodies).', 'The model has no parts (bodies).'));
  m.joints = m.joints || [];
  m.sensors = Object.assign({ scan: 0 }, m.sensors);
  // Mittauspisteitä enintään 32 (kirjoitusvirhe tekisi jokaisesta askeleesta raskaan)
  m.sensors.scan = Math.max(0, Math.min(32, m.sensors.scan | 0));
  m.fall = m.fall || {};
  const ids = new Set();
  for (const b of m.bodies) {
    if (!b.id) throw new Error(tr('Jokaisella osalla pitää olla id.', 'Every part needs an id.'));
    if (ids.has(b.id)) throw new Error(tr('Sama id kahdesti: ', 'Same id twice: ') + b.id);
    ids.add(b.id);
    if (!b.shapes) b.shapes = [{ type: b.shape || 'box', size: b.size, r: b.r, h: b.h, deco: b.deco, plain: b.plain, round: b.round }];
    b.pos = vec(b.pos);
    b.rot = vec(b.rot);
    for (const s of b.shapes) {
      s.type = s.type || 'box';
      s.pos = vec(s.pos);
      s.rot = vec(s.rot);
      const ok = s.type === 'box' ? Array.isArray(s.size) && s.size.length === 3 && s.size.every((v) => v > 0)
        : s.type === 'sphere' ? s.r > 0
          : (s.type === 'cylinder' || s.type === 'capsule') ? s.r > 0 && s.h > 0 : false;
      if (!ok) throw new Error(tr(`Osan ${b.id} muoto on virheellinen (box: size [w,h,d], sphere: r, cylinder/capsule: r ja h).`, `Part ${b.id} has an invalid shape (box: size [w,h,d], sphere: r, cylinder/capsule: r and h).`));
    }
  }
  for (const j of m.joints) {
    if (!ids.has(j.a) || !ids.has(j.b)) throw new Error(tr('Nivel viittaa tuntemattomaan osaan: ', 'A joint refers to an unknown part: ') + j.a + ' / ' + j.b);
    j.pos = vec(j.pos);
    const ax = vec(j.axis, [0, 0, 1]);
    const len = Math.hypot(...ax);
    if (!(len > 0)) throw new Error(tr('Nivelen akseli ei voi olla nolla.', 'A joint axis cannot be zero.'));
    j.axis = ax.map((v) => v / len);
  }
  if (!m.root) m.root = m.bodies[0].id;
  if (!ids.has(m.root)) throw new Error(tr('root-osaa ei löydy: ', 'Root part not found: ') + m.root);
  // Suihkut/roottorit: voima osaan pisteessä pos, suunta dir osan koordinaatistossa (oletus ylös)
  m.thrusters = (m.thrusters || []).map((t) => {
    if (!ids.has(t.body)) throw new Error(tr('Roottori viittaa tuntemattomaan osaan: ', 'A thruster refers to an unknown part: ') + t.body);
    const d = vec(t.dir, [0, 1, 0]), len = Math.hypot(...d) || 1;
    return { body: t.body, pos: vec(t.pos), dir: d.map((v) => v / len), force: t.force, weight: t.weight, rid: t.rid };
  });
  return m;
}

export function modelInfo3D(m) {
  const thrusters = (m.thrusters || []).length;
  const motors = m.joints.filter((j) => j.motor !== false).length;
  const feet = m.bodies.filter((b) => b.foot).length;
  const scan = m.sensors.scan | 0;
  // runko: ylös-vektori 3, eteen-vektori 3, kulmanopeus 3, nopeus 3, korkeus 1 = 13; vaihe 2;
  // kohde 2 (maan tasossa) tai 3, jos mallilla on oma kohdealue ilmassa (esim. robottikäsi)
  const targetDims = m.target ? 3 : 2;
  const obsSize = 13 + 2 * motors + feet + scan + 2 + targetDims;
  return { motors, thrusters, feet, scan, targetDims, obsSize, actSize: motors + thrusters };
}

// Muodon sijainti ja asento suhteessa osan origoon (osan oma asento on aina nolla,
// jotta nivelten akselit ovat molemmissa osissa samassa koordinaatistossa).
export function shapeTransform(body, s) {
  const qb = toQuat(body.rot);
  const pos = new THREE.Vector3(...s.pos).applyQuaternion(qb);
  const q = qb.clone().multiply(toQuat(s.rot));
  return { pos, q };
}

// Paljonko mallia nostetaan, jotta alin kohta on juuri maan yläpuolella.
function modelLift(m) {
  if (m.bodies.some((b) => b.static)) return 0;
  let minY = Infinity;
  const mat = new THREE.Matrix4();
  for (const b of m.bodies) {
    for (const s of b.shapes) {
      const { pos, q } = shapeTransform(b, s);
      const e = mat.makeRotationFromQuaternion(q).elements;
      const r1 = [e[1], e[5], e[9]]; // matriisin rivi 1: miten paikalliset akselit näkyvät y-suunnassa
      let ext;
      if (s.type === 'box') ext = Math.abs(r1[0]) * s.size[0] / 2 + Math.abs(r1[1]) * s.size[1] / 2 + Math.abs(r1[2]) * s.size[2] / 2;
      else if (s.type === 'sphere') ext = s.r;
      else if (s.type === 'cylinder') ext = Math.abs(r1[1]) * s.h / 2 + Math.sqrt(Math.max(0, 1 - r1[1] * r1[1])) * s.r;
      else ext = Math.abs(r1[1]) * s.h / 2 + s.r;
      minY = Math.min(minY, b.pos[1] + pos.y - ext);
    }
  }
  return 0.02 - minY;
}

function colliderDesc(RAPIER, s) {
  if (s.type === 'box') return RAPIER.ColliderDesc.cuboid(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2);
  if (s.type === 'sphere') return RAPIER.ColliderDesc.ball(s.r);
  if (s.type === 'cylinder') return RAPIER.ColliderDesc.cylinder(s.h / 2, s.r);
  return RAPIER.ColliderDesc.capsule(s.h / 2, s.r);
}

const _q = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _v = new THREE.Vector3(), _w = new THREE.Vector3();

export class Robot3D {
  constructor(RAPIER, world, model, terrain) {
    this.world = world;
    this.model = model;
    this.terrain = terrain;
    this.info = modelInfo3D(model);
    const lift = modelLift(model);
    // Miten osan ja maan kitkat yhdistetään. "min" = liukas osa pysyy liukkaana (esim. tukipyörät).
    const FRICTION_RULES = {
      average: RAPIER.CoefficientCombineRule.Average, min: RAPIER.CoefficientCombineRule.Min,
      max: RAPIER.CoefficientCombineRule.Max, multiply: RAPIER.CoefficientCombineRule.Multiply
    };
    this.parts = [];
    this.byId = {};

    for (const spec of model.bodies) {
      const [x, y, z] = spec.pos;
      const desc = spec.static ? RAPIER.RigidBodyDesc.fixed() : RAPIER.RigidBodyDesc.dynamic();
      // Ilmanvastus lentäville roboteille (muuten roottorien pienetkin erot pyörittävät rungon)
      if (spec.linearDamping) desc.setLinearDamping(spec.linearDamping);
      if (spec.angularDamping) desc.setAngularDamping(spec.angularDamping);
      const body = world.createRigidBody(desc.setTranslation(x, y + lift, z));
      const colliders = [];
      for (const s of spec.shapes) {
        const { pos, q } = shapeTransform(spec, s);
        const c = world.createCollider(colliderDesc(RAPIER, s)
          .setTranslation(pos.x, pos.y, pos.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setDensity(spec.density ?? 1)
          .setFriction(spec.friction ?? 0.8)
          .setFrictionCombineRule(FRICTION_RULES[spec.frictionCombine] ?? RAPIER.CoefficientCombineRule.Average)
          .setCollisionGroups(ROBOT_GROUPS), body);
        colliders.push(c);
      }
      const part = { body, spec, colliders };
      this.parts.push(part);
      this.byId[spec.id] = part;
    }

    this.motors = [];
    for (const j of model.joints) {
      const A = this.byId[j.a], B = this.byId[j.b];
      const pa = A.spec.pos, pb = B.spec.pos;
      const anchor1 = { x: j.pos[0] - pa[0], y: j.pos[1] - pa[1], z: j.pos[2] - pa[2] };
      const anchor2 = { x: j.pos[0] - pb[0], y: j.pos[1] - pb[1], z: j.pos[2] - pb[2] };
      const axis = { x: j.axis[0], y: j.axis[1], z: j.axis[2] };
      const joint = world.createImpulseJoint(RAPIER.JointData.revolute(anchor1, anchor2, axis), A.body, B.body, true);
      const limited = j.lower != null && j.upper != null;
      if (limited) joint.setLimits(RS.deg(j.lower), RS.deg(j.upper));
      // Rajoitetut nivelet ohjataan oletuksena kulmaan (servo), vapaat nivelet nopeuteen (pyörät).
      const control = j.control || (limited ? 'position' : 'velocity');
      const entry = {
        joint, a: A.body, b: B.body, axis: new THREE.Vector3(...j.axis), limited, control,
        lo: RS.deg(j.lower ?? 0), hi: RS.deg(j.upper ?? 0), speed: j.speed > 0 ? j.speed : 6, // 0 → havainto 0/0 = NaN
        strength: j.strength ?? 10, stiffness: j.stiffness ?? 200, damping: j.damping ?? 8
      };
      // Kulmaohjaus voimapohjaisena: Rapierin oletusmalli (kiihtyvyyspohjainen)
      // värähtelee nivelketjuissa, kuten jaloissa.
      if (control === 'position') joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
      if (j.motor !== false) this.motors.push(entry);
      // Jousi (ei moottoria): nivel joustaa takaisin lepoasentoon (kulma 0), kuten iskunvaimennin tai joustava polvi
      else if (j.spring > 0) {
        joint.configureMotorModel(RAPIER.MotorModel.ForceBased);
        joint.configureMotorPosition(0, j.spring, j.springDamping ?? 3);
      }
    }

    this.root = this.byId[model.root].body;
    this.rootColliders = this.byId[model.root].colliders;
    // Roottorit: maksimivoima newtoneina (force) tai robotin painon monikertana (weight); ulostulo 0 = puolet
    let mass = 0;
    for (const p of this.parts) mass += p.body.mass();
    this.thrusters = model.thrusters.map((t) => ({
      part: this.byId[t.body], local: new THREE.Vector3(...t.pos), dir: new THREE.Vector3(...t.dir),
      max: t.force ?? (t.weight ?? 1) * mass * 9.81, level: 0
    }));
    this.feet = this.parts.filter((p) => p.spec.foot);
    const p = this.root.translation();
    this.startX = p.x; this.startY = p.y; this.startZ = p.z;
  }

  touchingGround(colliders) {
    let touching = false;
    for (const c of colliders) {
      this.world.contactPairsWith(c, (other) => {
        if (touching || !this.terrain.colliders.has(other.handle)) return;
        this.world.contactPair(c, other, (manifold) => {
          if (manifold.numContacts() > 0) touching = true;
        });
      });
      if (touching) return true;
    }
    return false;
  }

  footContacts() {
    let n = 0;
    for (const f of this.feet) if (this.touchingGround(f.colliders)) n++;
    return n;
  }

  rotation() {
    const r = this.root.rotation();
    return _q.set(r.x, r.y, r.z, r.w);
  }

  upright() {
    return _v.set(0, 1, 0).applyQuaternion(this.rotation()).y;
  }

  yaw() {
    const f = _v.set(1, 0, 0).applyQuaternion(this.rotation());
    return Math.atan2(-f.z, f.x);
  }

  isFallen() {
    const f = this.model.fall;
    if (this.root.translation().y < this.startY - 15) return true;
    if (f.minUpright != null && this.upright() < f.minUpright) return true;
    if (f.rootContact && this.touchingGround(this.rootColliders)) return true;
    return false;
  }

  // Nivelen kulma: osan B kierto osan A suhteen nivelen akselin ympäri.
  jointAngle(m) {
    const ra = m.a.rotation(), rb = m.b.rotation();
    _qa.set(ra.x, ra.y, ra.z, ra.w).invert().multiply(_q.set(rb.x, rb.y, rb.z, rb.w));
    return 2 * Math.atan2(_qa.x * m.axis.x + _qa.y * m.axis.y + _qa.z * m.axis.z, _qa.w);
  }

  jointSpeed(m) {
    const ra = m.a.rotation();
    const axisW = _w.copy(m.axis).applyQuaternion(_qa.set(ra.x, ra.y, ra.z, ra.w));
    const wa = m.a.angvel(), wb = m.b.angvel();
    return (wb.x - wa.x) * axisW.x + (wb.y - wa.y) * axisW.y + (wb.z - wa.z) * axisW.z;
  }

  // Kirjoittaa havainnot taulukkoon out (pituus info.obsSize).
  observe(out, t, target) {
    const r = this.root;
    const pos = r.translation();
    const inv = this.rotation().clone().invert();
    let k = 0;
    const put3 = (v, f) => { out[k++] = f(v.x); out[k++] = f(v.y); out[k++] = f(v.z); };
    put3(_v.set(0, 1, 0).applyQuaternion(inv), (x) => x); // maailman "ylös" robotin koordinaateissa
    put3(_v.set(1, 0, 0).applyQuaternion(this.rotation()), (x) => x); // robotin eteen-suunta maailmassa
    const av = r.angvel(), lv = r.linvel();
    put3(_v.set(av.x, av.y, av.z).applyQuaternion(inv), (x) => Math.tanh(x * 0.25));
    put3(_v.set(lv.x, lv.y, lv.z).applyQuaternion(inv), (x) => Math.tanh(x * 0.3));
    out[k++] = Math.tanh(pos.y - this.startY);
    for (const m of this.motors) {
      const ang = this.jointAngle(m);
      out[k++] = m.limited && m.hi > m.lo ? (2 * (ang - m.lo)) / (m.hi - m.lo) - 1 : Math.sin(ang);
      out[k++] = RS.clamp(this.jointSpeed(m) / m.speed, -1, 1);
    }
    for (const f of this.feet) out[k++] = this.touchingGround(f.colliders) ? 1 : 0;
    // Maaston korkeus edessä kulkusuunnassa, suhteessa maahan rungon alla.
    const n = this.info.scan;
    if (n > 0) {
      const yaw = this.yaw(), cx = Math.cos(yaw), cz = -Math.sin(yaw);
      const h0 = this.terrain.heightAt(pos.x, pos.z);
      for (let i = 0; i < n; i++) {
        const d = 0.6 + i * 0.6;
        out[k++] = Math.tanh((this.terrain.heightAt(pos.x + cx * d, pos.z + cz * d) - h0) * 2);
      }
    }
    out[k++] = Math.sin(t * Math.PI * 2);
    out[k++] = Math.cos(t * Math.PI * 2);
    const dims = this.info.targetDims;
    if (target) {
      // Kohde robotin omassa koordinaatistossa (eteen, [ylös,] sivulle)
      _v.set(target.x - pos.x, dims === 3 ? target.y - pos.y : 0, target.z - pos.z).applyQuaternion(inv);
      out[k++] = Math.tanh(_v.x / 3);
      if (dims === 3) out[k++] = Math.tanh(_v.y / 3);
      out[k++] = Math.tanh(_v.z / 3);
    } else {
      for (let i = 0; i < dims; i++) out[k++] = 0;
    }
  }

  act(actions) {
    for (let i = 0; i < this.motors.length; i++) {
      const m = this.motors[i];
      const a = RS.clamp(actions[i], -1, 1);
      if (m.control === 'position' && m.limited) {
        // Servon tavoitekulma liikkuu korkeintaan speed rad/s, kuten oikeassa servossa.
        const want = m.lo + (a + 1) / 2 * (m.hi - m.lo);
        const step = m.speed / 60;
        m.cmd = m.cmd == null ? (m.lo + m.hi) / 2 : m.cmd;
        m.cmd = RS.clamp(want, m.cmd - step, m.cmd + step);
        m.joint.configureMotorPosition(m.cmd, m.stiffness, m.damping);
      } else {
        m.joint.configureMotorVelocity(a * m.speed, m.strength);
      }
    }
    // Roottorit: impulssi = voima × aika-askel, kohdistettuna roottorin kohdalle
    const n = this.motors.length;
    this.thrusters.forEach((t, i) => {
      t.level = (RS.clamp(actions[n + i] ?? 0, -1, 1) + 1) / 2;
      const b = t.part.body, r = b.rotation(), p = b.translation();
      _q.set(r.x, r.y, r.z, r.w);
      const f = _v.copy(t.dir).applyQuaternion(_q).multiplyScalar(t.max * t.level / 60);
      const at = _w.copy(t.local).applyQuaternion(_q).add(p);
      b.applyImpulseAtPoint({ x: f.x, y: f.y, z: f.z }, { x: at.x, y: at.y, z: at.z }, true);
    });
  }

  destroy() {
    for (const p of this.parts) this.world.removeRigidBody(p.body);
    this.parts = [];
    this.motors = [];
    this.feet = [];
    this.thrusters = [];
  }
}
