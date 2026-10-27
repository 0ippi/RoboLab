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
      this.ro = new ResizeObserver(() => this.r.resize());
      this.ro.observe(canvas);
      this.r.resize();
    }
    setEpisode(ep) { this.ep = ep; }
    draw(o) {
      const ep = this.ep;
      const focus = ep ? ep.leader() : -1;
      if (ep && focus >= 0 && o.follow && !this.manual) {
        const p = ep.agents[focus].robot.root.getPosition();
        this.r.follow(p.x, p.y, o.snap);
      }
      this.r.draw(ep, { focus, showAll: o.showAll, showTarget: o.showTarget });
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
    }
    setEpisode(ep) { this.v.setEpisode(ep); this.ep = ep; }
    draw(o) { this.v.draw({ focus: this.ep ? this.ep.leader() : -1, showAll: o.showAll, follow: o.follow, snap: o.snap, showTarget: o.showTarget }); }
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
          calm: true,
          modelHelp: tr("Osat (bodies): id, pos [x,y,z], rot [x,y,z] asteina, shape \"box\" (size [w,h,d]), \"sphere\" (r), \"cylinder\" tai \"capsule\" (r, h; akseli y-suunnassa), density, friction, color, foot (maakosketussensori), static.\nUseita muotoja yhteen osaan: shapes: [{type, size, r, h, pos, rot, color}].\nNivelet (joints): a, b, pos [x,y,z], axis [x,y,z] (kiertoakseli), lower, upper (asteina), strength, speed (rad/s), motor: false.\nroot, fall { rootContact, minUpright }, sensors { scan: 5 }. x eteenpäin, y ylöspäin, z sivulle.\nMallin muuttaminen nollaa aivot.",
            "Parts (bodies): id, pos [x,y,z], rot [x,y,z] in degrees, shape \"box\" (size [w,h,d]), \"sphere\" (r), \"cylinder\" or \"capsule\" (r, h; axis along y), density, friction, color, foot (ground contact sensor), static.\nSeveral shapes in one part: shapes: [{type, size, r, h, pos, rot, color}].\nJoints: a, b, pos [x,y,z], axis [x,y,z] (rotation axis), lower, upper (degrees), strength, speed (rad/s), motor: false.\nroot, fall { rootContact, minUpright }, sensors { scan: 5 }. x forward, y up, z sideways.\nChanging the model resets the brain."),
        };
      },
    },
  };

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
    let el, st, be, view, S, dead = true, raf = 0, chan = null, token = 0;

    const hiddenOf = () => { try { return RS.parseHidden(st.hidden); } catch { return [32, 32]; } };
    const modelRaw = () => (st.modelKey === "custom" ? st.modelRaw : be.MODELS[st.modelKey]);
    // Tuodun tiedoston oma palkkiofunktio (koodia) ajetaan vasta, kun käyttäjä on tarkistanut sen editorissa
    const taskCode = () => (st.taskKey === "custom" ? (st.taskCodeUntrusted ? be.TASKS[B.defaults.taskKey].code : st.taskCode) : be.TASKS[st.taskKey].code);
    const opts = () => ({ popSize: Math.round(st.popSize), sigma: st.sigma, lr: st.lr });
    const save = () => saveToolState(key, st);

    function saveBrain() {
      const t = S.trainer, p = t.best || t.mean;
      const brain = {
        layers: S.layers, params: p ? Array.from(p, (v) => +v.toPrecision(6)) : null,
        bestFitness: isFinite(t.bestFitness) ? t.bestFitness : null, gen: S.gen, history: S.history.slice(-300),
      };
      saveToolState(brainKey, brain, { undo: false });
      saveToolState(statsKey, { generation: S.gen, bestFitness: brain.bestFitness, lastBest: S.last?.best ?? null, lastMean: S.last?.mean ?? null,
        model: modelRaw()?.name, task: st.taskKey === "custom" ? "custom" : be.TASKS[st.taskKey].name }, { undo: false });
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

    function setEpisode(population) {
      const old = S.episode;
      S.episode = be.episode({ model: S.model, taskFn: S.taskFn, terrain: st.terrain, seed: (Math.random() * 1e9) | 0, population, layers: S.layers, duration: st.duration });
      view.setEpisode(S.episode);
      if (old) be.free(old);
      S.snap = true;
    }
    const preview = () => setEpisode([currentBest()]);

    function setMode(mode) {
      S.mode = mode;
      const tb = el.querySelector("#nn-train"), rb = el.querySelector("#nn-replay");
      tb.innerHTML = mode === "train" ? `❚❚ ${tr("Tauko", "Pause")}` : `▶ ${tr("Kouluta", "Train")}`;
      tb.classList.toggle("primary", mode !== "train");
      rb.textContent = mode === "replay" ? tr("Lopeta", "Stop") : tr("Näytä paras", "Show best");
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

    const confirmReset = () => S.gen === 0 || RS.ask(tr(`Tämä nollaa opitut aivot (${S.gen} sukupolvea). Jatketaanko?\n\nVoit tallentaa ne ensin Vie aivot -painikkeella.`, `This resets the learned brain (${S.gen} generations). Continue?\n\nYou can save it first with Export brain.`), tr("Nollaa ja jatka", "Reset and continue"));

    function endGeneration() {
      const fit = S.episode.fitness();
      S.trainer.tell(fit);
      S.gen++;
      const best = Math.max(...fit), mean = fit.reduce((a, b) => a + b, 0) / fit.length;
      S.last = { best, mean };
      S.history.push({ best, mean });
      if (S.history.length > 1000) S.history.shift();
      drawChart();
      saveBrain();
      setEpisode(S.trainer.ask());
    }

    /* ----- Silmukat: fysiikka erikseen piirrosta, jotta maksiminopeudella koulutus jatkuu taustallakin ----- */
    let stepDebt = 0, lastStep = 0;
    function physics(id) {
      if (dead || id !== token) return; // vanhan piirtokerran silmukka loppuu
      const now = performance.now();
      const elapsed = Math.min(0.25, (now - lastStep) / 1000);
      lastStep = now;
      const v = st.speed, max = v >= MAX_SPEED;
      try {
        if (S.mode !== "idle" && S.episode) {
          stepDebt = max ? Infinity : Math.min(stepDebt + elapsed * 60 * v, 60 * v * 0.25);
          const t0 = performance.now();
          while (stepDebt >= 1 && performance.now() - t0 < 25) {
            S.episode.step();
            stepDebt--;
            if (S.episode.finished) {
              if (S.mode === "train") endGeneration();
              else setEpisode([currentBest()]);
            }
          }
          if (max) stepDebt = 0;
        } else stepDebt = 0;
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
      view.draw({ showAll: st.showAll, follow: st.follow, snap: S.snap, showTarget: /targetDist|s\.target/.test(taskCode()) });
      S.snap = false;
      updateHud();
      raf = requestAnimationFrame(frame);
    }

    const f2 = (v) => (v == null || !isFinite(v) ? "–" : fmt(v, Math.abs(v) >= 100 ? 0 : 2));
    function updateHud() {
      const ep = S.episode, h = el.querySelector("#nn-hud");
      if (!h) return;
      const vals = [S.gen, f2(S.trainer?.bestFitness), f2(S.last?.best), f2(S.last?.mean), ep ? fmt(ep.t, 1) + " s" : "–",
        ep ? `${ep.agents.filter((a) => !a.done).length} / ${ep.agents.length}` : "–"];
      h.querySelectorAll("b").forEach((b, i) => { if (b.textContent !== String(vals[i])) b.textContent = vals[i]; });
    }

    function drawChart() {
      const c = el.querySelector("#nn-chart");
      if (!c) return;
      if (S.history.length < 2) {
        el.querySelector("#nn-chart-empty").hidden = false;
        c.hidden = true;
        return;
      }
      el.querySelector("#nn-chart-empty").hidden = true;
      c.hidden = false;
      const x = S.history.map((_, i) => S.gen - S.history.length + i + 1);
      drawPlot(c, {
        xLabel: tr("sukupolvi", "generation"),
        series: [
          { x, y: S.history.map((h) => h.mean), label: tr("Keskiarvo", "Mean"), color: cssColor("var(--text-3)"), width: 1.5 },
          { x, y: S.history.map((h) => h.best), label: tr("Paras", "Best"), color: seriesColor(0), width: 2 },
        ],
      });
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
        ],
        train: [
          { key: "algo", label: tr("Algoritmi", "Algorithm"), type: "select", options: [["es", tr("Evoluutiostrategia (ES)", "Evolution strategy (ES)")], ["ga", tr("Geneettinen algoritmi (GA)", "Genetic algorithm (GA)")]],
            info: tr("ES kokeilee pieniä muutoksia ja siirtyy parempien suuntaan: tasainen ja luotettava (suositus). GA:ssa parhaat robotit saavat mutatoituja \"lapsia\": voi löytää yllättäviä ratkaisuja, mutta vaihtelee enemmän.", "ES tries small changes and moves toward the better ones: steady and reliable (recommended). In GA the best robots get mutated \"children\": it can find surprising solutions but varies more.") },
          { key: "popSize", label: tr("Populaatio", "Population"), min: 4, max: dim === "3d" ? 200 : 400, step: 1,
            info: tr(`Montako robottia kokeillaan yhdessä sukupolvessa. Isompi on vakaampi mutta hitaampi. Suositus ${dim === "3d" ? "15–33" : "24–64"}.`, `How many robots are tried per generation. Bigger is steadier but slower. Recommended ${dim === "3d" ? "15–33" : "24–64"}.`) },
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
      st = getToolState(key, { ...B.defaults, showAll: true, follow: true, speed: MAX_SPEED });
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
              <div class="row-actions"><button class="btn" data-a="editTask" title="${tr("Kirjoita oma palkkiofunktio JavaScriptillä.", "Write your own reward function in JavaScript.")}">${tr("Muokkaa palkkiofunktiota", "Edit reward function")}</button></div>
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
              <div class="nn-stage">
                <canvas class="view3 nn-view" id="nn-view" aria-label="${tr("Simulaationäkymä", "Simulation view")}"></canvas>
                <div class="nn-hud" id="nn-hud" aria-live="off">
                  ${[tr("Sukupolvi", "Generation"), tr("Paras ikinä", "Best ever"), tr("Edell. paras", "Last best"), tr("Edell. keskiarvo", "Last mean"), tr("Aika", "Time"), tr("Elossa", "Alive")].map((l) => `<div><span>${l}</span><b>–</b></div>`).join("")}
                </div>
                <div class="nn-loading" id="nn-loading">${tr("Ladataan fysiikkamoottoria…", "Loading the physics engine…")}</div>
              </div>
              <div class="nn-controls">
                <label class="nn-speed">${tr("Nopeus", "Speed")} <b id="nn-speed-l"></b>
                  <input type="range" id="nn-speed" min="1" max="${MAX_SPEED}" value="${st.speed}" aria-label="${tr("Simulaation nopeus", "Simulation speed")}"></label>
                <label class="mini-toggle"><input type="checkbox" id="nn-all" ${st.showAll ? "checked" : ""}> ${tr("Koko populaatio", "Whole population")}</label>
                <label class="mini-toggle"><input type="checkbox" id="nn-follow" ${st.follow ? "checked" : ""}> ${tr("Kamera seuraa parasta", "Camera follows the best")}</label>
              </div>
              <div id="nn-trust" style="margin-top:8px"></div>
              <div id="nn-status" style="margin-top:8px"></div>
            </div>
            <div class="card"><h3 class="card-title">${tr("Oppimiskäyrä", "Learning curve")}</h3>
              <p class="note" id="nn-chart-empty">${tr("Kaavio näkyy, kun koulutus on edennyt pari sukupolvea.", "The chart appears after a couple of generations.")}</p>
              <canvas class="plot small" id="nn-chart" hidden></canvas>
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

      S = { mode: "idle", episode: null, gen: 0, history: [], last: null, snap: true };
      try { setupBrain(true); }
      catch (err) {
        status(tr("Tallennettu robotti on rikki: ", "The saved robot is broken: ") + err.message + tr(" Palautetaan oletusrobotti.", " Restoring the default robot."), "warn");
        st.modelKey = B.defaults.modelKey; st.taskKey = B.defaults.taskKey;
        setupBrain(false);
      }
      trustNote();
      view = be.view(el.querySelector("#nn-view"));
      el.querySelector("#nn-view").addEventListener("dblclick", () => { st.follow = true; el.querySelector("#nn-follow").checked = true; view.resumeFollow(); S.snap = true; });
      drawFields();
      preview();
      drawChart();
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
        setEpisode(S.trainer.ask());
        setMode("train");
        status(tr("Koulutetaan… Koko populaatio näkyy haaleana ja kamera seuraa parasta. Koulutus jatkuu, vaikka vaihtaisit selaimen välilehteä — mutta pysähtyy, jos siirryt toiseen työkaluun.", "Training… The whole population is shown faded and the camera follows the best. Training continues if you switch browser tabs — but stops if you open another tool."));
      };
      el.querySelector("#nn-replay").onclick = () => {
        if (S.mode === "replay") { setMode("idle"); preview(); return; }
        preview();
        setMode("replay");
        status(S.trainer.best ? tr("Näytetään paras tähän mennessä löydetty robotti. Laske nopeus 1×:ään, niin näet liikkeen oikeassa tahdissa.", "Showing the best robot found so far. Set the speed to 1× to see the motion in real time.")
          : tr("Ei vielä koulutettu — näytetään satunnaiset aivot.", "Not trained yet — showing a random brain."));
      };
      el.querySelector(".nn-tool").addEventListener("click", onAction);

      // Rakentajan "Kouluta simulaatiossa" jättää robotin odottamaan
      if (st.pendingModel) {
        const raw = st.pendingModel;
        delete st.pendingModel;
        saveToolState(key, st, { undo: false });
        try { await applyModel(raw, tr(`Robotti "${raw.name || tr("oma robotti", "custom robot")}" tuotiin rakentajasta. Valitse tehtävä ja paina Kouluta.`, `Robot "${raw.name || "custom robot"}" was brought from the builder. Pick a task and press Train.`)); }
        catch (err) { status(tr("Robotin tuonti rakentajasta: ", "Bringing the robot from the builder: ") + err.message, "warn"); }
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
        save(); if (S.mode === "idle") preview();
        status(tr("Tehtävä vaihdettu. Aivot säilyvät, joten robotti jatkaa oppimista uudesta tehtävästä.", "Task changed. The brain is kept, so the robot continues learning the new task."));
        return;
      }
      if (k === "terrain") { save(); if (S.mode === "idle") preview(); return; }
      if (k === "algo" || k === "popSize") { save(); rebuildTrainer(); return; }
      save(); // sigma, lr, duration: otetaan käyttöön seuraavassa sukupolvessa
      Object.assign(S.trainer.opts, opts());
    }

    async function onHidden(e) {
      let h;
      try { h = RS.parseHidden(e.target.value); } catch (err) { status(err.message, "err"); e.target.value = st.hidden; return; }
      if (!(await confirmReset())) { e.target.value = st.hidden; return; }
      st.hidden = h.join(",");
      setMode("idle");
      save(); setupBrain(false); resetBrain(); preview(); drawChart(); drawFields();
    }

    // Uusi robotti (JSON-muokkaus, tiedosto tai rakentaja): tarkistetaan, että se rakentuu fysiikkaan
    async function applyModel(raw, why) {
      be.check(raw);
      if (!(await confirmReset())) throw new Error(tr("Peruttu.", "Cancelled."));
      st.modelKey = "custom"; st.modelRaw = raw; delete st.libId;
      setMode("idle");
      save(); setupBrain(false); resetBrain(); drawFields(); preview(); drawChart();
      status(why || tr("Oma robotti otettu käyttöön. Paina Kouluta.", "Custom robot in use. Press Train."));
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
            st.taskKey = "custom"; st.taskCode = text; delete st.taskCodeUntrusted; trustNote();
            forgetBest();
            save(); drawFields(); if (S.mode === "idle") preview();
            status(tr("Oma palkkiofunktio otettu käyttöön.", "Custom reward function in use."));
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
        setMode("idle"); resetBrain(); preview(); drawChart();
        status(tr("Aivot nollattu.", "Brain reset."));
      } else if (a === "builder") {
        RSBridge.simToBuilder(dim);
        location.hash = "#/build" + dim;
      } else if (a === "saveOwn") {
        saveOwn();
      } else if (a === "deploy") {
        openDeploy();
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
          out = target === "link" ? { filename: "robolab_link.ino", code: RS.USB.linkSketch(info) } : RS.deployCode(target, base);
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
    }

    function importBrain(d, name) {
      if (!d || d.format !== BRAIN_FORMAT[dim]) throw new Error(dim === "3d" ? tr("Tiedosto ei ole RoboSim 3D -aivot-tiedosto.", "The file is not a RoboSim 3D brain file.") : tr("Tiedosto ei ole RoboSim 2D -aivot-tiedosto.", "The file is not a RoboSim 2D brain file."));
      const raw = d.model;
      be.normalize(raw);
      delete st.libId;
      Object.assign(st, {
        modelKey: Object.hasOwn(be.MODELS, d.modelKey) ? d.modelKey : "custom", modelRaw: Object.hasOwn(be.MODELS, d.modelKey) ? undefined : raw,
        taskKey: Object.hasOwn(be.TASKS, d.taskKey) ? d.taskKey : "custom", taskCode: Object.hasOwn(be.TASKS, d.taskKey) ? undefined : String(d.taskCode ?? ""),
        taskCodeUntrusted: Object.hasOwn(be.TASKS, d.taskKey) ? undefined : true,
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
      dead = true;
      cancelAnimationFrame(raf);
      if (S?.episode && be) be.free(S.episode);
      if (S) S.episode = null;
      view?.dispose();
      view = null;
    }

    // Esimerkit: valmiit yhdistelmät, jotka oppivat nopeasti
    const ex = (name, desc, cfg) => ({ name, desc, apply: () => {
      const cur = getToolState(key, B.defaults);
      saveToolState(key, { ...B.defaults, ...cfg, speed: cur.speed ?? MAX_SPEED, showAll: cur.showAll ?? true, follow: cur.follow ?? true, _adv: cur._adv });
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
    ] : [
      ex(tr("Pyöräauto ajaa eteenpäin", "A car drives forward"), tr("Oppii noin 30 sekunnissa", "Learns in about 30 seconds"), { modelKey: "car", taskKey: "forward" }),
      ex(tr("Dusty etsii kohteita", "Dusty finds targets"), tr("Robotti-imuri kääntyy pyörien nopeuserolla", "The robot vacuum turns using the wheel speed difference"), { modelKey: "dusty", taskKey: "target" }),
      ex(tr("Grip osuu kohteisiin", "Grip hits targets"), tr("Kohteet ovat ilmassa, 4 niveltä", "Targets in the air, 4 joints"), { modelKey: "grip", taskKey: "target" }),
      ex(tr("Zippy lentää kohteisiin", "Zippy flies to targets"), tr("Nelikopteri oppii säätämään neljää roottoria", "The quadcopter learns to control four rotors"), { modelKey: "zippy", taskKey: "target" }),
      ex(tr("Tasapainorobotti", "Balancing robot"), tr("Pysyy pystyssä noin 30 sekunnin koulutuksella", "Stays upright after about 30 s of training"), { modelKey: "balancer", taskKey: "balance" }),
      ex(tr("Hämähäkki kävelee", "Spider walks"), tr("Kahdeksan jalkaa ja kävelypalkkio — oppii askeltamaan", "Eight legs and the gait reward — learns to step"), { modelKey: "spider", taskKey: "walk", duration: 12, hidden: "48,48" }),
      ex(tr("Kuusijalkainen kävelee", "Hexapod walks"), tr("Vakaa alusta: helpoin kävelijä", "A stable base: the easiest walker"), { modelKey: "hexapod", taskKey: "walk", duration: 12 }),
      ex(tr("Neura kävelee 3D:ssä", "Neura walks in 3D"), tr("Neljä jalkaa, lonkka ja polvi", "Four legs, hip and knee"), { modelKey: "neura", taskKey: "walk", duration: 12 }),
    ];

    return { render, unmount, examples };
  }

  TOOL_IMPL.nn2d = makeTool("2d");
  TOOL_IMPL.nn3d = makeTool("3d");

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
