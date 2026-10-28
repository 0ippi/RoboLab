// Rakentajan mallilogiikka: osien ja nivelten luonti, valmisosat, peilaus,
// yhdistäminen, tarkistus sekä muunnokset simulaatioiden 2D- ja 3D-muotoihin.
//
// Sisäinen muoto on sama kuin 3D-simulaation malli (pos/rot-taulukot, shapes-lista).
// 2D-tilassa z on aina 0, nivelten akseli on z ja niveliin tallennetaan lisäksi torque.
import * as THREE from 'three';
import { normalizeModel3D, modelInfo3D } from '../3d/robot3d.js';

export const COLORS = ['#7aa2ff', '#ffb86b', '#6be3a4', '#ff7aa8', '#c39bff', '#ffd166', '#5ad1e6', '#b5e48c'];

export function emptyModel(dim) {
  return {
    name: tr('Oma robotti', 'My robot'),
    description: '',
    root: null,
    fall: { rootContact: true },
    sensors: dim === '2d' ? { lidar: 5 } : { scan: 5 },
    bodies: [],
    joints: []
  };
}

export function uniqueId(model, base) {
  const ids = new Set(model.bodies.map((b) => b.id));
  for (let i = 1; ; i++) if (!ids.has(base + i)) return base + i;
}
// Yhteinen juokseva numero useammalle uudelle osalle (esim. reisi3 + sääri3): kaikkien nimien pitää olla vapaita
function freeNumber(model, ...bases) {
  const ids = new Set(model.bodies.map((b) => b.id));
  for (let i = 1; ; i++) if (bases.every((b) => !ids.has(b + i))) return i;
}

// ---------- Osat ----------
export const PART_TYPES = {
  box: { label: tr('Laatikko', 'Box'), id: tr('laatikko', 'box') },
  sphere: { label: tr('Pallo', 'Sphere'), label2d: tr('Ympyrä', 'Circle'), id: tr('pallo', 'sphere') },
  cylinder: { label: tr('Sylinteri', 'Cylinder'), id: tr('sylinteri', 'cylinder'), only3d: true },
  capsule: { label: tr('Kapseli', 'Capsule'), id: tr('kapseli', 'capsule'), only3d: true }
};

export function defaultShape(type, dim) {
  if (type === 'box') return { type, size: [0.6, 0.3, dim === '2d' ? 0.3 : 0.4], pos: [0, 0, 0], rot: [0, 0, 0] };
  if (type === 'sphere') return { type, r: 0.2, pos: [0, 0, 0], rot: [0, 0, 0] };
  if (type === 'cylinder') return { type, r: 0.2, h: 0.4, pos: [0, 0, 0], rot: [0, 0, 0] };
  return { type: 'capsule', r: 0.1, h: 0.4, pos: [0, 0, 0], rot: [0, 0, 0] };
}

export function addPart(model, type, dim, pos) {
  const id = uniqueId(model, PART_TYPES[type].id);
  const body = {
    id,
    pos: pos ? pos.slice() : [0, 1, 0],
    rot: [0, 0, 0],
    shapes: [defaultShape(type, dim)],
    color: COLORS[model.bodies.length % COLORS.length]
  };
  model.bodies.push(body);
  if (!model.root) model.root = id;
  return body;
}

// Osan rajat maailmassa (akselisuuntainen laatikko), käytetään sijoitteluun.
export function bodyBox(body) {
  const box = new THREE.Box3();
  const qb = quat(body.rot);
  for (const s of body.shapes) {
    const q = qb.clone().multiply(quat(s.rot));
    const c = new THREE.Vector3(...s.pos).applyQuaternion(qb).add(new THREE.Vector3(...body.pos));
    let half;
    if (s.type === 'box') half = new THREE.Vector3(s.size[0] / 2, s.size[1] / 2, s.size[2] / 2);
    else if (s.type === 'sphere') half = new THREE.Vector3(s.r, s.r, s.r);
    else if (s.type === 'cylinder') half = new THREE.Vector3(s.r, s.h / 2, s.r);
    else half = new THREE.Vector3(s.r, s.h / 2 + s.r, s.r);
    const m = new THREE.Matrix4().makeRotationFromQuaternion(q);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
      box.expandByPoint(new THREE.Vector3(sx * half.x, sy * half.y, sz * half.z).applyMatrix4(m).add(c));
    }
  }
  return box;
}

export function quat(rotDeg) {
  return new THREE.Quaternion().setFromEuler(new THREE.Euler(
    THREE.MathUtils.degToRad(rotDeg[0]), THREE.MathUtils.degToRad(rotDeg[1]), THREE.MathUtils.degToRad(rotDeg[2])));
}

function quatToDeg(q) {
  const e = new THREE.Euler().setFromQuaternion(q);
  return [e.x, e.y, e.z].map((v) => round(THREE.MathUtils.radToDeg(v)));
}

export const round = (v, d = 3) => Math.round(v * 10 ** d) / 10 ** d;

// ---------- Nivelet ----------
export const JOINT_TYPES = {
  servo: { label: tr('Nivel (servo)', 'Joint (servo)'), hint: tr('Kääntyy rajojen välillä. Neuroverkko valitsee kulman. Jalat, kädet.', 'Turns between limits. The neural network picks the angle. Legs, arms.') },
  wheel: { label: tr('Pyörä', 'Wheel'), hint: tr('Pyörii vapaasti ympäri. Neuroverkko valitsee nopeuden.', 'Spins freely all the way round. The neural network picks the speed.') },
  free: { label: tr('Vapaa (ei moottoria)', 'Free (no motor)'), hint: tr('Heiluu vapaasti ilman moottoria, esim. tukipyörä tai häntä.', 'Swings freely without a motor, e.g. a caster or a tail.') },
  spring: { label: tr('Jousi (ei moottoria)', 'Spring (no motor)'), hint: tr('Joustaa takaisin lepoasentoon kuin iskunvaimennin: joustava polvi, puskuri tai jousitus. Lepoasento on se, mihin osat on rakennettu.', 'Springs back to its rest position like a shock absorber: a springy knee, a bumper or suspension. The rest position is how the parts are built.') }
};
export const SPRING_DEFAULT = { k: 30, d: 2 };

export function jointType(j) {
  if (j.motor === false) return j.spring > 0 ? 'spring' : 'free';
  return j.lower != null && j.upper != null ? 'servo' : 'wheel';
}

export function setJointType(j, type) {
  delete j.motor;
  if (type !== 'spring') { delete j.spring; delete j.springDamping; }
  if (type === 'spring') {
    j.motor = false;
    j.spring = j.spring > 0 ? j.spring : SPRING_DEFAULT.k;
    j.springDamping = j.springDamping ?? SPRING_DEFAULT.d;
    delete j.strength;
  } else if (type === 'servo') {
    j.lower = j.lower ?? -45; j.upper = j.upper ?? 45;
    j.speed = j.speed ?? 6;
    delete j.strength;
  } else if (type === 'wheel') {
    delete j.lower; delete j.upper;
    j.speed = 12; j.strength = j.strength ?? 30;
  } else {
    j.motor = false;
  }
}

// Nivelen oletuspaikka: pyörille ja palloille lapsiosan keskipiste, muille osien
// päällekkäisen alueen keskikohta (tai niiden välisen raon keskikohta), esim. reiden yläpää lonkassa.
export function guessPivot(parent, child) {
  const round1 = child.shapes.length === 1 && child.shapes[0].type !== 'box' && child.shapes[0].type !== 'capsule';
  if (round1) return child.pos.slice();
  const a = bodyBox(parent), b = bodyBox(child);
  return ['x', 'y', 'z'].map((k) => round((Math.max(a.min[k], b.min[k]) + Math.min(a.max[k], b.max[k])) / 2));
}

export function addJoint(model, a, b, type, dim) {
  const A = model.bodies.find((x) => x.id === a), B = model.bodies.find((x) => x.id === b);
  const j = { a, b, pos: guessPivot(A, B), axis: [0, 0, 1] };
  setJointType(j, type || 'servo');
  if (dim === '2d') j.torque = 10;
  model.joints.push(j);
  return j;
}

// ---------- Valmisosat ----------
// Kiinnitetään valitun osan (emo) reunaan. Palauttaa luodut osat.
export function addWheel(model, parent, dim) {
  const box = bodyBox(parent);
  // 2D (sivukuva): pyörä mitoitetaan rungon pituuden mukaan ja sijoitetaan rungon päähän, jotta pyöräparin
  // etu- ja takapyörä eivät mene päällekkäin. 3D:ssä pyörä tulee rungon kylkeen.
  const r = dim === '2d' ? round(Math.min(0.3, Math.max(0.08, (box.max.x - box.min.x) * 0.22))) : 0.3, h = 0.15;
  const id = uniqueId(model, tr('pyora', 'wheel'));
  const pos = [round(box.max.x - (dim === '2d' ? r : r * 0.6)), round(box.min.y), dim === '2d' ? 0 : round(box.max.z + h / 2 + 0.02)];
  const body = {
    id, pos, rot: [0, 0, 0], foot: true, friction: 1.5, density: dim === '2d' ? 1 : 3, color: '#3d4a5c',
    shapes: [dim === '2d' ? { type: 'sphere', r, pos: [0, 0, 0], rot: [0, 0, 0] } : { type: 'cylinder', r, h, pos: [0, 0, 0], rot: [90, 0, 0] }]
  };
  model.bodies.push(body);
  const j = { a: parent.id, b: id, pos: pos.slice(), axis: [0, 0, 1] };
  setJointType(j, 'wheel');
  if (dim === '2d') { j.torque = 20; }
  model.joints.push(j);
  return [body];
}

export function addLeg(model, parent, dim) {
  const box = bodyBox(parent);
  const thigh = 0.45, shin = 0.4, w = 0.12;
  const x = round(box.max.x - w), z = dim === '2d' ? 0 : round(box.max.z - w);
  const hipY = round(box.min.y + 0.05), kneeY = round(hipY - thigh);
  const thighBase = tr('reisi', 'thigh'), shinBase = tr('sääri', 'shin');
  const n = freeNumber(model, thighBase, shinBase); // juokseva numero, vapaa molemmille osille
  const color = parent.color || COLORS[0];
  const t = { id: thighBase + n, pos: [x, round(hipY - thigh / 2), z], rot: [0, 0, 0], color, shapes: [{ type: 'box', size: [w, thigh, w], pos: [0, 0, 0], rot: [0, 0, 0] }] };
  const s = {
    id: shinBase + n, pos: [x, round(kneeY - shin / 2), z], rot: [0, 0, 0], color, foot: true, friction: 1.2,
    shapes: [
      { type: 'box', size: [w * 0.8, shin, w * 0.8], pos: [0, 0, 0], rot: [0, 0, 0] },
      { type: 'sphere', r: 0.07, pos: [0, -shin / 2, 0], rot: [0, 0, 0] }
    ]
  };
  model.bodies.push(t, s);
  const hip = { a: parent.id, b: t.id, pos: [x, hipY, z], axis: [0, 0, 1], lower: -50, upper: 50, speed: 6 };
  const knee = { a: t.id, b: s.id, pos: [x, kneeY, z], axis: [0, 0, 1], lower: -45, upper: 45, speed: 8 };
  if (dim === '2d') { hip.torque = 9; knee.torque = 8; }
  model.joints.push(hip, knee);
  return [t, s];
}

// Pyöräpari: pyörä kummallekin puolelle (2D: eteen ja taakse). Molemmat pyörivät samaan suuntaan samalla käskyllä.
export function addWheelPair(model, parent, dim) {
  const [a] = addWheel(model, parent, dim);
  const box = bodyBox(parent), ax = dim === '2d' ? 0 : 2;
  const mid = (box.min.getComponent(ax) + box.max.getComponent(ax)) / 2;
  const b = RS.clone(a);
  b.id = uniqueId(model, a.id.replace(/\d+$/, ''));
  b.pos = a.pos.slice();
  b.pos[ax] = round(2 * mid - a.pos[ax]);
  model.bodies.push(b);
  const j = model.joints.find((x) => x.b === a.id);
  model.joints.push({ ...RS.clone(j), b: b.id, pos: b.pos.slice() });
  return [a, b];
}

// Tukipyörä: pieni liukas pallo rungon takaosan alla, vapaa nivel ilman moottoria
export function addCaster(model, parent, dim) {
  const box = bodyBox(parent), r = 0.08;
  const id = uniqueId(model, tr('tukipyora', 'caster'));
  const pos = [round(box.min.x + r * 1.5), round(box.min.y - r * 0.6), dim === '2d' ? 0 : round((box.min.z + box.max.z) / 2)];
  const body = { id, pos, rot: [0, 0, 0], foot: true, friction: 0.15, color: '#8a96a8', shapes: [{ type: 'sphere', r, pos: [0, 0, 0], rot: [0, 0, 0] }] };
  if (dim === '3d') body.frictionCombine = 'min';
  model.bodies.push(body);
  const j = { a: parent.id, b: id, pos: pos.slice(), axis: [0, 0, 1] };
  setJointType(j, 'free');
  if (dim === '2d') j.torque = 1;
  model.joints.push(j);
  return [body];
}

// Robottikäsi rungon päälle: olkavarsi ja kyynärvarsi servonivelillä, kärjessä kiinteä tarttuja
export function addArm(model, parent, dim) {
  const box = bodyBox(parent), w = 0.08, l1 = 0.4, l2 = 0.35;
  const x = round(box.min.x + (box.max.x - box.min.x) * 0.7), z = dim === '2d' ? 0 : round((box.min.z + box.max.z) / 2), y0 = round(box.max.y);
  const color = '#c39bff';
  const up = { id: uniqueId(model, tr('olkavarsi', 'upperarm')), pos: [x, round(y0 + l1 / 2), z], rot: [0, 0, 0], color, density: 0.5,
    shapes: [{ type: 'box', size: [w, l1, w], pos: [0, 0, 0], rot: [0, 0, 0] }] };
  const fore = { id: uniqueId(model, tr('kyynarvarsi', 'forearm')), pos: [x, round(y0 + l1 + l2 / 2), z], rot: [0, 0, 0], color, density: 0.5,
    shapes: [
      { type: 'box', size: [w * 0.8, l2, w * 0.8], pos: [0, 0, 0], rot: [0, 0, 0] },
      { type: 'box', size: [0.16, 0.04, 0.1], pos: [0, round(l2 / 2 + 0.02), 0], rot: [0, 0, 0], color: '#3d4a5c' },
      { type: 'box', size: [0.03, 0.1, 0.06], pos: [-0.065, round(l2 / 2 + 0.09), 0], rot: [0, 0, 0], color: '#3d4a5c' },
      { type: 'box', size: [0.03, 0.1, 0.06], pos: [0.065, round(l2 / 2 + 0.09), 0], rot: [0, 0, 0], color: '#3d4a5c' }
    ] };
  model.bodies.push(up, fore);
  const shoulder = { a: parent.id, b: up.id, pos: [x, y0, z], axis: [0, 0, 1], lower: -90, upper: 90, speed: 3 };
  const elbow = { a: up.id, b: fore.id, pos: [x, round(y0 + l1), z], axis: [0, 0, 1], lower: -120, upper: 120, speed: 4 };
  if (dim === '2d') { shoulder.torque = 14; elbow.torque = 8; }
  model.joints.push(shoulder, elbow);
  return [up, fore];
}

// Tarttuja rungon etuosaan: kaksi sormea, jotka sulkeutuvat servoilla toisiaan kohti
export function addGripper(model, parent, dim) {
  const box = bodyBox(parent), len = 0.22, t = 0.04;
  const x0 = round(box.max.x), yc = (box.min.y + box.max.y) / 2, z = dim === '2d' ? 0 : round((box.min.z + box.max.z) / 2);
  const made = [];
  for (const side of [1, -1]) {
    const id = uniqueId(model, tr('sormi', 'finger'));
    const y = round(yc + side * 0.07);
    const f = { id, pos: [round(x0 + len / 2), y, z], rot: [0, 0, 0], color: '#3d4a5c', friction: 1.5, density: 0.5,
      shapes: [{ type: 'box', size: [len, t, dim === '2d' ? 0.3 : 0.08], pos: [0, 0, 0], rot: [0, 0, 0] }] };
    model.bodies.push(f);
    const j = { a: parent.id, b: id, pos: [x0, y, z], axis: [0, 0, 1], lower: side > 0 ? -30 : 0, upper: side > 0 ? 0 : 30, speed: 3 };
    if (dim === '2d') j.torque = 5;
    model.joints.push(j);
    made.push(f);
  }
  return made;
}

// Häntä rungon takaosaan: heiluu vapaasti ja tasapainottaa, kuten eläinroboteilla
export function addTail(model, parent, dim) {
  const box = bodyBox(parent), len = 0.45;
  const x0 = round(box.min.x), y = round(box.max.y - 0.05), z = dim === '2d' ? 0 : round((box.min.z + box.max.z) / 2);
  const id = uniqueId(model, tr('hanta', 'tail'));
  const body = { id, pos: [round(x0 - len / 2), y, z], rot: [0, 0, 15], color: parent.color || COLORS[0], density: 0.4,
    shapes: [{ type: 'box', size: [len, 0.05, 0.05], pos: [0, 0, 0], rot: [0, 0, 0] }] };
  model.bodies.push(body);
  const j = { a: parent.id, b: id, pos: [x0, y, z], axis: [0, 0, 1] };
  setJointType(j, 'free');
  if (dim === '2d') j.torque = 1;
  model.joints.push(j);
  return [body];
}

// Kosketusanturi (puskuri): ohut levy osan etuosaan joustavalla nivelellä. Levy on "jalka" eli kosketusanturi:
// robotti tietää, osuuko puskuri maahan tai esteeseen. Törmäyksessä levy joustaa ja palaa paikalleen.
export function addBumper(model, parent, dim) {
  const box = bodyBox(parent), t = 0.04, hgt = round(Math.max(0.12, (box.max.y - box.min.y) * 0.7));
  const x0 = round(box.max.x), yc = round((box.min.y + box.max.y) / 2), z = dim === '2d' ? 0 : round((box.min.z + box.max.z) / 2);
  const depth = dim === '2d' ? 0.3 : round(Math.max(0.2, (box.max.z - box.min.z) * 0.9));
  const id = uniqueId(model, tr('puskuri', 'bumper'));
  const body = { id, pos: [round(x0 + 0.02 + t / 2), yc, z], rot: [0, 0, 0], color: '#ffd166', foot: true, friction: 0.6, density: 0.3,
    shapes: [{ type: 'box', size: [t, hgt, depth], pos: [0, 0, 0], rot: [0, 0, 0] }] };
  model.bodies.push(body);
  // Saranan paikka levyn yläreunassa: alareuna joustaa taaksepäin osuessaan esteeseen
  const j = { a: parent.id, b: id, pos: [x0, round(yc + hgt / 2), z], axis: [0, 0, 1], lower: -15, upper: 15 };
  setJointType(j, 'spring');
  if (dim === '2d') j.torque = 1;
  model.joints.push(j);
  return [body];
}

// Jousijalka: moottoroitu lonkka ja joustava polvi. Moottoreita on puolet vähemmän kuin tavallisessa jalassa,
// joten hyppivä tai tasapainoileva robotti oppii nopeammin.
export function addSpringLeg(model, parent, dim) {
  const made = addLeg(model, parent, dim);
  const knee = model.joints.find((j) => j.b === made[1].id);
  setJointType(knee, 'spring');
  knee.lower = -35; knee.upper = 35;
  return made;
}

// Anturit: näkyvä osa lisätään valittuun osaan muotona (lidar katolle, kamera eteen). Lidar myös kytkee
// robotin etäisyysanturit päälle, jos ne olivat pois.
export function addSensor(model, parent, kind, dim) {
  const box = bodyBox(parent);
  const top = round(box.max.y - parent.pos[1]), front = round(box.max.x - parent.pos[0]);
  if (kind === 'lidar') {
    parent.shapes.push(dim === '2d'
      ? { type: 'box', size: [0.18, 0.07, 0.3], pos: [0, round(top + 0.035), 0], rot: [0, 0, 0], color: '#2a3542', deco: 'visor' }
      : { type: 'cylinder', r: 0.07, h: 0.06, pos: [0, round(top + 0.03), 0], rot: [0, 0, 0], color: '#2a3542', deco: 'ring' });
    const key = dim === '2d' ? 'lidar' : 'scan';
    if (!model.sensors[key]) model.sensors[key] = 5;
  } else {
    parent.shapes.push({ type: 'box', size: [0.06, 0.08, dim === '2d' ? 0.3 : 0.12], pos: [round(front + 0.03), round(top * 0.5), 0], rot: [0, 0, 0], color: '#2a3542', deco: 'eye' });
  }
  return [parent];
}

// ---------- Peilaus ----------
// Kopioi osat peilikuvana: 3D:ssä sivulle (z) tai eteen-taakse (x), 2D:ssä eteen-taakse (x).
// Peilitaso kulkee sen osan keskeltä, johon valinta on kiinni (muuten päärungon keskeltä), kuten pyöräparissa.
// Nivel kopioidaan, kun sen lapsiosa kopioidaan: emo voi olla valinnan ulkopuolella (kopio kiinnittyy samaan emoon),
// mutta valinnan ulkopuolinen lapsi ei saa toista emoa.
export function mirror(model, ids, axisIndex, dim) {
  const sel = new Set(ids);
  const map = {};
  const parentId = model.joints.find((j) => sel.has(j.b) && !sel.has(j.a))?.a;
  const pb = model.bodies.find((b) => b.id === parentId) || model.bodies.find((b) => b.id === model.root);
  let c = 0;
  if (pb) { const box = bodyBox(pb); c = (box.min.getComponent(axisIndex) + box.max.getComponent(axisIndex)) / 2; }
  const flipWorld = (v) => v.map((x, i) => (i === axisIndex ? round(2 * c - x) : x));
  const flipLocal = (v) => v.map((x, i) => (i === axisIndex ? -x : x));
  const flipRot = (r) => r.map((x, i) => (i === axisIndex ? x : -x));
  const created = [];
  for (const b of model.bodies.filter((x) => sel.has(x.id))) {
    const nb = RS.clone(b);
    nb.id = uniqueId(model, b.id.replace(/\d+$/, '') || 'osa');
    map[b.id] = nb.id;
    nb.pos = flipWorld(b.pos);
    nb.rot = flipRot(b.rot);
    nb.shapes = b.shapes.map((s) => ({ ...RS.clone(s), pos: flipLocal(s.pos), rot: flipRot(s.rot) }));
    model.bodies.push(nb);
    created.push(nb);
  }
  for (const j of model.joints.slice()) {
    if (!(j.b in map)) continue;
    const nj = RS.clone(j);
    nj.a = map[j.a] || j.a;
    nj.b = map[j.b];
    nj.pos = flipWorld(j.pos);
    // Kiertoakseli on pseudovektori: peilauksessa peilattava komponentti säilyy, muut vaihtavat merkkiä.
    nj.axis = j.axis.map((c, i) => (i === axisIndex ? c : -c));
    if (dim === '2d' && nj.axis[2] < 0) {
      nj.axis = [0, 0, 1];
      if (nj.lower != null) [nj.lower, nj.upper] = [-nj.upper, -nj.lower];
    }
    model.joints.push(nj);
  }
  copyThrusters(model, (model.thrusters || []).slice(), map, flipLocal);
  return created;
}

// Kopioitujen osien roottorit: kiekolle ja työntövoimalle uusi yhteinen tunnus (muuten kopiossa olisi voimaton kiekko,
// jota ei voi poistaa). tf muuntaa paikan ja suunnan osan koordinaatistossa (esim. peilaus).
function copyThrusters(model, list, map, tf = (v) => v.slice()) {
  let n = 0;
  const vec3 = (v) => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
  for (const t of list) {
    const id = map[t?.body];
    if (!id || !vec3(t.pos) || (t.dir && !vec3(t.dir))) continue; // liitetty teksti voi olla mitä tahansa
    const rid = 'r' + Math.random().toString(36).slice(2, 7);
    const disc = model.bodies.find((b) => b.id === id)?.shapes.find((s) => s.rotor === t.rid);
    if (disc) disc.rotor = rid;
    (model.thrusters ||= []).push({ body: id, pos: tf(t.pos), dir: tf(t.dir || [0, 1, 0]), rid });
    n++;
  }
  if (n) balanceRotors(model);
}

// ---------- Kopiointi ja yhdistäminen ----------
export function duplicate(model, ids, offset) {
  const map = {};
  const created = [];
  for (const b of model.bodies.filter((x) => ids.includes(x.id))) {
    const nb = RS.clone(b);
    nb.id = uniqueId(model, b.id.replace(/\d+$/, '') || 'osa');
    nb.pos = b.pos.map((v, i) => round(v + offset[i]));
    map[b.id] = nb.id;
    model.bodies.push(nb);
    created.push(nb);
  }
  for (const j of model.joints.slice()) {
    if (j.a in map && j.b in map) {
      const nj = RS.clone(j);
      nj.a = map[j.a]; nj.b = map[j.b];
      nj.pos = j.pos.map((v, i) => round(v + offset[i]));
      model.joints.push(nj);
    }
  }
  copyThrusters(model, (model.thrusters || []).slice(), map);
  return created;
}

// Liittää osan B osaan A yhdeksi jäykäksi kappaleeksi (B:n muodot ja roottorit siirtyvät A:lle).
export function merge(model, aId, bId) {
  const A = model.bodies.find((x) => x.id === aId), B = model.bodies.find((x) => x.id === bId);
  const qa = quat(A.rot), qaInv = qa.clone().invert(), qb = quat(B.rot);
  const toA = (p) => new THREE.Vector3(...p).applyQuaternion(qb).add(new THREE.Vector3(...B.pos)).sub(new THREE.Vector3(...A.pos)).applyQuaternion(qaInv);
  for (const s of B.shapes) {
    const local = toA(s.pos);
    const q = qaInv.clone().multiply(qb).multiply(quat(s.rot));
    A.shapes.push({ ...RS.clone(s), color: s.color || B.color, pos: [round(local.x), round(local.y), round(local.z)], rot: quatToDeg(q) });
  }
  // Roottorien työntövoima seuraa kiekkoja A:lle (paikka ja suunta A:n koordinaatistoon)
  for (const t of model.thrusters || []) {
    if (t.body !== bId) continue;
    const p = toA(t.pos), d = new THREE.Vector3(...(t.dir || [0, 1, 0])).applyQuaternion(qb).applyQuaternion(qaInv);
    t.body = aId; t.pos = [round(p.x), round(p.y), round(p.z)]; t.dir = [round(d.x, 4), round(d.y, 4), round(d.z, 4)];
  }
  const wasRoot = model.root === bId;
  model.joints = model.joints.filter((j) => !((j.a === aId && j.b === bId) || (j.a === bId && j.b === aId)));
  for (const j of model.joints) { if (j.a === bId) j.a = aId; if (j.b === bId) j.b = aId; }
  removeBodies(model, [bId]);
  if (wasRoot) model.root = aId; // päärunko säilyy yhdistetyssä osassa (ei listan ensimmäinen osa)
}

export function removeBodies(model, ids) {
  const sel = new Set(ids);
  model.bodies = model.bodies.filter((b) => !sel.has(b.id));
  model.joints = model.joints.filter((j) => !sel.has(j.a) && !sel.has(j.b));
  if (model.thrusters) { model.thrusters = model.thrusters.filter((t) => !sel.has(t.body)); balanceRotors(model); }
  if (sel.has(model.root)) model.root = model.bodies[0] ? model.bodies[0].id : null;
}

export function renameBody(model, oldId, newId) {
  if (!newId || model.bodies.some((b) => b.id === newId)) return false;
  model.bodies.find((b) => b.id === oldId).id = newId;
  for (const j of model.joints) { if (j.a === oldId) j.a = newId; if (j.b === oldId) j.b = newId; }
  for (const t of model.thrusters || []) if (t.body === oldId) t.body = newId;
  if (model.root === oldId) model.root = newId;
  return true;
}

// ---------- Roottorit ----------
// Roottori = työntövoima osan pisteessä (pos osan koordinaatistossa, suunta dir). Näkyvä kiekko on osan muoto,
// jolla on sama tunnus (rotor). Voimat tasataan aina niin, että puolella teholla robotti juuri ja juuri leijuu.
export function balanceRotors(model) {
  const n = (model.thrusters || []).length;
  for (const t of model.thrusters || []) { t.weight = round(2 / n, 4); delete t.force; }
}

export function addRotor(model, parent, dim) {
  const box = bodyBox(parent);
  model.thrusters ||= [];
  const mine = model.thrusters.filter((t) => t.body === parent.id).length;
  const hx = (box.max.x - box.min.x) / 2, hz = (box.max.z - box.min.z) / 2;
  const top = round(box.max.y - parent.pos[1] + 0.04);
  // Paikat vuorotellen kulmiin: 2D:ssä etu/taka, 3D:ssä neljä kulmaa ristiin, jotta voimat pysyvät tasapainossa
  const corners3 = [[1, 1], [-1, -1], [1, -1], [-1, 1]];
  const [sx, sz] = dim === '2d' ? [mine % 2 ? -1 : 1, 0] : corners3[mine % 4];
  const ring = Math.floor(mine / (dim === '2d' ? 2 : 4)) + 1;
  const pos = [round(sx * hx * ring), top, dim === '2d' ? 0 : round(sz * hz * ring)];
  const rid = 'r' + Math.random().toString(36).slice(2, 7);
  parent.shapes.push(dim === '2d'
    ? { type: 'box', size: [0.36, 0.035, 0.3], pos: [pos[0], pos[1], 0], rot: [0, 0, 0], color: '#cfd8e3', round: 0, rotor: rid }
    : { type: 'cylinder', r: 0.17, h: 0.02, pos, rot: [0, 0, 0], color: '#cfd8e3', plain: true, rotor: rid });
  model.thrusters.push({ body: parent.id, pos, dir: [0, 1, 0], rid });
  // Ilmanvastus lentävälle rungolle (jos käyttäjä ei ole asettanut omaa): ilman sitä pienikin kallistus kiihtyy
  // hallitsemattomaksi pyörimiseksi, ja neuroverkon on vaikea oppia lentämään
  parent.linearDamping ??= 0.3;
  parent.angularDamping ??= 1.5;
  balanceRotors(model);
  return model.thrusters.length - 1;
}

export function removeRotor(model, index) {
  const t = model.thrusters?.[index];
  if (!t) return;
  const b = model.bodies.find((x) => x.id === t.body);
  if (b && t.rid) b.shapes = b.shapes.filter((s) => s.rotor !== t.rid);
  model.thrusters.splice(index, 1);
  balanceRotors(model);
}

// Roottorin siirto: kiekko seuraa mukana
export function moveRotor(model, index, pos) {
  const t = model.thrusters[index], b = model.bodies.find((x) => x.id === t.body);
  t.pos = pos.map((v) => round(v));
  const s = b?.shapes.find((x) => x.rotor === t.rid);
  if (s) s.pos = [t.pos[0], t.pos[1], s.type === 'box' ? 0 : t.pos[2]];
}

// ---------- Leikepöytä: kopioi ja liitä ----------
// Kopio sisältää valitut osat ja niiden väliset nivelet. Muoto kulkee myös järjestelmän leikepöydän kautta tekstinä.
export const CLIP_FORMAT = 'robolab-robot-parts';

export function copyParts(model, ids, dim) {
  const sel = new Set(ids);
  return {
    format: CLIP_FORMAT, dim,
    bodies: RS.clone(model.bodies.filter((b) => sel.has(b.id))),
    joints: RS.clone(model.joints.filter((j) => sel.has(j.a) && sel.has(j.b))),
    thrusters: RS.clone((model.thrusters || []).filter((t) => sel.has(t.body)))
  };
}

// Liittää osat uusilla nimillä ja siirrettynä. Väärän ulottuvuuden osat muunnetaan. Palauttaa luodut osat.
export function pasteParts(model, clip, dim, offset) {
  let src = { ...emptyModel(clip.dim || dim), bodies: RS.clone(clip.bodies), joints: RS.clone(clip.joints || []) };
  const sameDim = (clip.dim || dim) === dim;
  if (!sameDim) src = dim === '2d' ? convertTo2D(src) : convertTo3D(src);
  const map = {}, created = [];
  for (const b of src.bodies) {
    const nb = RS.clone(b);
    // Toisen ulottuvuuden roottorikiekot jäisivät ilman työntövoimaa: ne jätetään pois (roottorin voi lisätä uudelleen)
    if (!sameDim && nb.shapes.some((s) => s.rotor) && nb.shapes.some((s) => !s.rotor)) nb.shapes = nb.shapes.filter((s) => !s.rotor);
    nb.id = uniqueId(model, b.id.replace(/\d+$/, '') || 'osa');
    nb.pos = b.pos.map((v, i) => round(v + offset[i]));
    map[b.id] = nb.id;
    model.bodies.push(nb);
    created.push(nb);
  }
  for (const j of src.joints) {
    if (!(j.a in map) || !(j.b in map)) continue;
    model.joints.push({ ...RS.clone(j), a: map[j.a], b: map[j.b], pos: j.pos.map((v, i) => round(v + offset[i])) });
  }
  if (sameDim && Array.isArray(clip.thrusters)) copyThrusters(model, clip.thrusters, map);
  if (!model.root && created.length) model.root = created[0].id;
  return created;
}

// Siirtää osia (ja niiden niveliä, joissa osa on liikkuva osa) vektorin d verran
export function moveBodies(model, ids, d) {
  const sel = new Set(ids);
  for (const b of model.bodies) if (sel.has(b.id)) b.pos = b.pos.map((v, i) => round(v + d[i]));
  for (const j of model.joints) if (sel.has(j.b)) j.pos = j.pos.map((v, i) => round(v + d[i]));
}

// Kääntää osia yhteisen keskipisteen ympäri akselin (0 = x, 1 = y, 2 = z) ympäri asteina.
// pivotIds: osat, joiden keskipiste on kiertokeskiö (oletus: kaikki käännettävät; esim. valittu osa ilman lapsiaan)
export function rotateBodies(model, ids, axisIndex, deg, pivotIds = ids) {
  const sel = new Set(ids), piv = new Set(pivotIds);
  const bodies = model.bodies.filter((b) => sel.has(b.id));
  if (!bodies.length) return;
  const pivots = model.bodies.filter((b) => piv.has(b.id));
  const c = (pivots.length ? pivots : bodies).reduce((a, b) => a.add(new THREE.Vector3(...b.pos)), new THREE.Vector3()).divideScalar(pivots.length || bodies.length);
  const ax = new THREE.Vector3(axisIndex === 0 ? 1 : 0, axisIndex === 1 ? 1 : 0, axisIndex === 2 ? 1 : 0);
  const qr = new THREE.Quaternion().setFromAxisAngle(ax, THREE.MathUtils.degToRad(deg));
  const turn = (p) => new THREE.Vector3(...p).sub(c).applyQuaternion(qr).add(c).toArray().map((v) => round(v));
  for (const b of bodies) {
    b.pos = turn(b.pos);
    b.rot = quatToDeg(qr.clone().multiply(quat(b.rot)));
  }
  for (const j of model.joints) {
    if (!sel.has(j.b)) continue;
    j.pos = turn(j.pos);
    j.axis = new THREE.Vector3(...j.axis).applyQuaternion(qr).toArray().map((v) => round(v, 4));
  }
}

// Osat, jotka on kiinnitetty annettuihin osiin nivelillä (emo → lapsi, myös lapsenlapset). Kun osaa siirretään,
// siihen kiinnitetyt osat tulevat mukana kuin oikeassa kokoonpanossa. Päärunkoa ei koskaan lasketa lapseksi.
export function descendants(model, ids) {
  const own = new Set(ids), out = new Set(), stack = [...ids];
  while (stack.length) {
    const id = stack.pop();
    for (const j of model.joints) {
      if (j.a !== id || own.has(j.b) || out.has(j.b) || j.b === model.root) continue;
      out.add(j.b); stack.push(j.b);
    }
  }
  return [...out];
}

// Kääntää osia kvaternion qr verran pisteen center ympäri (vapaa kierto siirtokahvasta)
export function rotateBodiesQ(model, ids, qr, center, dim) {
  const sel = new Set(ids), c = new THREE.Vector3(...center);
  const turn = (p) => new THREE.Vector3(...p).sub(c).applyQuaternion(qr).add(c).toArray().map((v) => round(v));
  for (const b of model.bodies) {
    if (!sel.has(b.id)) continue;
    b.pos = turn(b.pos);
    b.rot = quatToDeg(qr.clone().multiply(quat(b.rot)));
    if (dim === '2d') { b.pos[2] = 0; b.rot = [0, 0, b.rot[2]]; }
  }
  for (const j of model.joints) {
    if (!sel.has(j.b)) continue;
    j.pos = turn(j.pos);
    if (dim === '2d') j.pos[2] = 0;
    else j.axis = new THREE.Vector3(...j.axis).applyQuaternion(qr).toArray().map((v) => round(v, 4));
  }
}

// Kuinka paljon muodon oma akseli (muodon koordinaatistossa) venyy, kun osaa skaalataan osan akselien suunnassa k
function axisFactor(qs, axis, k) {
  const v = new THREE.Vector3(...axis).applyQuaternion(qs);
  return Math.abs(v.x) * k[0] + Math.abs(v.y) * k[1] + Math.abs(v.z) * k[2];
}
function scaleShape(s, k, is2d) {
  const qs = quat(s.rot);
  s.pos = s.pos.map((v, i) => round(v * k[i]));
  const fx = axisFactor(qs, [1, 0, 0], k), fy = axisFactor(qs, [0, 1, 0], k), fz = axisFactor(qs, [0, 0, 1], k);
  if (s.size) s.size = [fx, fy, fz].map((f, i) => Math.max(0.01, round(s.size[i] * f)));
  // Pallo pysyy pallona (2D: ympyrä) ja sylinterin säde lasketaan poikittaisista suunnista
  if (s.type === 'sphere') s.r = Math.max(0.01, round(s.r * (is2d ? (k[0] + k[1]) / 2 : (k[0] + k[1] + k[2]) / 3)));
  else if (s.r != null) s.r = Math.max(0.01, round(s.r * (fx + fz) / 2));
  if (s.h != null) s.h = Math.max(0.01, round(s.h * fy));
}

// Skaalaa yhden osan omien akseliensa suunnassa (k = [kx, ky, kz]): muodot, niiden paikat ja osan roottorit
export function scaleBody(model, body, k, dim) {
  if (dim === '2d') k = [k[0], k[1], 1];
  for (const s of body.shapes) scaleShape(s, k, dim === '2d');
  for (const t of model.thrusters || []) if (t.body === body.id) t.pos = t.pos.map((v, i) => round(v * k[i]));
}

// Skaalaa osia tasaisesti kertoimella f pisteen center suhteen: paikat, muodot, nivelet ja roottorit
export function scaleBodies(model, ids, f, center, dim) {
  const sel = new Set(ids);
  const sc = (p) => p.map((v, i) => (dim === '2d' && i === 2 ? 0 : round(center[i] + (v - center[i]) * f)));
  for (const b of model.bodies) {
    if (!sel.has(b.id)) continue;
    b.pos = sc(b.pos);
    for (const s of b.shapes) scaleShape(s, [f, f, f], dim === '2d');
  }
  for (const j of model.joints) if (sel.has(j.b)) j.pos = sc(j.pos);
  for (const t of model.thrusters || []) if (sel.has(t.body)) t.pos = t.pos.map((v) => round(v * f));
}

// Pudottaa osat (tai koko robotin) niin, että alin kohta on maan pinnalla (y = 0)
export function dropToGround(model, ids) {
  const list = ids && ids.length ? model.bodies.filter((b) => ids.includes(b.id)) : model.bodies;
  if (!list.length) return;
  const minY = Math.min(...list.map((b) => bodyBox(b).min.y));
  moveBodies(model, list.map((b) => b.id), [0, -minY, 0]);
}

// ---------- Massa ja painopiste ----------
// Massa = tiheys × tilavuus (3D) tai tiheys × pinta-ala (2D, kuten planck.js). Oletustiheys 1.
function shapeSize(s, dim) {
  if (dim === '2d') return s.type === 'box' ? s.size[0] * s.size[1] : Math.PI * s.r * s.r;
  if (s.type === 'box') return s.size[0] * s.size[1] * s.size[2];
  if (s.type === 'sphere') return (4 / 3) * Math.PI * s.r ** 3;
  if (s.type === 'cylinder') return Math.PI * s.r * s.r * s.h;
  return Math.PI * s.r * s.r * s.h + (4 / 3) * Math.PI * s.r ** 3;
}

export function massProps(model, dim) {
  let mass = 0;
  const c = new THREE.Vector3();
  for (const b of model.bodies) {
    if (b.static) continue;
    const qb = quat(b.rot);
    for (const s of b.shapes) {
      const m = (b.density ?? 1) * shapeSize(s, dim);
      c.addScaledVector(new THREE.Vector3(...s.pos).applyQuaternion(qb).add(new THREE.Vector3(...b.pos)), m);
      mass += m;
    }
  }
  return { mass, com: mass > 0 ? c.divideScalar(mass).toArray().map((v) => round(v)) : null };
}

// ---------- Muunnokset simulaatioiden muotoihin ----------
const clean = (o) => JSON.parse(JSON.stringify(o));
// Roottorit, joiden osa on yhä olemassa (rakentajassa osan voi poistaa)
const liveThrusters = (model) => (model.thrusters || []).filter((t) => model.bodies.some((b) => b.id === t.body));

export function to3D(model) {
  return clean({
    name: model.name, description: model.description, root: model.root,
    fall: model.fall, sensors: { scan: model.sensors.scan ?? 5 },
    target: model.target && model.target.z ? model.target : undefined,
    bodies: model.bodies.map((b) => ({
      id: b.id, pos: b.pos, rot: b.rot, color: b.color, density: b.density, friction: b.friction,
      frictionCombine: b.frictionCombine, foot: b.foot || undefined, static: b.static || undefined,
      linearDamping: b.linearDamping, angularDamping: b.angularDamping,
      shapes: b.shapes.map((s) => ({ type: s.type, size: s.size, r: s.r, h: s.h, pos: s.pos, rot: s.rot, color: s.color, deco: s.deco, plain: s.plain, round: s.round, rotor: s.rotor }))
    })),
    joints: model.joints.map((j) => ({
      a: j.a, b: j.b, pos: j.pos, axis: j.axis, lower: j.lower, upper: j.upper, speed: j.speed,
      strength: j.strength, stiffness: j.stiffness, damping: j.damping, control: j.control, motor: j.motor,
      spring: j.spring, springDamping: j.springDamping
    })),
    thrusters: liveThrusters(model).map((t) => ({ body: t.body, pos: t.pos, dir: t.dir, weight: t.weight, force: t.force, rid: t.rid }))
  });
}

export function to2D(model) {
  return clean({
    name: model.name, description: model.description, root: model.root,
    fall: model.fall, sensors: { lidar: model.sensors.lidar ?? 5 },
    target: model.target ? { x: model.target.x, y: model.target.y } : undefined,
    bodies: model.bodies.map((b) => ({
      id: b.id, x: b.pos[0], y: b.pos[1], angle: b.rot[2], color: b.color, density: b.density,
      friction: b.friction, foot: b.foot || undefined, static: b.static || undefined,
      linearDamping: b.linearDamping, angularDamping: b.angularDamping,
      shapes: b.shapes.map((s) => (s.type === 'box'
        ? { type: 'box', w: s.size[0], h: s.size[1], x: s.pos[0], y: s.pos[1], angle: s.rot[2], color: s.color, deco: s.deco, round: s.round, rotor: s.rotor }
        : { type: 'circle', r: s.r, x: s.pos[0], y: s.pos[1], color: s.color, deco: s.deco, plain: s.plain, rotor: s.rotor }))
    })),
    joints: model.joints.map((j) => ({
      a: j.a, b: j.b, x: j.pos[0], y: j.pos[1], lower: j.lower, upper: j.upper,
      torque: j.torque ?? 10, speed: j.speed, motor: j.motor, spring: j.spring, springDamping: j.springDamping
    })),
    thrusters: liveThrusters(model).map((t) => ({ body: t.body, x: t.pos[0], y: t.pos[1], angle: round(Math.atan2(t.dir[1], t.dir[0]) * 180 / Math.PI), weight: t.weight, force: t.force, rid: t.rid }))
  });
}

export function from3D(raw) {
  const m = normalizeModel3D(raw);
  const out = { ...emptyModel('3d'), ...RS.clone(raw) };
  out.bodies = m.bodies.map((b) => ({
    id: b.id, pos: b.pos, rot: b.rot, color: b.color, density: b.density, friction: b.friction,
    frictionCombine: b.frictionCombine, foot: b.foot, static: b.static, linearDamping: b.linearDamping, angularDamping: b.angularDamping,
    shapes: b.shapes.map((s) => ({ type: s.type, size: s.size, r: s.r, h: s.h, pos: s.pos, rot: s.rot, color: s.color, deco: s.deco, plain: s.plain, round: s.round, rotor: s.rotor }))
  }));
  out.joints = m.joints;
  out.thrusters = m.thrusters;
  out.root = m.root;
  out.fall = raw.fall || {}; // ilman kaatumissääntöjä oleva malli (esim. käärme) ei saa oletussääntöä
  out.sensors = { scan: m.sensors.scan ?? 5 };
  return clean(out);
}

export function from2D(raw) {
  const m = RS.normalizeModel(raw);
  const out = { ...emptyModel('2d'), name: raw.name || 'Oma robotti', description: raw.description || '', root: m.root, fall: m.fall };
  out.sensors = { lidar: m.sensors.lidar ?? 0 };
  if (raw.target) out.target = { x: raw.target.x, y: raw.target.y };
  out.bodies = m.bodies.map((b) => ({
    id: b.id, pos: [b.x, b.y, 0], rot: [0, 0, b.angle], color: b.color, density: b.density,
    friction: b.friction, foot: b.foot, static: b.static, linearDamping: b.linearDamping, angularDamping: b.angularDamping,
    shapes: b.shapes.map((s) => (s.type === 'circle'
      ? { type: 'sphere', r: s.r, pos: [s.x, s.y, 0], rot: [0, 0, 0], color: s.color, deco: s.deco, plain: s.plain, rotor: s.rotor }
      : { type: 'box', size: [s.w, s.h, 0.3], pos: [s.x, s.y, 0], rot: [0, 0, s.angle], color: s.color, deco: s.deco, round: s.round, rotor: s.rotor }))
  }));
  out.thrusters = m.thrusters.map((t) => ({ body: t.body, pos: [t.x, t.y, 0], dir: [Math.cos(t.angle * Math.PI / 180), Math.sin(t.angle * Math.PI / 180), 0], weight: t.weight, force: t.force, rid: t.rid }));
  out.joints = m.joints.map((j) => clean({
    a: j.a, b: j.b, pos: [j.x, j.y, 0], axis: [0, 0, 1], lower: j.lower, upper: j.upper,
    torque: j.torque, speed: j.speed, motor: j.motor, spring: j.spring, springDamping: j.springDamping
  }));
  return clean(out);
}

// 3D → 2D: z-suunta poistetaan, muodot muutetaan laatikoiksi ja ympyröiksi.
export function convertTo2D(model) {
  const m = RS.clone(model);
  for (const b of m.bodies) {
    b.pos[2] = 0; b.rot = [0, 0, b.rot[2]];
    b.shapes = b.shapes.map((s) => {
      if (s.type === 'box') return { ...s, pos: [s.pos[0], s.pos[1], 0], rot: [0, 0, s.rot[2]] };
      if (s.type === 'capsule') return { type: 'box', size: [s.r * 2, s.h + 2 * s.r, 0.3], pos: [s.pos[0], s.pos[1], 0], rot: [0, 0, s.rot[2]], color: s.color, deco: s.deco };
      // Roottorin kiekko pysyy kiekkona (ohut laatikko kuten 2D-roottorissa), ei iso törmäävä ympyrä
      if (s.rotor) return { type: 'box', size: [s.r * 2, 0.035, 0.3], pos: [s.pos[0], s.pos[1], 0], rot: [0, 0, 0], color: s.color, round: 0, rotor: s.rotor };
      return { type: 'sphere', r: s.r, pos: [s.pos[0], s.pos[1], 0], rot: [0, 0, 0], color: s.color, deco: s.deco, plain: s.plain };
    });
  }
  for (const j of m.joints) { j.pos[2] = 0; j.axis = [0, 0, 1]; j.torque = j.torque ?? 10; }
  for (const t of m.thrusters || []) {
    t.pos = [t.pos[0], t.pos[1], 0];
    const l = Math.hypot(t.dir[0], t.dir[1]);
    t.dir = l > 1e-6 ? [t.dir[0] / l, t.dir[1] / l, 0] : [0, 1, 0]; // sivulle osoittava (z) työntö → ylös
  }
  m.sensors = { lidar: m.sensors.lidar ?? 5 };
  if (m.target) m.target = { x: m.target.x, y: m.target.y };
  return m;
}

export function convertTo3D(model) {
  const m = RS.clone(model);
  m.sensors = { scan: m.sensors.scan ?? 5 };
  if (m.target) m.target = { ...m.target, z: m.target.z || [-1, 1] };
  return m;
}

// ---------- Tarkistus ----------
// Palauttaa listan { level: 'error' | 'warn' | 'info', text, id? }.
export function validate(model, dim) {
  const out = [];
  if (model.bodies.length === 0) {
    out.push({ level: 'error', text: tr('Robotissa ei ole yhtään osaa. Aloita lisäämällä esimerkiksi laatikko rungoksi.', 'The robot has no parts. Start by adding for example a box as the body.') });
    return out;
  }
  // Osa ilman muotoja on näkymätön eikä sitä voi klikata (esim. viimeinen muoto ja roottori poistettu)
  for (const b of model.bodies) if (!b.shapes?.length) out.push({ level: 'error', id: b.id, text: tr(`Osalla "${b.id}" ei ole yhtään muotoa. Poista osa tai lisää sille muoto.`, `Part "${b.id}" has no shapes. Delete the part or add a shape to it.`) });
  if (out.length) return out;
  try {
    if (dim === '2d') RS.normalizeModel(to2D(model)); else normalizeModel3D(to3D(model));
  } catch (e) {
    out.push({ level: 'error', text: e.message });
    return out;
  }
  // Mitkä osat ovat kiinni päärungossa nivelten kautta?
  const adj = {};
  for (const j of model.joints) {
    (adj[j.a] = adj[j.a] || []).push(j.b);
    (adj[j.b] = adj[j.b] || []).push(j.a);
  }
  const seen = new Set([model.root]);
  const stack = [model.root];
  while (stack.length) for (const n of adj[stack.pop()] || []) if (!seen.has(n)) { seen.add(n); stack.push(n); }
  for (const b of model.bodies) {
    if (!seen.has(b.id) && !b.static) out.push({ level: 'warn', id: b.id, text: tr(`Osa "${b.id}" ei ole kiinni päärungossa nivelellä, joten se putoaa erilleen.`, `Part "${b.id}" is not connected to the main body by a joint, so it will fall off.`) });
  }
  const parents = {}, pairs = new Set();
  for (const j of model.joints) {
    if (j.a === j.b) out.push({ level: 'error', text: tr(`Nivel yhdistää osan "${j.a}" itseensä.`, `A joint connects part "${j.a}" to itself.`) });
    const A = model.bodies.find((b) => b.id === j.a), B = model.bodies.find((b) => b.id === j.b);
    if (A && B) {
      // Nivelen pitää olla kummankin osan lähellä (yhden osan sisällä oleva nivel kaukana toisesta on näkymätön vipu)
      const p = new THREE.Vector3(...j.pos);
      const d = Math.max(bodyBox(A).distanceToPoint(p), bodyBox(B).distanceToPoint(p));
      if (d > 0.3) out.push({ level: 'warn', text: tr(`Nivel ${j.a}–${j.b} on kaukana osistaan (${d.toFixed(2)} m). Siirrä se osien väliin.`, `Joint ${j.a}–${j.b} is far from its parts (${d.toFixed(2)} m). Move it between the parts.`) });
    }
    if (j.lower != null && j.upper != null && j.lower > j.upper) out.push({ level: 'error', text: tr(`Nivelen ${j.a}–${j.b} alaraja on suurempi kuin yläraja.`, `Joint ${j.a}–${j.b} has its lower limit above its upper limit.`) });
    else if (j.lower != null && j.upper != null && j.lower === j.upper) out.push({ level: 'error', text: tr(`Nivelen ${j.a}–${j.b} ala- ja yläraja ovat samat, joten nivel ei voi liikkua.`, `Joint ${j.a}–${j.b} has equal lower and upper limits, so it cannot move.`) });
    const pair = [j.a, j.b].sort().join('|');
    if (pairs.has(pair)) out.push({ level: 'warn', text: tr(`Osien ${j.a} ja ${j.b} välillä on kaksi niveltä. Poista toinen.`, `Parts ${j.a} and ${j.b} have two joints between them. Delete one.`) });
    pairs.add(pair);
    (parents[j.b] ||= []).push(j.a);
  }
  for (const [id, ps] of Object.entries(parents)) {
    if (ps.length > 1) out.push({ level: 'warn', id, text: tr(`Osa "${id}" on kiinni kahdella nivelellä (${ps.join(', ')}). Silmukka jäykistää robotin tai saa sen nykimään; tarkista nivelet.`, `Part "${id}" is attached by two joints (${ps.join(', ')}). The loop stiffens the robot or makes it jitter; check the joints.`) });
  }
  const motors = model.joints.filter((j) => j.motor !== false).length;
  if (motors === 0 && !liveThrusters(model).length) out.push({ level: 'warn', text: tr('Robotissa ei ole moottoreita, joten se ei voi liikkua itse. Yhdistä osia nivelillä.', 'The robot has no motors, so it cannot move by itself. Connect parts with joints.') });
  if (!model.bodies.some((b) => b.foot)) out.push({ level: 'info', text: tr('Mikään osa ei tunnista maakosketusta. Merkitse jalat tai pyörät kohdasta "Maakosketus" – se helpottaa oppimista.', 'No part senses ground contact. Mark feet or wheels with "Ground contact" – it makes learning easier.') });
  if (out.every((x) => x.level !== 'error')) {
    const info = dim === '2d' ? RS.modelInfo(RS.normalizeModel(to2D(model))) : modelInfo3D(normalizeModel3D(to3D(model)));
    const rot = info.thrusters ? tr(`, ${info.thrusters} roottoria`, `, ${info.thrusters} rotors`) : '';
    out.push({ level: 'ok', text: tr(`Valmis simulaatioon: ${info.motors} moottoria${rot}, ${info.obsSize} sensoria.`, `Ready for simulation: ${info.motors} motors${rot}, ${info.obsSize} sensors.`) });
  }
  return out;
}
