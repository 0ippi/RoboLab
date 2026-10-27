// Rakentajan 3D-näkymä: osien ja nivelten piirto, valinta hiirellä ja siirtokahvat.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { quat } from './model.js';
import * as Look from '../3d/look.js';

const JOINT_COLORS = { servo: '#ffb86b', wheel: '#5ad1e6', free: '#8a96a8' };

export class Viewport {
  constructor(canvas, callbacks) {
    this.canvas = canvas;
    this.cb = callbacks; // { onPick(kind, id, additive), onTransform(kind, id, obj), onTransformEnd() }
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.antialias !== false });

    this.scene = new THREE.Scene();
    this.shadowSize = Look.setupRenderer(this.renderer, this.scene);
    // Värit RoboLabin teemasta
    const C = { bg: cssColor('var(--bg-2)'), ground: cssColor('var(--surface-2)'), g1: cssColor('var(--border-strong)'), g2: cssColor('var(--border)') };
    this.scene.background = new THREE.Color(C.bg);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 200);
    this.orbit = new OrbitControls(this.camera, canvas);
    this.orbit.enableDamping = true;

    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#2a3542', 1.3));
    const sun = new THREE.DirectionalLight('#ffffff', 2);
    sun.position.set(4, 8, 5);
    sun.castShadow = this.shadowSize > 0;
    sun.shadow.mapSize.set(this.shadowSize || 512, this.shadowSize || 512);
    sun.shadow.bias = -0.0005;
    Object.assign(sun.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5 });
    this.scene.add(sun);
    if (Look.quality() !== 'low') {
      const rim = new THREE.DirectionalLight(cssColor('var(--accent)'), 0.7);
      rim.position.set(-5, 4, -6);
      this.scene.add(rim);
    }

    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.MeshStandardMaterial({ color: C.ground, roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.ground = ground;
    this.grid3d = new THREE.GridHelper(20, 40, C.g1, C.g2);
    this.grid3d.position.y = 0.002;
    this.grid2d = new THREE.GridHelper(20, 40, C.g1, C.g2);
    this.grid2d.rotation.x = Math.PI / 2;
    this.grid2d.position.z = -0.4;
    this.groundLine = new THREE.Mesh(new THREE.BoxGeometry(60, 0.02, 0.6), new THREE.MeshBasicMaterial({ color: C.g1 }));
    this.groundLine.position.y = -0.01;
    this.scene.add(ground, this.grid3d, this.grid2d, this.groundLine);

    this.modelGroup = new THREE.Group();
    this.jointGroup = new THREE.Group();
    this.physGroup = new THREE.Group();
    this.scene.add(this.modelGroup, this.jointGroup, this.physGroup);

    this.gizmo = new TransformControls(this.camera, canvas);
    this.gizmo.setSize(0.8);
    this.gizmo.addEventListener('dragging-changed', (e) => {
      this.orbit.enabled = !e.value;
      if (e.value) this.cb.onTransformStart();
      else this.cb.onTransformEnd();
    });
    this.gizmo.addEventListener('objectChange', () => {
      const o = this.gizmo.object;
      if (o) this.cb.onTransform(o.userData.kind, o.userData.id, o);
    });
    this.scene.add(this.gizmo.getHelper ? this.gizmo.getHelper() : this.gizmo);

    this.bodyObjects = {};
    this.jointObjects = [];
    this.selection = { bodies: [], joint: null };
    this.raycaster = new THREE.Raycaster();
    this.setupPicking();
    this.setDim('3d');
  }

  setDim(dim) {
    this.dim = dim;
    this.ground.visible = dim === '3d';
    this.grid3d.visible = dim === '3d' && settings.showGrid !== false;
    this.grid2d.visible = this.groundLine.visible = dim === '2d';
    this.orbit.enableRotate = dim === '3d';
    this.resetCamera();
  }

  resetCamera() {
    if (this.dim === '2d') {
      this.camera.position.set(0, 1, 6);
      this.orbit.target.set(0, 1, 0);
    } else {
      this.camera.position.set(3.2, 2.4, 4.2);
      this.orbit.target.set(0, 0.6, 0);
    }
    this.orbit.update();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
  }

  // 2D-tilassa ympyrä piirretään kiekkona, jotta se näyttää samalta kuin simulaatiossa.
  geometry(s) { return Look.geometry(s, { dim2d: this.dim === '2d' }); }

  // Muoto samalla ulkoasulla kuin simulaatiossa; materiaali kopioidaan, jotta valinnan korostus koskee vain tätä osaa
  shapeMesh(s, color) {
    const mesh = Look.shapeMesh(s, color, { dim2d: this.dim === '2d' });
    mesh.material = mesh.material.clone();
    mesh.userData.main = true;
    return mesh;
  }

  clear(group) {
    // Vain osakohtaiset (kopioidut) materiaalit vapautetaan; jaetut tyylimateriaalit jäävät käyttöön
    const own = group === this.jointGroup; // nivelmerkeillä on aina omat materiaalit
    group.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (own || o.userData.main || o.userData.marker) o.material?.dispose?.(); });
    group.clear();
  }

  // Rakentaa osien ja nivelten kappaleet mallista. Kutsutaan aina mallin muuttuessa.
  build(model, selection) {
    const attached = this.gizmo.object;
    const attachedKey = attached ? attached.userData.kind + ':' + attached.userData.id : null;
    this.gizmo.detach();
    this.clear(this.modelGroup);
    this.clear(this.jointGroup);
    this.bodyObjects = {};
    this.jointObjects = [];

    for (const b of model.bodies) {
      const g = new THREE.Group();
      g.position.set(...b.pos);
      g.quaternion.copy(quat(b.rot));
      g.userData = { kind: 'body', id: b.id };
      for (const s of b.shapes) {
        const mesh = this.shapeMesh(s, s.color || b.color || '#9fb3c8');
        mesh.position.set(...s.pos);
        mesh.quaternion.copy(quat(s.rot));
        mesh.castShadow = this.shadowSize > 0;
        Object.assign(mesh.userData, { kind: 'body', id: b.id });
        g.add(mesh);
      }
      if (b.id === model.root) {
        // Päärungon tunnus: pieni rengas osan yläpuolella
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 24), new THREE.MeshBasicMaterial({ color: '#ffd166' }));
        ring.rotation.x = Math.PI / 2;
        ring.position.y = 0.05;
        ring.userData = { kind: 'body', id: b.id, marker: true };
        g.add(ring);
        this.rootRing = ring;
      }
      this.modelGroup.add(g);
      this.bodyObjects[b.id] = g;
    }
    if (this.rootRing && this.bodyObjects[model.root]) {
      // Rengas osan yläreunaan
      const box = new THREE.Box3().setFromObject(this.bodyObjects[model.root]);
      this.rootRing.position.y = (box.max.y - this.bodyObjects[model.root].position.y) + 0.08;
    }

    model.joints.forEach((j, i) => {
      const type = j.motor === false ? 'free' : j.lower != null && j.upper != null ? 'servo' : 'wheel';
      const color = JOINT_COLORS[type];
      const mat = new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true });
      const g = new THREE.Group();
      g.position.set(...j.pos);
      g.userData = { kind: 'joint', id: i };
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.06, 16, 12), mat);
      ball.userData = g.userData;
      const axis = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.4, 8), mat);
      axis.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...j.axis).normalize());
      axis.userData = g.userData;
      g.add(ball, axis);
      g.renderOrder = 10;
      ball.renderOrder = axis.renderOrder = 10;
      this.jointGroup.add(g);
      this.jointObjects.push(g);
    });

    this.applySelection(selection);
    if (attachedKey) {
      const [kind, id] = attachedKey.split(':');
      const obj = kind === 'body' ? this.bodyObjects[id] : this.jointObjects[+id];
      if (obj) this.gizmo.attach(obj);
    }
  }

  applySelection(sel) {
    this.selection = sel;
    for (const [id, g] of Object.entries(this.bodyObjects)) {
      const on = sel.bodies.includes(id);
      g.traverse((o) => {
        if (o.isMesh && o.userData.main && o.material.emissive) o.material.emissive = new THREE.Color(on ? '#2c4f8f' : '#000000');
      });
    }
    this.jointObjects.forEach((g, i) => g.scale.setScalar(sel.joint === i ? 1.6 : 1));
  }

  attachGizmo(kind, id, mode) {
    const obj = kind === 'body' ? this.bodyObjects[id] : kind === 'joint' ? this.jointObjects[id] : null;
    if (!obj) { this.gizmo.detach(); return; }
    this.gizmo.attach(obj);
    this.setGizmoMode(kind === 'joint' ? 'translate' : mode);
  }

  setGizmoMode(mode) {
    this.gizmo.setMode(mode);
    const is2d = this.dim === '2d';
    if (mode === 'translate') {
      this.gizmo.showX = true; this.gizmo.showY = true; this.gizmo.showZ = !is2d;
    } else {
      this.gizmo.showX = !is2d; this.gizmo.showY = !is2d; this.gizmo.showZ = true;
    }
  }

  setSnap(enabled, step, angle) {
    this.gizmo.setTranslationSnap(enabled ? step : null);
    this.gizmo.setRotationSnap(enabled ? THREE.MathUtils.degToRad(angle) : null);
  }

  setupPicking() {
    let down = null;
    this.canvas.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', (e) => {
      if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) return; // oli vetäminen, ei klikkaus
      if (this.gizmo.dragging || this.physicsMode) return;
      const r = this.canvas.getBoundingClientRect();
      const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      this.raycaster.setFromCamera(ndc, this.camera);
      // Nivelet ensin, koska ne ovat osien sisällä
      const hitJ = this.raycaster.intersectObjects(this.jointGroup.children, true)[0];
      if (hitJ) { this.cb.onPick('joint', hitJ.object.userData.id, e.shiftKey || e.ctrlKey); return; }
      const hitB = this.raycaster.intersectObjects(this.modelGroup.children, true)[0];
      if (hitB) this.cb.onPick('body', hitB.object.userData.id, e.shiftKey || e.ctrlKey);
      else this.cb.onPick(null, null, false);
    });
  }

  // Mikä osa tai nivel on näytön pisteen kohdalla (hiiren oikean napin valikkoa varten)
  pickAt(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hitJ = this.jointGroup.visible && this.raycaster.intersectObjects(this.jointGroup.children, true)[0];
    if (hitJ) return { kind: 'joint', id: hitJ.object.userData.id };
    const hitB = this.raycaster.intersectObjects(this.modelGroup.children, true)[0];
    return hitB ? { kind: 'body', id: hitB.object.userData.id } : null;
  }

  // Valmiit kuvakulmat: kamera siirretään kohteen ympärillä säilyttäen etäisyys
  setView(name) {
    const dist = Math.max(2, this.camera.position.distanceTo(this.orbit.target));
    const dirs = { iso: [0.6, 0.45, 0.66], front: [0, 0.08, 1], side: [1, 0.08, 0], top: [0, 1, 0.0001] };
    const d = new THREE.Vector3(...(dirs[name] || dirs.iso)).normalize().multiplyScalar(dist);
    this.camera.position.copy(this.orbit.target).add(d);
    this.orbit.update();
  }

  setJointsVisible(on) { this.jointsHidden = !on; this.jointGroup.visible = on && !this.physicsMode; }

  // Painopisteen merkki: pallo ja pystyviiva maahan
  setCom(pos, visible) {
    if (!this.com) {
      const mat = new THREE.MeshBasicMaterial({ color: cssColor('var(--warn)'), depthTest: false, transparent: true });
      this.com = new THREE.Group();
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 12), mat);
      this.comLine = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1, 6), mat);
      this.com.add(ball, this.comLine);
      this.com.renderOrder = 11;
      ball.renderOrder = this.comLine.renderOrder = 11;
      this.scene.add(this.com);
    }
    this.com.visible = !!visible && !!pos && !this.physicsMode;
    if (!pos) return;
    this.com.position.set(...pos);
    const h = Math.max(0.001, pos[1]);
    this.comLine.scale.y = h;
    this.comLine.position.y = -h / 2;
  }

  // Kuvakaappaus PNG:nä (piirretään juuri ennen lukemista, joten erillistä puskuria ei tarvita)
  screenshot() {
    this.gizmo.getHelper && (this.gizmo.getHelper().visible = false);
    this.renderer.render(this.scene, this.camera);
    const url = this.canvas.toDataURL('image/png');
    this.gizmo.getHelper && (this.gizmo.getHelper().visible = true);
    return url;
  }

  focusOn(box) {
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3()).length();
    const dir = this.camera.position.clone().sub(this.orbit.target).normalize();
    // Etäisyys, jolla robotti mahtuu kuvaan myös kapeassa näkymässä
    const fit = size / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov) / 2)) / Math.min(1, this.camera.aspect);
    this.orbit.target.copy(c);
    this.camera.position.copy(c).add(dir.multiplyScalar(Math.max(1.5, fit * 1.15)));
  }

  // ---------- Fysiikkatestin piirto ----------
  // parts: [{ getPose() -> {x,y,z,qx,qy,qz,qw}, shapes, color, bodyRot }]
  showPhysics(on) {
    this.physicsMode = on;
    this.modelGroup.visible = !on;
    this.jointGroup.visible = !on && !this.jointsHidden;
    if (this.com) this.com.visible = this.com.visible && !on;
    if (on) this.gizmo.detach();
    if (!on) this.clear(this.physGroup);
  }

  buildPhysics(bodies) {
    this.clear(this.physGroup);
    this.physObjects = bodies.map((b) => {
      const g = new THREE.Group();
      const inner = new THREE.Group(); // osan oma kierto (muodot), sillä fysiikkakappaleen asento alkaa nollasta
      inner.quaternion.copy(quat(b.rot));
      for (const s of b.shapes) {
        const mesh = this.shapeMesh(s, s.color || b.color || '#9fb3c8');
        mesh.position.set(...s.pos);
        mesh.quaternion.copy(quat(s.rot));
        mesh.castShadow = this.shadowSize > 0;
        inner.add(mesh);
      }
      g.add(inner);
      this.physGroup.add(g);
      return g;
    });
  }

  updatePhysics(poses) {
    poses.forEach((p, i) => {
      const g = this.physObjects[i];
      if (!g) return;
      g.position.set(p.x, p.y, p.z);
      g.quaternion.set(p.qx, p.qy, p.qz, p.qw);
    });
  }

  render() {
    this.orbit.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Vapauttaa WebGL-kontekstin, kun työkalusta poistutaan
  dispose() {
    this.gizmo.detach();
    this.clear(this.modelGroup); this.clear(this.jointGroup); this.clear(this.physGroup);
    this.gizmo.dispose(); this.orbit.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
