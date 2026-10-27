// Robotin rakentaminen mallista, sensorit ja moottorit.

// Tarkistaa mallin ja muuttaa sen sisäiseen muotoon (jokaisella osalla shapes-lista).
RS.normalizeModel = function (input) {
  const m = RS.clone(input);
  if (!Array.isArray(m.bodies) || m.bodies.length === 0) throw new Error(tr('Mallissa ei ole osia (bodies).', 'The model has no parts (bodies).'));
  m.joints = m.joints || [];
  m.sensors = Object.assign({ lidar: 0 }, m.sensors);
  m.fall = m.fall || {};
  const ids = new Set();
  for (const b of m.bodies) {
    if (!b.id) throw new Error(tr('Jokaisella osalla pitää olla id.', 'Every part needs an id.'));
    if (ids.has(b.id)) throw new Error(tr('Sama id kahdesti: ', 'Same id twice: ') + b.id);
    ids.add(b.id);
    if (!b.shapes) {
      const extra = { deco: b.deco, plain: b.plain, round: b.round };
      if (b.shape === 'circle') b.shapes = [{ type: 'circle', r: b.r, ...extra }];
      else b.shapes = [{ type: 'box', w: b.w, h: b.h, ...extra }];
    }
    for (const s of b.shapes) {
      s.x = s.x || 0; s.y = s.y || 0; s.angle = s.angle || 0;
      if (s.type === 'circle' ? !(s.r > 0) : !(s.w > 0 && s.h > 0)) {
        throw new Error(tr('Osan ' + b.id + ' muodolta puuttuu koko (w/h tai r).', 'A shape of part ' + b.id + ' has no size (w/h or r).'));
      }
    }
    b.x = b.x || 0; b.y = b.y || 0; b.angle = b.angle || 0;
  }
  for (const j of m.joints) {
    if (!ids.has(j.a) || !ids.has(j.b)) throw new Error(tr('Nivel viittaa tuntemattomaan osaan: ', 'A joint refers to an unknown part: ') + j.a + ' / ' + j.b);
    j.x = j.x || 0; j.y = j.y || 0;
  }
  if (!m.root) m.root = m.bodies[0].id;
  if (!ids.has(m.root)) throw new Error(tr('root-osaa ei löydy: ', 'Root part not found: ') + m.root);
  // Suihkut/roottorit: voima osaan pisteessä (x, y), suunta angle asteina (90 = ylös osan koordinaatistossa)
  m.thrusters = (m.thrusters || []).map((t) => {
    if (!ids.has(t.body)) throw new Error(tr('Roottori viittaa tuntemattomaan osaan: ', 'A thruster refers to an unknown part: ') + t.body);
    return { body: t.body, x: t.x || 0, y: t.y || 0, angle: t.angle ?? 90, force: t.force, weight: t.weight, rid: t.rid };
  });
  return m;
};

// Etäisyysanturien säteet maailman koordinaateissa (eivät käänny rungon mukana): −90° = suoraan alas
RS.LIDAR_RANGE = 4;
RS.lidarAngle = (i, n) => RS.deg(n === 1 ? -45 : -90 + (100 * i) / (n - 1));

RS.modelInfo = function (m) {
  const motors = m.joints.filter((j) => j.motor !== false).length;
  const thrusters = (m.thrusters || []).length;
  const feet = m.bodies.filter((b) => b.foot).length;
  const lidar = m.sensors.lidar | 0;
  // runko: sin, cos, kulmanopeus, vx, vy, korkeus = 6; vaihe: 2; kohde: 2
  const obsSize = 6 + 2 * motors + feet + lidar + 2 + 2;
  return { motors, thrusters, feet, lidar, obsSize, actSize: motors + thrusters };
};

// Paljonko mallia nostetaan, jotta alin kohta on juuri maan yläpuolella.
function modelLift(m) {
  if (m.bodies.some((b) => b.static)) return 0;
  let minY = Infinity;
  for (const b of m.bodies) {
    for (const s of b.shapes) {
      const a = RS.deg(b.angle);
      const cx = b.y + s.x * Math.sin(a) + s.y * Math.cos(a);
      let ext;
      if (s.type === 'circle') ext = s.r;
      else {
        const t = a + RS.deg(s.angle);
        ext = Math.abs(Math.cos(t)) * s.h / 2 + Math.abs(Math.sin(t)) * s.w / 2;
      }
      minY = Math.min(minY, cx - ext);
    }
  }
  return 0.02 - minY;
}

function isGround(fixture) {
  return fixture.getUserData() === 'ground';
}

function touchingGround(body) {
  for (let ce = body.getContactList(); ce; ce = ce.next) {
    const c = ce.contact;
    if (c.isTouching() && (isGround(c.getFixtureA()) || isGround(c.getFixtureB()))) return true;
  }
  return false;
}

RS.Robot = class {
  constructor(world, model, opts = {}) {
    this.world = world;
    this.model = model;
    this.info = RS.modelInfo(model);
    const offX = opts.offsetX || 0;
    const lift = modelLift(model);
    this.parts = [];
    this.byId = {};

    for (const spec of model.bodies) {
      const body = world.createBody({
        type: spec.static ? 'static' : 'dynamic',
        position: RS.V(spec.x + offX, spec.y + lift),
        angle: RS.deg(spec.angle),
        // Ilmanvastus: lentävät robotit tarvitsevat vaimennusta, muuten ne pyörivät hallitsemattomasti
        linearDamping: spec.linearDamping || 0,
        angularDamping: spec.angularDamping || 0
      });
      for (const s of spec.shapes) {
        const shape = s.type === 'circle'
          ? new planck.Circle(RS.V(s.x, s.y), s.r)
          : new planck.Box(s.w / 2, s.h / 2, RS.V(s.x, s.y), RS.deg(s.angle));
        body.createFixture(shape, {
          density: spec.density ?? 1,
          friction: spec.friction ?? 0.8,
          restitution: 0,
          filterGroupIndex: -1, // robotin osat eivät törmää toisiinsa eivätkä muihin robotteihin
          userData: 'robot'
        });
      }
      const part = { body, spec };
      this.parts.push(part);
      this.byId[spec.id] = body;
    }

    this.motors = [];
    this.sensedJoints = [];
    for (const j of model.joints) {
      const limited = j.lower != null && j.upper != null;
      const joint = world.createJoint(new planck.RevoluteJoint({
        enableMotor: j.motor !== false,
        maxMotorTorque: j.torque ?? 10,
        motorSpeed: 0,
        enableLimit: limited,
        lowerAngle: limited ? RS.deg(j.lower) : 0,
        upperAngle: limited ? RS.deg(j.upper) : 0
      }, this.byId[j.a], this.byId[j.b], RS.V(j.x + offX, j.y + lift)));
      const entry = { joint, spec: j, limited, lo: RS.deg(j.lower ?? 0), hi: RS.deg(j.upper ?? 0), speed: j.speed ?? 6 };
      if (j.motor !== false) this.motors.push(entry);
    }

    this.root = this.byId[model.root];
    this.feet = this.parts.filter((p) => p.spec.foot).map((p) => p.body);
    // Roottorit: maksimivoima joko newtoneina (force) tai robotin painon monikertana (weight).
    // Ulostulo 0 = puolet maksimista, joten oletuksena painoon 2/n mitoitetut roottorit leijuvat paikallaan.
    let mass = 0;
    for (const p of this.parts) mass += p.body.getMass();
    this.thrusters = model.thrusters.map((t) => ({
      body: this.byId[t.body], local: RS.V(t.x, t.y), dir: RS.V(Math.cos(RS.deg(t.angle)), Math.sin(RS.deg(t.angle))),
      max: t.force ?? (t.weight ?? 1) * mass * 10, level: 0
    }));
    const p = this.root.getPosition();
    this.startX = p.x;
    this.startY = p.y;
  }

  footContacts() {
    let n = 0;
    for (const f of this.feet) if (touchingGround(f)) n++;
    return n;
  }

  isFallen() {
    const f = this.model.fall;
    const pos = this.root.getPosition();
    if (pos.y < this.startY - 15) return true;
    if (f.minUpright != null && Math.cos(this.root.getAngle()) < f.minUpright) return true;
    if (f.rootContact && touchingGround(this.root)) return true;
    return false;
  }

  // Kirjoittaa havainnot taulukkoon out (pituus info.obsSize).
  observe(out, t, target) {
    const r = this.root;
    const pos = r.getPosition();
    const vel = r.getLinearVelocity();
    const a = r.getAngle();
    let k = 0;
    out[k++] = Math.sin(a);
    out[k++] = Math.cos(a);
    out[k++] = Math.tanh(r.getAngularVelocity() * 0.25);
    out[k++] = Math.tanh(vel.x * 0.3);
    out[k++] = Math.tanh(vel.y * 0.3);
    out[k++] = Math.tanh(pos.y - this.startY);
    for (const m of this.motors) {
      const ang = m.joint.getJointAngle();
      out[k++] = m.limited && m.hi > m.lo ? (2 * (ang - m.lo)) / (m.hi - m.lo) - 1 : Math.sin(ang);
      out[k++] = RS.clamp(m.joint.getJointSpeed() / m.speed, -1, 1);
    }
    for (const f of this.feet) out[k++] = touchingGround(f) ? 1 : 0;
    const n = this.info.lidar;
    for (let i = 0; i < n; i++) out[k++] = this.lidar(pos, i, n);
    out[k++] = Math.sin(t * Math.PI * 2);
    out[k++] = Math.cos(t * Math.PI * 2);
    if (target) {
      out[k++] = Math.tanh((target.x - pos.x) / 3);
      out[k++] = Math.tanh((target.y - pos.y) / 3);
    } else {
      out[k++] = 0;
      out[k++] = 0;
    }
  }

  // Etäisyyssäde maahan: 1 = ei osumaa RS.LIDAR_RANGE metrin sisällä.
  lidar(pos, i, n) {
    const ang = RS.lidarAngle(i, n), range = RS.LIDAR_RANGE;
    if (!this.terrain) return 1;
    return RS.terrainRay(this.terrain, pos.x, pos.y, Math.cos(ang) * range, Math.sin(ang) * range);
  }

  act(actions) {
    for (let i = 0; i < this.motors.length; i++) {
      const m = this.motors[i];
      m.joint.setMotorSpeed(RS.clamp(actions[i], -1, 1) * m.speed);
    }
    const n = this.motors.length;
    this.thrusters.forEach((t, i) => {
      t.level = (RS.clamp(actions[n + i] ?? 0, -1, 1) + 1) / 2; // −1…1 → 0…1
      const f = t.body.getWorldVector(t.dir), p = t.body.getWorldPoint(t.local);
      t.body.applyForce(RS.V(f.x * t.max * t.level, f.y * t.max * t.level), p, true);
    });
  }

  destroy() {
    for (const p of this.parts) this.world.destroyBody(p.body);
    this.parts = [];
    this.motors = [];
    this.thrusters = [];
  }
};
