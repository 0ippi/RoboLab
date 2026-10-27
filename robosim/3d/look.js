// Robottien ulkoasu 3D:ssä: renderöijän asetukset, materiaalit, pyöristetyt muodot, ääriviivat ja koristeet.
// Sama tyyli kuin RoboLabin hahmoissa: tummat ääriviivat, pehmeät muodot, hehkuvat yksityiskohdat.
// Laatu (RS.quality): low = kevyt (ei varjoja, ei ääriviivoja), normal, high (pehmeät varjot, heijastukset).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export const quality = () => RS.quality();
const INK = '#1b2a44';

// Renderöijä ja varjot laadun mukaan. Palauttaa varjokartan koon (0 = ei varjoja).
export function setupRenderer(renderer, scene) {
  const q = quality(), dpr = window.devicePixelRatio || 1;
  renderer.setPixelRatio(q === 'low' ? 1 : q === 'high' ? Math.min(dpr, 2) : Math.min(dpr, 1.5));
  renderer.shadowMap.enabled = q !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap; // PCFSoft on poistumassa Three.js:stä; korkealla laadulla isompi varjokartta
  if (q === 'high' && scene) {
    // Ympäristövalo heijastuksia varten (kiiltävät pinnat näyttävät muovilta ja metallilta)
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.45;
    pmrem.dispose();
  }
  return q === 'low' ? 0 : q === 'high' ? 2048 : 1024;
}

// Materiaali: low = Lambert (kevyt), normal = Standard, high = Physical (kirkas lakkapinta).
// Materiaalit jaetaan välimuistista, jotta uusi sukupolvi ei luo (ja vuoda) satoja materiaaleja.
const matCache = new Map();
export function material(color, opts = {}) {
  const key = [quality(), color, opts.ghost, opts.opacity, opts.emissive].join('|');
  if (!matCache.has(key)) matCache.set(key, makeMaterial(color, opts));
  return matCache.get(key);
}
function makeMaterial(color, { ghost = false, opacity = 1, emissive = null } = {}) {
  const q = quality();
  if (ghost) return new THREE.MeshLambertMaterial({ color, transparent: true, opacity: 0.16, depthWrite: false });
  const common = { color, transparent: opacity < 1, opacity };
  if (emissive) Object.assign(common, { emissive, emissiveIntensity: 0.9 });
  if (q === 'low') return new THREE.MeshLambertMaterial(common);
  if (q === 'high') return new THREE.MeshPhysicalMaterial({ ...common, roughness: 0.42, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.35 });
  return new THREE.MeshStandardMaterial({ ...common, roughness: 0.5, metalness: 0.06 });
}

// Muodon geometria. dim2d: 2D-robotin pallot piirretään litteinä kiekkoina.
export function geometry(s, { dim2d = false } = {}) {
  const q = quality(), seg = q === 'low' ? 12 : q === 'high' ? 40 : 24;
  if (s.type === 'box') {
    const [w, h, d] = s.size;
    if (q === 'low' || s.round === 0) return new THREE.BoxGeometry(w, h, d);
    return new RoundedBoxGeometry(w, h, d, q === 'high' ? 4 : 2, Math.min(w, h, d) * (s.round ?? 0.18));
  }
  if (s.type === 'sphere') {
    if (dim2d) return new THREE.CylinderGeometry(s.r, s.r, 0.3, seg + 8).rotateX(Math.PI / 2);
    return new THREE.SphereGeometry(s.r, seg, Math.round(seg * 0.7));
  }
  if (s.type === 'cylinder') return new THREE.CylinderGeometry(s.r, s.r, s.h, seg + 4);
  return new THREE.CapsuleGeometry(s.r, s.h, q === 'low' ? 3 : 6, seg);
}

// Ääriviiva "käännetyn kuoren" tekniikalla: sama muoto hieman isompana, sisäpuoli tummana
const outlineMat = new THREE.MeshBasicMaterial({ color: INK, side: THREE.BackSide });
export function outline(geo, thickness = 0.018) {
  geo.computeBoundingBox();
  const b = geo.boundingBox, size = new THREE.Vector3();
  b.getSize(size);
  const m = new THREE.Mesh(geo, outlineMat);
  m.scale.set(1 + (2 * thickness) / Math.max(size.x, 0.01), 1 + (2 * thickness) / Math.max(size.y, 0.01), 1 + (2 * thickness) / Math.max(size.z, 0.01));
  m.userData.outline = true;
  m.raycast = () => {}; // ei häiritse valintaa rakentajassa
  return m;
}

// Koristetekstuurit (kasvot, silmä, visiiri) piirretään kerran ja jaetaan
const texCache = new Map();
function decoTexture(deco, aspect) {
  const key = deco + ':' + aspect.toFixed(2);
  if (!texCache.has(key)) {
    const t = new THREE.CanvasTexture(RS.decoCanvas(deco, aspect, 256));
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    texCache.set(key, t);
  }
  return texCache.get(key);
}

const glowCache = new Map();
const glowMat = (color) => { if (!glowCache.has(color)) glowCache.set(color, new THREE.MeshBasicMaterial({ color })); return glowCache.get(color); };
let domeMat = null, netMat = null, plateMats = new Map();
const plateMat = (tex) => { if (!plateMats.has(tex)) plateMats.set(tex, new THREE.MeshBasicMaterial({ map: tex, transparent: true })); return plateMats.get(tex); };

// Yksityiskohdat muodon päälle: pyörän navat, kasvot, valorengas, aivoverkko. Lisätään meshin lapsiksi.
export function details(mesh, s, color, { dim2d = false } = {}) {
  const q = quality();
  const add = (o) => { o.raycast = () => {}; mesh.add(o); return o; };
  // Pyörä (litteä sylinteri): vanne ja puola, joista pyöriminen näkyy
  if (s.type === 'cylinder' && s.r > s.h * 1.2 && !s.deco && !s.plain) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.55, s.r * 0.55, s.h * 1.06, q === 'low' ? 10 : 20), material('#c9d4df'));
    add(hub);
    if (q !== 'low') {
      const spoke = new THREE.Mesh(new THREE.BoxGeometry(s.r * 1.6, s.h * 1.1, s.r * 0.16), material(color));
      add(spoke);
    }
    return;
  }
  // 2D-robotin pyörä (kiekko) samaan tapaan
  if (dim2d && s.type === 'sphere' && !s.deco && !s.plain) {
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(s.r * 0.55, s.r * 0.55, 0.32, 20).rotateX(Math.PI / 2), material('#c9d4df'));
    add(hub);
    if (q !== 'low') add(new THREE.Mesh(new THREE.BoxGeometry(s.r * 1.6, s.r * 0.16, 0.33), material(color)));
    return;
  }
  if (!s.deco) return;
  // Kasvotyyppiset koristeet: tekstuurilevy muodon etupinnalle (+x)
  if (['face', 'soft', 'eye', 'visor'].includes(s.deco)) {
    let w, h, front;
    if (s.type === 'box') { w = s.size[2]; h = s.size[1]; front = s.size[0] / 2; }
    else if (s.type === 'sphere') { w = h = s.r * 1.15; front = s.r + 0.004; } // pallon pinta on keskellä kauimpana
    else if (s.type === 'cylinder') { w = h = Math.min(s.r * 1.4, s.h); front = s.r; }
    else { w = s.r * 1.4; h = s.r * 1.4; front = s.r; }
    if (dim2d) { // 2D-robotti katsotaan sivulta: kasvot +z-puolelle
      const sw = s.type === 'box' ? s.size[0] : s.r * 1.4, sh = s.type === 'box' ? s.size[1] : s.r * 1.4;
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(sw, sh), plateMat(decoTexture(s.deco, sw / sh)));
      plane.position.z = (s.type === 'box' ? s.size[2] / 2 : 0.15) + 0.004;
      add(plane);
      return;
    }
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(w, h), plateMat(decoTexture(s.deco, w / h)));
    plane.rotation.y = Math.PI / 2;
    plane.position.x = front + 0.004;
    add(plane);
    return;
  }
  if (s.deco === 'ring') { // valorengas sylinterin päällä
    const r = s.type === 'cylinder' ? s.r * 0.72 : 0.2, y = s.type === 'cylinder' ? s.h / 2 + 0.004 : 0.1;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, Math.max(0.012, r * 0.06), 8, q === 'low' ? 24 : 48), glowMat('#5ee7ff'));
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    add(ring);
    return;
  }
  if (s.deco === 'led') {
    add(new THREE.Mesh(new THREE.SphereGeometry(Math.min(s.r || 0.05, 0.05) * 0.8 + 0.01, 10, 8), glowMat('#5ee7ff')));
    return;
  }
  if (s.deco === 'brain') { // lasikupu: verkon solmut ja yhteydet hehkuvat sisällä
    const r = s.r || 0.3, mint = '#7cf5c2';
    mesh.material = domeMat ||= new THREE.MeshPhysicalMaterial({ color: '#3ddc97', transparent: true, opacity: 0.28, roughness: 0.1, metalness: 0, clearcoat: 1, depthWrite: false });
    mesh.userData.mat = mesh.material;
    const L = [[-0.42, [-0.25, 0.25]], [0, [-0.42, 0, 0.42]], [0.42, [-0.25, 0.25]]];
    const nodeGeo = new THREE.SphereGeometry(r * 0.08, 10, 8), nodeMat = glowMat(mint);
    // Verkko x–y-tasossa, joten se näkyy sivulta katsottaessa (kamera katsoo yleensä viistosti sivulta)
    const pts = [];
    for (const [x, ys] of L) for (const y of ys) add(new THREE.Mesh(nodeGeo, nodeMat)).position.set(x * r, y * r, 0);
    for (let i = 0; i < 2; i++) for (const ya of L[i][1]) for (const yb of L[i + 1][1]) {
      pts.push(new THREE.Vector3(L[i][0] * r, ya * r, 0), new THREE.Vector3(L[i + 1][0] * r, yb * r, 0));
    }
    const lines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), netMat ||= new THREE.LineBasicMaterial({ color: mint, transparent: true, opacity: 0.7 }));
    add(lines);
  }
}

// Kokonainen muoto: mesh + yksityiskohdat + (normal/high) ääriviiva. Palauttaa meshin.
export function shapeMesh(s, color, { dim2d = false, ghost = false, geo = null } = {}) {
  const g = geo || geometry(s, { dim2d });
  const mesh = new THREE.Mesh(g, material(color, { ghost }));
  mesh.userData.mat = mesh.material;
  mesh.userData.color = color;
  if (ghost) return mesh;
  details(mesh, s, color, { dim2d });
  if (quality() !== 'low' && s.deco !== 'brain') mesh.add(outline(g));
  return mesh;
}

// Roottorin ilmavirta: läpikuultava kartio, jota venytetään työntövoiman mukaan
let coneMat = null;
export function thrustCone() {
  const geo = new THREE.ConeGeometry(0.09, 1, 14, 1, true).translate(0, -0.5, 0);
  const m = new THREE.Mesh(geo, coneMat ||= new THREE.MeshBasicMaterial({ color: '#5ee7ff', transparent: true, opacity: 0.45, depthWrite: false, side: THREE.DoubleSide }));
  m.raycast = () => {};
  return m;
}
