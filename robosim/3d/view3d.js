// 3D-näkymä (Three.js). Kamera seuraa parasta robottia; hiirellä voi pyörittää ja zoomata.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { shapeTransform } from './robot3d.js';
import * as Look from './look.js';

const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();

export class View3D {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.antialias !== false });

    // Taustan ja maan värit RoboLabin teemasta
    const bg = cssColor('var(--bg-2)');
    this.theme = { ground: cssColor('var(--surface-2)'), block: cssColor('var(--hover)'), grid1: cssColor('var(--border-strong)'), grid2: cssColor('var(--border)'), wire: cssColor('var(--text-3)'), accent: cssColor('var(--accent)'), target: cssColor('var(--warn)') };
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(bg);
    this.scene.fog = new THREE.Fog(bg, 25, 70);
    this.shadowSize = Look.setupRenderer(this.renderer, this.scene);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 200);
    this.camera.position.set(-4, 3.5, 6);
    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.target.set(0, 0.6, 0);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.controls.minDistance = 1.5;
    this.controls.maxDistance = 40;

    this.scene.add(new THREE.HemisphereLight('#cfe3ff', '#2a3542', 1.2));
    const sun = new THREE.DirectionalLight('#ffffff', 2.2);
    sun.position.set(6, 12, 4);
    sun.castShadow = this.shadowSize > 0;
    sun.shadow.mapSize.set(this.shadowSize || 512, this.shadowSize || 512);
    sun.shadow.bias = -0.0005;
    const sc = sun.shadow.camera;
    sc.left = -8; sc.right = 8; sc.top = 8; sc.bottom = -8; sc.near = 1; sc.far = 40;
    this.scene.add(sun, sun.target);
    this.sun = sun;
    // Takavalo korostaa muotojen reunoja (ei kevyessä tilassa)
    if (Look.quality() !== 'low') {
      const rim = new THREE.DirectionalLight(this.theme.accent, 0.8);
      rim.position.set(-6, 5, -8);
      this.scene.add(rim);
    }

    this.target = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.35, 0.04, 24),
      new THREE.MeshBasicMaterial({ color: this.theme.target, transparent: true, opacity: 0.8 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.2, 8), new THREE.MeshBasicMaterial({ color: this.theme.target }));
    pole.position.y = 0.6;
    this.target.add(pole);
    this.scene.add(this.target);

    this.terrainGroup = new THREE.Group();
    this.robotGroup = new THREE.Group();
    // Anturipisteet (maaston korkeusmittaus edessä) ja omat reittipisteet
    this.scanGroup = new THREE.Group();
    this.wpGroup = new THREE.Group();
    this.scene.add(this.terrainGroup, this.robotGroup, this.scanGroup, this.wpGroup);
    this.wpKey = '';
    this.race = null;
    this.materials = new Map();
    this.episode = null;
    this.follow = true;
    this.lastFocus = null;
    this.controls.addEventListener('start', () => { this.userMoving = true; });
    this.controls.addEventListener('end', () => { this.userMoving = false; });
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
    this.camera.aspect = Math.max(1, r.width) / Math.max(1, r.height);
    this.camera.updateProjectionMatrix();
  }

  geometry(s) { return Look.geometry(s); }

  clearGroup(g) {
    g.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    g.clear();
  }

  // Rakentaa maaston ja robottien kappaleet uutta episodia varten. race: kisaajien värit (kaikki näkyvät täysin)
  setEpisode(ep, race) {
    const sameTerrain = this.episode && this.episode.cfg.terrain === ep.cfg.terrain && this.episode.cfg.seed === ep.cfg.seed;
    this.episode = ep;
    if (!sameTerrain) { this.buildTerrain(ep.terrain); this.wpKey = ''; }
    this.clearGroup(this.robotGroup);
    this.race = race || null;
    // Geometriat jaetaan kaikkien robottien kesken.
    const geoms = ep.cfg.model.bodies.map((b) => b.shapes.map((s) => this.geometry(s)));
    ep.agents.forEach((a) => {
      const groups = a.robot.parts.map((part, bi) => {
        const g = new THREE.Group();
        part.spec.shapes.forEach((s, si) => {
          const color = s.color || part.spec.color || '#9fb3c8';
          // Täysi ulkoasu (yksityiskohdat ja ääriviivat) piilotetaan, kun robotti näkyy haaleana taustalla
          const mesh = Look.shapeMesh(s, color, { geo: geoms[bi][si] });
          const { pos, q } = shapeTransform(part.spec, s);
          mesh.position.copy(pos);
          mesh.quaternion.copy(q);
          g.add(mesh);
        });
        this.robotGroup.add(g);
        return g;
      });
      a.view = groups;
      // Roottorien ilmavirta: kartio roottorin kohdalla, osoittaa työntövoimaa vastakkaiseen suuntaan
      a.thrustViews = (a.robot.thrusters || []).map((t) => {
        const cone = Look.thrustCone();
        cone.position.copy(t.local);
        cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), t.dir);
        groups[a.robot.parts.indexOf(t.part)].add(cone);
        return { cone, t };
      });
      this.setFocusStyle(a, !!this.race);
    });
    this.lastFocus = null;
    // Kisassa jokaisen robotin yllä on oman värinen merkki (kartio kärki alaspäin)
    this.raceMarks = (this.race || []).map((color) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 16), new THREE.MeshBasicMaterial({ color }));
      m.rotation.x = Math.PI;
      this.robotGroup.add(m);
      return m;
    });
  }

  // Ruudun piste maastoon: reittipisteiden asettaminen klikkaamalla. Palauttaa { x, y, z } tai null.
  pick(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    const ray = new THREE.Raycaster();
    this.camera.updateMatrixWorld();
    ray.setFromCamera(ndc, this.camera);
    const hit = ray.intersectObjects(this.terrainGroup.children, false).find((h) => h.object.isMesh && !h.object.material.wireframe);
    if (hit) return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    const p = new THREE.Vector3();
    return ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), p) ? { x: p.x, y: 0, z: p.z } : null;
  }

  // Omat reittipisteet: tolpat ja niitä yhdistävä viiva. Rakennetaan uudelleen vain, kun pisteet muuttuvat.
  drawWaypoints(list) {
    const key = list ? JSON.stringify(list.map((p) => [p.x, p.y, p.z].map((v) => +v.toFixed(2)))) : '';
    if (key === this.wpKey) return;
    this.wpKey = key;
    this.clearGroup(this.wpGroup);
    if (!list?.length) return;
    const mat = new THREE.MeshBasicMaterial({ color: this.theme.target });
    for (const p of list) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 8), mat);
      pole.position.set(p.x, p.y + 0.35, p.z);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 8), mat);
      ball.position.set(p.x, p.y + 0.72, p.z);
      this.wpGroup.add(pole, ball);
    }
    const pts = [...list, list[0]].map((p) => new THREE.Vector3(p.x, p.y + 0.05, p.z));
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),
      new THREE.LineDashedMaterial({ color: this.theme.target, dashSize: 0.25, gapSize: 0.18, transparent: true, opacity: 0.7 }));
    line.computeLineDistances();
    this.wpGroup.add(line);
  }

  // Maaston korkeusanturin mittauspisteet pieninä palloina
  drawScan(points) {
    while (this.scanGroup.children.length < (points?.length || 0)) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: this.theme.target }));
      this.scanGroup.add(m);
    }
    this.scanGroup.children.forEach((m, i) => {
      const p = points?.[i];
      m.visible = !!p;
      if (p) m.position.set(p.x, p.y + 0.03, p.z);
    });
  }

  buildTerrain(t) {
    this.clearGroup(this.terrainGroup);
    // Maa hieman taustaa vaaleampi, jotta se erottuu myös tummassa teemassa
    const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(this.theme.ground).lerp(new THREE.Color('#ffffff'), 0.12), roughness: 0.95 });
    const { X0, X1, Z0, Z1 } = t.bounds;
    if (t.mesh) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(t.mesh.verts, 3));
      geo.setIndex(new THREE.BufferAttribute(t.mesh.idx, 1));
      geo.computeVertexNormals();
      const m = new THREE.Mesh(geo, groundMat);
      m.receiveShadow = true;
      this.terrainGroup.add(m);
      const wire = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: this.theme.wire, wireframe: true, transparent: true, opacity: 0.18 }));
      this.terrainGroup.add(wire);
    } else {
      const plane = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, Z1 - Z0), groundMat);
      plane.rotation.x = -Math.PI / 2;
      plane.position.set((X0 + X1) / 2, 0, 0);
      plane.receiveShadow = true;
      const grid = new THREE.GridHelper(X1 - X0, X1 - X0, this.theme.grid1, this.theme.grid2);
      grid.position.set((X0 + X1) / 2, 0.005, 0);
      grid.visible = settings.showGrid !== false;
      this.terrainGroup.add(plane, grid);
      const boxMat = new THREE.MeshStandardMaterial({ color: this.theme.block, roughness: 0.9 });
      if (t.boxes.length > 120) {
        // Satoja esteitä tai porraskehiä: yksi instanssoitu verkko (yksi piirtokutsu) yksittäisten verkkojen sijaan
        const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), boxMat, t.boxes.length);
        const m4 = new THREE.Matrix4();
        t.boxes.forEach((b, i) => inst.setMatrixAt(i, m4.makeScale(b.w, b.h, b.d).setPosition(b.x, b.y, b.z)));
        inst.castShadow = inst.receiveShadow = true;
        this.terrainGroup.add(inst);
      } else {
        for (const b of t.boxes) {
          const m = new THREE.Mesh(Look.geometry({ type: 'box', size: [b.w, b.h, b.d], round: 0.08 }), boxMat);
          m.position.set(b.x, b.y, b.z);
          m.castShadow = m.receiveShadow = true;
          this.terrainGroup.add(m);
        }
      }
    }
    // Aloitusmerkki
    const start = new THREE.Mesh(new THREE.RingGeometry(0.5, 0.56, 32), new THREE.MeshBasicMaterial({ color: this.theme.accent, transparent: true, opacity: 0.5 }));
    start.rotation.x = -Math.PI / 2;
    start.position.y = 0.01;
    this.terrainGroup.add(start);
  }

  setFocusStyle(a, focused) {
    for (const g of a.view) {
      for (const mesh of g.children) {
        if (!mesh.userData.mat) continue; // roottorikartio
        mesh.material = focused ? mesh.userData.mat : Look.material(mesh.userData.color, { ghost: true });
        mesh.castShadow = focused && this.shadowSize > 0;
        for (const c of mesh.children) c.visible = focused;
      }
    }
    for (const tv of a.thrustViews || []) tv.cone.visible = focused;
  }

  // opts: { focus, showAll, follow, snap, showTarget, lerp, scan, orbit, waypoints }
  draw(opts) {
    const ep = this.episode;
    if (ep) {
      const focus = opts.focus, race = this.race;
      if (!race && focus !== this.lastFocus) {
        if (this.lastFocus != null && ep.agents[this.lastFocus]) this.setFocusStyle(ep.agents[this.lastFocus], false);
        if (focus >= 0) this.setFocusStyle(ep.agents[focus], true);
        this.lastFocus = focus;
      }
      const L = opts.lerp;
      ep.agents.forEach((a, i) => {
        const visible = a.robot.parts.length > 0 && (race || opts.showAll || i === focus);
        a.view.forEach((g, bi) => {
          g.visible = visible;
          if (!visible) return;
          const body = a.robot.parts[bi].body;
          const p = body.translation(), r = body.rotation();
          const q = L && L.prev.get(body);
          if (q) {
            // Hidastettu uusinta: liike tasoitetaan kahden fysiikka-askeleen välillä
            const k = L.alpha;
            g.position.set(q.p.x + (p.x - q.p.x) * k, q.p.y + (p.y - q.p.y) * k, q.p.z + (p.z - q.p.z) * k);
            g.quaternion.slerpQuaternions(_qa.set(q.q.x, q.q.y, q.q.z, q.q.w), _qb.set(r.x, r.y, r.z, r.w), k);
          } else {
            g.position.set(p.x, p.y, p.z);
            g.quaternion.set(r.x, r.y, r.z, r.w);
          }
        });
      });
      (this.raceMarks || []).forEach((m, i) => {
        const a = ep.agents[i];
        m.visible = !!a && a.robot.parts.length > 0;
        if (!m.visible) return;
        let top = -Infinity;
        for (const part of a.robot.parts) top = Math.max(top, part.body.translation().y);
        const p = ep.positionOf(a);
        m.position.set(p.x, top + 0.75, p.z);
      });
      this.drawWaypoints(opts.showTarget && opts.waypoints?.length ? ep.targets : null);
      this.drawScan(opts.scan);

      if (focus >= 0) {
        const fa = ep.agents[focus];
        for (const tv of fa.thrustViews || []) tv.cone.scale.set(1, 0.12 + tv.t.level * 0.55, 1);
        const p = ep.positionOf(fa);
        // Kamera liikkuu robotin mukana säilyttäen käyttäjän valitseman kulman.
        if (opts.follow && !this.userMoving) {
          // Jos robotti on karannut kauas, kamera hyppää sen kohdalle.
          const far = Math.hypot(p.x - this.controls.target.x, p.z - this.controls.target.z) > 5;
          const k = opts.snap || far ? 1 : 0.1;
          const dx = (p.x - this.controls.target.x) * k;
          const dy = (p.y - 0.2 - this.controls.target.y) * k;
          const dz = (p.z - this.controls.target.z) * k;
          this.controls.target.x += dx; this.controls.target.y += dy; this.controls.target.z += dz;
          this.camera.position.x += dx; this.camera.position.y += dy; this.camera.position.z += dz;
        }
        // Kiertävä kamera: hidas kierros robotin ympäri (uusinnassa), käyttäjän veto keskeyttää
        if (opts.orbit && !this.userMoving) {
          const t = this.controls.target, cp = this.camera.position;
          const dx = cp.x - t.x, dz = cp.z - t.z, c = Math.cos(0.004), s = Math.sin(0.004);
          cp.x = t.x + dx * c - dz * s;
          cp.z = t.z + dx * s + dz * c;
        }
        this.sun.position.set(p.x + 6, p.y + 12, p.z + 4);
        this.sun.target.position.set(p.x, p.y, p.z);
        const tg = ep.targetOf(fa);
        this.target.visible = !!opts.showTarget;
        this.target.position.set(tg.x, tg.y + 0.02, tg.z);
      }
    }
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  // Vapauttaa WebGL-kontekstin, kun työkalusta poistutaan (selaimissa kontekstien määrä on rajattu)
  dispose() {
    this.clearGroup(this.terrainGroup);
    this.clearGroup(this.robotGroup);
    this.clearGroup(this.scanGroup);
    this.clearGroup(this.wpGroup);
    for (const m of this.materials.values()) m.dispose();
    this.controls.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
  }
}
