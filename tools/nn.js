"use strict";

/* Neuroverkkosimulaatiot 2D ja 3D (RoboSim, sovitettu RoboLabiin). Robotin aivot ovat pieni neuroverkko,
   joka oppii evoluutiostrategialla (ES) tai geneettisellä algoritmilla (GA). Sama käyttöliittymä palvelee
   molempia: ero on vain taustassa (2D: planck.js + canvas, 3D: Rapier + Three.js).

   Tallennus projektiin:  nnXd       = asetukset (kumottavissa Ctrl+Z:lla)
                          nnXdBrain  = opitut painot ja historia (ei kumota, tallennetaan joka sukupolven jälkeen)
                          nnXdStats  = lyhyt tilanne avustajalle ja kursseille */
(() => {
  const BRAIN_FORMAT = { "2d": "robosim-brain-v1", "3d": "robosim3d-brain-v1" };
  const MAX_SPEED = 31; // liukusäätimen ääriarvo = maksiminopeus
  const RUN_MAX = 8, RACE_MAX = 5, WAYPOINT_MAX = 12;
  const REPLAY_RATES = [0.1, 0.25, 0.5, 1, 2];
  // Saavutukset (achievements.js): ilmoitus, kun käyttäjä kokeilee ominaisuutta ensimmäistä kertaa
  const achieve = (id) => window.Achievements?.unlock(id);

  // Lyhyt tiiviste (FNV-1a): kisaan ja vertailuun kelpaavat vain saman robotin aivot
  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36);
  }

  /* ===== Jakolinkki =====
     Robotti, tehtävä ja opitut aivot pakataan linkin #-osaan: selain ei lähetä sitä palvelimelle, joten mitään
     ei tallenneta mihinkään. Painot 16-bittisinä kokonaislukuina (suhteellinen tarkkuus 1/32767), koko pakattuna. */
  const SHARE_VERSION = 1, SHARE_MAX_CHARS = 300000, SHARE_MAX_BYTES = 4e6;
  const QR_URL = "https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.js";
  const PUBLIC_URL = "https://0ippi.github.io/RoboLab/index.html";
  const b64url = (bytes) => {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  };
  const unb64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
  // Virta läpi (pakkaus tai purku); purettaessa koko rajataan, ettei pieni linkki voi paisua valtavaksi
  async function pipeBytes(bytes, stream, limit = Infinity) {
    const reader = new Blob([bytes]).stream().pipeThrough(stream).getReader();
    const parts = [];
    let total = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > limit) { reader.cancel(); throw new Error("size"); }
      parts.push(value);
    }
    const out = new Uint8Array(total);
    let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  // bits8: QR-koodiin mahtuva versio, jossa painot ovat 8-bittisiä ja jokaisella kerroksella on oma mittakaava
  async function encodeShare(meta, params, bits8 = false) {
    let body, extra;
    if (bits8) {
      const L = meta.layers, q = new Int8Array(params.length), scales = [];
      let k = 0;
      for (let i = 1; i < L.length; i++) {
        const n = L[i] * (L[i - 1] + 1);
        let max = 1e-9;
        for (let j = k; j < k + n; j++) max = Math.max(max, Math.abs(params[j]));
        for (let j = k; j < k + n; j++) q[j] = Math.round((params[j] / max) * 127);
        scales.push(max / 127);
        k += n;
      }
      body = new Uint8Array(q.buffer);
      extra = { bits: 8, scales };
    } else {
      let max = 1e-9;
      for (const v of params) max = Math.max(max, Math.abs(v));
      const q = new Int16Array(params.length);
      for (let i = 0; i < params.length; i++) q[i] = Math.round((params[i] / max) * 32767);
      body = new Uint8Array(q.buffer);
      extra = { scale: max / 32767 };
    }
    const json = new TextEncoder().encode(JSON.stringify({ ...meta, v: SHARE_VERSION, ...extra }));
    const buf = new Uint8Array(4 + json.length + body.length);
    new DataView(buf.buffer).setUint32(0, json.length, true);
    buf.set(json, 4);
    buf.set(body, 4 + json.length);
    return b64url(await pipeBytes(buf, new CompressionStream("deflate-raw")));
  }
  async function decodeShare(data) {
    if (data.length > SHARE_MAX_CHARS) throw new Error("size");
    const buf = await pipeBytes(unb64url(data), new DecompressionStream("deflate-raw"), SHARE_MAX_BYTES);
    const len = new DataView(buf.buffer).getUint32(0, true);
    if (len > buf.length - 4) throw new Error("format");
    const meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + len)));
    const rest = buf.slice(4 + len); // kopio: Int16Array vaatii parillisen alkukohdan
    if (meta?.bits === 8) {
      const q = new Int8Array(rest.buffer), L = Array.isArray(meta.layers) ? meta.layers : [], sc = Array.isArray(meta.scales) ? meta.scales : [];
      const params = new Float32Array(q.length);
      let k = 0;
      for (let i = 1; i < L.length && k < q.length; i++) {
        const n = (L[i] | 0) * ((L[i - 1] | 0) + 1), s = Number(sc[i - 1]);
        for (let j = k; j < Math.min(k + n, q.length); j++) params[j] = q[j] * s;
        k += n;
      }
      return { meta, params };
    }
    const q = new Int16Array(rest.buffer, 0, rest.length >> 1);
    const scale = Number(meta?.scale);
    return { meta, params: Float32Array.from(q, (v) => v * scale) };
  }
  // Paikallisesti (localhost) ajettaessa linkki osoittaa julkiseen sivuun, jotta muut voivat avata sen
  const shareBase = () => (/^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || location.protocol === "file:" ? PUBLIC_URL : location.origin + location.pathname);
  function loadQr() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    loadQr.p ||= new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = QR_URL;
      s.onload = () => resolve(window.qrcode);
      s.onerror = () => { loadQr.p = null; s.remove(); reject(new Error("qr")); };
      document.head.append(s);
    });
    return loadQr.p;
  }
  // QR-koodi canvakselle; palauttaa false, jos linkki on liian pitkä QR-koodiksi (yli ~2900 merkkiä)
  function drawQr(canvas, text) {
    let qr;
    try { qr = window.qrcode(0, "L"); qr.addData(text); qr.make(); } catch { return false; }
    const n = qr.getModuleCount(), quiet = 4, cell = Math.max(2, Math.floor(560 / (n + 2 * quiet)));
    canvas.width = canvas.height = (n + 2 * quiet) * cell;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * cell, (r + quiet) * cell, cell, cell);
    return true;
  }

  // Klikkaus (ei veto) näkymään: reittipisteiden asettaminen
  function onClickNotDrag(canvas, cb) {
    let down = null;
    canvas.addEventListener("pointerdown", (e) => { down = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener("pointerup", (e) => {
      if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 6) cb(e);
      down = null;
    });
  }

  /* ===== Taustat ===== */
  // 2D-näkymä: canvas-piirto, kamera seuraa parasta; rulla zoomaa, veto siirtää, tuplaklikkaus palauttaa seurannan
  class View2D {
    constructor(canvas) {
      this.canvas = canvas;
      this.r = new RS.Renderer(canvas);
      this.manual = false;
      canvas.addEventListener("wheel", (e) => { e.preventDefault(); this.r.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1); }, { passive: false });
      let drag = null;
      canvas.addEventListener("pointerdown", (e) => { drag = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener("pointermove", (e) => {
        if (!drag) return;
        this.r.camX -= (e.clientX - drag.x) / this.r.scale;
        this.r.camY += (e.clientY - drag.y) / this.r.scale;
        drag = { x: e.clientX, y: e.clientY };
        this.manual = true;
      });
      canvas.addEventListener("pointerup", () => { drag = null; });
      canvas.addEventListener("dblclick", () => { this.manual = false; });
      onClickNotDrag(canvas, (e) => this.onPick?.(this.r.toWorld(e.clientX, e.clientY)));
      this.ro = new ResizeObserver(() => this.r.resize());
      this.ro.observe(canvas);
      this.r.resize();
    }
    setEpisode(ep, race) { this.ep = ep; this.race = race || null; }
    draw(o) {
      const ep = this.ep;
      const focus = ep ? ep.leader() : -1;
      if (ep && focus >= 0 && o.follow && !this.manual) {
        const p = ep.agents[focus].robot.root.getPosition();
        this.r.follow(p.x, p.y, o.snap);
      }
      // Etäisyysanturien säteet seurattavalta robotilta
      let rays = null;
      const fa = focus >= 0 ? ep.agents[focus] : null;
      if (o.sensors && fa && !fa.done && fa.robot.info.lidar) {
        const rb = fa.robot, pos = rb.root.getPosition(), n = rb.info.lidar;
        rays = [];
        for (let i = 0; i < n; i++) {
          const ang = RS.lidarAngle(i, n), f = rb.lidar(pos, i, n) * RS.LIDAR_RANGE;
          rays.push({ x0: pos.x, y0: pos.y, x1: pos.x + Math.cos(ang) * f, y1: pos.y + Math.sin(ang) * f, hit: f < RS.LIDAR_RANGE });
        }
      }
      this.r.draw(ep, { focus, showAll: o.showAll, showTarget: o.showTarget, race: this.race, rays, lerp: o.lerp, waypoints: o.waypoints });
    }
    resumeFollow() { this.manual = false; }
    dispose() { this.ro.disconnect(); }
  }

  // 3D-näkymän kääre: sama rajapinta kuin 2D:llä
  class View3DWrap {
    constructor(api, canvas) {
      this.v = new api.View3D(canvas);
      this.ro = new ResizeObserver(() => this.v.resize());
      this.ro.observe(canvas);
      this.v.resize();
      onClickNotDrag(canvas, (e) => { const p = this.v.pick(e.clientX, e.clientY); if (p) this.onPick?.(p); });
    }
    setEpisode(ep, race) { this.v.setEpisode(ep, race); this.ep = ep; }
    draw(o) {
      const ep = this.ep, focus = ep ? ep.leader() : -1, fa = focus >= 0 ? ep.agents[focus] : null;
      // Maaston korkeusanturin mittauspisteet seurattavan robotin edessä
      let scan = null;
      if (o.sensors && fa && !fa.done && fa.robot.info.scan) {
        const r = fa.robot, pos = r.root.translation(), yaw = r.yaw(), cx = Math.cos(yaw), cz = -Math.sin(yaw);
        scan = [];
        for (let i = 0; i < r.info.scan; i++) {
          const d = 0.6 + i * 0.6, x = pos.x + cx * d, z = pos.z + cz * d;
          scan.push({ x, y: ep.terrain.heightAt(x, z), z });
        }
      }
      this.v.draw({ focus, showAll: o.showAll, follow: o.follow, snap: o.snap, showTarget: o.showTarget, lerp: o.lerp, scan, orbit: o.orbit, waypoints: o.waypoints });
    }
    resumeFollow() {}
    dispose() { this.ro.disconnect(); this.v.dispose(); }
  }

  const BACKENDS = {
    "2d": {
      defaults: { modelKey: "car", taskKey: "forward", terrain: "flat", algo: "es", popSize: 33, duration: 12, sigma: 0.08, lr: 0.03, hidden: "32,32" },
      async load() {
        await RS.loadPlanck();
        return {
          MODELS: RS.MODELS, TASKS: RS.TASKS, TERRAINS: RS.TERRAINS, HELP: RS.TASK_HELP,
          DEFAULT_TASK: { grip: "target", wobbly: "balance", zippy: "target" },
          normalize: RS.normalizeModel, info: RS.modelInfo,
          check(raw) { new RS.Robot(new planck.World({ gravity: RS.V(0, -10) }), RS.normalizeModel(raw)); },
          episode: (cfg) => new RS.Episode(cfg),
          free() {},
          view: (canvas) => new View2D(canvas),
          // Kappaleiden asennot ennen fysiikka-askelta: hidastetun uusinnan tasoitusta varten
          pose(ep) {
            const m = new Map();
            for (const a of ep.agents) if (!a.done) for (const { body } of a.robot.parts) { const p = body.getPosition(); m.set(body, { x: p.x, y: p.y, a: body.getAngle() }); }
            return m;
          },
          calm: false,
          modelHelp: tr("Osat (bodies): id, shape \"box\" (w, h) tai \"circle\" (r), x, y, angle, density, friction, color, foot (maakosketussensori), static.\nUseita muotoja yhteen osaan: shapes: [{type, w, h, r, x, y, angle}].\nNivelet (joints): a, b (osien id:t), x, y (nivelen paikka), lower, upper (asteina), torque, speed (rad/s), motor: false = ei moottoria.\nroot: osa, jonka sijaintia tehtävä seuraa. fall: { rootContact: true, minUpright: 0.5 }. sensors: { lidar: 5 }. target: { x: [min, max], y: [min, max] }.\nMallin muuttaminen nollaa aivot.",
            "Parts (bodies): id, shape \"box\" (w, h) or \"circle\" (r), x, y, angle, density, friction, color, foot (ground contact sensor), static.\nSeveral shapes in one part: shapes: [{type, w, h, r, x, y, angle}].\nJoints: a, b (part ids), x, y (joint position), lower, upper (degrees), torque, speed (rad/s), motor: false = no motor.\nroot: the part the task tracks. fall: { rootContact: true, minUpright: 0.5 }. sensors: { lidar: 5 }. target: { x: [min, max], y: [min, max] }.\nChanging the model resets the brain."),
        };
      },
    },
    "3d": {
      defaults: { modelKey: "car", taskKey: "forward", terrain: "flat", algo: "es", popSize: 21, duration: 10, sigma: 0.05, lr: 0.03, hidden: "32,32" },
      async load() {
        const api = await import(new URL("robosim/3d/api.js", document.baseURI).href);
        const R = await api.init();
        return {
          MODELS: api.MODELS3D, TASKS: api.TASKS3D, TERRAINS: api.TERRAINS3D, HELP: api.TASK_HELP3D,
          DEFAULT_TASK: api.DEFAULT_TASK3D,
          normalize: api.normalizeModel3D, info: api.modelInfo3D,
          check(raw) {
            const w = new R.World({ x: 0, y: -9.81, z: 0 });
            try { new api.Robot3D(R, w, api.normalizeModel3D(raw), { colliders: new Set(), heightAt: () => 0 }); } finally { w.free(); }
          },
          episode: (cfg) => new api.Episode3D({ RAPIER: R, ...cfg }),
          free: (ep) => ep.free(),
          view: (canvas) => new View3DWrap(api, canvas),
          pose(ep) {
            const m = new Map();
            for (const a of ep.agents) if (!a.done) for (const { body } of a.robot.parts) {
              const p = body.translation(), q = body.rotation();
              m.set(body, { p: { x: p.x, y: p.y, z: p.z }, q: { x: q.x, y: q.y, z: q.z, w: q.w } });
            }
            return m;
          },
          calm: true,
          modelHelp: tr("Osat (bodies): id, pos [x,y,z], rot [x,y,z] asteina, shape \"box\" (size [w,h,d]), \"sphere\" (r), \"cylinder\" tai \"capsule\" (r, h; akseli y-suunnassa), density, friction, color, foot (maakosketussensori), static.\nUseita muotoja yhteen osaan: shapes: [{type, size, r, h, pos, rot, color}].\nNivelet (joints): a, b, pos [x,y,z], axis [x,y,z] (kiertoakseli), lower, upper (asteina), strength, speed (rad/s), motor: false.\nroot, fall { rootContact, minUpright }, sensors { scan: 5 }. x eteenpäin, y ylöspäin, z sivulle.\nMallin muuttaminen nollaa aivot.",
            "Parts (bodies): id, pos [x,y,z], rot [x,y,z] in degrees, shape \"box\" (size [w,h,d]), \"sphere\" (r), \"cylinder\" or \"capsule\" (r, h; axis along y), density, friction, color, foot (ground contact sensor), static.\nSeveral shapes in one part: shapes: [{type, size, r, h, pos, rot, color}].\nJoints: a, b, pos [x,y,z], axis [x,y,z] (rotation axis), lower, upper (degrees), strength, speed (rad/s), motor: false.\nroot, fall { rootContact, minUpright }, sensors { scan: 5 }. x forward, y up, z sideways.\nChanging the model resets the brain."),
        };
      },
    },
  };

  /* ===== Rinnakkaiskoulutus =====
     Sukupolven robotit jaetaan Web Workereille: jokainen laskee oman osuutensa omassa fysiikkamaailmassaan
     samalla siemenellä (sama maasto ja kohteet). Pääsäie piirtää vain parhaan robotin, joten iso populaatio
     ei hidasta näkymää, ja koulutus käyttää kaikkia prosessoriytimiä. */
  class TrainPool {
    constructor(dim) {
      this.dim = dim;
      this.size = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 1));
      this.workers = null;
      this.jobs = new Map();
      this.seq = 0;
    }
    start() {
      if (this.starting) return this.starting;
      const url = this.dim === "2d" ? "robosim/core/worker2d.js" : "robosim/3d/worker3d.js";
      const map = JSON.parse(document.querySelector('script[type="importmap"]')?.textContent || "{}").imports || {};
      const init = { type: "init", lang: LANG, planck: RS.PLANCK_URL, rapier: map["@dimforge/rapier3d-compat"] };
      this.workers = Array.from({ length: this.size }, () => new Worker(url, this.dim === "3d" ? { type: "module" } : undefined));
      this.starting = Promise.all(this.workers.map((w) => new Promise((resolve, reject) => {
        w.onmessage = (e) => {
          const d = e.data;
          if (d.type === "ready") { if (d.error) reject(new Error(d.error)); else resolve(); return; }
          const job = this.jobs.get(d.id);
          if (!job) return;
          this.jobs.delete(d.id);
          if (d.error) job.reject(new Error(d.error)); else job.resolve(d.fitness);
        };
        w.onerror = (e) => { e.preventDefault(); reject(new Error(e.message || tr("Rinnakkaiskoulutus ei käynnistynyt.", "Parallel training did not start."))); };
        w.postMessage(init);
      })));
      return this.starting;
    }
    // Laskee koko populaation kunto-arvot jakamalla sen työläisille tasaisesti
    async run(cfg) {
      await this.start();
      const pop = cfg.population, n = this.workers.length, per = Math.ceil(pop.length / n);
      const parts = [];
      for (let w = 0; w < n && w * per < pop.length; w++) {
        const id = ++this.seq, chunk = pop.slice(w * per, (w + 1) * per);
        parts.push(new Promise((resolve, reject) => {
          this.jobs.set(id, { resolve, reject });
          this.workers[w].postMessage({ ...cfg, type: "run", id, population: chunk });
        }));
      }
      return (await Promise.all(parts)).flat();
    }
    terminate() {
      this.workers?.forEach((w) => w.terminate());
      for (const j of this.jobs.values()) j.reject(new Error("terminated"));
      this.workers = null; this.starting = null; this.jobs.clear();
    }
  }

  /* ===== Yleiskäyttöinen editori-ikkuna (malli JSONina, palkkiofunktio) ===== */
  function editDialog({ title, help, text, apply }) {
    let dlg = document.getElementById("rs-edit");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "rs-edit";
      dlg.className = "rs-dlg wide";
      dlg.innerHTML = `<h2></h2><pre class="rs-help"></pre><textarea spellcheck="false"></textarea><p class="rs-err"></p>
        <div class="row-actions rs-dlg-foot"><button class="btn" data-no></button><button class="btn primary" data-yes></button></div>`;
      document.body.append(dlg);
    }
    dlg.querySelector("h2").textContent = title;
    dlg.querySelector(".rs-help").textContent = help || "";
    dlg.querySelector(".rs-help").hidden = !help;
    dlg.querySelector("textarea").value = text;
    dlg.querySelector(".rs-err").textContent = "";
    dlg.querySelector("[data-no]").textContent = tr("Peruuta", "Cancel");
    dlg.querySelector("[data-yes]").textContent = tr("Käytä", "Apply");
    dlg.querySelector("[data-no]").onclick = () => dlg.close();
    dlg.querySelector("[data-yes]").onclick = async () => {
      try { await apply(dlg.querySelector("textarea").value); dlg.close(); }
      catch (err) { dlg.querySelector(".rs-err").textContent = err.message; }
    };
    dlg.showModal();
  }

  /* ===== Oman tavoitteen rakentaja =====
     Käyttäjä valitsee tavoitteet ja niiden painot; niistä kootaan palkkiofunktion koodi.
     Koodiin päätyy vain kiinteitä paloja ja lukuja, joten tallennettu tavoite ei voi tuoda omaa koodia. */
  function goalParts(dim) {
    const d3 = dim === "3d";
    return [
      { k: "move", name: tr("Liiku suuntaan", "Move in a direction"), desc: tr("Palkitaan etenemisestä valittuun suuntaan.", "Rewards progress in the chosen direction."),
        dirs: d3 ? [["+x", tr("eteenpäin (+x)", "forward (+x)")], ["-x", tr("taaksepäin (−x)", "backward (−x)")], ["+z", tr("sivulle (+z)", "sideways (+z)")], ["-z", tr("toiselle sivulle (−z)", "other side (−z)")]]
          : [["+x", tr("oikealle (+x)", "right (+x)")], ["-x", tr("vasemmalle (−x)", "left (−x)")]] },
      { k: "speed", name: tr("Ole nopea", "Be fast"), desc: tr("Palkitaan vauhdista mihin tahansa suuntaan.", "Rewards speed in any direction.") },
      { k: "target", name: tr("Mene kohteisiin", "Reach targets"), desc: tr("Kohde näkyy näkymässä; saavutettu kohde vaihtuu seuraavaan. Kohteet arvotaan, tai robotti kulkee omat reittipisteesi (Aseta reittipisteet).", "The target shows in the view; a reached target is replaced by the next. Targets are random, or the robot follows your own waypoints (Set waypoints).") },
      { k: "upright", name: tr("Pysy pystyssä", "Stay upright"), desc: tr("Palkitaan joka hetki, jona robotti on pystyssä.", "Rewards every moment the robot is upright.") },
      { k: "jump", name: tr("Hyppää korkealle", "Jump high"), desc: tr("Lopussa palkitaan korkeimmasta saavutetusta korkeudesta.", "At the end, rewards the highest point reached.") },
      ...(d3 ? [{ k: "spin", name: tr("Pyöri", "Spin"), desc: tr("Palkitaan kääntymisestä vastapäivään.", "Rewards turning counter-clockwise.") }] : []),
      { k: "still", name: tr("Pysy paikallaan", "Stay in place"), desc: tr("Rangaistaan liikkumisesta pois aloituspaikalta.", "Penalises drifting away from the start.") },
      { k: "energy", name: tr("Säästä energiaa", "Save energy"), desc: tr("Rangaistaan moottorien turhasta käytöstä.", "Penalises needless motor use.") },
    ];
  }
  const GOAL_DEFAULT = { move: { on: true, w: 1, dir: "+x" }, energy: { on: true, w: 1 }, fall: "end" };
  const wnum = (v) => Math.min(3, Math.max(0.1, Math.round((+v || 1) * 10) / 10));
  function goalCode(dim, g) {
    const d3 = dim === "3d", parts = goalParts(dim), lines = [];
    const on = (k) => g?.[k]?.on && parts.some((p) => p.k === k);
    const w = (k) => { const v = wnum(g[k].w); return v === 1 ? "" : ` * ${v}`; };
    const name = (k) => parts.find((p) => p.k === k).name;
    if (on("move")) {
      const dir = parts[0].dirs.some(([d]) => d === g.move.dir) ? g.move.dir : "+x";
      const ax = dir[1] === "x" ? "X" : "Z", side = ax === "X" ? "Z" : "X", sign = dir[0] === "+";
      lines.push(`// ${name("move")}: ${parts[0].dirs.find(([d]) => d === dir)[1]}`,
        `r += (${sign ? `s.${ax.toLowerCase()} - s.prev${ax}` : `s.prev${ax} - s.${ax.toLowerCase()}`}) * 10${w("move")};`);
      if (d3) lines.push(`r -= Math.abs(s.${side.toLowerCase()} - s.prev${side}) * 3${w("move")}; // ${tr("ei sivuttain ajautumista", "no sideways drift")}`);
    }
    if (on("speed")) lines.push(`// ${name("speed")}`, `r += ${d3 ? "Math.hypot(s.vx, s.vz)" : "Math.abs(s.vx)"} * 0.05${w("speed")};`);
    if (on("target")) lines.push(`// ${name("target")}`, `r += (s.prevTargetDist - s.targetDist) * 10${w("target")};`,
      `if (s.targetDist < ${d3 ? 0.8 : 0.4}) { r += 20${w("target")}; s.newTarget = true; }`);
    if (on("upright")) lines.push(`// ${name("upright")}`, `r += 0.05 * s.upright${w("upright")};`);
    if (on("spin")) lines.push(`// ${name("spin")}`, `r += s.yawRate * 0.05${w("spin")};`);
    if (on("still")) lines.push(`// ${name("still")}`, `r -= ${d3 ? "Math.hypot(s.x - s.startX, s.z - s.startZ)" : "Math.abs(s.x - s.startX)"} * 0.02${w("still")};`);
    if (on("energy")) lines.push(`// ${name("energy")}`, `r -= 0.002 * s.energy${w("energy")};`);
    if (on("jump")) lines.push(`// ${name("jump")}`, "m.maxY = Math.max(m.maxY ?? s.y, s.y);");
    if (!lines.length) throw new Error(tr("Valitse vähintään yksi tavoite.", "Choose at least one goal."));
    const falls = { end: `if (s.fallen) { s.done = true; r -= 5; } // ${tr("kaatuminen lopettaa yrityksen", "a fall ends the attempt")}`,
      penalty: `if (s.fallen) r -= 0.05; // ${tr("kaatuminen maksaa vähän", "falling costs a little")}`, ignore: "" };
    const fall = falls[Object.hasOwn(falls, g.fall) ? g.fall : "end"];
    if (fall) lines.push(fall);
    if (on("jump")) lines.push(`if (s.done || s.last) r += (m.maxY - s.startY) * 20${w("jump")};`);
    return [`// ${tr("Oma tavoite (luotu tavoitteen rakentajalla)", "Custom goal (made with the goal builder)")}`, "let r = 0;", ...lines, "return r;"].join("\n");
  }

  function goalDialog({ dim, goal, apply }) {
    let dlg = document.getElementById("rs-goal");
    if (!dlg) {
      dlg = document.createElement("dialog");
      dlg.id = "rs-goal";
      dlg.className = "rs-dlg wide";
      document.body.append(dlg);
    }
    const g = structuredClone(goal && typeof goal === "object" ? goal : GOAL_DEFAULT);
    const parts = goalParts(dim);
    dlg.innerHTML = `<h2>${tr("Oma tavoite", "Custom goal")}</h2>
      <p class="goal-intro">${tr("Valitse, mitä robotin pitää oppia. Liukusäädin kertoo, kuinka tärkeä tavoite on muihin verrattuna. Tavoitteista tehdään palkkiofunktio, jota voit vielä muokata koodina.", "Choose what the robot should learn. The slider sets how important a goal is compared to the others. The goals become a reward function that you can still edit as code.")}</p>
      <div class="goal-list">${parts.map((p) => {
        const v = g[p.k] || {};
        return `<label class="goal-row ${v.on ? "on" : ""}" data-k="${p.k}"><input type="checkbox" data-on ${v.on ? "checked" : ""}>
          <span><b>${esc(p.name)}</b><small>${esc(p.desc)}</small></span>
          <input type="range" data-w min="0.1" max="3" step="0.1" value="${wnum(v.w)}" aria-label="${esc(tr("Tärkeys", "Importance"))}: ${esc(p.name)}">
          ${p.dirs ? `<span class="goal-extra"><select data-dir aria-label="${esc(tr("Suunta", "Direction"))}">${p.dirs.map(([d, lab]) => `<option value="${d}" ${(v.dir || "+x") === d ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select></span>` : ""}
        </label>`;
      }).join("")}</div>
      <div class="goal-fall"><span>${tr("Kun robotti kaatuu:", "When the robot falls:")}</span>
        <select data-fall>${[["end", tr("yritys loppuu ja tulee rangaistus", "the attempt ends with a penalty")], ["penalty", tr("pieni rangaistus, jatkaa", "small penalty, carries on")], ["ignore", tr("ei väliä", "doesn't matter")]]
          .map(([k, lab]) => `<option value="${k}" ${(g.fall || "end") === k ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select></div>
      <pre class="rs-help" aria-label="${esc(tr("Palkkiofunktio", "Reward function"))}"></pre><p class="rs-err"></p>
      <div class="row-actions rs-dlg-foot"><button class="btn" data-no>${tr("Peruuta", "Cancel")}</button><button class="btn primary" data-yes>${tr("Käytä tavoitetta", "Use this goal")}</button></div>`;
    const read = () => {
      const out = { fall: dlg.querySelector("[data-fall]").value };
      dlg.querySelectorAll(".goal-row").forEach((row) => {
        const o = { on: row.querySelector("[data-on]").checked, w: wnum(row.querySelector("[data-w]").value) };
        const dir = row.querySelector("[data-dir]");
        if (dir) o.dir = dir.value;
        row.classList.toggle("on", o.on);
        out[row.dataset.k] = o;
      });
      return out;
    };
    const update = () => {
      const err = dlg.querySelector(".rs-err"), pre = dlg.querySelector(".rs-help");
      try { pre.textContent = goalCode(dim, read()); err.textContent = ""; }
      catch (e) { pre.textContent = ""; err.textContent = e.message; }
    };
    dlg.oninput = dlg.onchange = (e) => {
      // Liukusäätimen siirto ottaa tavoitteen samalla käyttöön
      if (e.target.matches("[data-w], [data-dir]")) e.target.closest(".goal-row").querySelector("[data-on]").checked = true;
      update();
    };
    update();
    dlg.querySelector("[data-no]").onclick = () => dlg.close();
    dlg.querySelector("[data-yes]").onclick = () => {
      try { const out = read(); apply(goalCode(dim, out), out); dlg.close(); }
      catch (err) { dlg.querySelector(".rs-err").textContent = err.message; }
    };
    dlg.showModal();
  }

  function pickFile() {
    return new Promise((resolve) => {
      const i = document.createElement("input");
      i.type = "file"; i.accept = ".json,application/json";
      i.onchange = () => resolve(i.files[0] || null);
      i.click();
    });
  }

  /* ===== Työkalu ===== */
  function makeTool(dim) {
    const key = "nn" + dim, brainKey = key + "Brain", statsKey = key + "Stats";
    const B = BACKENDS[dim];
    let el, st, be, view, S, dead = true, raf = 0, chan = null, token = 0, pool = null;

    const hiddenOf = () => { try { return RS.parseHidden(st.hidden); } catch { return [32, 32]; } };
    const modelRaw = () => (st.modelKey === "custom" ? st.modelRaw : be.MODELS[st.modelKey]);
    // Tuodun tiedoston oma palkkiofunktio (koodia) ajetaan vasta, kun käyttäjä on tarkistanut sen editorissa
    const taskCode = () => (st.taskKey === "custom" ? (st.taskCodeUntrusted ? be.TASKS[B.defaults.taskKey].code : st.taskCode) : be.TASKS[st.taskKey].code);
    const opts = () => ({ popSize: Math.round(st.popSize), sigma: st.sigma, lr: st.lr });
    const save = () => saveToolState(key, st);
    const runsKey = key + "Runs";
    const taskLabel = () => (st.taskKey === "custom" ? (st.goal ? tr("Oma tavoite", "Custom goal") : tr("Oma tehtävä", "Custom task")) : be.TASKS[st.taskKey]?.name || "");
    const usesTarget = () => /targetDist|s\.target/.test(taskCode());

    function writeBrain() {
      // Projekti on voinut vaihtua kesken (koulutus kuuluu siihen projektiin, jossa työkalu avattiin)
      if (activeProject().id !== S.projectId) return;
      const t = S.trainer, p = t.best || t.mean;
      const brain = {
        layers: S.layers, params: p ? Array.from(p, (v) => +v.toPrecision(6)) : null,
        bestFitness: isFinite(t.bestFitness) ? t.bestFitness : null, gen: S.gen, history: S.history.slice(-300),
      };
      saveToolState(brainKey, brain, { undo: false });
      saveToolState(statsKey, { generation: S.gen, bestFitness: brain.bestFitness, lastBest: S.last?.best ?? null, lastMean: S.last?.mean ?? null,
        model: modelRaw()?.name, task: st.taskKey === "custom" ? "custom" : be.TASKS[st.taskKey].name, terrain: st.terrain }, { undo: false });
    }
    // Aivot tallennetaan joka sukupolven jälkeen, mutta enintään puolentoista sekunnin välein: nopeassa koulutuksessa
    // koko projektin kirjoittaminen selaimen tallennukseen kymmeniä kertoja sekunnissa hidastaisi kaikkea.
    let brainTimer = 0, brainAt = 0;
    function saveBrain(force) {
      clearTimeout(brainTimer);
      brainTimer = 0;
      const wait = 1500 - (performance.now() - brainAt);
      if (force || wait <= 0) { brainAt = performance.now(); writeBrain(); }
      else brainTimer = setTimeout(() => { if (!dead && S) saveBrain(true); }, wait);
    }
    const flushBrain = () => { if (brainTimer && S?.trainer) saveBrain(true); };

    /* ----- Koulutusajot: tallennetut aivot ja oppimiskäyrät vertailua ja kisaa varten ----- */
    const modelSig = () => hashStr(JSON.stringify(S.model));
    // Tuotu projekti voi sisältää mitä tahansa, joten jokainen ajo tarkistetaan ennen käyttöä
    function runs() {
      const list = activeProject().tools[runsKey]?.list;
      if (!Array.isArray(list)) return [];
      return list.filter((r) => r && typeof r === "object" && typeof r.id === "string" && Array.isArray(r.layers) && Array.isArray(r.params)
        && r.layers.length >= 2 && r.layers.every((n) => Number.isInteger(n) && n > 0 && n <= 4096)
        && r.params.length === RS.Brain.paramCount(r.layers) && r.params.every(Number.isFinite));
    }
    const saveRuns = (list) => saveToolState(runsKey, { list }, { undo: false });
    const runColor = (i) => seriesColor(i + 1); // 0 = nykyinen koulutus
    const sameBrainShape = (r) => r.sig === modelSig() && JSON.stringify(r.layers) === JSON.stringify(S.layers);
    // Oppimiskäyrä tiivistettynä: enintään 150 pistettä [sukupolvi, paras]
    function curveOf(history, gen) {
      const n = history.length, step = Math.max(1, Math.ceil(n / 150)), out = [];
      for (let i = 0; i < n; i += step) out.push([gen - n + i + 1, +(+history[i].best).toPrecision(5)]);
      if (n > 1 && (n - 1) % step) out.push([gen, +(+history[n - 1].best).toPrecision(5)]);
      return out.filter(([, y]) => Number.isFinite(y));
    }
    function makeRun(name, auto) {
      const t = S.trainer, p = currentBest();
      return {
        id: "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name: String(name).slice(0, 80), auto: !!auto, savedAt: Date.now(),
        model: S.model.name || modelRaw()?.name || "", sig: modelSig(), task: taskLabel(), terrain: st.terrain,
        gen: S.gen, best: isFinite(t.bestFitness) ? +t.bestFitness.toPrecision(5) : null, layers: S.layers.slice(),
        params: Array.from(p, (v) => +v.toPrecision(4)), curve: curveOf(S.history, S.gen),
      };
    }
    function addRun(run) {
      const list = [run, ...runs()];
      // Lista täynnä: pois ensin vanhimmat automaattisesti tallennetut, sitten vanhimmat muut
      while (list.length > RUN_MAX) {
        const i = list.findLastIndex((r) => r.auto);
        list.splice(i > 0 ? i : list.length - 1, 1);
      }
      saveRuns(list);
      drawRuns(); drawChart();
    }
    // Ennen kuin aivot nollataan tai korvataan, kunnollinen koulutus tallentuu koulutusajoksi
    function autoArchive() {
      if (!S?.trainer || S.gen < 10) return;
      addRun(makeRun(`${S.model.name || tr("Robotti", "Robot")} · ${taskLabel()} · ${tr("sp", "gen")} ${S.gen}`, true));
      toast(tr("Edellinen koulutus tallennettiin Koulutusajot-listaan.", "The previous training was saved to the Training runs list."));
    }

    function calmInit(layers) {
      const p = RS.Brain.randomParams(layers);
      const n = layers.length, last = layers[n - 1] * (layers[n - 2] + 1);
      for (let k = p.length - last; k < p.length; k++) p[k] *= 0.1;
      return p;
    }

    // Aivot luodaan mallin ja piilokerrosten mukaan. Tallennettu aivo otetaan käyttöön vain, jos koko sopii.
    function setupBrain(useSaved) {
      S.model = be.normalize(modelRaw());
      const info = be.info(S.model);
      S.layers = [info.obsSize, ...hiddenOf(), info.actSize];
      S.taskFn = RS.compileTask(taskCode());
      // Aivonäkymän nimet sisään- ja ulostuloille (samat kuin Vie omalle robotille -kytkentäohjeessa)
      try { S.io = RS.deployInfo(dim, S.model); } catch { S.io = null; }
      S.vizBrain = new RS.Brain(S.layers);
      S.vizObs = new Float32Array(S.layers[0]);
      const saved = useSaved && activeProject().tools[brainKey];
      let init = null;
      if (saved?.params && JSON.stringify(saved.layers) === JSON.stringify(S.layers) && saved.params.length === RS.Brain.paramCount(S.layers)) {
        init = Float32Array.from(saved.params);
        S.gen = saved.gen || 0; S.history = saved.history || [];
      } else {
        if (saved?.params) toast(tr("Tallennetut aivot eivät sovi tähän robottiin, joten aloitetaan alusta.", "The saved brain does not fit this robot, so training starts over."));
        S.gen = 0; S.history = [];
      }
      S.trainer = RS.makeTrainer(st.algo, S.layers, opts(), init || (be.calm ? calmInit(S.layers) : null));
      if (init && saved.bestFitness != null) S.trainer.bestFitness = saved.bestFitness;
      S.last = S.history.at(-1) || null;
    }

    function resetBrain() {
      S.gen = 0; S.history = []; S.last = null;
      S.trainer = RS.makeTrainer(st.algo, S.layers, opts(), be.calm ? calmInit(S.layers) : null);
      saveBrain();
    }

    // Algoritmin tai populaation vaihto säilyttää opitun
    function rebuildTrainer() {
      const t = S.trainer, init = t && (t.best || t.mean), bf = t ? t.bestFitness : -Infinity;
      S.trainer = RS.makeTrainer(st.algo, S.layers, opts(), init || null);
      S.trainer.bestFitness = bf;
    }

    const currentBest = () => (S.trainer && (S.trainer.best || S.trainer.mean)) || RS.Brain.randomParams(S.layers);

    // Omat reittipisteet episodin kohteiksi. 2D: maassa kulkevan robotin piste asettuu maan tasalle (y puuttuu),
    // ilmassa liikkuvan (mallissa oma kohdealue) klikattuun korkeuteen. 3D: ilmassa liikkuvalle kohdealueen keskikorkeus.
    function wpTargets() {
      const list = waypoints();
      if (!list.length) return undefined;
      const area = S.model.target;
      if (dim === "2d") return list.map((p) => (area ? { x: p.x, y: p.y } : { x: p.x }));
      return list.map((p) => (area ? { x: p.x, y: (area.y[0] + area.y[1]) / 2, z: p.z } : { x: p.x, z: p.z }));
    }
    function waypoints() {
      const w = st.waypoints;
      if (!Array.isArray(w)) return [];
      return w.filter((p) => p && Number.isFinite(p.x) && (dim === "2d" ? Number.isFinite(p.y) : Number.isFinite(p.z))).slice(0, WAYPOINT_MAX);
    }

    // o.seed: sama siemen = sama maasto ja samat kohteet (uusinta), o.race: kisaajien värit,
    // o.terrain / o.duration / o.taskFn / o.targets: haasteen omat ehdot asetusten sijaan
    function setEpisode(population, o = {}) {
      const old = S.episode;
      S.episode = be.episode({ model: S.model, taskFn: o.taskFn || S.taskFn, terrain: o.terrain || st.terrain, seed: o.seed ?? ((Math.random() * 1e9) | 0), population,
        layers: S.layers, duration: o.duration || st.duration, targets: "targets" in o ? o.targets : wpTargets() });
      S.race = o.race || null;
      view.setEpisode(S.episode, S.race?.colors);
      if (old) be.free(old);
      S.snap = true;
      S.prevPose = null;
    }
    const preview = () => setEpisode([currentBest()]);

    function setMode(mode) {
      if (S.mode === "train" && mode !== "train") flushBrain();
      S.mode = mode;
      const tb = el.querySelector("#nn-train"), rb = el.querySelector("#nn-replay");
      tb.innerHTML = mode === "train" ? `❚❚ ${tr("Tauko", "Pause")}` : `▶ ${tr("Kouluta", "Train")}`;
      tb.classList.toggle("primary", mode !== "train");
      rb.textContent = mode === "replay" ? tr("Lopeta", "Stop") : tr("Näytä paras", "Show best");
      const rc = el.querySelector("#nn-race-btn");
      if (rc) rc.textContent = mode === "race" ? tr("Lopeta kisa", "Stop the race") : tr("🏁 Kisa", "🏁 Race");
      el.querySelector("#nn-rp").hidden = mode !== "replay";
      if (mode !== "race" && !S.race?.done) el.querySelector("#nn-race").hidden = true;
      if (mode === "replay") drawReplayBar();
      S.fsSync?.(); // koko näytön palkin napit samoiksi
    }

    // Tuodun palkkiofunktion varoitus omassa laatikossaan, jottei koulutuksen tilaviesti peitä sitä
    function trustNote() {
      const box = el.querySelector("#nn-trust");
      if (box) box.innerHTML = st.taskKey === "custom" && st.taskCodeUntrusted ? alertsHtml([{ level: "warn", text: tr("Tuodussa tiedostossa on oma palkkiofunktio (JavaScript-koodia). Sitä ei ajeta ennen kuin tarkistat sen: Muokkaa palkkiofunktiota → Käytä. Siihen asti käytetään oletustehtävää.", "The imported file contains a custom reward function (JavaScript code). It won't run until you review it: Edit reward function → Apply. Until then the default task is used.") }]) : "";
    }

    function status(text, level) {
      const box = el.querySelector("#nn-status");
      if (!box) return;
      box.innerHTML = level ? alertsHtml([{ level, text }]) : `<p class="note">${esc(text)}</p>`;
    }

    const confirmReset = () => S.gen === 0 || RS.ask(S.gen >= 10
      ? tr(`Tämä nollaa opitut aivot (${S.gen} sukupolvea). Jatketaanko?\n\nNykyinen koulutus tallentuu Koulutusajot-listaan, josta sen voi ottaa myöhemmin takaisin käyttöön.`, `This resets the learned brain (${S.gen} generations). Continue?\n\nThe current training is saved to the Training runs list, where you can bring it back later.`)
      : tr(`Tämä nollaa opitut aivot (${S.gen} sukupolvea). Jatketaanko?\n\nVoit tallentaa ne ensin Vie aivot -painikkeella.`, `This resets the learned brain (${S.gen} generations). Continue?\n\nYou can save it first with Export brain.`), tr("Nollaa ja jatka", "Reset and continue"));

    function finishGeneration(fit) {
      S.trainer.tell(fit);
      S.gen++;
      const best = Math.max(...fit), mean = fit.reduce((a, b) => a + b, 0) / fit.length;
      S.last = { best, mean };
      S.history.push({ best, mean, ter: st.terrain });
      if (S.history.length > 1000) S.history.shift();
      if (S.gen >= 100 && !S.got100) { S.got100 = true; achieve("train100"); }
      curriculumStep();
      drawChart();
      saveBrain();
    }

    /* ----- Maaston automaattinen vaikeutus: kun oppiminen tasaantuu, siirrytään seuraavaan maastoon ----- */
    const CUR_MIN_GENS = 20, CUR_WINDOW = 8;
    function curriculumStep() {
      if (!st.autoTerrain || S.mode !== "train") return;
      const order = Object.keys(be.TERRAINS), i = order.indexOf(st.terrain);
      if (i < 0 || i >= order.length - 1) return;
      // Sukupolvet nykyisessä maastossa (vanhoissa tallennuksissa maastoa ei ole merkitty)
      let n = 0;
      for (let k = S.history.length - 1; k >= 0 && (S.history[k].ter ?? st.terrain) === st.terrain; k--) n++;
      if (n < CUR_MIN_GENS) return;
      const avg = (a) => a.reduce((s, h) => s + h.best, 0) / a.length;
      const h = S.history.slice(-2 * CUR_WINDOW), late = avg(h.slice(CUR_WINDOW)), early = avg(h.slice(0, CUR_WINDOW));
      // Vielä paranee selvästi (yli 3 %): pysytään tässä maastossa
      if (late - early > Math.max(0.03 * Math.abs(early), 1e-6)) return;
      st.terrain = order[i + 1];
      save(); drawFields();
      forgetBest(); // vaikeamman maaston pisteet eivät ole vertailukelpoisia
      const last = i + 1 === order.length - 1;
      status(tr(`Oppiminen tasaantui, joten maasto vaihtui vaikeampaan: ${be.TERRAINS[st.terrain]}${last ? " (vaikein)" : ""}.`, `Learning levelled off, so the terrain changed to a harder one: ${be.TERRAINS[st.terrain]}${last ? " (the hardest)" : ""}.`), "ok");
      toast(tr(`Maasto: ${be.TERRAINS[st.terrain]}`, `Terrain: ${be.TERRAINS[st.terrain]}`));
      if (last) achieve("curriculum");
    }

    // Tavallinen koulutus: koko populaatio simuloidaan ja piirretään pääsäikeessä
    function endGeneration() {
      finishGeneration(S.episode.fitness());
      setEpisode(S.trainer.ask());
    }

    // Rinnakkaiskoulutus: sukupolvi lasketaan työläisissä, näkymässä pyörii paras robotti
    const useParallel = () => st.parallel !== false && !S.noParallel && typeof Worker !== "undefined";
    async function trainParallel() {
      const trainer = S.trainer, t0 = performance.now();
      try {
        pool ||= new TrainPool(dim);
        const fit = await pool.run({ model: S.model, code: taskCode(), terrain: st.terrain, seed: (Math.random() * 1e9) | 0,
          layers: S.layers, duration: st.duration, population: trainer.ask(), targets: wpTargets() });
        if (dead || S.trainer !== trainer || S.mode !== "train" || !useParallel()) return;
        finishGeneration(fit);
        if (++S.parGens === 20) achieve("parallel");
        S.genMs = S.genMs ? S.genMs * 0.7 + (performance.now() - t0) * 0.3 : performance.now() - t0;
        const ter = st.autoTerrain ? tr(` Maasto: ${be.TERRAINS[st.terrain]} (vaikeutuu automaattisesti).`, ` Terrain: ${be.TERRAINS[st.terrain]} (gets harder automatically).`) : "";
        status(tr(`Koulutetaan ${pool.size} prosessoriytimellä, noin ${fmt(60000 / S.genMs, 0)} sukupolvea minuutissa. Näkymässä ajaa paras tähän mennessä löydetty robotti.`,
          `Training on ${pool.size} processor cores, about ${fmt(60000 / S.genMs, 0)} generations a minute. The view shows the best robot found so far.`) + ter);
      } catch (err) {
        if (dead || err.message === "terminated") return;
        if (err.message.startsWith(tr("Virhe tehtävän koodissa", "Error in the task code"))) { setMode("idle"); status(err.message, "err"); return; }
        // Työläiset eivät käynnisty (esim. vanha selain tai kirjasto ei latautunut): jatketaan tavalliseen tapaan
        console.warn(err);
        S.noParallel = true;
        pool?.terminate(); pool = null;
        status(tr("Rinnakkaiskoulutus ei toimi tässä selaimessa, joten koulutetaan tavalliseen tapaan.", "Parallel training doesn't work in this browser, so training runs the usual way."), "warn");
        if (S.mode === "train") setEpisode(S.trainer.ask());
      } finally {
        S.pending = null;
      }
    }

    /* ----- Silmukat: fysiikka erikseen piirrosta, jotta maksiminopeudella koulutus jatkuu taustallakin ----- */
    let stepDebt = 0, lastStep = 0;
    function physics(id) {
      if (dead || id !== token) return; // vanhan piirtokerran silmukka loppuu
      const now = performance.now();
      const elapsed = Math.min(0.25, (now - lastStep) / 1000);
      lastStep = now;
      // Rinnakkaistilassa pääsäie vain näyttää parasta robottia (ei maksiminopeuden kiiresilmukkaa).
      // Uusinnalla on oma nopeutensa (hidastus) ja tauko; kisa ajetaan valitulla nopeudella, enintään 4×.
      const par = S.mode === "train" && useParallel();
      const v = S.mode === "replay" ? (S.replay.paused ? 0 : S.replay.rate)
        : S.mode === "race" ? Math.min(st.speed, 4)
        : par && st.speed >= MAX_SPEED ? 1 : st.speed;
      const max = v >= MAX_SPEED;
      try {
        if (par && !S.pending) S.pending = trainParallel();
        if (S.mode !== "idle" && S.episode && !S.episode.finished && v > 0) {
          stepDebt = max ? Infinity : Math.min(stepDebt + elapsed * 60 * v, Math.max(1, 60 * v * 0.25));
          const t0 = performance.now();
          while (stepDebt >= 1 && performance.now() - t0 < 25) {
            if (S.mode === "replay") S.prevPose = be.pose(S.episode);
            S.episode.step();
            stepDebt--;
            if (S.episode.finished) {
              if (S.mode === "train" && !par) endGeneration();
              else if (S.mode === "train") setEpisode([currentBest()]);
              else if (S.mode === "replay") { S.replay.paused = true; S.replay.ended = true; stepDebt = 0; drawReplayBar(); break; }
              else if (S.mode === "race") { finishRace(); break; }
            }
          }
          if (max) stepDebt = 0;
        } else if (S.mode !== "replay") stepDebt = 0;
      } catch (err) {
        setMode("idle");
        status(err.message, "err");
        console.error(err);
      }
      if (max && S.mode !== "idle") chan.port2.postMessage(id);
      else setTimeout(() => physics(id), 8);
    }

    function frame() {
      if (dead) return;
      const lerp = S.mode === "replay" && S.prevPose && S.replay.rate < 1 ? { prev: S.prevPose, alpha: RS.clamp(stepDebt, 0, 1) } : null;
      view.draw({ showAll: st.showAll, follow: st.follow, snap: S.snap, showTarget: usesTarget() || S.placing, lerp, sensors: st.sensors,
        orbit: S.mode === "replay" && st.orbit, waypoints: waypoints() });
      S.snap = false;
      updateHud();
      if (++S.tick % 6 === 0) drawBrainViz();
      if (S.mode === "replay") drawReplayBar();
      raf = requestAnimationFrame(frame);
    }

    const f2 = (v) => (v == null || !isFinite(v) ? "–" : fmt(v, Math.abs(v) >= 100 ? 0 : 2));
    function updateHud() {
      const ep = S.episode, h = el.querySelector("#nn-hud");
      if (!h) return;
      const vals = [S.gen, f2(S.trainer?.bestFitness), f2(S.last?.best), f2(S.last?.mean), ep ? fmt(ep.t, 1) + " s" : "–",
        ep ? `${ep.agents.filter((a) => !a.done).length} / ${ep.agents.length}` : "–"];
      h.querySelectorAll("b").forEach((b, i) => { if (b.textContent !== String(vals[i])) b.textContent = vals[i]; });
      drawRaceBox();
    }

    function drawChart() {
      const c = el.querySelector("#nn-chart");
      if (!c) return;
      const shown = runs().map((r, i) => ({ r, i })).filter(({ r }) => (st.runShow || []).includes(r.id) && r.curve?.length > 1);
      if (S.history.length < 2 && !shown.length) {
        el.querySelector("#nn-chart-empty").hidden = false;
        c.hidden = true;
        return;
      }
      el.querySelector("#nn-chart-empty").hidden = true;
      c.hidden = false;
      const x = S.history.map((_, i) => S.gen - S.history.length + i + 1);
      // Maaston vaihtumiskohdat pystyviivoina (automaattinen vaikeutus tai käsin vaihdettu maasto)
      const marks = [];
      S.history.forEach((h, i) => { const p = S.history[i - 1]; if (p?.ter && h.ter && p.ter !== h.ter) marks.push({ x: x[i], label: be.TERRAINS[h.ter] || "" }); });
      drawPlot(c, {
        xLabel: tr("sukupolvi", "generation"),
        marks,
        series: [
          { x, y: S.history.map((h) => h.mean), label: tr("Keskiarvo", "Mean"), color: cssColor("var(--text-3)"), width: 1.5 },
          { x, y: S.history.map((h) => h.best), label: tr("Paras", "Best"), color: seriesColor(0), width: 2 },
          // Valitut koulutusajot katkoviivoina (vain paras)
          ...shown.map(({ r, i }) => ({ x: r.curve.map((p) => p[0]), y: r.curve.map((p) => p[1]), label: r.name.length > 24 ? r.name.slice(0, 23) + "…" : r.name,
            color: runColor(i), width: 1.5, dash: [6, 4] })),
        ],
      });
    }

    /* ----- Koulutusajojen lista ----- */
    function drawRuns() {
      const box = el.querySelector("#nn-runs");
      if (!box) return;
      const list = runs(), show = new Set(st.runShow || []);
      if (!list.length) {
        box.innerHTML = `<p class="note">${tr("Ei vielä tallennettuja koulutusajoja. Kun nollaat aivot tai vaihdat robottia, kunnollinen koulutus (vähintään 10 sukupolvea) tallentuu tänne myös itsestään.", "No saved training runs yet. When you reset the brain or switch robots, a proper training (at least 10 generations) is also saved here automatically.")}</p>`;
        return;
      }
      box.innerHTML = list.map((r, i) => {
        const fits = sameBrainShape(r);
        const meta = [r.model, r.task, be.TERRAINS[r.terrain] || "", tr(`sp ${r.gen}`, `gen ${r.gen}`), tr(`paras ${f2(r.best)}`, `best ${f2(r.best)}`)].filter(Boolean).map((s) => esc(String(s))).join(" · ");
        return `<div class="nn-run${fits ? "" : " other"}">
          <label><input type="checkbox" data-run="${esc(r.id)}" ${show.has(r.id) ? "checked" : ""}><i class="dot" style="background:${runColor(i)}"></i>
            <span><b>${esc(r.name)}</b><small>${meta}${fits ? "" : ` · ${tr("eri robotti: vain vertailuun", "a different robot: comparison only")}`}</small></span></label>
          <span class="nn-run-acts">
            ${fits ? `<button class="icon-btn" data-a="useRun" data-id="${esc(r.id)}" title="${tr("Ota nämä aivot käyttöön", "Use this brain")}" aria-label="${tr("Ota käyttöön", "Use")}">↺</button>` : ""}
            <button class="icon-btn" data-a="renameRun" data-id="${esc(r.id)}" title="${tr("Nimeä uudelleen", "Rename")}" aria-label="${tr("Nimeä uudelleen", "Rename")}">✎</button>
            <button class="icon-btn" data-a="delRun" data-id="${esc(r.id)}" title="${tr("Poista", "Delete")}" aria-label="${tr("Poista", "Delete")}">✕</button>
          </span></div>`;
      }).join("");
    }

    /* ----- Kisa: valitut koulutusajot ja nykyiset aivot samalla radalla ----- */
    function startRace() {
      const list = runs(), show = new Set(st.runShow || []);
      const picked = list.map((r, i) => ({ r, i })).filter(({ r }) => show.has(r.id) && sameBrainShape(r)).slice(0, RACE_MAX - 1);
      if (!picked.length) {
        status(tr("Valitse Koulutusajot-listasta vähintään yksi saman robotin ajo (rasti), niin se kisaa nykyisiä aivoja vastaan. Tallenna ensin ajo, jos lista on tyhjä.", "Tick at least one run of the same robot in the Training runs list and it races the current brain. Save a run first if the list is empty."), "warn");
        return;
      }
      const race = {
        names: [tr("Nykyiset aivot", "Current brain"), ...picked.map(({ r }) => r.name)],
        colors: [seriesColor(0), ...picked.map(({ i }) => runColor(i))],
      };
      setMode("race");
      setEpisode([Float32Array.from(currentBest()), ...picked.map(({ r }) => Float32Array.from(r.params))], { race });
      S.raceKey = "";
      status(tr(`Kisa käynnissä: ${race.names.length} aivoa samalla radalla ja samoilla kohteilla. Pisteet lasketaan tehtävän palkkiofunktiolla.`, `Race on: ${race.names.length} brains on the same track with the same targets. Points come from the task's reward function.`));
    }
    // Matka alusta: 2D eteenpäin x-suunnassa, 3D vaakatasossa mihin tahansa suuntaan
    function distanceOf(ep, a) {
      if (dim === "3d") { const p = ep.positionOf(a); return Math.hypot(p.x - a.robot.startX, p.z - a.robot.startZ); }
      return a.robot.root.getPosition().x - a.robot.startX;
    }
    function finishRace() {
      const ep = S.episode, R = S.race;
      R.done = true;
      window.rsRaces = (window.rsRaces || 0) + 1; // kurssi seuraa päättyneitä kisoja
      const order = ep.agents.map((a, i) => i).sort((p, q) => ep.agents[q].fitness - ep.agents[p].fitness);
      R.result = order.map((i) => ({ i, fit: ep.agents[i].fitness, dist: distanceOf(ep, ep.agents[i]), fell: !ep.agents[i].robot.parts.length }));
      setMode("idle");
      drawRaceBox();
      const w = R.result[0];
      status(tr(`Kisa päättyi. Voittaja: ${R.names[w.i]} (${f2(w.fit)} pistettä, matka ${fmt(w.dist, 1)} m).`, `The race is over. Winner: ${R.names[w.i]} (${f2(w.fit)} points, distance ${fmt(w.dist, 1)} m).`), "ok");
      if (w.i === 0) achieve("race");
    }
    function drawRaceBox() {
      const box = el.querySelector("#nn-race"), R = S.race, ep = S.episode;
      if (!box) return;
      if (!R || !ep) { if (!box.hidden) box.hidden = true; return; }
      const rows = R.result || ep.agents.map((a, i) => ({ i, fit: a.fitness, dist: distanceOf(ep, a), fell: !a.robot.parts.length })).sort((p, q) => q.fit - p.fit);
      const html = `<b>${R.done ? tr("Tulokset", "Results") : tr("Kisa", "Race")}</b>` + rows.map((r, k) =>
        `<div><i style="background:${R.colors[r.i]}"></i><span>${R.done ? ["🥇", "🥈", "🥉"][k] || `${k + 1}.` : `${k + 1}.`} ${esc(R.names[r.i])}${r.fell ? " ✗" : ""}</span><em>${f2(r.fit)}</em></div>`).join("");
      if (html !== S.raceKey) { S.raceKey = html; box.innerHTML = html; }
      box.hidden = false;
    }

    /* ----- Uusinta: sama rata (siemen) ja samat aivot uudelleen, hidastus ja aikajana ----- */
    // cfg: haasteen ehdot (maasto, kesto, mittari) — muuten nykyiset asetukset
    function startReplay(cfg = null) {
      S.replay = { seed: cfg?.seed ?? ((Math.random() * 1e9) | 0), params: Float32Array.from(currentBest()), rate: S.replay?.rate ?? 1, paused: false, ended: false, cfg };
      setEpisode([S.replay.params], { seed: S.replay.seed, ...(cfg || {}) });
      setMode("replay");
    }
    function replayRestart() {
      setEpisode([S.replay.params], { seed: S.replay.seed, ...(S.replay.cfg || {}) });
      S.replay.ended = false;
      stepDebt = 0;
    }
    // Aikajanalla taaksepäin: rata ajetaan alusta uudelleen samalla siemenellä (fysiikka on deterministinen)
    function replaySeek(k) {
      if (!S.episode || k < S.episode.steps) replayRestart();
      const t0 = performance.now();
      while (S.episode.steps < k && !S.episode.finished && performance.now() - t0 < 400) S.episode.step();
      S.replay.ended = S.episode.finished;
      S.prevPose = null;
      stepDebt = 0;
    }
    function drawReplayBar() {
      const bar = el.querySelector("#nn-rp"), ep = S.episode;
      if (!bar || !S.replay || !ep) return;
      const time = bar.querySelector("#nn-rp-time");
      time.max = ep.maxSteps;
      if (!S.scrubbing) time.value = ep.steps;
      const label = `${fmt(ep.t, 1)} / ${fmt(ep.maxSteps / 60, 0)} s`;
      const tl = bar.querySelector("#nn-rp-t");
      if (tl.textContent !== label) tl.textContent = label;
      const play = bar.querySelector("#nn-rp-play"), icon = S.replay.ended ? "↻" : S.replay.paused ? "▶" : "❚❚";
      if (play.textContent !== icon) {
        play.textContent = icon;
        play.setAttribute("aria-label", S.replay.ended ? tr("Toista alusta", "Play from the start") : S.replay.paused ? tr("Toista", "Play") : tr("Tauko", "Pause"));
      }
      bar.querySelectorAll("#nn-rp-rate button").forEach((b) => b.classList.toggle("on", +b.dataset.r === S.replay.rate));
    }

    /* ----- Aivot toiminnassa: neuroverkon kerrokset, painot ja aktivaatiot seurattavalle robotille ----- */
    // force: piirretään, vaikka kaavio ei olisi näkyvissä (testit)
    function drawBrainViz(force) {
      const c = el.querySelector("#nn-brain");
      // Ei piirretä, kun kaavio ei ole näkyvissä (vieritetty pois tai välilehti taustalla): säästää suoritinta koulutuksen aikana
      if (!c || !S.vizBrain || !c.clientWidth || (!force && (document.hidden || S.vizVisible === false))) return;
      const ep = S.episode, L = S.layers;
      const focus = ep ? ep.leader() : -1, a = focus >= 0 ? ep.agents[focus] : null;
      const params = a?.params || currentBest();
      let acts = null;
      if (a && !a.done) {
        a.robot.observe(S.vizObs, ep.t, ep.targetOf(a));
        S.vizBrain.forward(params, S.vizObs);
        acts = S.vizBrain.buffers;
      }
      // Korkeus sisään- ja ulostulojen määrän mukaan, jotta niiden nimet mahtuvat näkyviin
      const wantH = RS.clamp(Math.max(L[0], L[L.length - 1]) * 12 + 24, 240, 560) + "px";
      if (c.style.height !== wantH) c.style.height = wantH;
      const dpr = window.devicePixelRatio || 1, W = c.clientWidth, H = c.clientHeight;
      if (c.width !== Math.round(W * dpr) || c.height !== Math.round(H * dpr)) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
      const ctx = c.getContext("2d");
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const padL = Math.min(130, W * 0.3), padR = Math.min(110, W * 0.24), padY = 10;
      const colX = (i) => padL + (i / (L.length - 1)) * (W - padL - padR);
      const nodeY = (n, j) => padY + ((j + 0.5) / n) * (H - 2 * padY);
      const maxN = Math.max(...L), rad = RS.clamp((H - 2 * padY) / maxN / 2.6, 1.5, 6);
      const pos = getComputedStyle(document.documentElement).getPropertyValue("--warn").trim() || "#f5b84a";
      const neg = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#4c8dff";
      // Yhteydet: jokaiseen neuroniin piirretään sen kolme voimakkainta painoa (oranssi = vahvistaa, sininen = vaimentaa)
      let k = 0;
      for (let li = 1; li < L.length; li++) {
        const nIn = L[li - 1], nOut = L[li];
        let maxW = 1e-6;
        for (let q = k, end = k + nOut * (nIn + 1); q < end; q++) maxW = Math.max(maxW, Math.abs(params[q]));
        for (let o = 0; o < nOut; o++) {
          const base = k + o * (nIn + 1);
          const top = [];
          for (let j = 0; j < nIn; j++) {
            const w = params[base + j];
            if (top.length < 3) top.push(j);
            else { let m = 0; for (let t = 1; t < 3; t++) if (Math.abs(params[base + top[t]]) < Math.abs(params[base + top[m]])) m = t; if (Math.abs(w) > Math.abs(params[base + top[m]])) top[m] = j; }
          }
          for (const j of top) {
            const w = params[base + j], src = acts ? Math.abs(acts[li - 1][j]) : 0.6;
            ctx.strokeStyle = w > 0 ? pos : neg;
            ctx.globalAlpha = 0.08 + 0.55 * (Math.abs(w) / maxW) * (0.25 + 0.75 * src);
            ctx.lineWidth = 0.6 + 1.4 * Math.abs(w) / maxW;
            ctx.beginPath(); ctx.moveTo(colX(li - 1), nodeY(nIn, j)); ctx.lineTo(colX(li), nodeY(nOut, o)); ctx.stroke();
          }
        }
        k += nOut * (nIn + 1);
      }
      ctx.globalAlpha = 1;
      // Neuronit: väri aktivaation mukaan (−1 sininen … 0 harmaa … 1 oranssi)
      const nodes = [];
      const border = cssColor("var(--border-strong)"), text2 = cssColor("var(--text-2)"), text3 = cssColor("var(--text-3)");
      for (let li = 0; li < L.length; li++) {
        const n = L[li];
        for (let j = 0; j < n; j++) {
          const x = colX(li), y = nodeY(n, j), v = acts ? acts[li][j] : 0;
          ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2);
          ctx.fillStyle = cssColor("var(--surface-2)"); ctx.fill();
          if (acts) { ctx.globalAlpha = Math.min(1, Math.abs(v)); ctx.fillStyle = v > 0 ? pos : neg; ctx.fill(); ctx.globalAlpha = 1; }
          ctx.strokeStyle = border; ctx.lineWidth = 0.8; ctx.stroke();
          const name = li === 0 ? S.io?.inputs[j]?.name : li === L.length - 1 ? S.io?.outputs[j]?.name : null;
          nodes.push({ x, y, v: acts ? v : null, name: name || (li === 0 ? tr(`sisääntulo ${j + 1}`, `input ${j + 1}`) : li === L.length - 1 ? tr(`ulostulo ${j + 1}`, `output ${j + 1}`) : tr(`piilokerros ${li}, neuroni ${j + 1}`, `hidden layer ${li}, neuron ${j + 1}`)) });
        }
      }
      // Nimet sisään- ja ulostuloille, jos ne mahtuvat
      const gap = (H - 2 * padY) / L[0];
      ctx.font = `${RS.clamp(gap - 1.5, 8, 10.5)}px ${getComputedStyle(document.body).fontFamily}`;
      ctx.textBaseline = "middle";
      const fit = (s, w) => { if (ctx.measureText(s).width <= w) return s; while (s.length > 1 && ctx.measureText(s + "…").width > w) s = s.slice(0, -1); return s + "…"; };
      if (gap >= 8) {
        ctx.textAlign = "right"; ctx.fillStyle = text3;
        for (let j = 0; j < L[0]; j++) ctx.fillText(fit(S.io?.inputs[j]?.name || "", padL - rad - 8), padL - rad - 5, nodeY(L[0], j));
      }
      ctx.font = `10.5px ${getComputedStyle(document.body).fontFamily}`;
      const nl = L.length - 1;
      if ((H - 2 * padY) / L[nl] >= 9) {
        ctx.textAlign = "left";
        for (let j = 0; j < L[nl]; j++) {
          const v = acts ? acts[nl][j] : null;
          ctx.fillStyle = text2;
          ctx.fillText(fit(`${v == null ? "" : (v >= 0 ? "+" : "") + v.toFixed(2) + " "}${S.io?.outputs[j]?.name || ""}`, padR - rad - 8), colX(nl) + rad + 5, nodeY(L[nl], j));
        }
      }
      S.vizNodes = nodes;
      const note = el.querySelector("#nn-brain-note");
      if (note) note.textContent = acts ? tr(`Seurattava robotti, aika ${fmt(ep.t, 1)} s`, `Followed robot, time ${fmt(ep.t, 1)} s`) : tr("Ei liikkuvaa robottia: näkyvät vain painot. Paina Kouluta tai Näytä paras.", "No moving robot: only the weights are shown. Press Train or Show best.");
    }

    /* ----- Kentät ----- */
    function fields() {
      const tasks = Object.entries(be.TASKS).map(([k, t]) => [k, t.name]);
      if (st.taskKey === "custom") tasks.push(["custom", tr("Oma tehtävä", "Custom task")]);
      return {
        robot: [], // robotti valitaan omalla valitsimella (drawPicker)
        task: [
          { key: "taskKey", label: tr("Tehtävä", "Task"), type: "select", options: tasks,
            info: tr("Mitä robotin halutaan oppivan. Tehtävä on palkkiofunktio, joka antaa pisteitä hyvästä käytöksestä. Tehtävää voi vaihtaa kesken koulutuksen: opitut aivot säilyvät.", "What the robot should learn. The task is a reward function that gives points for good behaviour. You can switch tasks mid-training: the learned brain is kept.") },
          { key: "terrain", label: tr("Maasto", "Terrain"), type: "select", options: Object.entries(be.TERRAINS),
            info: tr("Maa, jolla robotti liikkuu. Aloita tasaisella ja vaihda vaikeampaan, kun robotti osaa perusasiat. Aivot säilyvät vaihdossa.", "The ground the robot moves on. Start flat and switch to harder terrain once the basics are learned. The brain is kept.") },
          { key: "autoTerrain", label: tr("Vaikeuta maastoa automaattisesti", "Make the terrain harder automatically"), type: "toggle",
            info: tr(`Opetussuunnitelma: kun oppiminen tasaantuu (vähintään ${CUR_MIN_GENS} sukupolvea samassa maastossa eikä paras tulos enää parane), maasto vaihtuu seuraavaan: ${Object.values(be.TERRAINS).join(" → ")}. Vaihdot näkyvät oppimiskäyrässä pystyviivoina.`, `A curriculum: when learning levels off (at least ${CUR_MIN_GENS} generations on the same terrain and the best result no longer improves), the terrain changes to the next one: ${Object.values(be.TERRAINS).join(" → ")}. The changes show in the learning curve as vertical lines.`) },
        ],
        train: [
          { key: "algo", label: tr("Algoritmi", "Algorithm"), type: "select", options: [["es", tr("Evoluutiostrategia (ES)", "Evolution strategy (ES)")], ["ga", tr("Geneettinen algoritmi (GA)", "Genetic algorithm (GA)")]],
            info: tr("ES kokeilee pieniä muutoksia ja siirtyy parempien suuntaan: tasainen ja luotettava (suositus). GA:ssa parhaat robotit saavat mutatoituja \"lapsia\": voi löytää yllättäviä ratkaisuja, mutta vaihtelee enemmän.", "ES tries small changes and moves toward the better ones: steady and reliable (recommended). In GA the best robots get mutated \"children\": it can find surprising solutions but varies more.") },
          { key: "parallel", label: tr("Nopea koulutus", "Fast training"), type: "toggle",
            info: tr("Laskee sukupolven kaikilla prosessoriytimillä taustalla, ja näkymässä ajaa vain paras robotti. Moninkertaisesti nopeampi, ja isokin populaatio (satoja robotteja) onnistuu. Kytke pois, jos haluat nähdä koko populaation liikkeessä.", "Computes each generation on all processor cores in the background while the view shows only the best robot. Many times faster, and even a big population (hundreds of robots) works. Turn it off to watch the whole population move.") },
          { key: "popSize", label: tr("Populaatio", "Population"), min: 4, max: dim === "3d" ? 1000 : 2000, step: 1,
            info: tr(`Montako robottia kokeillaan yhdessä sukupolvessa. Isompi on vakaampi mutta hitaampi. Suositus ${dim === "3d" ? "15–100" : "24–200"}; nopealla koulutuksella satojakin.`, `How many robots are tried per generation. Bigger is steadier but slower. Recommended ${dim === "3d" ? "15–100" : "24–200"}; with fast training even hundreds.`) },
          { key: "duration", label: tr("Episodin pituus", "Episode length"), unit: "s", min: 2, max: 120, step: 1,
            info: tr("Kuinka kauan yksi yritys kestää. Lyhyt (5–10 s) nopeuttaa alkua; pidennä (15–30 s), kun robotti jo liikkuu, jotta se oppii myös kestävyyttä.", "How long one attempt lasts. Short (5–10 s) speeds up the start; lengthen it (15–30 s) once the robot moves so it also learns endurance.") },
          { key: "sigma", label: tr("Mutaatio σ", "Mutation σ"), adv: true, min: 0.001, max: 2, step: 0.01,
            info: tr("Kuinka paljon aivoja muutellaan kokeiltaessa. Liian pieni: oppiminen jumittuu. Liian suuri: robotit riuhtovat ja kaatuvat. Suositus 0,03–0,1.", "How much the brain is varied when trying. Too small: learning stalls. Too big: robots thrash and fall. Recommended 0.03–0.1.") },
          { key: "lr", label: tr("Oppimisnopeus", "Learning rate"), adv: true, min: 0.0001, max: 1, step: 0.005,
            info: tr("Kuinka ison askeleen aivot ottavat kohti parempaa kerralla (vain ES). Liian suuri: kaavio heiluu. Suositus 0,01–0,05.", "How big a step the brain takes toward better at once (ES only). Too big: the chart swings. Recommended 0.01–0.05.") },
        ],
      };
    }

    async function render(root, tool) {
      el = root;
      dead = false;
      const my = ++token; // uudelleenpiirto kesken latauksen (esim. Ctrl+Z) ohittaa vanhan
      st = getToolState(key, { ...B.defaults, showAll: true, follow: true, speed: MAX_SPEED, parallel: true, autoTerrain: false, sensors: false, orbit: true });
      const adv = st._adv ?? settings.advanced;
      el.innerHTML = `
        ${toolHead(tool)}
        <div class="tool nn-tool viz-first">
          <div class="col">
            <div class="card"><h3 class="card-title">${tr("Robotti", "Robot")}</h3>
              <div class="field"><label>${tr("Robotti", "Robot")} <small>${tr("mallin vaihto nollaa aivot", "changing the model resets the brain")}</small></label><div id="nn-pick"></div></div>
              <div class="fields" id="nn-f-robot"></div>
              <p class="note" id="nn-desc" style="margin-top:8px"></p>
              <div class="row-actions">
                <button class="btn" data-a="editModel" title="${tr("Avaa robotin rakenteen JSON-muodossa. Muutos nollaa aivot.", "Opens the robot structure as JSON. Changing it resets the brain.")}">${tr("Muokkaa JSONia", "Edit JSON")}</button>
                <button class="btn" data-a="builder">${icon("wrench")} ${tr("Avaa rakentajassa", "Open in builder")}</button>
              </div>
              <div class="row-actions">
                <button class="link-btn" data-a="saveOwn" title="${tr("Tallentaa nykyisen robotin Omat robotit -listaan, josta sen saa käyttöön kaikissa projekteissa.", "Saves the current robot to My robots, where it is available in every project.")}">${tr("Tallenna omiin robotteihin", "Save to my robots")}</button>
                <button class="link-btn" data-a="importModel">${tr("Tuo malli", "Import model")}</button>
                <button class="link-btn" data-a="exportModel">${tr("Vie malli", "Export model")}</button>
              </div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Tehtävä ja maasto", "Task and terrain")}</h3>
              <div class="fields" id="nn-f-task"></div>
              <div class="row-actions"><button class="btn primary" data-a="goal" title="${tr("Valitse tavoitteet ja niiden tärkeys: palkkiofunktio tehdään puolestasi.", "Pick goals and how important they are: the reward function is made for you.")}">${icon("target")} ${tr("Oma tavoite", "Custom goal")}</button>
                <button class="btn" data-a="editTask" title="${tr("Kirjoita oma palkkiofunktio JavaScriptillä.", "Write your own reward function in JavaScript.")}">${tr("Muokkaa palkkiofunktiota", "Edit reward function")}</button></div>
              <div class="nn-wp" id="nn-wp"></div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Koulutus", "Training")}</h3>
              <div class="fields" id="nn-f-train"></div>
              ${adv ? `<div class="field" style="margin-top:12px"><label>${tr("Piilokerrokset", "Hidden layers")} <small>${tr("neuroneja kerroksittain, esim. 32,32 — muutos nollaa aivot", "neurons per layer, e.g. 32,32 — changing resets the brain")}</small></label>
                <div class="field-ctl"><span class="num"><input type="text" id="nn-hidden" value="${esc(st.hidden)}"></span></div></div>` : ""}
              <button class="link-btn" data-a="adv" style="margin-top:12px">${adv ? tr("Piilota lisäasetukset", "Hide advanced settings") : tr("Näytä lisäasetukset (mutaatio, oppimisnopeus, verkon koko)", "Show advanced settings (mutation, learning rate, network size)")}</button>
            </div>
            <div class="card"><h3 class="card-title">${tr("Aivot", "Brain")}</h3>
              <p class="note">${tr("Opitut aivot tallentuvat projektiin joka sukupolven jälkeen. Tiedostoon viety aivot sisältää mallin, tehtävän ja painot — ja toimii myös alkuperäisessä RoboSimissä.", "The learned brain is saved to the project after every generation. An exported brain file contains the model, task and weights — and also works in the original RoboSim.")}</p>
              <div class="row-actions">
                <button class="btn primary" data-a="deploy" title="${tr("Arduino, ESP32, Raspberry Pi Pico, Raspberry Pi… Koodi, joka ajaa opitut aivot oikealla robotilla.", "Arduino, ESP32, Raspberry Pi Pico, Raspberry Pi… Code that runs the learned brain on a real robot.")}">${icon("chip")} ${tr("Vie omalle robotille", "Put on a real robot")}</button>
              </div>
              <div class="row-actions">
                <button class="btn" data-a="share" title="${tr("Linkki ja QR-koodi, joilla muut voivat avata robottisi ja sen aivot omassa selaimessaan", "A link and a QR code others can use to open your robot and its brain in their own browser")}">🔗 ${tr("Jaa linkkinä", "Share as a link")}</button>
                <button class="btn" data-a="exportBrain">${icon("download")} ${tr("Vie aivot", "Export brain")}</button>
                <button class="btn" data-a="importBrain">${tr("Tuo aivot", "Import brain")}</button>
              </div>
              <div class="row-actions"><button class="link-btn danger-link" data-a="reset">${tr("Nollaa aivot", "Reset brain")}</button></div>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Simulaatio", "Simulation")}
                <span class="view-tools">
                  <button class="btn primary" id="nn-train">▶ ${tr("Kouluta", "Train")}</button>
                  <button class="btn" id="nn-replay">${tr("Näytä paras", "Show best")}</button>
                </span></h3>
              <div class="nn-stage" id="nn-stage">
                <canvas class="view3 nn-view" id="nn-view" aria-label="${tr("Simulaationäkymä", "Simulation view")}"></canvas>
                <button class="icon-btn nn-fs-btn" id="nn-fs" title="${tr("Koko näyttö (Esc palaa)", "Full screen (Esc to exit)")}" aria-label="${tr("Koko näyttö", "Full screen")}">⛶</button>
                <div class="nn-fs-bar" aria-label="${tr("Simulaation ohjaus", "Simulation controls")}">
                  <button class="btn primary" data-fs="train"></button>
                  <button class="btn" data-fs="replay"></button>
                  <button class="btn" data-fs="exit">✕ ${tr("Sulje koko näyttö", "Exit full screen")}</button>
                </div>
                <div class="nn-hud" id="nn-hud" aria-live="off">
                  ${[tr("Sukupolvi", "Generation"), tr("Paras ikinä", "Best ever"), tr("Edell. paras", "Last best"), tr("Edell. keskiarvo", "Last mean"), tr("Aika", "Time"), tr("Elossa", "Alive")].map((l) => `<div><span>${l}</span><b>–</b></div>`).join("")}
                </div>
                <div class="nn-loading" id="nn-loading">${tr("Ladataan fysiikkamoottoria…", "Loading the physics engine…")}</div>
                <div class="nn-race" id="nn-race" hidden aria-live="polite"></div>
              </div>
              <div class="nn-replaybar" id="nn-rp" hidden>
                <button class="icon-btn" id="nn-rp-play" aria-label="${tr("Tauko", "Pause")}">❚❚</button>
                <input type="range" id="nn-rp-time" min="0" max="600" value="0" step="1" aria-label="${tr("Uusinnan aikajana", "Replay timeline")}">
                <span class="nn-rp-t" id="nn-rp-t"></span>
                <div class="seg small" id="nn-rp-rate" role="group" aria-label="${tr("Uusinnan nopeus", "Replay speed")}">${REPLAY_RATES.map((r) => `<button data-r="${r}">${fmt(r, r === 0.25 ? 2 : r < 1 ? 1 : 0)}×</button>`).join("")}</div>
                ${dim === "3d" ? `<label class="mini-toggle"><input type="checkbox" id="nn-orbit" ${st.orbit ? "checked" : ""}> ${tr("Kiertävä kamera", "Orbiting camera")}</label>` : ""}
                <button class="link-btn" id="nn-rp-new" title="${tr("Samat aivot uudella radalla ja uusilla kohteilla", "The same brain on a new track with new targets")}">${tr("Uusi rata", "New track")}</button>
              </div>
              <div class="nn-controls">
                <label class="nn-speed">${tr("Nopeus", "Speed")} <b id="nn-speed-l"></b>
                  <input type="range" id="nn-speed" min="1" max="${MAX_SPEED}" value="${st.speed}" aria-label="${tr("Simulaation nopeus", "Simulation speed")}"></label>
                <label class="mini-toggle"><input type="checkbox" id="nn-all" ${st.showAll ? "checked" : ""}> ${tr("Koko populaatio", "Whole population")}</label>
                <label class="mini-toggle"><input type="checkbox" id="nn-follow" ${st.follow ? "checked" : ""}> ${tr("Kamera seuraa parasta", "Camera follows the best")}</label>
                <label class="mini-toggle" title="${tr(dim === "3d" ? "Näyttää pisteet, joista robotti mittaa maaston korkeuden edessään" : "Näyttää robotin etäisyysanturien säteet", dim === "3d" ? "Shows the points where the robot measures the terrain height ahead" : "Shows the robot's distance sensor rays")}"><input type="checkbox" id="nn-sensors" ${st.sensors ? "checked" : ""}> ${tr("Anturit näkyviin", "Show sensors")}</label>
                <button class="link-btn" data-a="coach" title="${tr("Kolmen askeleen opastus tämän työkalun käyttöön", "A three-step guide to this tool")}">❓ ${tr("Opastus", "Guide")}</button>
              </div>
              <div id="nn-trust" style="margin-top:8px"></div>
              <div id="nn-status" style="margin-top:8px"></div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Oppimiskäyrä", "Learning curve")}</h3>
              <p class="note" id="nn-chart-empty">${tr("Kaavio näkyy, kun koulutus on edennyt pari sukupolvea.", "The chart appears after a couple of generations.")}</p>
              <canvas class="plot small" id="nn-chart" hidden></canvas>
            </div>
            <div class="card"><h3 class="card-title">${tr("Koulutusajot", "Training runs")}</h3>
              <p class="note">${tr("Tallenna koulutus, niin voit verrata oppimiskäyriä ja laittaa aivot kisaamaan. Rastitetut ajot näkyvät oppimiskäyrässä katkoviivoina ja pääsevät kisaan.", "Save a training to compare learning curves and race the brains. Ticked runs show in the learning curve as dashed lines and take part in the race.")}</p>
              <div class="nn-runs" id="nn-runs"></div>
              <div class="row-actions">
                <button class="btn" data-a="saveRun">＋ ${tr("Tallenna nykyinen koulutus", "Save the current training")}</button>
                <button class="btn primary" id="nn-race-btn" data-a="race">${tr("🏁 Kisa", "🏁 Race")}</button>
              </div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Haasteet", "Challenges")}</h3>
              <p class="note">${tr("Kouluta robotti ja kokeile, läpäiseekö se haasteen. Aivot ajetaan aina samalla radalla, ja tulos mitataan RoboLabin omalla mittarilla: oma palkkiofunktio ei vaikuta tulokseen. Läpäistyt haasteet näkyvät Kurssit-sivun saavutuksissa ja luokan opettajalle.", "Train a robot and try whether it passes a challenge. The brain always runs on the same track, and the result is measured with RoboLab's own meter: your reward function doesn't affect it. Passed challenges show in the achievements on the Courses page and to your class teacher.")}</p>
              <div class="nn-chs" id="nn-ch"></div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Aivot toiminnassa", "The brain in action")}</h3>
              <p class="note">${tr("Vasemmalla anturit (sisääntulot), oikealla moottorit (ulostulot) ja välissä piilokerrokset. Neuronin väri on sen aktivaatio: oranssi = positiivinen, sininen = negatiivinen. Viivat ovat kunkin neuronin kolme voimakkainta painoa. Vie hiiri neuronin päälle, niin näet sen nimen ja arvon.", "Sensors (inputs) on the left, motors (outputs) on the right and the hidden layers in between. A neuron's colour is its activation: orange = positive, blue = negative. The lines are each neuron's three strongest weights. Hover over a neuron to see its name and value.")}</p>
              <div class="nn-brainviz"><canvas id="nn-brain" aria-label="${tr("Neuroverkon kaavio", "Neural network diagram")}"></canvas><div class="nn-brain-tip" id="nn-brain-tip" hidden></div></div>
              <p class="note" id="nn-brain-note"></p>
            </div>
          </div>
        </div>`;

      const speedLabel = () => { el.querySelector("#nn-speed-l").textContent = st.speed >= MAX_SPEED ? tr("maksimi", "max") : `${st.speed}×`; };
      speedLabel();
      try {
        be = await B.load();
      } catch (err) {
        if (dead || my !== token) return;
        el.querySelector("#nn-loading").textContent = err.message + " " + tr("(tarvitset internetyhteyden ensimmäisellä kerralla)", "(you need an internet connection the first time)");
        return;
      }
      if (dead || my !== token || !root.querySelector("#nn-view")) return; // käyttäjä ehti vaihtaa sivua
      el.querySelector("#nn-loading").remove();
      if (!Object.hasOwn(be.MODELS, st.modelKey) && st.modelKey !== "custom") st.modelKey = B.defaults.modelKey;
      if (!Object.hasOwn(be.TASKS, st.taskKey) && st.taskKey !== "custom") st.taskKey = B.defaults.taskKey;

      S = { mode: "idle", episode: null, gen: 0, history: [], last: null, snap: true, tick: 0, parGens: 0, projectId: activeProject().id };
      try { setupBrain(true); }
      catch (err) {
        status(tr("Tallennettu robotti on rikki: ", "The saved robot is broken: ") + err.message + tr(" Palautetaan oletusrobotti.", " Restoring the default robot."), "warn");
        st.modelKey = B.defaults.modelKey; st.taskKey = B.defaults.taskKey;
        setupBrain(false);
      }
      trustNote();
      view = be.view(el.querySelector("#nn-view"));
      view.onPick = addWaypoint;
      el.querySelector("#nn-view").addEventListener("dblclick", () => { st.follow = true; el.querySelector("#nn-follow").checked = true; view.resumeFollow(); S.snap = true; });
      drawFields();
      preview();
      drawChart();
      drawRuns();
      drawWaypointRow();
      setMode("idle");
      status(S.gen
        ? tr(`Jatketaan tallennetusta: sukupolvi ${S.gen}. Paina Kouluta.`, `Continuing from the save: generation ${S.gen}. Press Train.`)
        : tr("Valitse robotti ja tehtävä ja paina Kouluta. Vedä näkymää hiirellä, rulla zoomaa, tuplaklikkaus palauttaa seurannan.", "Pick a robot and a task and press Train. Drag the view with the mouse, scroll to zoom, double-click to follow again."));

      chan = new MessageChannel();
      chan.port1.onmessage = (e) => physics(e.data);
      lastStep = performance.now();
      physics(my);
      raf = requestAnimationFrame(frame);

      el.querySelector("#nn-speed").oninput = (e) => { st.speed = +e.target.value; speedLabel(); };
      el.querySelector("#nn-speed").onchange = () => saveToolState(key, st, { undo: false });
      el.querySelector("#nn-all").onchange = (e) => { st.showAll = e.target.checked; saveToolState(key, st, { undo: false }); };
      el.querySelector("#nn-follow").onchange = (e) => { st.follow = e.target.checked; if (st.follow) view.resumeFollow(); saveToolState(key, st, { undo: false }); };
      el.querySelector("#nn-train").onclick = () => {
        if (S.mode === "train") { setMode("idle"); status(tr("Koulutus tauolla. Paina Kouluta jatkaaksesi.", "Training paused. Press Train to continue.")); return; }
        setMode("train");
        if (useParallel()) {
          setEpisode([currentBest()]);
          status(tr("Koulutus käynnistyy kaikilla prosessoriytimillä… Näkymässä ajaa paras tähän mennessä löydetty robotti.", "Training starts on all processor cores… The view shows the best robot found so far."));
          return;
        }
        setEpisode(S.trainer.ask());
        status(tr("Koulutetaan… Koko populaatio näkyy haaleana ja kamera seuraa parasta. Koulutus jatkuu, vaikka vaihtaisit selaimen välilehteä — mutta pysähtyy, jos siirryt toiseen työkaluun.", "Training… The whole population is shown faded and the camera follows the best. Training continues if you switch browser tabs — but stops if you open another tool."));
      };
      el.querySelector("#nn-replay").onclick = () => {
        if (S.mode === "replay") { setMode("idle"); preview(); return; }
        startReplay();
        status(S.trainer.best ? tr("Uusinta: paras tähän mennessä löydetty robotti. Hidasta liikettä nopeusnapeilla ja kelaa aikajanalla. Uusi rata vaihtaa maaston ja kohteet.", "Replay: the best robot found so far. Slow the motion down with the speed buttons and scrub the timeline. New track changes the terrain and targets.")
          : tr("Ei vielä koulutettu — näytetään satunnaiset aivot.", "Not trained yet — showing a random brain."));
      };
      // Koko näyttö: näkymä täyttää ikkunan (myös puhelimessa, jossa elementin Fullscreen API ei aina toimi),
      // ja alareunan palkissa ovat tärkeimmät napit. Esc tai Sulje palauttaa.
      const stage = el.querySelector("#nn-stage");
      const fsSync = () => {
        stage.querySelector('[data-fs="train"]').textContent = el.querySelector("#nn-train").textContent;
        stage.querySelector('[data-fs="replay"]').textContent = el.querySelector("#nn-replay").textContent;
      };
      const setFs = (on) => {
        stage.classList.toggle("fs", on);
        document.body.classList.toggle("nn-fs-open", on);
        el.querySelector("#nn-fs").setAttribute("aria-pressed", on);
        if (on) fsSync();
        S.snap = true;
      };
      el.querySelector("#nn-fs").onclick = () => setFs(!stage.classList.contains("fs"));
      stage.querySelector(".nn-fs-bar").onclick = (e) => {
        const a = e.target.closest("[data-fs]")?.dataset.fs;
        if (a === "train") el.querySelector("#nn-train").click();
        else if (a === "replay") el.querySelector("#nn-replay").click();
        else if (a === "exit") setFs(false);
        fsSync();
      };
      S.fsKey = (e) => { if (e.key === "Escape" && stage.classList.contains("fs")) setFs(false); };
      document.addEventListener("keydown", S.fsKey);
      S.fsOff = () => setFs(false);
      S.fsSync = fsSync;
      // Uusinnan säätimet
      const rp = el.querySelector("#nn-rp");
      rp.querySelector("#nn-rp-play").onclick = () => {
        if (S.replay.ended) { replayRestart(); S.replay.paused = false; }
        else S.replay.paused = !S.replay.paused;
        drawReplayBar();
      };
      const time = rp.querySelector("#nn-rp-time");
      time.addEventListener("pointerdown", () => { S.scrubbing = true; });
      time.addEventListener("pointerup", () => { S.scrubbing = false; });
      time.oninput = () => { S.replay.paused = true; replaySeek(+time.value); drawReplayBar(); };
      time.onchange = () => { S.scrubbing = false; };
      rp.querySelector("#nn-rp-rate").onclick = (e) => {
        const b = e.target.closest("[data-r]");
        if (!b) return;
        S.replay.rate = +b.dataset.r;
        if (S.replay.paused && !S.replay.ended) S.replay.paused = false;
        if (S.replay.rate < 1) achieve("replay");
        drawReplayBar();
      };
      // Uusi rata: haasteen ehdot jäävät pois, jolloin samat aivot ajavat tavallisella radalla
      rp.querySelector("#nn-rp-new").onclick = () => { S.replay.seed = (Math.random() * 1e9) | 0; S.replay.cfg = null; replayRestart(); S.replay.paused = false; drawReplayBar(); };
      const orbit = rp.querySelector("#nn-orbit");
      if (orbit) orbit.onchange = () => { st.orbit = orbit.checked; saveToolState(key, st, { undo: false }); };
      el.querySelector("#nn-sensors").onchange = (e) => { st.sensors = e.target.checked; saveToolState(key, st, { undo: false }); };
      // Koulutusajojen valinnat: rasti näyttää käyrän ja ottaa ajon kisaan
      el.querySelector("#nn-runs").addEventListener("change", (e) => {
        const id = e.target.dataset.run;
        if (!id) return;
        const set = new Set(st.runShow || []);
        if (e.target.checked) set.add(id); else set.delete(id);
        st.runShow = [...set];
        saveToolState(key, st, { undo: false });
        drawChart();
      });
      // Aivonäkymän vihjeteksti: lähin neuroni hiiren kohdalla
      const brain = el.querySelector("#nn-brain"), tip = el.querySelector("#nn-brain-tip");
      if (typeof IntersectionObserver !== "undefined") {
        S.vizObserver = new IntersectionObserver(([e]) => { S.vizVisible = e.isIntersecting; if (e.isIntersecting) drawBrainViz(); });
        S.vizObserver.observe(brain);
      }
      brain.addEventListener("mousemove", (e) => {
        const r = brain.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
        let best = null, bd = 12;
        for (const n of S.vizNodes || []) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
        tip.hidden = !best;
        if (!best) return;
        tip.textContent = best.v == null ? best.name : `${best.name}: ${(best.v >= 0 ? "+" : "") + best.v.toFixed(2)}`;
        tip.style.left = Math.min(x + 12, r.width - 180) + "px";
        tip.style.top = y + 12 + "px";
      });
      brain.addEventListener("mouseleave", () => { tip.hidden = true; });
      el.querySelector(".nn-tool").addEventListener("click", onAction);

      // Rakentajan "Kouluta simulaatiossa" jättää robotin odottamaan
      if (st.pendingModel) {
        const raw = st.pendingModel;
        delete st.pendingModel;
        saveToolState(key, st, { undo: false });
        try { await applyModel(raw, tr(`Robotti "${raw.name || tr("oma robotti", "custom robot")}" tuotiin rakentajasta. Valitse tehtävä ja paina Kouluta.`, `Robot "${raw.name || "custom robot"}" was brought from the builder. Pick a task and press Train.`)); }
        catch (err) { status(tr("Robotin tuonti rakentajasta: ", "Bringing the robot from the builder: ") + err.message, "warn"); }
      }

      // Ensimmäisellä käyttökerralla lyhyt opastus (kurssin aikana kurssipaneeli opastaa)
      if (!window.Courses?.active()) setTimeout(() => { if (!dead && my === token) startCoach(false); }, 700);

      // Automaattitestit (tests-app.html, ?memstore) pääsevät käsiksi koulutuksen tilaan
      if (/[?&]memstore\b/.test(location.search)) {
        (window.__nn ||= {})[dim] = {
          get S() { return S; }, get st() { return st; }, get view() { return view; },
          finishGeneration, startRace, startReplay, replaySeek, addWaypoint, setPlacing, runs, makeRun, addRun, drawBrainViz, useRun, setMode, runChallenge,
        };
      }
    }

    // Robotin valitsin: hahmot, perusmallit ja omat robotit omissa kokoontaitettavissa osioissaan
    function drawPicker() {
      const lib = "robot" + dim;
      const own = Library.list(lib).map((r) => ({ value: "lib:" + r.id, label: r.name, sub: tr("tallennettu ", "saved ") + new Date(r.saved).toLocaleDateString(LANG) }));
      const unsaved = st.modelKey === "custom" && !(st.libId && Library.get(lib, st.libId))
        ? [{ value: "custom", label: (st.modelRaw?.name || tr("Oma robotti", "Custom robot")), sub: tr("ei tallennettu omiin", "not saved to my robots") }] : [];
      const value = st.modelKey !== "custom" ? st.modelKey : unsaved.length ? "custom" : "lib:" + st.libId;
      modelPicker(el.querySelector("#nn-pick"), {
        value, storeKey: "nn" + dim,
        sections: robotSections(be.MODELS, { own, ownExtra: unsaved, ownAction: unsaved.length ? { label: tr("＋ Tallenna nykyinen robotti omiin", "＋ Save the current robot to my robots"), run: saveOwn } : null }),
        onSelect: async (v) => {
          if (v === "custom") return;
          if (v.startsWith("lib:")) {
            const r = Library.get(lib, v.slice(4));
            if (!r) return;
            try { await applyModel(r.data, tr(`Oma robotti "${r.name}" otettu käyttöön. Paina Kouluta.`, `Your robot "${r.name}" is in use. Press Train.`)); st.libId = r.id; save(); drawPicker(); }
            catch (err) { if (err.message !== tr("Peruttu.", "Cancelled.")) status(err.message, "err"); }
            return;
          }
          st.modelKey = v; delete st.libId;
          await onField("modelKey");
          drawPicker();
        },
        onRemove: async (v) => {
          const r = Library.get(lib, v.slice(4));
          if (!r || !(await RS.ask(tr(`Poistetaanko "${r.name}" omista roboteista? Tämä ei poista robottia nykyisestä simulaatiosta.`, `Remove "${r.name}" from my robots? This does not remove it from the current simulation.`), tr("Poista", "Remove")))) return;
          Library.remove(lib, r.id);
          if (st.libId === r.id) { delete st.libId; save(); }
          drawPicker();
        },
        onRename: (v) => {
          const r = Library.get(lib, v.slice(4)), n = r && askName(tr("Robotin uusi nimi:", "New name for the robot:"), r.name);
          if (n) { Library.rename(lib, r.id, n); drawPicker(); }
        },
      });
    }

    function saveOwn() {
      const raw = modelRaw(), lib = "robot" + dim;
      const name = askName(tr("Robotin nimi omissa roboteissa:", "Name of the robot in my robots:"), st.modelKey === "custom" ? raw.name : `${raw.name} (${tr("oma", "mine")})`);
      if (!name) return;
      const id = Library.add(lib, name, { ...RS.clone(raw), name });
      if (!id) return;
      if (st.modelKey === "custom") { st.libId = id; st.modelRaw = { ...st.modelRaw, name }; save(); }
      drawPicker();
      toast(tr(`"${name}" tallennettu omiin robotteihin.`, `"${name}" saved to my robots.`));
    }

    function drawFields() {
      drawPicker();
      const F = fields(), adv = st._adv ?? settings.advanced;
      const groups = { robot: "#nn-f-robot", task: "#nn-f-task", train: "#nn-f-train" };
      for (const [g, sel] of Object.entries(groups)) {
        const box = el.querySelector(sel);
        box.innerHTML = fieldsHtml(F[g], st, adv);
        if (!box.dataset.bound) { box.dataset.bound = "1"; bindFields(box, F[g], st, onField); }
      }
      const info = be.info(S.model), raw = modelRaw();
      const act = info.thrusters ? tr(`${info.motors} moottoria, ${info.thrusters} roottoria`, `${info.motors} motors, ${info.thrusters} rotors`) : tr(`${info.actSize} moottoria`, `${info.actSize} motors`);
      el.querySelector("#nn-desc").textContent = `${raw.description || ""} (${tr(`${info.obsSize} sensoria`, `${info.obsSize} sensors`)}, ${act})`.trim();
      const h = el.querySelector("#nn-hidden");
      if (h) h.onchange = onHidden;
      drawChallenges();
    }

    // Uusi tehtävä tai palkkio: vanhan tehtävän ennätys ei ole vertailukelpoinen (Näytä paras ja Paras ikinä).
    // Aivot säilyvät, joten oppiminen jatkuu nykyisistä painoista.
    function forgetBest() {
      if (!S.trainer) return;
      S.trainer.best = null;
      S.trainer.bestFitness = -Infinity;
    }

    async function onField(k) {
      if (k === "modelKey") {
        const prev = getToolState(key, B.defaults).modelKey;
        if (st.modelKey === "custom" || !(await confirmReset())) { st.modelKey = prev; drawFields(); return; }
        autoArchive();
        const task = be.DEFAULT_TASK[st.modelKey];
        if (task && st.taskKey !== task) { st.taskKey = task; toast(tr(`Tehtäväksi vaihdettiin "${be.TASKS[task].name}", koska se sopii tälle robotille.`, `The task was switched to "${be.TASKS[task].name}" because it suits this robot.`)); }
        delete st.modelRaw;
        setMode("idle");
        save(); setupBrain(false); resetBrain(); drawFields(); preview(); drawChart();
        status(tr(`Robotiksi vaihdettiin ${be.MODELS[st.modelKey].name}. Paina Kouluta.`, `Switched the robot to ${be.MODELS[st.modelKey].name}. Press Train.`));
        return;
      }
      if (k === "taskKey") {
        if (st.taskKey === "custom") return;
        delete st.taskCode;
        S.taskFn = RS.compileTask(taskCode());
        forgetBest();
        save(); drawWaypointRow(); if (S.mode === "idle") preview();
        status(tr("Tehtävä vaihdettu. Aivot säilyvät, joten robotti jatkaa oppimista uudesta tehtävästä.", "Task changed. The brain is kept, so the robot continues learning the new task."));
        return;
      }
      // Eri maaston tai episodin pituuden pisteet eivät ole vertailukelpoisia: vanha "paras ikinä" unohdetaan,
      // muuten Näytä paras ja haasteet käyttäisivät helpomman maaston aivoja
      if (k === "terrain") { forgetBest(); save(); if (S.mode === "idle") preview(); return; }
      if (k === "duration") forgetBest();
      if (k === "autoTerrain") {
        save();
        const order = Object.values(be.TERRAINS);
        status(st.autoTerrain
          ? tr(`Maasto vaikeutuu automaattisesti koulutuksen aikana: ${order.join(" → ")}. Aloita tasaisesta, niin robotti oppii perusasiat ensin.`, `The terrain gets harder automatically during training: ${order.join(" → ")}. Start on flat ground so the robot learns the basics first.`)
          : tr("Maasto pysyy valitsemassasi.", "The terrain stays as you choose."));
        return;
      }
      if (k === "algo" || k === "popSize") { save(); rebuildTrainer(); return; }
      if (k === "parallel") {
        save();
        if (S.mode === "train") setEpisode(useParallel() ? [currentBest()] : S.trainer.ask());
        return;
      }
      save(); // sigma, lr, duration: otetaan käyttöön seuraavassa sukupolvessa
      Object.assign(S.trainer.opts, opts());
    }

    async function onHidden(e) {
      let h;
      try { h = RS.parseHidden(e.target.value); } catch (err) { status(err.message, "err"); e.target.value = st.hidden; return; }
      if (!(await confirmReset())) { e.target.value = st.hidden; return; }
      autoArchive();
      st.hidden = h.join(",");
      setMode("idle");
      save(); setupBrain(false); resetBrain(); preview(); drawChart(); drawFields();
    }

    // Uusi robotti (JSON-muokkaus, tiedosto tai rakentaja): tarkistetaan, että se rakentuu fysiikkaan
    async function applyModel(raw, why) {
      be.check(raw);
      if (!(await confirmReset())) throw new Error(tr("Peruttu.", "Cancelled."));
      autoArchive();
      st.modelKey = "custom"; st.modelRaw = raw; delete st.libId;
      setMode("idle");
      save(); setupBrain(false); resetBrain(); drawFields(); preview(); drawChart();
      status(why || tr("Oma robotti otettu käyttöön. Paina Kouluta.", "Custom robot in use. Press Train."));
    }

    // Tallennetun koulutusajon aivot takaisin käyttöön (nykyinen koulutus tallentuu ensin listaan)
    async function useRun(r) {
      if (!sameBrainShape(r)) return;
      if (S.gen > 0 && !(await RS.ask(tr(`Otetaanko koulutusajon "${r.name}" aivot käyttöön? Nykyiset aivot (${S.gen} sukupolvea) korvataan${S.gen >= 10 ? ", mutta ne tallentuvat ensin Koulutusajot-listaan" : ""}.`, `Use the brain of the training run "${r.name}"? The current brain (${S.gen} generations) is replaced${S.gen >= 10 ? ", but it is saved to the Training runs list first" : ""}.`), tr("Ota käyttöön", "Use")))) return;
      autoArchive();
      setMode("idle");
      const p = Float32Array.from(r.params);
      S.trainer = RS.makeTrainer(st.algo, S.layers, opts(), p);
      S.trainer.bestFitness = Number.isFinite(r.best) ? r.best : -Infinity;
      // Tiivistetty käyrä takaisin sukupolvikohtaiseksi historiaksi (välit täytetään suoralla viivalla)
      const hist = [], c = r.curve || [];
      for (let i = 0; i < c.length; i++) {
        const [g0, b0] = c[i], next = c[i + 1];
        if (!next) { hist.push({ best: b0, mean: null }); break; }
        const [g1, b1] = next;
        for (let g = g0; g < g1; g++) hist.push({ best: b0 + ((b1 - b0) * (g - g0)) / Math.max(1, g1 - g0), mean: null });
      }
      S.history = hist.slice(-1000);
      S.gen = Math.max(r.gen | 0, S.history.length);
      S.last = S.history.at(-1) || null;
      saveBrain(true);
      preview(); drawChart(); drawRuns();
      status(tr(`Koulutusajon "${r.name}" aivot otettu käyttöön (sukupolvi ${S.gen}). Paina Kouluta jatkaaksesi niistä.`, `The brain of the training run "${r.name}" is in use (generation ${S.gen}). Press Train to continue from it.`), "ok");
    }

    /* ----- Haasteet (achievements.js): opitut aivot kiinteällä radalla, tulos RoboLabin omalla mittarilla ----- */
    const challenges = () => (window.Achievements?.CHALLENGES || []).filter((c) => c.dim === dim);
    const fmtMetric = (c, v) => Achievements.fmtScore(c, v);
    function drawChallenges() {
      const box = el.querySelector("#nn-ch");
      if (!box || !be) return;
      box.innerHTML = challenges().map((c) => {
        const r = Achievements.challengeState(c.id), fits = !c.model || st.modelKey === c.model;
        const need = c.model ? be.MODELS[c.model]?.name || c.model : "";
        return `<div class="nn-ch${r?.passed ? " passed" : ""}">
          <span class="nn-ch-icon" aria-hidden="true">${r?.passed ? "🏅" : "🎯"}</span>
          <span class="nn-ch-text"><b>${esc(c.name)}</b><small>${esc(c.desc)}</small>
            <small class="nn-ch-res">${r ? tr(`Paras tulos ${fmtMetric(c, r.best)} / tavoite ${fmtMetric(c, c.goal)}`, `Best result ${fmtMetric(c, r.best)} / goal ${fmtMetric(c, c.goal)}`) : tr(`Tavoite ${fmtMetric(c, c.goal)} · ei vielä yritetty`, `Goal ${fmtMetric(c, c.goal)} · not tried yet`)}${fits ? "" : ` · ${tr(`vaatii robotin ${esc(need)}`, `needs the ${esc(need)} robot`)}`}</small></span>
          <button class="btn${fits ? " primary" : ""}" data-a="challenge" data-id="${esc(c.id)}" ${fits ? "" : "disabled"}>${tr("Kokeile", "Try")}</button>
        </div>`;
      }).join("");
    }
    function runChallenge(id) {
      const c = challenges().find((x) => x.id === id);
      if (!c || (c.model && st.modelKey !== c.model)) return;
      setMode("idle");
      // Mittaus: sama rata kaikille (siemen), tulos on mittarin summa koko ajolta
      const taskFn = RS.compileTask(Achievements.measureCode(c));
      const ep = be.episode({ model: S.model, taskFn, terrain: c.terrain, seed: c.seed, population: [Float32Array.from(currentBest())], layers: S.layers, duration: c.duration });
      let score;
      try {
        while (!ep.finished) ep.step();
        score = ep.agents[0].fitness;
      } finally { be.free(ep); }
      const res = Achievements.challengeResult(c.id, score);
      window.rsChallenges = (window.rsChallenges || 0) + 1; // kurssi seuraa haasteyrityksiä (lista piirretään uudelleen)
      drawChallenges();
      // Yritys näytetään uusintana samoilla ehdoilla (sama rata ja kohteet)
      startReplay({ seed: c.seed, terrain: c.terrain, duration: c.duration, taskFn, targets: undefined });
      status(res?.passed
        ? tr(`Haaste "${c.name}" läpäisty: ${fmtMetric(c, score)} (tavoite ${fmtMetric(c, c.goal)}). Uusinta näyttää yrityksen.`, `Challenge "${c.name}" passed: ${fmtMetric(c, score)} (goal ${fmtMetric(c, c.goal)}). The replay shows the attempt.`)
        : tr(`Haaste "${c.name}": ${fmtMetric(c, score)}, tavoite ${fmtMetric(c, c.goal)}. Kouluta lisää ja yritä uudelleen. Uusinta näyttää yrityksen.`, `Challenge "${c.name}": ${fmtMetric(c, score)}, goal ${fmtMetric(c, c.goal)}. Train more and try again. The replay shows the attempt.`), res?.passed ? "ok" : "warn");
    }

    /* ----- Omat reittipisteet: klikkaa näkymää ----- */
    function drawWaypointRow() {
      const box = el.querySelector("#nn-wp");
      if (!box) return;
      const n = waypoints().length;
      box.innerHTML = `<div class="row-actions">
          <button class="btn${S.placing ? " primary" : ""}" data-a="waypoints" aria-pressed="${!!S.placing}">📍 ${S.placing ? tr("Valmis", "Done") : tr("Aseta reittipisteet", "Set waypoints")}</button>
          ${n ? `<button class="link-btn" data-a="clearWaypoints">${tr(`Poista reittipisteet (${n})`, `Remove waypoints (${n})`)}</button>` : ""}
        </div>
        ${n && !usesTarget() ? `<p class="note">${tr("Reittipisteitä käytetään vain tehtävissä, joissa on kohde: valitse tehtäväksi Mene kohteeseen tai Oma tavoite → Mene kohteisiin.", "Waypoints are only used by tasks with a target: pick Reach the target or Custom goal → Reach targets.")}</p>` : ""}`;
    }
    function setPlacing(on) {
      S.placing = on;
      if (on && S.mode !== "idle") { setMode("idle"); preview(); }
      drawWaypointRow();
      el.querySelector("#nn-view").classList.toggle("placing", on);
      const n = waypoints().length;
      if (on) status(tr(`Klikkaa näkymää: jokainen klikkaus lisää reittipisteen (nyt ${n}/${WAYPOINT_MAX}). Robotti kulkee pisteet järjestyksessä ja aloittaa sitten alusta. ${dim === "3d" ? "Vedä hiirellä kääntääksesi näkymää." : "Vedä hiirellä siirtääksesi näkymää, rulla zoomaa."} Paina lopuksi Valmis.`, `Click the view: every click adds a waypoint (now ${n}/${WAYPOINT_MAX}). The robot visits the points in order and then starts over. ${dim === "3d" ? "Drag to turn the view." : "Drag to move the view, scroll to zoom."} Press Done when finished.`));
      else if (n) status(tr(`${n} reittipistettä käytössä. Robotti oppii kulkemaan ne järjestyksessä, kun tehtävässä on kohde. Paina Kouluta.`, `${n} waypoints in use. The robot learns to visit them in order when the task has a target. Press Train.`), "ok");
    }
    function addWaypoint(p) {
      if (!S.placing) return;
      const list = waypoints();
      if (list.length >= WAYPOINT_MAX) { status(tr(`Enintään ${WAYPOINT_MAX} reittipistettä.`, `At most ${WAYPOINT_MAX} waypoints.`), "warn"); return; }
      list.push(dim === "2d" ? { x: +p.x.toFixed(2), y: +p.y.toFixed(2) } : { x: +p.x.toFixed(2), z: +p.z.toFixed(2) });
      st.waypoints = list;
      forgetBest(); // eri reitin pisteet eivät ole vertailukelpoisia
      save();
      preview(); // uusi episodi ottaa pisteet kohteiksi
      setPlacing(true);
      achieve("waypoints");
    }

    async function onAction(e) {
      const a = e.target.closest("[data-a]")?.dataset.a;
      if (!a) return;
      if (a === "adv") { st._adv = !(st._adv ?? settings.advanced); save(); router(); return; }
      if (a === "editModel") {
        editDialog({ title: tr("Muokkaa robottimallia (JSON)", "Edit robot model (JSON)"), help: be.modelHelp, text: JSON.stringify(modelRaw(), null, 2),
          apply: async (text) => {
            let raw;
            try { raw = JSON.parse(text); } catch (err) { throw new Error(tr("JSON-virhe: ", "JSON error: ") + err.message); }
            await applyModel(raw);
          } });
      } else if (a === "editTask") {
        editDialog({ title: tr("Muokkaa palkkiofunktiota (JavaScript)", "Edit reward function (JavaScript)"), help: be.HELP, text: st.taskKey === "custom" && st.taskCodeUntrusted ? st.taskCode : taskCode(),
          apply: (text) => {
            S.taskFn = RS.compileTask(text); // heittää syntaksivirheen
            st.taskKey = "custom"; st.taskCode = text; delete st.taskCodeUntrusted; delete st.goal; trustNote();
            forgetBest();
            save(); drawFields(); drawWaypointRow(); if (S.mode === "idle") preview();
            status(tr("Oma palkkiofunktio otettu käyttöön.", "Custom reward function in use."));
          } });
      } else if (a === "goal") {
        goalDialog({ dim, goal: st.goal, apply: (code, goal) => {
          S.taskFn = RS.compileTask(code);
          st.taskKey = "custom"; st.taskCode = code; st.goal = goal; delete st.taskCodeUntrusted; trustNote();
          forgetBest();
          save(); drawFields(); drawWaypointRow(); if (S.mode === "idle") preview();
          status(tr("Oma tavoite otettu käyttöön. Paina Kouluta. Aivot säilyvät, joten robotti jatkaa nykyisestä osaamisestaan.", "Custom goal in use. Press Train. The brain is kept, so the robot builds on what it already knows."));
          achieve("goal");
        } });
      } else if (a === "exportModel") {
        RS.download(`${dim === "3d" ? "robotti3d" : "robotti"}-malli.json`, JSON.stringify(modelRaw(), null, 2));
      } else if (a === "importModel") {
        const f = await pickFile();
        if (!f) return;
        try { await applyModel(JSON.parse(await RS.readFile(f)), tr(`Malli ladattu tiedostosta ${f.name}.`, `Model loaded from ${f.name}.`)); }
        catch (err) { status(tr("Tiedoston lataus epäonnistui: ", "Loading the file failed: ") + err.message, "err"); }
      } else if (a === "exportBrain") {
        const t = S.trainer, p = t.best || t.mean;
        RS.download(`aivot${dim === "3d" ? "3d" : ""}-${st.modelKey}-${st.taskKey}-sp${S.gen}.json`, JSON.stringify({
          format: BRAIN_FORMAT[dim], savedAt: new Date().toISOString(),
          modelKey: st.modelKey, model: modelRaw(), taskKey: st.taskKey, taskCode: taskCode(),
          terrain: st.terrain, algo: st.algo, opts: opts(), duration: st.duration, hidden: hiddenOf(), layers: S.layers,
          generation: S.gen, bestFitness: isFinite(t.bestFitness) ? t.bestFitness : null, history: S.history.slice(-300),
          params: p ? Array.from(p) : null,
        }));
      } else if (a === "importBrain") {
        const f = await pickFile();
        if (!f) return;
        try { importBrain(JSON.parse(await RS.readFile(f)), f.name); }
        catch (err) { status(tr("Tiedoston lataus epäonnistui: ", "Loading the file failed: ") + err.message, "err"); }
      } else if (a === "reset") {
        if (!(await confirmReset())) return;
        autoArchive();
        setMode("idle"); resetBrain(); preview(); drawChart();
        status(tr("Aivot nollattu.", "Brain reset."));
      } else if (a === "saveRun") {
        const name = askName(tr("Koulutusajon nimi:", "Name of the training run:"), `${S.model.name || tr("Robotti", "Robot")} · ${taskLabel()} · ${tr("sp", "gen")} ${S.gen}`);
        if (!name) return;
        addRun(makeRun(name, false));
        // Juuri tallennettu ajo näkyy heti käyrässä
        st.runShow = [...new Set([...(st.runShow || []), runs()[0].id])];
        saveToolState(key, st, { undo: false });
        drawRuns(); drawChart();
        toast(tr(`Koulutusajo "${name}" tallennettu.`, `Training run "${name}" saved.`));
      } else if (a === "race") {
        if (S.mode === "race") { setMode("idle"); preview(); status(tr("Kisa keskeytettiin.", "The race was stopped.")); return; }
        startRace();
      } else if (a === "useRun" || a === "renameRun" || a === "delRun") {
        const id = e.target.closest("[data-id]")?.dataset.id, list = runs(), r = list.find((x) => x.id === id);
        if (!r) return;
        if (a === "renameRun") {
          const n = askName(tr("Koulutusajon uusi nimi:", "New name for the training run:"), r.name);
          if (n) { r.name = n.slice(0, 80); saveRuns(list); drawRuns(); drawChart(); }
        } else if (a === "delRun") {
          if (!(await RS.ask(tr(`Poistetaanko koulutusajo "${r.name}"?`, `Delete the training run "${r.name}"?`), tr("Poista", "Delete")))) return;
          saveRuns(list.filter((x) => x.id !== id));
          st.runShow = (st.runShow || []).filter((x) => x !== id);
          saveToolState(key, st, { undo: false });
          drawRuns(); drawChart();
        } else await useRun(r);
      } else if (a === "waypoints") {
        setPlacing(!S.placing);
      } else if (a === "clearWaypoints") {
        delete st.waypoints;
        forgetBest();
        save(); setPlacing(false);
        if (S.mode === "idle") preview();
        status(tr("Reittipisteet poistettu: kohteet arvotaan taas.", "Waypoints removed: targets are random again."));
      } else if (a === "builder") {
        RSBridge.simToBuilder(dim);
        location.hash = "#/build" + dim;
      } else if (a === "saveOwn") {
        saveOwn();
      } else if (a === "deploy") {
        openDeploy();
      } else if (a === "share") {
        openShare();
      } else if (a === "coach") {
        startCoach(true);
      } else if (a === "challenge") {
        const id = e.target.closest("[data-id]")?.dataset.id;
        status(tr("Mitataan…", "Measuring…"));
        setTimeout(() => { if (!dead) runChallenge(id); }, 30); // tilaviesti ehtii näkyä ennen mittausta
      }
    }

    // Ensikäytön opastus: robotti → tavoite → kouluta (ei kurssin aikana, jolloin kurssipaneeli opastaa)
    function startCoach(force) {
      coachTour("nn" + dim, [
        { sel: "#nn-pick", text: tr("Valitse robotti: valmiit hahmot, perusmallit tai oma robotti rakentajasta. Esimerkit-valikossa on valmiita yhdistelmiä, jotka oppivat nopeasti.", "Pick a robot: ready characters, basic models or your own robot from the builder. The Examples menu has ready combinations that learn quickly.") },
        { sel: '[data-a="goal"]', text: tr("Valitse, mitä robotin pitää oppia: valmis tehtävä tai Oma tavoite, jossa kokoat palkkion itse.", "Choose what the robot should learn: a ready task or Custom goal, where you build the reward yourself.") },
        { sel: "#nn-train", text: tr("Paina Kouluta. Nopea koulutus käyttää kaikkia prosessoriytimiä, ja näkymässä ajaa paras robotti. Oppimiskäyrä näyttää edistymisen, ja Näytä paras toistaa parhaan yrityksen.", "Press Train. Fast training uses every processor core and the view shows the best robot. The learning curve shows progress, and Show best replays the best attempt.") },
      ], { force });
    }

    // Jaa linkkinä: robotti, tehtävä ja aivot linkkiin ja QR-koodiin
    async function openShare() {
      const raw = modelRaw();
      const meta = { dim, name: String(raw.name || tr("Oma robotti", "Custom robot")).slice(0, 80), terrain: st.terrain, duration: st.duration, hidden: st.hidden, algo: st.algo,
        layers: S.layers, gen: S.gen, best: isFinite(S.trainer?.bestFitness) ? +S.trainer.bestFitness.toPrecision(5) : null };
      if (st.modelKey === "custom") meta.model = raw; else meta.modelKey = st.modelKey;
      if (st.taskKey !== "custom") meta.taskKey = st.taskKey;
      else if (st.goal) meta.goal = st.goal; // tavoitteesta tehdään koodi avattaessa: linkki ei voi tuoda koodia
      else meta.code = taskCode();
      const wps = waypoints();
      if (wps.length) meta.waypoints = wps;
      let url;
      try { url = shareBase() + "#/share/" + (await encodeShare(meta, currentBest())); }
      catch (err) { status(tr("Linkin tekeminen ei onnistunut tässä selaimessa: ", "Making the link failed in this browser: ") + err.message, "err"); return; }
      let dlg = document.getElementById("rs-share");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "rs-share";
        dlg.className = "rs-dlg";
        document.body.append(dlg);
      }
      const n = currentBest().length;
      dlg.innerHTML = `<h2>${tr("Jaa robotti linkkinä", "Share the robot as a link")}</h2>
        <p class="note">${tr(`Linkki sisältää robotin, tehtävän${wps.length ? ", reittipisteet" : ""} ja opitut aivot (${n} painoa, sukupolvi ${S.gen}). Avaaja saa ne uuteen projektiin omaan selaimeensa. Tiedot ovat linkissä itsessään: niitä ei tallenneta palvelimelle.`, `The link contains the robot, the task${wps.length ? ", the waypoints" : ""} and the learned brain (${n} weights, generation ${S.gen}). Whoever opens it gets them in a new project in their own browser. The data is inside the link itself: nothing is stored on a server.`)}</p>
        ${meta.code ? alertsHtml([{ level: "warn", text: tr("Oma palkkiofunktio on koodia: avaajan pitää tarkistaa ja hyväksyä se ennen kuin sitä ajetaan.", "The custom reward function is code: whoever opens the link has to review and accept it before it runs.") }]) : ""}
        <div class="share-link"><input type="text" readonly id="sh-url" aria-label="${tr("Jakolinkki", "Share link")}"><button class="btn primary" id="sh-copy">${tr("Kopioi linkki", "Copy link")}</button></div>
        <p class="note" id="sh-len"></p>
        <div class="share-qr"><canvas id="sh-qr" hidden aria-label="${tr("QR-koodi linkistä", "QR code of the link")}"></canvas><p class="note" id="sh-qr-note"></p></div>
        <div class="row-actions rs-dlg-foot"><button class="btn" data-close>${tr("Sulje", "Close")}</button><button class="btn" id="sh-dl" hidden>${icon("download")} ${tr("Lataa QR-kuva", "Download the QR image")}</button></div>`;
      dlg.querySelector("#sh-url").value = url;
      dlg.querySelector("#sh-len").textContent = tr(`Linkin pituus ${url.length.toLocaleString(LANG)} merkkiä.`, `The link is ${url.length.toLocaleString(LANG)} characters long.`);
      dlg.querySelector("[data-close]").onclick = () => dlg.close();
      dlg.querySelector("#sh-copy").onclick = async () => {
        try { await navigator.clipboard.writeText(url); }
        catch { const i = dlg.querySelector("#sh-url"); i.select(); document.execCommand("copy"); }
        toast(tr("Linkki kopioitu leikepöydälle.", "Link copied to the clipboard."));
        achieve("share");
      };
      dlg.querySelector("#sh-url").onfocus = (e) => e.target.select();
      dlg.showModal();
      const qrNote = dlg.querySelector("#sh-qr-note"), canvas = dlg.querySelector("#sh-qr");
      qrNote.textContent = tr("Tehdään QR-koodia…", "Making the QR code…");
      try {
        await loadQr();
        // Tarkka linkki ensin; jos se ei mahdu, QR-koodiin tehdään tiiviimpi 8-bittinen versio
        let qrUrl = url, approx = false;
        if (url.length > 2900) { qrUrl = shareBase() + "#/share/" + (await encodeShare(meta, currentBest(), true)); approx = true; }
        if (drawQr(canvas, qrUrl)) {
          canvas.hidden = false;
          qrNote.textContent = approx
            ? tr("Puhelimen kamera avaa robotin QR-koodista. QR-koodiin aivot on pakattu tiiviimmin (8-bittiset painot), joten robotti voi liikkua hieman eri tavalla kuin linkissä.", "A phone camera opens the robot from the QR code. In the QR code the brain is packed more tightly (8-bit weights), so the robot may move slightly differently than with the link.")
            : tr("Puhelimen kamera avaa linkin QR-koodista.", "A phone camera opens the link from the QR code.");
          const dl = dlg.querySelector("#sh-dl");
          dl.hidden = false;
          dl.onclick = () => { const a = document.createElement("a"); a.href = canvas.toDataURL("image/png"); a.download = `robolab-${dim}-${st.modelKey}.png`; a.click(); };
        } else {
          qrNote.textContent = tr(`Robotin aivot ovat liian isot QR-koodiksi (QR-koodiin mahtuu noin 2 900 merkkiä). Kopioi linkki, tai pienennä verkkoa lisäasetuksista (esim. piilokerrokset 16,16) ja kouluta uudelleen.`, `The robot's brain is too big for a QR code (a QR code holds about 2,900 characters). Copy the link, or make the network smaller in the advanced settings (e.g. hidden layers 16,16) and train again.`);
        }
      } catch {
        qrNote.textContent = tr("QR-kirjastoa ei saatu ladattua (tarvitset internetyhteyden). Linkki toimii silti.", "Could not load the QR library (you need an internet connection). The link still works.");
      }
    }

    // Vie aivot omalle robotille: koodi mikrokontrollerille tai tietokoneelle + sensorien ja moottorien kytkentäohje
    function openDeploy() {
      const TARGETS = {
        arduino: { label: "Arduino (.ino)", hint: tr("Valmis luonnos Arduino IDE:hen. Avaa tiedosto, täytä TODO-kohdat robottisi antureilla ja moottoreilla ja lataa levylle. Sarjamonitorin itsetesti kertoo, laskeeko levy verkon samoin kuin simulaatio. Toimii Arduino Unolla, Nanolla, Megalla, ESP32:lla, Picolla, Teensyllä…", "A ready sketch for the Arduino IDE. Open the file, fill the TODO lines with your robot’s sensors and motors and upload it. The self-test in the serial monitor tells whether the board computes the network like the simulation. Works on Arduino Uno, Nano, Mega, ESP32, Pico, Teensy…") },
        c: { label: "C/C++ (.h)", hint: tr("Otsaketiedosto mihin tahansa C/C++-projektiin (ESP-IDF, PlatformIO, STM32CubeIDE, Pico SDK). #include \"robolab_brain.h\" ja kutsu robolab_brain(in, out) 60 kertaa sekunnissa.", "A header for any C/C++ project (ESP-IDF, PlatformIO, STM32CubeIDE, Pico SDK). #include \"robolab_brain.h\" and call robolab_brain(in, out) 60 times per second.") },
        python: { label: "MicroPython / Python", hint: tr("MicroPython (ESP32, Raspberry Pi Pico): kytke laite USB:llä ja paina \"Lataa laitteelle USB:llä\" — koodi tallentuu nimellä main.py ja käynnistyy. Raspberry Pi tai PC: python3 tiedosto.py.", "MicroPython (ESP32, Raspberry Pi Pico): plug the board in over USB and press \"Upload over USB\" — the code is saved as main.py and starts. Raspberry Pi or PC: python3 file.py.") },
        link: { label: tr("Live-linkki (USB)", "Live link (USB)"), hint: tr("Testaa aivoja oikealla robotilla ilman latausta: lataa tämä luonnos robotille, täytä anturit ja moottorit, ja paina \"Yhdistä ja aja\". Robotti lähettää anturit USB:llä, RoboLab laskee aivot ja lähettää moottorikomennot takaisin. Kun koulutat lisää, robotti saa heti uudet aivot.", "Test the brain on the real robot without uploading it: put this sketch on the robot, fill in sensors and motors, and press \"Connect and run\". The robot sends its sensors over USB, RoboLab runs the brain and sends the motor commands back. Train more and the robot gets the new brain right away.") },
        json: { label: "JSON", hint: tr("Painot ja sensorien kuvaus koneluettavana muihin ympäristöihin (ROS, Unity, C#, Rust…). Laskenta: jokaiselle kerrokselle out = tanh(W·in + b).", "Weights and the sensor description in machine-readable form for other environments (ROS, Unity, C#, Rust…). Computation: for each layer out = tanh(W·in + b).") },
        wiring: { label: tr("Kytkentäohje", "Wiring guide"), hint: tr("Ehdotus osista ja Raspberry Pi Picon nastoista juuri tälle robotille: moottoriohjaimet, servot, anturit, virta ja turvallisuus. Suuntaa antava: tarkista oman laitteesi nastat.", "Suggested parts and Raspberry Pi Pico pins for this robot: motor drivers, servos, sensors, power and safety. Indicative: check your own board's pins.") },
      };
      // Kouluttamattomilla aivoilla (ei vielä yhtään sukupolvea) viedään satunnaiset painot: dialogi aukeaa silti
      const t = S.trainer, p = currentBest();
      const raw = modelRaw();
      const base = { dim, model: S.model, layers: S.layers, params: p, name: raw.name || tr("Oma robotti", "Custom robot"), gen: S.gen,
        fitness: t && isFinite(t.bestFitness) ? t.bestFitness : null, task: st.taskKey === "custom" ? tr("oma", "custom") : be.TASKS[st.taskKey].name };
      const info = RS.deployInfo(dim, S.model);
      const kb = (p.length * 4 / 1024).toFixed(1);
      let target = TARGETS[st.deployTarget] ? st.deployTarget : "arduino", out = null, liveLink = null;
      const linkBrain = new RS.Brain(S.layers);

      let dlg = document.getElementById("rs-deploy");
      if (!dlg) {
        dlg = document.createElement("dialog");
        dlg.id = "rs-deploy";
        dlg.className = "rs-dlg wide";
        document.body.append(dlg);
      }
      const row = (cells) => `<tr>${cells.map((c, i) => (i === 0 ? `<td><code>${c}</code></td>` : `<td>${c}</td>`)).join("")}</tr>`;
      dlg.innerHTML = `<h2>${tr("Vie aivot omalle robotille", "Put the brain on a real robot")}</h2>
        <p class="note">${tr(`Opittu neuroverkko (${S.layers.join(" → ")}, ${p.length} painoa ≈ ${kb} kt) muutetaan koodiksi, joka ajaa sen mikrokontrollerilla. Robotin pitää vastata mallia: samat moottorit samassa järjestyksessä ja anturit, joista sisääntulot saadaan.`, `The learned neural network (${S.layers.join(" → ")}, ${p.length} weights ≈ ${kb} kB) is turned into code that runs it on a microcontroller. The robot has to match the model: the same motors in the same order and sensors that provide the inputs.`)}</p>
        ${S.gen === 0 ? alertsHtml([{ level: "warn", text: tr("Aivoja ei ole vielä koulutettu — vienti toimii, mutta robotti liikkuu satunnaisesti. Kouluta ensin.", "The brain is not trained yet — export works, but the robot moves randomly. Train first.") }]) : ""}
        ${p.length * 4 > 20000 ? alertsHtml([{ level: "warn", text: tr(`Verkko vie ${kb} kt — liian iso Arduino Unolle/Nanolle (32 kt flash). Käytä ESP32:ta tai Picoa, tai pienennä piilokerroksia (esim. 16,16) lisäasetuksista.`, `The network takes ${kb} kB — too big for an Arduino Uno/Nano (32 kB flash). Use an ESP32 or a Pico, or make the hidden layers smaller (e.g. 16,16) in the advanced settings.`) }]) : ""}
        <div class="seg" id="dp-target" role="tablist">${Object.entries(TARGETS).map(([k, v]) => `<button data-t="${k}" role="tab">${v.label}</button>`).join("")}</div>
        <p class="note" id="dp-hint" style="margin:10px 0"></p>
        <details class="dp-io" open><summary>${tr(`Sisääntulot: ${info.inputs.length} anturiarvoa`, `Inputs: ${info.inputs.length} sensor values`)}</summary>
          <div class="dp-scroll"><table class="dp-table"><tr><th>#</th><th>${tr("Nimi", "Name")}</th><th>${tr("Mistä arvo saadaan", "Where the value comes from")}</th></tr>
          ${info.inputs.map((x, i) => row([i, `<b>${esc(x.name)}</b><br><small>${x.id}</small>`, esc(x.how)])).join("")}</table></div></details>
        <details class="dp-io"><summary>${tr(`Ulostulot: ${info.outputs.length} moottoria`, `Outputs: ${info.outputs.length} motors`)}</summary>
          <div class="dp-scroll"><table class="dp-table"><tr><th>#</th><th>${tr("Nivel", "Joint")}</th><th>${tr("Mitä arvo tarkoittaa", "What the value means")}</th></tr>
          ${info.outputs.map((x, i) => row([i, `<b>${esc(x.name)}</b><br><small>${x.id}</small>`, esc(x.how)])).join("")}</table></div></details>
        <textarea id="dp-code" readonly spellcheck="false" aria-label="${tr("Generoitu koodi", "Generated code")}"></textarea>
        <div class="dp-usb" id="dp-usb" hidden>
          <button class="btn primary" id="dp-usb-go"></button>
          <div class="ai-progress" id="dp-usb-prog" hidden><div class="bar"><span></span></div><small></small></div>
          <div class="note" id="dp-usb-status"></div>
        </div>
        <p class="note">${tr("Simulaatio ei ole koskaan täsmälleen todellisuus: kitka, viiveet ja anturien kohina eroavat. Aloita hitaasti ja varmista, että robotin voi pysäyttää. Siirtyminen toimii parhaiten, kun mallin mitat, massat ja moottorien nopeudet vastaavat oikeaa robottia ja koulutat vaihtelevassa maastossa.", "A simulation is never exactly reality: friction, delays and sensor noise differ. Start slowly and make sure you can stop the robot. Transfer works best when the model’s sizes, masses and motor speeds match the real robot and you train on varied terrain.")}</p>
        <div class="row-actions rs-dlg-foot"><button class="btn" data-close>${tr("Sulje", "Close")}</button><button class="btn" data-copy>${tr("Kopioi koodi", "Copy code")}</button><button class="btn primary" data-dl>${icon("download")} <span></span></button></div>`;

      const show = () => {
        dlg.querySelectorAll("#dp-target button").forEach((b) => { b.classList.toggle("on", b.dataset.t === target); b.setAttribute("aria-selected", b.dataset.t === target); });
        dlg.querySelector("#dp-hint").textContent = TARGETS[target].hint;
        try {
          out = target === "link" ? { filename: "robolab_link.ino", code: RS.USB.linkSketch(info) }
            : target === "wiring" ? RS.wiringGuide(base) : RS.deployCode(target, base);
          dlg.querySelector("#dp-code").value = out.code;
        } catch (err) { out = null; dlg.querySelector("#dp-code").value = err.message; }
        dlg.querySelector("[data-dl] span").textContent = out ? tr(`Lataa ${out.filename}`, `Download ${out.filename}`) : tr("Lataa", "Download");
        // USB-toiminnot: MicroPythonin lataus laitteelle ja live-linkki
        const usb = dlg.querySelector("#dp-usb");
        usb.hidden = !(target === "python" || target === "link");
        const go = dlg.querySelector("#dp-usb-go");
        go.disabled = !RS.USB.supported() || !out;
        go.textContent = target === "link" ? (liveLink ? tr("Pysäytä linkki", "Stop the link") : tr("🔌 Yhdistä ja aja", "🔌 Connect and run"))
          : tr("⚡ Lataa laitteelle USB:llä", "⚡ Upload over USB");
        dlg.querySelector("#dp-usb-status").textContent = RS.USB.supported() ? "" : tr("USB-yhteys vaatii Chromen tai Edgen (Web Serial).", "USB needs Chrome or Edge (Web Serial).");
      };
      const usbStatus = (t) => { dlg.querySelector("#dp-usb-status").textContent = t; };
      dlg.querySelector("#dp-usb-go").onclick = async () => {
        if (target === "python") {
          const prog = dlg.querySelector("#dp-usb-prog");
          prog.hidden = false;
          try {
            await RS.USB.flashMicroPython(out.code, (text, p) => { prog.querySelector("span").style.width = Math.round(p * 100) + "%"; prog.querySelector("small").textContent = text; });
            toast(tr("Aivot ladattu laitteelle", "Brain uploaded to the device"));
          } catch (err) {
            if (err?.name !== "NotFoundError") usbStatus("⚠ " + (err?.message || err));
            prog.hidden = true;
          }
          return;
        }
        if (liveLink) { await liveLink.stop(); liveLink = null; usbStatus(tr("Linkki pysäytetty.", "Link stopped.")); show(); return; }
        try {
          liveLink = await RS.USB.link({
            inputs: S.layers[0],
            // Aina uusimmat aivot: koulutus voi jatkua samaan aikaan
            step: (v) => linkBrain.forward(Float32Array.from(currentBest()), v),
            onStatus: (s) => {
              if (s.hz) usbStatus(tr(`Yhdistetty · ${s.hz.toFixed(0)} kertaa/s · moottorit: `, `Connected · ${s.hz.toFixed(0)} per second · motors: `) + s.output.map((x) => x.toFixed(2)).join(", "));
              else if (s.bad) usbStatus(tr(`Robotti lähetti ${s.got} arvoa, aivot tarvitsevat ${s.expected}.`, `The robot sent ${s.got} values, the brain needs ${s.expected}.`));
            },
          });
          usbStatus(tr("Yhdistetty — odotetaan robotin \"S:\"-rivejä…", "Connected — waiting for \"S:\" lines from the robot…"));
          show();
        } catch (err) { liveLink = null; if (err?.name !== "NotFoundError") usbStatus("⚠ " + (err?.message || err)); }
      };
      dlg.onclose = () => { liveLink?.stop(); liveLink = null; };
      dlg.querySelector("#dp-target").onclick = (e) => {
        const b = e.target.closest("[data-t]");
        if (!b) return;
        target = b.dataset.t; st.deployTarget = target; saveToolState(key, st, { undo: false }); show();
      };
      dlg.querySelector("[data-close]").onclick = () => dlg.close();
      dlg.querySelector("[data-copy]").onclick = async () => {
        if (!out) return;
        try { await navigator.clipboard.writeText(out.code); toast(tr("Koodi kopioitu leikepöydälle.", "Code copied to the clipboard.")); }
        catch { dlg.querySelector("#dp-code").select(); document.execCommand("copy"); toast(tr("Koodi kopioitu.", "Code copied.")); }
      };
      dlg.querySelector("[data-dl]").onclick = () => { if (out) RS.download(out.filename, out.code); };
      show();
      dlg.showModal();
      window.rsDeployOpened = (window.rsDeployOpened || 0) + 1; // kurssi seuraa avauskertoja (vasta kun dialogi oikeasti aukesi)
      achieve("deploy");
    }

    function importBrain(d, name) {
      if (!d || d.format !== BRAIN_FORMAT[dim]) throw new Error(dim === "3d" ? tr("Tiedosto ei ole RoboSim 3D -aivot-tiedosto.", "The file is not a RoboSim 3D brain file.") : tr("Tiedosto ei ole RoboSim 2D -aivot-tiedosto.", "The file is not a RoboSim 2D brain file."));
      const raw = d.model;
      be.normalize(raw);
      autoArchive();
      delete st.libId;
      Object.assign(st, {
        modelKey: Object.hasOwn(be.MODELS, d.modelKey) ? d.modelKey : "custom", modelRaw: Object.hasOwn(be.MODELS, d.modelKey) ? undefined : raw,
        taskKey: Object.hasOwn(be.TASKS, d.taskKey) ? d.taskKey : "custom", taskCode: Object.hasOwn(be.TASKS, d.taskKey) ? undefined : String(d.taskCode ?? ""),
        taskCodeUntrusted: Object.hasOwn(be.TASKS, d.taskKey) ? undefined : true, goal: undefined,
        terrain: d.terrain in be.TERRAINS ? d.terrain : "flat", algo: d.algo === "ga" ? "ga" : "es",
        popSize: d.opts?.popSize ?? st.popSize, sigma: d.opts?.sigma ?? st.sigma, lr: d.opts?.lr ?? st.lr,
        duration: d.duration || st.duration, hidden: (d.hidden || [32, 32]).join(","),
      });
      save();
      saveToolState(brainKey, { layers: d.layers, params: d.params, bestFitness: d.bestFitness, gen: d.generation || 0, history: d.history || [] }, { undo: false });
      setMode("idle");
      setupBrain(true); drawFields(); preview(); drawChart(); trustNote();
      status(tr(`Aivot ladattu tiedostosta ${name} (sukupolvi ${S.gen}).`, `Brain loaded from ${name} (generation ${S.gen}).`) + (st.taskCodeUntrusted ? tr(" Tiedoston oma palkkiofunktio on pois käytöstä, kunnes tarkistat sen (Muokkaa palkkiofunktiota).", " The file's own reward function is off until you review it (Edit reward function).") : ""), st.taskCodeUntrusted ? "warn" : "ok");
    }

    function unmount() {
      flushBrain();
      if (S?.fsKey) document.removeEventListener("keydown", S.fsKey);
      S?.fsOff?.();
      S?.vizObserver?.disconnect();
      dead = true;
      cancelAnimationFrame(raf);
      pool?.terminate();
      pool = null;
      if (S?.episode && be) be.free(S.episode);
      if (S) S.episode = null;
      view?.dispose();
      view = null;
    }

    // Esimerkit: valmiit yhdistelmät, jotka oppivat nopeasti
    const ex = (name, desc, cfg) => ({ name, desc, apply: () => {
      if (S && !dead) { flushBrain(); autoArchive(); }
      const cur = getToolState(key, B.defaults);
      saveToolState(key, { ...B.defaults, ...cfg, speed: cur.speed ?? MAX_SPEED, showAll: cur.showAll ?? true, follow: cur.follow ?? true, _adv: cur._adv,
        parallel: cur.parallel ?? true, sensors: cur.sensors, orbit: cur.orbit, runShow: cur.runShow });
      saveToolState(brainKey, {}, { undo: false });
      saveToolState(statsKey, {}, { undo: false }); // uudet aivot aloittavat sukupolvesta 0
    } });
    const examples = dim === "2d" ? [
      ex(tr("Pyöräauto oppii ajamaan", "A car learns to drive"), tr("Nopein alku: oppii alle minuutissa", "The fastest start: learns in under a minute"), { modelKey: "car", taskKey: "forward", duration: 10 }),
      ex(tr("Grip osuu kohteisiin", "Grip hits targets"), tr("Kohteet arvotaan ilmaan käden ulottuville", "Targets appear in the air within reach"), { modelKey: "grip", taskKey: "target", duration: 10 }),
      ex(tr("Wobbly pysyy pystyssä", "Wobbly stays upright"), tr("Klassinen säätötehtävä neuroverkolla", "A classic control task with a neural network"), { modelKey: "wobbly", taskKey: "balance", duration: 15 }),
      ex(tr("Zippy oppii lentämään", "Zippy learns to fly"), tr("Drooni lentää kohteisiin säätämällä roottoreita", "The drone flies to targets by adjusting its rotors"), { modelKey: "zippy", taskKey: "target", duration: 10 }),
      ex(tr("Neura oppii kävelemään", "Neura learns to walk"), tr("Kävelypalkkio: askeleet pystyssä, ei ryömimistä", "Gait reward: steps while upright, no crawling"), { modelKey: "neura", taskKey: "walk", duration: 15, hidden: "48,48" }),
      ex(tr("Kaksijalkainen kävelijä (vaikea)", "Biped walker (hard)"), tr("Kävelypalkkiolla, vaatii satoja sukupolvia", "With the gait reward, takes hundreds of generations"), { modelKey: "biped", taskKey: "walk", duration: 15 }),
      ex(tr("Mato portailla", "A worm on stairs"), tr("Ryömii eteenpäin epätasaisessa maastossa", "Crawls forward on uneven terrain"), { modelKey: "worm", taskKey: "forward", terrain: "stairs" }),
      ex(tr("Pyöräauto: helposta vaikeaan", "Car: from easy to hard"), tr("Maasto vaikeutuu itsestään, kun oppiminen tasaantuu", "The terrain gets harder by itself when learning levels off"), { modelKey: "car", taskKey: "forward", terrain: "flat", autoTerrain: true, duration: 12 }),
      ex(tr("Grip kulkee oman reitin", "Grip follows its own route"), tr("Käsi oppii käymään kolmessa omassa pisteessä järjestyksessä", "The arm learns to visit three points of your own in order"), { modelKey: "grip", taskKey: "target", duration: 12, waypoints: [{ x: 1, y: 1.5 }, { x: -1, y: 1.2 }, { x: 0.4, y: 2 }] }),
    ] : [
      ex(tr("Pyöräauto ajaa eteenpäin", "A car drives forward"), tr("Oppii noin 30 sekunnissa", "Learns in about 30 seconds"), { modelKey: "car", taskKey: "forward" }),
      ex(tr("Dusty etsii kohteita", "Dusty finds targets"), tr("Robotti-imuri kääntyy pyörien nopeuserolla", "The robot vacuum turns using the wheel speed difference"), { modelKey: "dusty", taskKey: "target" }),
      ex(tr("Grip osuu kohteisiin", "Grip hits targets"), tr("Kohteet ovat ilmassa, 4 niveltä", "Targets in the air, 4 joints"), { modelKey: "grip", taskKey: "target" }),
      ex(tr("Zippy lentää kohteisiin", "Zippy flies to targets"), tr("Nelikopteri oppii säätämään neljää roottoria", "The quadcopter learns to control four rotors"), { modelKey: "zippy", taskKey: "target" }),
      ex(tr("Tasapainorobotti", "Balancing robot"), tr("Pysyy pystyssä noin 30 sekunnin koulutuksella", "Stays upright after about 30 s of training"), { modelKey: "balancer", taskKey: "balance" }),
      ex(tr("Hämähäkki kävelee", "Spider walks"), tr("Kahdeksan jalkaa ja kävelypalkkio — oppii askeltamaan", "Eight legs and the gait reward — learns to step"), { modelKey: "spider", taskKey: "walk", duration: 12, hidden: "48,48" }),
      ex(tr("Kuusijalkainen kävelee", "Hexapod walks"), tr("Vakaa alusta: helpoin kävelijä", "A stable base: the easiest walker"), { modelKey: "hexapod", taskKey: "walk", duration: 12 }),
      ex(tr("Neura kävelee 3D:ssä", "Neura walks in 3D"), tr("Neljä jalkaa, lonkka ja polvi", "Four legs, hip and knee"), { modelKey: "neura", taskKey: "walk", duration: 12 }),
      ex(tr("Pyöräauto: helposta vaikeaan", "Car: from easy to hard"), tr("Maasto vaikeutuu itsestään, kun oppiminen tasaantuu", "The terrain gets harder by itself when learning levels off"), { modelKey: "car", taskKey: "forward", terrain: "flat", autoTerrain: true }),
      ex(tr("Dusty imuroi oman reitin", "Dusty vacuums its own route"), tr("Imuri oppii kiertämään neljä omaa pistettä järjestyksessä", "The vacuum learns to go round four points of your own in order"), { modelKey: "dusty", taskKey: "target", duration: 20, waypoints: [{ x: 3, z: 0 }, { x: 3, z: 3 }, { x: 0, z: 3 }, { x: 0, z: 0 }] }),
    ];

    return { render, unmount, examples };
  }

  TOOL_IMPL.nn2d = makeTool("2d");
  TOOL_IMPL.nn3d = makeTool("3d");

  /* ===== Jaetun linkin avaaminen (#/share/<data>, app.js router) =====
     Linkin sisältö on tuntematonta dataa: jokainen kenttä tarkistetaan, nimet näytetään esc():llä, palkkiofunktion
     koodi merkitään tarkistettavaksi (taskCodeUntrusted) ja Oma tavoite tehdään koodiksi vasta täällä. */
  window.RSShare = {
    encode: encodeShare, // testit ja muut työkalut
    async open(data) {
      let d;
      try { d = await decodeShare(String(data)); }
      catch { toast(tr("Jakolinkki on rikki tai liian pitkä.", "The share link is broken or too long.")); return; }
      const m = d.meta, p = d.params;
      const dim = m?.dim === "3d" ? "3d" : m?.dim === "2d" ? "2d" : null;
      const layers = Array.isArray(m?.layers) ? m.layers : [];
      const okLayers = layers.length >= 2 && layers.length <= 10 && layers.every((n) => Number.isInteger(n) && n > 0 && n <= 4096);
      if (m?.v !== SHARE_VERSION || !dim || !okLayers || p.length !== RS.Brain.paramCount(layers) || !p.every(Number.isFinite)) {
        toast(tr("Jakolinkki on rikki tai tehty eri RoboLab-versiolla.", "The share link is broken or made with a different RoboLab version."));
        return;
      }
      const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
      const name = String(m.name || tr("Jaettu robotti", "Shared robot")).slice(0, 80);
      const gen = Math.max(0, Math.floor(Number(m.gen) || 0));
      const ok = await RS.ask(tr(`Avataanko jaettu robotti "${name}" (${dim.toUpperCase()}, ${gen} sukupolvea koulutusta)?\n\nSe avataan uuteen projektiin, joten omat työsi säilyvät ennallaan.`,
        `Open the shared robot "${name}" (${dim.toUpperCase()}, ${gen} generations of training)?\n\nIt opens in a new project, so your own work stays as it is.`), tr("Avaa", "Open"));
      if (!ok) return;
      const B = BACKENDS[dim], key = "nn" + dim;
      const st = { ...B.defaults, speed: MAX_SPEED, showAll: true, follow: true, parallel: true, hidden: layers.slice(1, -1).join(",") };
      if (typeof m.modelKey === "string" && /^[\w-]{1,40}$/.test(m.modelKey)) st.modelKey = m.modelKey;
      else if (isObj(m.model) && Array.isArray(m.model.bodies) && Array.isArray(m.model.joints)) { st.modelKey = "custom"; st.modelRaw = m.model; }
      if (typeof m.taskKey === "string" && /^[\w-]{1,40}$/.test(m.taskKey)) st.taskKey = m.taskKey;
      else if (isObj(m.goal)) {
        try { st.taskCode = goalCode(dim, m.goal); st.taskKey = "custom"; st.goal = JSON.parse(JSON.stringify(m.goal)); } catch {}
      } else if (typeof m.code === "string") { st.taskKey = "custom"; st.taskCode = m.code.slice(0, 20000); st.taskCodeUntrusted = true; }
      if (typeof m.terrain === "string" && /^\w{1,20}$/.test(m.terrain)) st.terrain = m.terrain;
      if (Number.isFinite(m.duration)) st.duration = RS.clamp(Math.round(m.duration), 2, 120);
      if (m.algo === "ga") st.algo = "ga";
      if (Array.isArray(m.waypoints)) {
        st.waypoints = m.waypoints.filter((w) => isObj(w) && Number.isFinite(w.x) && Number.isFinite(dim === "2d" ? w.y : w.z)).slice(0, WAYPOINT_MAX)
          .map((w) => (dim === "2d" ? { x: w.x, y: w.y } : { x: w.x, z: w.z }));
      }
      const proj = newProject(tr("Jaettu: ", "Shared: ") + name);
      proj.tools[key] = st;
      proj.tools[key + "Brain"] = { layers, params: Array.from(p, (v) => +v.toPrecision(6)), bestFitness: Number.isFinite(m.best) ? m.best : null, gen, history: [] };
      const prev = projects.active;
      projects.projects[proj.id] = proj;
      projects.active = proj.id;
      if (!saveProjects()) {
        delete projects.projects[proj.id];
        projects.active = prev;
        saveProjects();
        toast(tr("Selaimen tallennustila on täynnä, joten jaettua robottia ei voitu avata.", "The browser storage is full, so the shared robot could not be opened."));
        return;
      }
      refreshCrumbs?.();
      achieve("shareOpen");
      location.hash = "#/" + key;
      toast(tr(`Jaettu robotti "${name}" avattiin projektiin "${proj.name}".`, `The shared robot "${name}" opened in the project "${proj.name}".`));
    },
  };

  /* ===== Siirrot rakentajan ja simulaation välillä =====
     Robotti kulkee projektin tilassa: rakentaja lukee build2d/build3d.importRaw-kentän ja simulaatio nn2d/nn3d-mallin. */
  window.RSBridge = Object.assign(window.RSBridge || {}, {
    simToBuilder(dim) {
      const MODELS = dim === "2d" ? RS.MODELS : null;
      const st = getToolState("nn" + dim, BACKENDS[dim].defaults);
      const raw = st.modelKey === "custom" ? st.modelRaw : (MODELS ? MODELS[st.modelKey] : { builtin3d: st.modelKey });
      const cur = getToolState("build" + dim, {});
      saveToolState("build" + dim, { ...cur, importRaw: raw });
    },
  });
})();
