"use strict";

/* Varjostettu 3D-näkymä URDF-malleille (Three.js). Kirjasto ladataan vasta tarvittaessa; jos lataus
   epäonnistuu (ei verkkoa), kutsuja palaa rautalankanäkymään. Ohjaus vastaa View3:a: vedä = kierrä,
   rulla = zoomaa, tuplaklikkaus / 0 = palauta, nuolinäppäimet = kierrä. */
const ThreeView = (() => {
  const URL = "three"; // index.html:n import map: sama Three.js-versio kuin neuroverkkosimulaatioissa ja rakentajissa
  let THREE = null, loading = null;

  function load() {
    if (THREE) return Promise.resolve(THREE);
    loading ||= import(URL).then((m) => (THREE = m)).catch((e) => { loading = null; throw e; });
    return loading;
  }

  // Rivimuotoinen 4×4 (Kin/TF) → THREE.Matrix4
  const toM4 = (T) => new THREE.Matrix4().set(...T[0], ...T[1], ...T[2], ...T[3]);

  class Scene {
    // opts: { up, az, el, onDown(sx, sy) → true jos kohde napattiin, onDrag(sx, sy), onEnd(), hoverable(sx, sy) }
    constructor(canvas, opts = {}) {
      const { up = "Z" } = opts;
      this.opts = opts;
      this.canvas = canvas;
      Scene.last = this; // vianetsintää varten (selaimen konsoli)
      this.renderer = new THREE.WebGLRenderer({ canvas, antialias: settings.antialias !== false, alpha: true });
      this.renderer.setPixelRatio(window.devicePixelRatio || 1);
      this.scene = new THREE.Scene();
      this.camera = new THREE.PerspectiveCamera(40, 1, 0.005, 200);
      // Robotiikan maailma on Z-ylös; Three.js on Y-ylös, joten malli käännetään juuriryhmässä
      this.root = new THREE.Group();
      if (up !== "Y") this.root.rotation.x = -Math.PI / 2;
      this.scene.add(this.root);
      // Heikompi ympäristövalo ja vahvempi aurinko, jotta varjot erottuvat selvästi
      this.scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 0.6));
      const sun = new THREE.DirectionalLight(0xffffff, 2.4);
      sun.position.set(2, 4, 3);
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.bias = -0.0005;
      sun.shadow.normalBias = 0.01;
      this.scene.add(sun, sun.target);
      this.sun = sun;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      // Varjon vastaanottava lattia (z = 0): kiinteä pinta, jotta varjo erottuu myös tummassa teemassa
      const floor = new THREE.Color(cssColor("var(--surface-2)")).lerp(new THREE.Color(0xffffff), 0.12);
      this.ground = new THREE.Mesh(new THREE.CircleGeometry(0.5, 64), new THREE.MeshStandardMaterial({ color: floor, roughness: 1, metalness: 0, transparent: true, opacity: 0.82, depthWrite: false }));
      // Hieman läpikuultava: lattian alle menevät osat näkyvät himmeinä eivätkä katoa kokonaan
      this.ground.position.z = -0.0005; // hieman ruudukon alla, ettei viivat välky
      this.ground.receiveShadow = true;
      this.ground.visible = false;
      this.root.add(this.ground);
      const fill = new THREE.DirectionalLight(0xffffff, 0.5);
      fill.position.set(-3, 2, -2);
      this.scene.add(fill);

      this.home = { az: opts.az ?? 55, el: opts.el ?? 25, zoom: opts.zoom ?? 1 };
      this.az = this.home.az; this.el = this.home.el; this.zoom = this.home.zoom; this.extent = 0.5; this.fixedExtent = null;
      this.target = new THREE.Vector3();
      this.pan = new THREE.Vector3(); // käyttäjän siirtämä kiertokeskipiste (Three.js-koordinaatit)
      this.meshes = []; this.frames = []; this.model = null;
      // Dynaamiset primitiivit (robottikäsivarret): uudelleenkäytettävät kappaleet, jotta liukusäätimen veto on sujuvaa
      this.pool = { cyl: [], sph: [], box: [], axes: [], line: [] };
      this.used = { cyl: 0, sph: 0, box: 0, axes: 0, line: 0 };
      this.geo = { cyl: new THREE.CylinderGeometry(1, 1, 1, 28), sph: new THREE.SphereGeometry(1, 28, 18), box: new THREE.BoxGeometry(1, 1, 1) };
      this.mats = new Map();
      this._bindInput();
      this.ro = new ResizeObserver(() => this.render());
      this.ro.observe(canvas);
    }

    _bindInput() {
      const cv = this.canvas, o = this.opts;
      let drag = null, lx = 0, ly = 0;
      const pos = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
      // Vasen = kierrä (tai raahaa kohdetta), oikea / keski / Shift+vasen = siirrä kiertokeskistä (panorointi)
      cv.addEventListener("pointerdown", (e) => {
        const [x, y] = pos(e);
        const pan = e.button === 1 || e.button === 2 || (e.button === 0 && e.shiftKey);
        drag = pan ? "pan" : o.onDown && o.onDown(x, y, e) ? "target" : "orbit";
        lx = e.clientX; ly = e.clientY;
        cv.setPointerCapture(e.pointerId);
        cv.style.cursor = drag === "orbit" ? "move" : "grabbing";
        if (pan) e.preventDefault();
      });
      cv.addEventListener("contextmenu", (e) => e.preventDefault());
      cv.addEventListener("pointermove", (e) => {
        if (!drag) { if (o.hoverable) { const [x, y] = pos(e); cv.style.cursor = o.hoverable(x, y) ? "grab" : ""; } return; }
        if (drag === "target") { const [x, y] = pos(e); o.onDrag(x, y, e); return; }
        const dx = e.clientX - lx, dy = e.clientY - ly;
        lx = e.clientX; ly = e.clientY;
        if (drag === "pan") {
          // Siirto kameran tasossa: pikselin koko maailmassa kiertokeskipisteen etäisyydellä
          this._camera();
          const dist = this.camera.position.distanceTo(this.target);
          const k = (2 * dist * Math.tan((this.camera.fov * Math.PI) / 360)) / Math.max(1, cv.clientHeight);
          const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0);
          const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1);
          this.pan.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
        } else {
          this.az -= dx * 0.4;
          this.el = Math.max(-89, Math.min(89, this.el + dy * 0.4));
        }
        this.render();
      });
      const end = () => { if (drag === "target") o.onEnd?.(); drag = null; cv.style.cursor = ""; };
      cv.addEventListener("pointerup", end);
      cv.addEventListener("pointercancel", end);
      cv.addEventListener("wheel", (e) => { e.preventDefault(); this.zoom = Math.max(0.2, Math.min(8, this.zoom * Math.exp(-e.deltaY * 0.0015))); this.render(); }, { passive: false });
      cv.addEventListener("dblclick", () => this.reset());
      if (!cv.hasAttribute("tabindex")) cv.tabIndex = 0;
      cv.setAttribute("role", "img");
      cv.addEventListener("keydown", (e) => {
        const step = e.shiftKey ? 2 : 10;
        if (e.key === "ArrowLeft") this.az += step;
        else if (e.key === "ArrowRight") this.az -= step;
        else if (e.key === "ArrowUp") this.el = Math.min(89, this.el + step);
        else if (e.key === "ArrowDown") this.el = Math.max(-89, this.el - step);
        else if (e.key === "+" || e.key === "=") this.zoom = Math.min(8, this.zoom * 1.2);
        else if (e.key === "-") this.zoom = Math.max(0.2, this.zoom / 1.2);
        else if (e.key === "0" || e.key === "Home") { this.reset(); e.preventDefault(); return; }
        else return;
        e.preventDefault(); e.stopPropagation();
        this.render();
      });
    }

    reset() { this.az = this.home.az; this.el = this.home.el; this.zoom = this.home.zoom; this.pan.set(0, 0, 0); this.render(); }
    setView(az, el) { this.az = az; this.el = el; this.render(); }
    setExtent(e) { this.fixedExtent = e; this.extent = e; }

    /* ----- Dynaamiset primitiivit (robotin koordinaatisto, Z ylös) ----- */
    _mat(color, opts = {}) {
      const key = color + (opts.emissive ? "e" : "") + (opts.opacity ?? 1);
      if (!this.mats.has(key)) {
        this.mats.set(key, new THREE.MeshStandardMaterial({
          color: new THREE.Color(color), roughness: 0.45, metalness: 0.2,
          emissive: opts.emissive ? new THREE.Color(color) : 0x000000, emissiveIntensity: opts.emissive ? 0.35 : 0,
          transparent: (opts.opacity ?? 1) < 1, opacity: opts.opacity ?? 1,
        }));
      }
      return this.mats.get(key);
    }
    _take(kind) {
      let m = this.pool[kind][this.used[kind]];
      if (!m) {
        m = kind === "axes" ? new THREE.AxesHelper(1)
          : kind === "line" ? new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial())
          : new THREE.Mesh(this.geo[kind], this._mat("#888888"));
        m.matrixAutoUpdate = false;
        this.root.add(m);
        this.pool[kind].push(m);
      }
      this.used[kind]++;
      m.visible = true;
      return m;
    }
    beginPrims() { for (const k in this.used) this.used[k] = 0; }
    // Sylinteri pisteestä p0 pisteeseen p1
    cyl(p0, p1, r, color, opts) {
      const a = new THREE.Vector3(...p0), b = new THREE.Vector3(...p1);
      const d = b.clone().sub(a), len = d.length();
      if (len < 1e-6) return;
      const m = this._take("cyl");
      m.material = this._mat(color, opts);
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
      m.matrix.compose(a.add(b).multiplyScalar(0.5), q, new THREE.Vector3(r, len, r));
    }
    sphere(p, r, color, opts) {
      const m = this._take("sph");
      m.material = this._mat(color, opts);
      m.matrix.compose(new THREE.Vector3(...p), new THREE.Quaternion(), new THREE.Vector3(r, r, r));
    }
    // Laatikko paikallisessa koordinaatistossa T (4×4)
    box(T, size, color, opts) {
      const m = this._take("box");
      m.material = this._mat(color, opts);
      m.matrix.copy(toM4(T)).multiply(new THREE.Matrix4().makeScale(...size));
    }
    axes(T, len) {
      const m = this._take("axes");
      m.matrix.copy(toM4(T)).multiply(new THREE.Matrix4().makeScale(len, len, len));
    }
    line(points, color, opacity = 1) {
      const m = this._take("line");
      m.geometry.setFromPoints(points.map((p) => new THREE.Vector3(...p)));
      m.material.color.set(color);
      m.material.transparent = opacity < 1; m.material.opacity = opacity;
    }
    endPrims({ shadows = false } = {}) {
      for (const k in this.pool) this.pool[k].slice(this.used[k]).forEach((m) => (m.visible = false));
      this._shadows(shadows);
      this._grid();
      this.render();
    }

    /* ----- Näyttö ↔ maailma (kohteen raahaus) ----- */
    _camera() {
      const cv = this.canvas, W = cv.clientWidth, H = cv.clientHeight;
      this.camera.aspect = W / Math.max(1, H);
      const r = (d) => (d * Math.PI) / 180;
      // Kapeassa (pystysuuntaisessa) näkymässä vaakasuora näkökenttä on pieni: loitonnetaan, jotta malli mahtuu
      const dist = (this.extent * 2.2 * Math.max(1, 1 / this.camera.aspect)) / this.zoom;
      this.target.set(0, this.opts.lift ?? this.extent * 0.15, 0).add(this.pan);
      this.camera.position.set(
        this.target.x + dist * Math.cos(r(this.el)) * Math.cos(r(this.az)),
        this.target.y + dist * Math.sin(r(this.el)),
        this.target.z + dist * Math.cos(r(this.el)) * Math.sin(r(this.az)));
      this.camera.lookAt(this.target);
      this.camera.near = dist / 100; this.camera.far = dist * 20;
      this.camera.updateProjectionMatrix();
      this.camera.updateMatrixWorld();
      this.root.updateMatrixWorld();
    }
    toScreen(p) {
      this._camera();
      const v = this.root.localToWorld(new THREE.Vector3(...p)).project(this.camera);
      return [((v.x + 1) / 2) * this.canvas.clientWidth, ((1 - v.y) / 2) * this.canvas.clientHeight];
    }
    // Näytön piste → robotin koordinaatiston piste tasolla z = h
    fromScreen(sx, sy, h = 0) {
      this._camera();
      const ndc = new THREE.Vector2((sx / this.canvas.clientWidth) * 2 - 1, -(sy / this.canvas.clientHeight) * 2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, this.camera);
      const inv = this.root.matrixWorld.clone().invert();
      const o = ray.ray.origin.clone().applyMatrix4(inv);
      const d = ray.ray.direction.clone().transformDirection(inv);
      if (Math.abs(d.z) < 0.05) return null; // katse lähes tason suuntainen
      const t = (h - o.z) / d.z;
      return t > 0 ? [o.x + t * d.x, o.y + t * d.y, h] : null;
    }

    // Rakentaa mallin geometriat uudelleen vain, kun malli vaihtuu
    setModel(model) {
      if (model === this.model) return;
      this.model = model;
      for (const m of [...this.meshes, ...this.frames]) {
        this.root.remove(m.obj);
        m.obj.traverse?.((o) => { o.geometry?.dispose(); o.material?.dispose?.(); });
      }
      this.meshes = []; this.frames = [];
      const accent = cssColor("var(--accent)");
      for (const link of Object.values(model.links)) {
        for (const vis of link.visuals) {
          const g = vis.geom;
          if (!g) continue;
          let geo;
          if (g.type === "box") geo = new THREE.BoxGeometry(...g.size);
          else if (g.type === "cylinder") { geo = new THREE.CylinderGeometry(g.radius, g.radius, g.length, 32); geo.rotateX(Math.PI / 2); } // URDF: akseli z
          else if (g.type === "sphere") geo = new THREE.SphereGeometry(g.radius, 32, 16);
          else geo = new THREE.OctahedronGeometry(0.015); // mesh-tiedostoja ei ladata: merkki paikan kohdalle
          const rgba = vis.rgba || null;
          const mat = new THREE.MeshStandardMaterial({
            color: rgba ? new THREE.Color(rgba[0], rgba[1], rgba[2]) : new THREE.Color(accent),
            roughness: 0.55, metalness: 0.15,
            transparent: !!rgba && rgba[3] < 1, opacity: rgba ? rgba[3] : 1,
            wireframe: g.type === "mesh",
          });
          const mesh = new THREE.Mesh(geo, mat);
          mesh.matrixAutoUpdate = false;
          this.root.add(mesh);
          this.meshes.push({ obj: mesh, link: link.name, vis });
        }
        const axes = new THREE.AxesHelper(1);
        axes.matrixAutoUpdate = false;
        this.root.add(axes);
        this.frames.push({ obj: axes, link: link.name });
      }
    }

    // Päivittää linkkien asennot (T: linkin nimi → maailmamuunnos) ja koordinaatistojen näkyvyyden
    update(T, { showFrames = true, showVisual = true, shadows = false } = {}) {
      const pts = Object.values(T).map((M) => [M[0][3], M[1][3], M[2][3]]);
      this.extent = this.fixedExtent ?? Math.max(0.15, ...pts.map((p) => Math.hypot(...p))) * 1.5;
      for (const m of this.meshes) {
        const L = T[m.link];
        m.obj.visible = !!L && showVisual;
        if (L) m.obj.matrix.copy(toM4(Kin.mul(L, TF.fromXyzRpy(m.vis.xyz, m.vis.rpy))));
      }
      this._shadows(shadows);
      const s = this.extent * 0.07;
      for (const f of this.frames) {
        const L = T[f.link];
        f.obj.visible = !!L && showFrames;
        if (L) f.obj.matrix.copy(toM4(L)).multiply(new THREE.Matrix4().makeScale(s, s, s));
      }
      this._grid();
      this.render();
    }

    // Varjot: aurinko seuraa mallin kokoa, jotta varjokartan tarkkuus riittää pienillekin roboteille
    _shadows(on) {
      const e = this.extent;
      if (this.renderer.shadowMap.enabled !== on) {
        this.renderer.shadowMap.enabled = on;
        for (const m of this.meshes) m.obj.material.needsUpdate = true; // materiaalit käännetään uudelleen
        this.ground.material.needsUpdate = true;
      }
      this.sun.castShadow = on;
      this.ground.visible = on;
      for (const m of this.meshes) { m.obj.castShadow = on; m.obj.receiveShadow = on; }
      for (const k of ["cyl", "sph", "box"]) for (const m of this.pool[k]) { m.castShadow = on; m.receiveShadow = on; }
      if (on) for (const mat of this.mats.values()) mat.needsUpdate = true;
      this.ground.scale.set(e * 36, e * 36, 1); // ulottuu horisonttiin asti, ettei reuna näy
      // Valo vasemmalta takaa ja ylhäältä, jolloin varjot lankeavat oletuskameran suuntaan eivätkä jää kappaleiden taakse
      this.sun.position.set(-e * 1.6, e * 3, -e * 0.6);
      const cam = this.sun.shadow.camera;
      cam.left = cam.bottom = -e * 1.5; cam.right = cam.top = e * 1.5;
      cam.near = e * 0.05; cam.far = e * 12;
      cam.updateProjectionMatrix();
    }

    _grid() {
      const size = Math.ceil(this.extent * 2 / 0.1) * 0.1;
      if (this.grid && this.gridSize === size) return;
      if (this.grid) { this.scene.remove(this.grid); this.grid.geometry.dispose(); }
      const c = new THREE.Color(cssColor("var(--border-strong)"));
      this.grid = new THREE.GridHelper(size, Math.round(size / 0.1), c, c);
      this.grid.material.transparent = true; this.grid.material.opacity = 0.6;
      this.grid.visible = settings.showGrid !== false;
      this.gridSize = size;
      this.scene.add(this.grid);
    }

    render() {
      if (this._raf) return;
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        const cv = this.canvas, W = cv.clientWidth, H = cv.clientHeight;
        if (!W || !H) return;
        this.renderer.setSize(W, H, false);
        this._camera(); // kamera kiertää mallin keskikohtaa (Three.js-koordinaatit, Y ylös)
        this.renderer.render(this.scene, this.camera);
      });
    }

    dispose() {
      cancelAnimationFrame(this._raf);
      this.ro.disconnect();
      this.setModel({ links: {} });
      this.renderer.dispose();
    }
  }

  return { load, Scene, isLoaded: () => !!THREE };
})();
