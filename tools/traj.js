"use strict";

/* Trajektorigeneraattori: yksi akseli tai robottikäsivarsi nivelavaruudessa.
   Käsivarsitila käyttää kinematiikkatyökalujen yhteistä mallia (työkalutila "arm"). */
(() => {
  const PROFILES = {
    cubic: { name: tr("Kuutiopolynomi", "Cubic polynomial"), timed: true, info: tr("Sileä paikka ja nopeus, mutta kiihtyvyys hyppää alussa ja lopussa.", "Smooth position and velocity, but acceleration jumps at the start and end.") },
    quintic: { name: tr("Kvinttipolynomi", "Quintic polynomial"), timed: true, info: tr("Myös kiihtyvyys on jatkuva — pehmeämpi liike, hieman suurempi huippunopeus kuin kuutiolla.", "Acceleration is continuous too — smoother motion, slightly higher peak velocity than cubic.") },
    trap: { name: tr("Trapetsiprofiili", "Trapezoidal profile"), timed: false, info: tr("Nopein liike annetuilla nopeus- ja kiihtyvyysrajoilla. Kiihtyvyys muuttuu portaittain, mikä aiheuttaa nykäyksen.", "Fastest motion within the given velocity and acceleration limits. Acceleration changes in steps, which causes jerk.") },
    scurve: { name: tr("S-käyrä (rajoitettu nykäys)", "S-curve (jerk-limited)"), timed: false, info: tr("Pehmein käynnistys ja pysähdys, vähiten tärinää. Yleinen CNC-koneissa ja teollisuusroboteissa.", "Smoothest start and stop, least vibration. Common in CNC machines and industrial robots.") },
  };
  const DEFAULTS = {
    mode: "axis", profile: "trap", quantity: "angle",
    q0: 0, q1: Math.PI / 2, T: 2, vmax: Math.PI / 2, amax: Math.PI, jmax: 4 * Math.PI, v0: 0, v1: 0,
  };

  let el, st, arm, view, plots = {}, anim = { t: 0, playing: false, last: 0, raf: 0 }, result;

  // Yksiköt: kulma tai pituus (käsivarsitilassa kulma)
  const isLen = () => st.mode === "axis" && st.quantity === "length";
  const f = () => (isLen() ? lenF() : angF());
  const u = () => (isLen() ? lenLabel() : angLabel());

  function render(root, tool) {
    el = root;
    st = getToolState("traj", DEFAULTS);
    arm = window.loadArmModel();
    const hasArm = true;
    if (!st.armStart || st.armStart.length !== arm.chain.joints.length) {
      st.armStart = [...arm.q];
      st.armEnd = arm.q.map((v, i) => {
        const j = arm.chain.joints[i];
        return j.type === "R" ? Math.min(j.max, v + 0.6) : v;
      });
    }
    const adv = st._adv ?? settings.advanced;
    const P = PROFILES[st.profile];

    el.innerHTML = `
      ${toolHead(tool)}
      <div class="tool">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Liike", "Motion")}</h3>
            <div class="fields" id="tr-fields"></div>
            ${st.mode === "arm" ? `<div class="subhead" style="margin-top:14px">${tr("Nivelet: alku → loppu", "Joints: start → end")}</div>
              <div class="fields" id="tr-joints" style="margin-top:10px"></div>
              <div class="row-actions">
                <button class="btn" id="tr-from-arm" title="${tr("Kopioi nykyinen asento kinematiikkatyökaluista", "Copy the current pose from the kinematics tools")}">${tr("Alku = nykyinen asento", "Start = current pose")}</button>
              </div>` : ""}
            <button class="link-btn" id="tr-adv" style="margin-top:12px">${adv ? tr("Piilota lisäsyötteet", "Hide advanced inputs") : tr("Näytä lisäsyötteet", "Show advanced inputs")}</button>
          </div>
          <div class="card"><p class="note" style="margin:0">${P.info}</p></div>
        </div>
        <div class="col">
          <div id="tr-results"></div>
          <div id="tr-alerts"></div>
          ${st.mode === "arm" ? `<div class="card">
            <h3 class="card-title">${tr("Käsivarsi", "Arm")} <span class="view-tools"><button id="tr-play">${tr("▶ Toista", "▶ Play")}</button><span class="note" id="tr-time"></span></span></h3>
            <div class="row-actions" style="margin:0 0 8px">${armViewTools("tr-vt")}</div>
            <canvas class="view3" id="tr-view" style="height:340px"></canvas>
            <p class="note" style="margin-top:8px">${viewHint()}</p>
          </div>` : ""}
          <div class="card"><h3 class="card-title">${tr("Paikka", "Position")}</h3><canvas class="plot small" id="tr-p"></canvas></div>
          <div class="card"><h3 class="card-title">${tr("Nopeus", "Velocity")}</h3><canvas class="plot small" id="tr-v"></canvas></div>
          <div class="card"><h3 class="card-title">${tr("Kiihtyvyys", "Acceleration")}</h3><canvas class="plot small" id="tr-a"></canvas></div>
          ${adv ? `<div class="card"><h3 class="card-title">${tr("Nykäys (jerk)", "Jerk")}</h3><canvas class="plot small" id="tr-j"></canvas></div>` : ""}
        </div>
      </div>`;

    const fields = buildFields(hasArm, P);
    const box = el.querySelector("#tr-fields");
    box.innerHTML = fieldsHtml(fields, st, adv);
    bindFields(box, fields, st, (key) => {
      save();
      if (["mode", "profile", "quantity"].includes(key)) { stop(); unmount(); render(root, tool); return; }
      compute();
    });

    if (st.mode === "arm") {
      drawJointFields();
      el.querySelector("#tr-from-arm").onclick = () => {
        st.armStart = [...window.loadArmModel().q];
        save(); drawJointFields(); compute();
      };
      view = new ArmView(el.querySelector("#tr-view"), { lift: armLift(arm.chain),
        extent: Math.max(0.3, Kin.reach(arm.chain).max * (Kin.isPlanar(arm.chain) ? 1.05 : 0.75)),
        az: -60, el: Kin.isPlanar(arm.chain) ? 50 : 25,
        draw: drawView, draw3d: drawView3d,
      });
      bindArmViewTools(el, "tr-vt", view);
      el.querySelector("#tr-play").onclick = () => (anim.playing ? stop() : play());
    }
    el.querySelector("#tr-adv").onclick = () => { st._adv = !adv; save(); unmount(); render(root, tool); };
    window.addEventListener("resize", drawPlots);
    compute();
  }

  function buildFields(hasArm, P) {
    const per = (p) => () => `${u()}/s${p}`;
    return [
      { key: "mode", label: tr("Mitä liikutetaan", "What moves"), type: "select",
        options: [["axis", tr("Yksi akseli", "Single axis")], ...(hasArm ? [["arm", tr("Robottikäsivarsi (nivelavaruus)", "Robot arm (joint space)")]] : [])],
        info: tr("Yksi akseli = yksi moottori tai nivel. Robottikäsivarsi liikuttaa kaikkia niveliä samanaikaisesti niin, että ne lähtevät ja pysähtyvät yhtä aikaa (malli tulee kinematiikkatyökaluista).",
          "Single axis = one motor or joint. Robot arm moves all joints together so that they start and stop at the same time (the model comes from the kinematics tools).") },
      { key: "profile", label: tr("Profiili", "Profile"), type: "select", options: Object.entries(PROFILES).map(([k, p]) => [k, p.name]),
        info: tr("Profiili määrää, miten nopeus kasvaa ja pienenee liikkeen aikana. Polynomeille annetaan kesto, trapetsille ja S-käyrälle nopeus- ja kiihtyvyysrajat, joista kesto lasketaan.",
          "The profile decides how velocity rises and falls during the move. Polynomials take a duration; trapezoid and S-curve take velocity and acceleration limits and compute the duration.") },
      ...(st.mode === "axis" ? [
        { key: "quantity", label: tr("Suure", "Quantity"), type: "select", options: [["angle", tr("Kulma (kiertyvä nivel)", "Angle (revolute joint)")], ["length", tr("Pituus (lineaarinen akseli)", "Length (linear axis)")]],
          info: tr("Kulma kiertyvälle nivelelle tai moottorille (asteet tai radiaanit), pituus lineaariselle akselille kuten 3D-tulostimen tai CNC-koneen kelkalle (mm tai m).",
            "Angle for a revolute joint or motor (degrees or radians), length for a linear axis such as a 3D printer or CNC carriage (mm or m).") },
        { key: "q0", label: tr("Alkuasema", "Start position"), unit: u, factor: f, min: -1e6, max: 1e6, step: 1,
          info: tr("Mistä liike alkaa. Akseli on tässä paikallaan liikkeen alussa (ellei alkunopeutta anneta).", "Where the move starts. The axis is at rest here at the start (unless a start velocity is given).") },
        { key: "q1", label: tr("Loppuasema", "End position"), unit: u, factor: f, min: -1e6, max: 1e6, step: 1,
          info: tr("Mihin liike päättyy. Matka = loppuasema − alkuasema; esim. nivelelle tyypillisesti 10–180°, tulostimen akselille 10–300 mm.", "Where the move ends. Distance = end − start; typically 10–180° for a joint, 10–300 mm for a printer axis.") },
      ] : []),
      ...(P.timed ? [{ key: "T", label: tr("Kesto", "Duration"), unit: "s", min: 0.01, max: 1000, step: 0.1,
        info: tr("Kuinka kauan liike kestää. Lyhyempi kesto = suurempi huippunopeus ja -kiihtyvyys; pidennä, jos rajat ylittyvät. Tyypillisesti 0,5–5 s.", "How long the move takes. Shorter = higher peak velocity and acceleration; lengthen it if the limits are exceeded. Typically 0.5–5 s.") }] : []),
      { key: "vmax", label: P.timed ? tr("Nopeusraja (tarkistus)", "Velocity limit (check)") : tr("Suurin nopeus", "Max velocity"), unit: per(""), factor: f, min: 1e-6, max: 1e6, step: 1, adv: P.timed,
        info: P.timed
          ? tr("Polynomiprofiilissa tätä ei käytetä liikkeen laskemiseen — työkalu vain varoittaa, jos huippunopeus ylittää rajan.", "Not used to compute a polynomial profile — the tool only warns if the peak velocity exceeds this limit.")
          : tr("Nopeus, jota akseli ei ylitä. Robottinivelillä tyypillisesti 90–360 °/s, 3D-tulostimen akselilla 100–300 mm/s.", "The speed the axis never exceeds. Robot joints typically 90–360 °/s, 3D printer axes 100–300 mm/s.") },
      { key: "amax", label: P.timed ? tr("Kiihtyvyysraja (tarkistus)", "Acceleration limit (check)") : tr("Suurin kiihtyvyys", "Max acceleration"), unit: per("²"), factor: f, min: 1e-6, max: 1e7, step: 1, adv: P.timed,
        info: P.timed
          ? tr("Polynomiprofiilissa vain tarkistusraja: työkalu varoittaa, jos huippukiihtyvyys ylittää sen.", "Only a check for polynomial profiles: the tool warns if the peak acceleration exceeds it.")
          : tr("Kuinka nopeasti nopeus saa muuttua. Rajoittaa moottorin vääntöä ja tärinää; tulostimilla tyypillisesti 1000–5000 mm/s².", "How fast the velocity may change. Limits motor torque and vibration; printers typically use 1000–5000 mm/s².") },
      ...(st.profile === "scurve" ? [{ key: "jmax", label: tr("Suurin nykäys", "Max jerk"), unit: per("³"), factor: f, min: 1e-6, max: 1e8, step: 10,
        info: tr("Nykäys = kiihtyvyyden muutosnopeus. Pienempi arvo pehmentää käynnistystä ja pysähdystä (vähemmän tärinää), mutta pidentää liikettä. Usein 5–50 × suurin kiihtyvyys.", "Jerk = rate of change of acceleration. A smaller value softens start and stop (less vibration) but lengthens the move. Often 5–50 × the max acceleration.") }] : []),
      ...(P.timed && st.mode === "axis" ? [
        { key: "v0", label: tr("Alkunopeus", "Start velocity"), unit: per(""), factor: f, min: -1e6, max: 1e6, step: 1, adv: true,
          info: tr("Nopeus liikkeen alussa. Yleensä 0; muuta, kun liike jatkuu edellisestä liikkeestä pysähtymättä.", "Velocity at the start of the move. Usually 0; change it when the move continues from a previous one without stopping.") },
        { key: "v1", label: tr("Loppunopeus", "End velocity"), unit: per(""), factor: f, min: -1e6, max: 1e6, step: 1, adv: true,
          info: tr("Nopeus liikkeen lopussa. Yleensä 0 (pysähdys); muuta, kun liike jatkuu seuraavaan pysähtymättä.", "Velocity at the end of the move. Usually 0 (stop); change it when the move flows into the next one without stopping.") },
      ] : []),
    ];
  }

  function drawJointFields() {
    const box = el.querySelector("#tr-joints");
    box.innerHTML = arm.chain.joints.map((j, i) => {
      const jf = j.type === "R" ? angF() : lenF(), lab = j.type === "R" ? angLabel() : lenLabel();
      return `<div class="field"><label>q${i + 1} <small>${lab}</small></label><div class="field-ctl">
        <span class="num"><input type="text" inputmode="decimal" data-js="${i}" value="${fmtInput(st.armStart[i] / jf, 5)}" aria-label="${tr(`q${i + 1} alku`, `q${i + 1} start`)}"></span>
        <span class="note">→</span>
        <span class="num"><input type="text" inputmode="decimal" data-je="${i}" value="${fmtInput(st.armEnd[i] / jf, 5)}" aria-label="${tr(`q${i + 1} loppu`, `q${i + 1} end`)}"></span>
      </div></div>`;
    }).join("");
    box.oninput = (e) => {
      const t = e.target, i = t.dataset.js ?? t.dataset.je;
      if (i === undefined) return;
      const j = arm.chain.joints[+i];
      const v = parseInput(t.value);
      const bad = v === null || v * (j.type === "R" ? angF() : lenF()) < j.min - 1e-9 || v * (j.type === "R" ? angF() : lenF()) > j.max + 1e-9;
      t.classList.toggle("invalid", bad);
      t.title = bad ? tr("Nivelen rajojen ulkopuolella", "Outside joint limits") : "";
      if (bad) return;
      (t.dataset.js !== undefined ? st.armStart : st.armEnd)[+i] = v * (j.type === "R" ? angF() : lenF());
      save(); compute();
    };
  }

  const save = () => saveToolState("traj", st);

  function profileFor(q0, q1, T) {
    if (st.profile === "cubic") return Motion.cubic(q0, q1, T, st.mode === "axis" ? st.v0 : 0, st.mode === "axis" ? st.v1 : 0);
    if (st.profile === "quintic") return Motion.quintic(q0, q1, T, st.mode === "axis" ? st.v0 : 0, st.mode === "axis" ? st.v1 : 0);
    if (st.profile === "trap") return Motion.trapezoid(q0, q1, st.vmax, st.amax);
    return Motion.scurve(q0, q1, st.vmax, st.amax, st.jmax);
  }

  function compute() {
    const P = PROFILES[st.profile];
    let axes;
    if (st.mode === "axis") {
      axes = [profileFor(st.q0, st.q1, st.T)];
    } else {
      // Synkronointi: hitain nivel määrää keston, muut skaalataan samaan normalisoituun profiiliin
      const d = st.armEnd.map((e, i) => e - st.armStart[i]);
      const k = d.reduce((m, v, i) => (Math.abs(v) > Math.abs(d[m]) ? i : m), 0);
      const lead = profileFor(st.armStart[k], st.armEnd[k], st.T);
      const dk = d[k];
      axes = d.map((di, i) => i === k ? lead : {
        T: lead.T,
        sample: (t) => {
          const s = lead.sample(t), r = dk ? di / dk : 0;
          return [st.armStart[i] + r * (s[0] - st.armStart[k]), r * s[1], r * s[2], r * s[3]];
        },
      });
      axes.lead = lead;
    }
    const samples = axes.map((a) => Motion.sampleProfile(a, 400));
    const lead = axes.lead || axes[0];
    result = { axes, samples, lead };

    const vMax = Math.max(...samples.map((s) => s.vMax)), aMax = Math.max(...samples.map((s) => s.aMax)), jMax = Math.max(...samples.map((s) => s.jMax));
    const per = (p) => `${u()}/s${p}`;
    const vOver = vMax > st.vmax * (1 + 1e-6), aOver = aMax > st.amax * (1 + 1e-6);
    el.querySelector("#tr-results").innerHTML = resultTiles([
      { label: tr("Kesto", "Duration"), value: fmt(lead.T, 3), unit: "s" },
      { label: tr("Huippunopeus", "Peak velocity"), value: fmt(vMax / f(), 2), unit: per(""), level: P.timed && vOver ? "warn" : "" },
      { label: tr("Huippukiihtyvyys", "Peak acceleration"), value: fmt(aMax / f(), 2), unit: per("²"), level: P.timed && aOver ? "warn" : "" },
      // Trapetsissa ja kuutiopolynomissa kiihtyvyys hyppää, joten nykäys on teoriassa ääretön hyppäyskohdissa
      ...(st._adv ?? settings.advanced ? [(st.profile === "trap" || st.profile === "cubic") && lead.T > 0
        ? { label: tr("Huippunykäys", "Peak jerk"), value: "∞", unit: per("³"), sub: tr("kiihtyvyys muuttuu hyppäyksellisesti", "acceleration changes in steps") }
        : { label: tr("Huippunykäys", "Peak jerk"), value: fmt(jMax / f(), 1), unit: per("³") }] : []),
    ]);

    const alerts = [];
    if (P.timed && vOver) alerts.push({ level: "warn", text: tr(`Huippunopeus ylittää rajan ${fmt(st.vmax / f(), 2)} ${per("")} — pidennä kestoa.`, `Peak velocity exceeds the limit ${fmt(st.vmax / f(), 2)} ${per("")} — increase the duration.`) });
    if (P.timed && aOver) alerts.push({ level: "warn", text: tr(`Huippukiihtyvyys ylittää rajan ${fmt(st.amax / f(), 2)} ${per("²")} — pidennä kestoa.`, `Peak acceleration exceeds the limit ${fmt(st.amax / f(), 2)} ${per("²")} — increase the duration.`) });
    if (st.profile === "trap" && lead.triangle) alerts.push({ level: "info", text: tr("Matka on niin lyhyt, ettei suurinta nopeutta saavuteta — profiili on kolmio.", "The distance is too short to reach max velocity — the profile is triangular.") });
    if (st.profile === "scurve" && lead.T > 0) {
      if (!lead.reachedV) alerts.push({ level: "info", text: tr("Suurinta nopeutta ei saavuteta tällä matkalla.", "Max velocity is not reached over this distance.") });
      if (!lead.reachedA) alerts.push({ level: "info", text: tr("Suurinta kiihtyvyyttä ei saavuteta — nykäysraja rajoittaa.", "Max acceleration is not reached — limited by the jerk limit.") });
    }
    if (st.mode === "arm" && arm.chain.joints.some((j) => j.type === "P")) {
      alerts.push({ level: "info", text: tr("Liukuville nivelille käytetään samoja lukuarvoja rajoina (m/s, m/s²).", "Prismatic joints use the same numeric values as limits (m/s, m/s²).") });
    }
    el.querySelector("#tr-alerts").innerHTML = alertsHtml(alerts);

    anim.t = Math.min(anim.t, lead.T);
    if (view) {
      // Työkalun kärjen rata
      result.tip = [];
      for (let i = 0; i <= 120; i++) {
        const t = (lead.T * i) / 120;
        const T = Kin.fk(arm.chain, axes.map((a) => a.sample(t)[0])).at(-1);
        result.tip.push([T[0][3], T[1][3], T[2][3]]);
      }
      view.draw();
      updateTime();
    }
    drawPlots();
  }

  function drawPlots() {
    if (!result || !el.querySelector("#tr-p")) return;
    const { samples } = result;
    const names = st.mode === "arm" ? arm.chain.joints.map((_, i) => "q" + (i + 1)) : [""];
    const scale = (i) => (st.mode === "arm" && arm.chain.joints[i].type === "P" ? lenF() : f());
    const mk = (key) => samples.map((s, i) => ({ x: s.t, y: s[key].map((v) => v / scale(i)), label: names[i], width: 2 }));
    drawPlot(el.querySelector("#tr-p"), { xLabel: "t [s]", series: mk("p") });
    drawPlot(el.querySelector("#tr-v"), { xLabel: "t [s]", series: mk("v") });
    drawPlot(el.querySelector("#tr-a"), { xLabel: "t [s]", series: mk("a") });
    const jc = el.querySelector("#tr-j");
    if (jc) drawPlot(jc, { xLabel: "t [s]", series: mk("j") });
  }

  // Varjostettu versio: käsivarsi kappaleina, työkalun rata viivana, alku- ja loppupiste palloina
  function drawView3d(g) {
    if (!result?.tip) return;
    const q = result.axes.map((a) => a.sample(anim.t)[0]);
    const ext = view.opts.extent;
    g.line(result.tip, cssColor("var(--warn)"));
    drawArm3d(g, arm.chain, q, { extent: ext });
    g.sphere(result.tip[0], ext * 0.02, cssColor("var(--ok)"), { emissive: true });
    g.sphere(result.tip.at(-1), ext * 0.02, cssColor("var(--err)"), { emissive: true });
  }

  function drawView(v) {
    if (!result?.tip) return;
    const q = result.axes.map((a) => a.sample(anim.t)[0]);
    if (settings.showGrid) {
      const ext = v.opts.extent, step = ext > 1.5 ? 0.5 : 0.1;
      v.grid(Math.ceil(ext / step) * step, step, cssColor("var(--border)"));
    }
    v.poly(result.tip, cssColor("var(--warn)"), 1.5, [4, 4]);
    // Käsivarsi: sama värikoodattu piirto kuin kinematiikassa
    drawArm(v, arm.chain, q, { extent: v.opts.extent, grid: false });
    v.dot(result.tip[0], 4, cssColor("var(--ok)"));
    v.dot(result.tip.at(-1), 4, cssColor("var(--err)"));
  }

  function updateTime() {
    const t = el.querySelector("#tr-time");
    if (t) t.textContent = `${fmt(anim.t, 2)} / ${fmt(result.lead.T, 2)} s`;
    const b = el.querySelector("#tr-play");
    if (b) b.textContent = anim.playing ? tr("❚❚ Tauko", "❚❚ Pause") : tr("▶ Toista", "▶ Play");
  }

  function play() {
    if (anim.t >= result.lead.T) anim.t = 0;
    anim.playing = true;
    anim.last = performance.now();
    const step = (now) => {
      if (!anim.playing || !el.querySelector("#tr-view")) return;
      anim.t = Math.min(result.lead.T, anim.t + ((now - anim.last) / 1000) * settings.realtime);
      anim.last = now;
      view.draw(); updateTime();
      if (anim.t >= result.lead.T) { anim.playing = false; updateTime(); return; }
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
    updateTime();
  }
  function stop() {
    anim.playing = false;
    cancelAnimationFrame(anim.raf);
    if (el?.querySelector("#tr-time")) updateTime();
  }

  function unmount() {
    stop();
    view?.destroy();
    view = null;
    window.removeEventListener("resize", drawPlots);
  }

  // Esimerkit: koko tila tallennetaan (SI-yksiköt), lisäsyötteiden näkyvyys ja käsivarren nivelarvot säilyvät
  function applyExample(cfg) {
    const cur = getToolState("traj", DEFAULTS);
    saveToolState("traj", { ...DEFAULTS, armStart: cur.armStart, armEnd: cur.armEnd, ...cfg, _adv: cur._adv });
  }
  const DEG = Math.PI / 180;

  const examples = [
    { name: tr("Nopea poiminta ja asettelu (S-käyrä)", "Fast pick-and-place joint move (S-curve)"),
      desc: tr("90° nivelliike, 180 °/s, pehmeä käynnistys ja pysähdys", "90° joint move, 180 °/s, smooth start and stop"),
      apply: () => applyExample({ mode: "axis", profile: "scurve", quantity: "angle", q0: 0, q1: 90 * DEG, vmax: 180 * DEG, amax: 900 * DEG, jmax: 9000 * DEG }) },
    { name: tr("Lyhyt liike: trapetsista tulee kolmio", "Short move: trapezoid becomes a triangle"),
      desc: tr("15° matka on liian lyhyt huippunopeuden saavuttamiseen", "A 15° move is too short to reach max velocity"),
      apply: () => applyExample({ mode: "axis", profile: "trap", quantity: "angle", q0: 0, q1: 15 * DEG, vmax: 120 * DEG, amax: 240 * DEG }) },
    { name: tr("Kuutio vs. kvintti: pehmeys", "Cubic vs quintic smoothness"),
      desc: tr("Kvinttipolynomi 1,5 s — vaihda kuutioon ja vertaa kiihtyvyyttä", "Quintic in 1.5 s — switch to cubic and compare the acceleration"),
      apply: () => applyExample({ mode: "axis", profile: "quintic", quantity: "angle", q0: 0, q1: 90 * DEG, T: 1.5, vmax: 150 * DEG, amax: 300 * DEG, v0: 0, v1: 0 }) },
    { name: tr("3D-tulostimen akseli 300 mm", "3D printer axis, 300 mm move"),
      desc: tr("Lineaarinen akseli: 150 mm/s, 3000 mm/s², trapetsi", "Linear axis: 150 mm/s, 3000 mm/s², trapezoid"),
      apply: () => applyExample({ mode: "axis", profile: "trap", quantity: "length", q0: 0, q1: 0.3, vmax: 0.15, amax: 3, jmax: 100 }) },
    { name: tr("Robottikäsivarren nivelliike", "Robot arm joint move"),
      desc: tr("Kaikki nivelet liikkuvat yhtä aikaa nykyisestä asennosta", "All joints move together from the current pose"),
      apply: () => {
        const arm = window.loadArmModel();
        applyExample({
          mode: "arm", profile: "scurve", vmax: 90 * DEG, amax: 270 * DEG, jmax: 1800 * DEG,
          armStart: [...arm.q],
          // Kiertyvä nivel +45°, liukuva +5 cm; jos ylärajaan ei mahdu, liikutaan toiseen suuntaan
          armEnd: arm.q.map((v, i) => {
            const j = arm.chain.joints[i], d = j.type === "R" ? 45 * DEG : 0.05;
            return v + d <= j.max ? v + d : Math.max(j.min, v - d);
          }),
        });
      } },
  ];

  TOOL_IMPL.traj = { render, unmount, examples };
  // Moottorityökalu lukee liikkeen nopeus- ja kiihtyvyysrajat tästä (SI-yksiköt; kulmaliike rad/s)
  window.trajLimits = () => {
    const s = getToolState("traj", DEFAULTS);
    return { vmax: s.vmax, amax: s.amax, angular: s.mode === "arm" || s.quantity !== "length" };
  };
})();
