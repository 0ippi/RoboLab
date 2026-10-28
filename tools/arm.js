"use strict";

/* Robottikäsivarsi: DH-parametrit, eteenpäin kinematiikka ja käänteiskinematiikka jakavat saman mallin
   (projektin työkalutila "arm"), joten DH-taulukon muutos näkyy heti FK:ssa ja IK:ssa. */
(() => {
  const D = Math.PI / 180;
  const Rj = (a, { alpha = 0, d = 0, theta = 0, lim = 180 } = {}) =>
    ({ type: "R", theta: theta * D, d, a, alpha: alpha * D, min: -lim * D, max: lim * D });
  const Pj = ({ a = 0, alpha = 0, d = 0, theta = 0, min = 0, max = 0.2 } = {}) =>
    ({ type: "P", theta: theta * D, d, a, alpha: alpha * D, min, max });

  // Valmiit mallit klassisella DH:lla (pituudet metreinä)
  const PRESETS = {
    "2r": { name: tr("2R tasomainen", "2R planar"), joints: [Rj(0.3), Rj(0.25)], q: [30 * D, 45 * D] },
    "3r": { name: tr("3R tasomainen", "3R planar"), joints: [Rj(0.3), Rj(0.25), Rj(0.1)], q: [20 * D, 40 * D, -30 * D] },
    scara: { name: "SCARA", joints: [Rj(0.3, { d: 0.4, lim: 150 }), Rj(0.25, { alpha: 180, lim: 150 }), Pj({ max: 0.2 }), Rj(0, { d: 0.05 })],
      q: [30 * D, 60 * D, 0.1, 0] },
    ur: { name: tr("6-DOF (UR-tyyppinen)", "6-DOF (UR-style)"),
      joints: [Rj(0, { d: 0.089, alpha: 90, lim: 360 }), Rj(-0.425, { lim: 360 }), Rj(-0.392, { lim: 180 }),
               Rj(0, { d: 0.109, alpha: 90, lim: 360 }), Rj(0, { d: 0.095, alpha: -90, lim: 360 }), Rj(0, { d: 0.082, lim: 360 })],
      q: [0, -60 * D, 80 * D, -110 * D, -90 * D, 0] },
  };

  function presetArm(id) {
    const p = PRESETS[id];
    let chain = { convention: "classic", joints: p.joints.map((j) => ({ ...j })), tool: { a: 0, alpha: 0 } };
    if (settings.dhConvention === "modified") chain = Kin.toModified(chain);
    return { preset: id, chain, q: [...p.q] };
  }

  // Korjaa tuodun tai tallennetun ketjun puuttuvat ja virheelliset kentät. Pituudet enintään ±100 m:
  // valtava pituus tekisi näkymän ruudukosta miljoonia viivoja ja jäädyttäisi välilehden.
  const num = (v, d = 0) => (Number.isFinite(+v) && v !== null && v !== "" ? +v : d);
  const LEN_MAX = 100;
  const len = (v, d = 0) => Math.max(-LEN_MAX, Math.min(LEN_MAX, num(v, d)));
  function normalizeChain(c) {
    const joints = (Array.isArray(c?.joints) ? c.joints : []).slice(0, 12).map((j) => {
      const type = j?.type === "P" ? "P" : "R";
      const lim = type === "R" ? num : len;
      const lo = lim(j?.min, type === "R" ? -Math.PI : 0), hi = lim(j?.max, type === "R" ? Math.PI : 0.2);
      return { type, theta: num(j?.theta), d: len(j?.d), a: len(j?.a), alpha: num(j?.alpha), min: Math.min(lo, hi), max: Math.max(lo, hi) };
    });
    if (!joints.length) throw new Error(tr("käsivarressa ei ole niveliä", "the arm has no joints"));
    const out = { convention: c.convention === "modified" ? "modified" : "classic", joints, tool: { a: len(c.tool?.a), alpha: num(c.tool?.alpha) } };
    if (out.convention === "classic" && c.base) out.base = { a: len(c.base.a), alpha: num(c.base.alpha) };
    return out;
  }

  const loadArm = () => {
    const a = getToolState("arm", presetArm("2r"));
    a.chain = normalizeChain(a.chain);
    const q = Array.isArray(a.q) ? a.q : [];
    a.q = a.chain.joints.map((_, i) => num(q[i]));
    return a;
  };
  const saveArm = (a) => saveToolState("arm", { preset: a.preset, chain: a.chain, q: a.q, _adv: a._adv });

  // Nivelarvon näyttöyksikkö: kiertyvä kulmana, liukuva pituutena
  const jf = (j) => (j.type === "R" ? angF() : lenF());
  const jl = (j) => (j.type === "R" ? angLabel() : lenLabel());

  const origin = (T) => [T[0][3], T[1][3], T[2][3]];
  const col = (T, k) => [T[0][k], T[1][k], T[2][k]];
  const add = (p, v, s) => p.map((x, i) => x + v[i] * s);

  // Ulottuma on yläraja; tilakäsivarret eivät käytännössä ojennu siihen, joten niille pienempi näkymä
  function extentOf(chain) {
    const r = Kin.reach(chain).max;
    return Math.max(0.3, Kin.isPlanar(chain) ? r * 1.05 : r * 0.75);
  }

  const floorText = (below) => tr(`Käsivarsi menee lattian alle (${fmtLen(below)} ${lenLabel()}). Todellinen robotti törmäisi kantansa tasoon, ellei se ole asennettu pöydän reunalle.`,
    `The arm goes below the floor (${fmtLen(below)} ${lenLabel()}). A real robot would hit its mounting surface unless it is mounted at a table edge.`);

  const viewTools = armViewTools;
  const bindViewTools = bindArmViewTools;

  // Mallin valitsin: valmiit mallit ja omat käsivarret omissa kokoontaitettavissa osioissaan
  const presetSelect = (arm, id) => `<div id="${id}" class="arm-pick"></div>`;
  function bindPreset(host, arm, apply) {
    const own = Library.list("arm").map((r) => ({ value: "lib:" + r.id, label: r.name, sub: tr(`${r.data.chain.joints.length} niveltä`, `${r.data.chain.joints.length} joints`) }));
    const unsaved = arm.preset === "custom" || (arm.preset?.startsWith("lib:") && !Library.get("arm", arm.preset.slice(4)))
      ? [{ value: "custom", label: tr("Oma malli (DH-taulukosta)", "Custom (from DH table)"), sub: tr("ei tallennettu omiin", "not saved to my arms") }] : [];
    const saveCurrent = () => {
      const name = askName(tr("Käsivarren nimi omissa käsivarsissa:", "Name of the arm in my arms:"), tr("Oma käsivarsi", "My arm"));
      if (!name) return;
      const id = Library.add("arm", name, { chain: arm.chain, q: arm.q });
      if (!id) return;
      arm.preset = "lib:" + id; saveArm(arm);
      toast(tr(`"${name}" tallennettu omiin käsivarsiin.`, `"${name}" saved to my arms.`));
      bindPreset(host, arm, apply);
    };
    modelPicker(host, {
      value: unsaved.length ? "custom" : arm.preset, storeKey: "arm",
      sections: [
        { id: "base", title: tr("Valmiit mallit", "Base models"), items: Object.entries(PRESETS).map(([k, p]) => ({ value: k, label: p.name, sub: tr(`${p.joints.length} niveltä`, `${p.joints.length} joints`) })) },
        { id: "own", own: true, title: tr("Omat käsivarret", "My arms"), items: [...unsaved, ...own],
          empty: tr("Muokkaa DH-taulukkoa ja tallenna käsivarsi, niin se näkyy täällä kaikissa projekteissa.", "Edit the DH table and save the arm, and it appears here in every project."),
          action: { label: tr("＋ Tallenna nykyinen käsivarsi omiin", "＋ Save the current arm to my arms"), run: saveCurrent } },
      ],
      onSelect: (v) => {
        if (v === "custom") return;
        // Tallentamaton oma käsivarsi (DH-taulukosta) korvataan vain luvalla
        if (unsaved.length && settings.confirmReset && !confirm(tr("Nykyistä omaa käsivartta ei ole tallennettu omiin käsivarsiin. Korvataanko se? Voit kumota muutoksen (Ctrl+Z).", "The current custom arm is not saved to my arms. Replace it? You can undo the change (Ctrl+Z)."))) { bindPreset(host, arm, apply); return; }
        if (v.startsWith("lib:")) {
          const r = Library.get("arm", v.slice(4));
          if (r) apply({ preset: v, chain: normalizeChain(r.data.chain), q: [...r.data.q] });
        } else apply(presetArm(v));
      },
      onRemove: (v) => {
        const r = Library.get("arm", v.slice(4));
        if (r && confirm(tr(`Poistetaanko "${r.name}" omista käsivarsista?`, `Remove "${r.name}" from my arms?`))) { Library.remove("arm", r.id); bindPreset(host, arm, apply); }
      },
      onRename: (v) => {
        const r = Library.get("arm", v.slice(4)), n = r && askName(tr("Käsivarren uusi nimi:", "New name for the arm:"), r.name);
        if (n) { Library.rename("arm", r.id, n); bindPreset(host, arm, apply); }
      },
    });
  }

  // Asento valitulla rotaatioesityksellä (asetuksista)
  function orientationTiles(T) {
    const R = [0, 1, 2].map((i) => [T[i][0], T[i][1], T[i][2]]);
    const rep = settings.rotationRep;
    if (rep === "quat") {
      const q = Kin.matToQuat(R), idx = settings.quatOrder === "wxyz" ? [3, 0, 1, 2] : [0, 1, 2, 3];
      return [{ label: tr(`Kvaternio (${idx.map((i) => "xyzw"[i]).join(", ")})`, `Quaternion (${idx.map((i) => "xyzw"[i]).join(", ")})`), value: idx.map((i) => fmt(q[i], 3)).join("  ") }];
    }
    if (rep === "axisangle") {
      const aa = Kin.quatToAxisAngle(Kin.matToQuat(R));
      return [{ label: tr("Kiertokulma", "Rotation angle"), value: fmtAng(aa.angle, 1), unit: angLabel() },
              { label: tr("Kiertoakseli", "Rotation axis"), value: aa.axis.map((c) => fmt(c, 2)).join("  ") }];
    }
    if (rep === "matrix") return [{ label: tr("Rotaatiomatriisi", "Rotation matrix"), value: R.map((r) => r.map((x) => fmt(x, 2)).join(" ")).join(" │ ") }];
    const e = Kin.matToEuler(R, settings.eulerOrder, settings.eulerFrame);
    return e.map((a, i) => ({ label: `Euler ${settings.eulerOrder} · ${settings.eulerOrder[i]}`, value: fmtAng(a, 1), unit: angLabel() }));
  }

  function matricesHtml(F) {
    const m = (T, title) => `<div class="mat4"><b>${title}</b><table>${T.map((r) => `<tr>${r.map((x) => `<td>${fmt(x, 3)}</td>`).join("")}</tr>`).join("")}</table></div>`;
    return `<div class="mats">${F.slice(1).map((T, i) => m(T, i === F.length - 2 ? tr("⁰T työkalu", "⁰T tool") : `⁰T${i + 1}`)).join("")}</div>`;
  }

  /* ===== Eteenpäin kinematiikka ===== */
  const FK = (() => {
    let el, arm, view;

    function render(root, tool) {
      el = root;
      arm = loadArm();
      const adv = arm._adv ?? settings.advanced;
      const planar = Kin.isPlanar(arm.chain);
      el.innerHTML = `
        ${toolHead(tool, `<a class="btn" href="#/dh">${tr("Muokkaa DH-taulukkoa", "Edit DH table")}</a>`)}
        <div class="tool viz-first">
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Robotti", "Robot")}</h3>
              <div class="fields">
                <div class="field"><label>${tr("Malli", "Model")}</label><div class="field-ctl">${presetSelect(arm, "fk-preset")}</div></div>
              </div>
            </div>
            <div class="card">
              <h3 class="card-title">${tr("Nivelet", "Joints")} <button class="link-btn" id="fk-zero">${tr("Nollaa", "Reset")}</button></h3>
              <div class="fields" id="fk-joints"></div>
            </div>
            <button class="link-btn" id="fk-adv">${adv ? tr("Piilota muunnosmatriisit", "Hide transformation matrices") : tr("Näytä muunnosmatriisit ja kaikki koordinaatistot", "Show transformation matrices and all frames")}</button>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Näkymä", "View")} ${viewTools("fk-vt")}</h3>
              <canvas class="view3" id="fk-view"></canvas>
              <p class="note" style="margin-top:8px">${viewHint()}</p>
            </div>
            <div id="fk-alerts"></div>
            <div class="card"><h3 class="card-title">${tr("Työkalun asento", "Tool pose")}</h3><div id="fk-pose"></div></div>
            ${adv ? `<div class="card"><h3 class="card-title">${tr("Muunnosmatriisit (pituudet metreinä)", "Transformation matrices (lengths in meters)")}</h3><div id="fk-mats"></div></div>` : ""}
          </div>
        </div>`;

      const fields = arm.chain.joints.map((j, i) => ({
        key: "q" + i, label: `q${i + 1} ${j.type === "R" ? tr("· kierto", "· revolute") : tr("· liuku", "· prismatic")}`, type: "slider",
        info: j.type === "R"
          ? tr("Kiertyvän nivelen kulma: kuinka paljon nivel on kääntynyt nolla-asennostaan oman akselinsa ympäri. Positiivinen kulma kiertää vastapäivään akselin kärjestä katsottuna; tyypillinen alue on ±180°.",
            "Revolute joint angle: how far the joint has turned from its zero position about its own axis. A positive angle turns counter-clockwise seen from the axis tip; the typical range is ±180°.")
          : tr("Liukuvan nivelen pituus: kuinka pitkälle nivel on liukunut nolla-asennostaan oman akselinsa suuntaan. Tyypillisesti muutamasta senttimetristä noin 0,5 metriin.",
            "Prismatic joint extension: how far the joint has slid from its zero position along its own axis. Typically from a few centimetres up to about 0.5 m."),
        unit: jl(j), factor: jf(j), min: +(j.min / jf(j)).toFixed(4), max: +(j.max / jf(j)).toFixed(4),
        step: j.type === "R" ? (settings.angleUnit === "rad" ? 0.01 : 1) : +(0.001 / lenF()).toPrecision(2),
      }));
      const qs = Object.fromEntries(arm.q.map((v, i) => ["q" + i, v]));
      el.querySelector("#fk-joints").innerHTML = fieldsHtml(fields, qs, true);
      bindFields(el.querySelector("#fk-joints"), fields, qs, (key) => {
        arm.q[+key.slice(1)] = qs[key];
        saveArm(arm);
        update();
      });

      // Tasomainenkin käsivarsi näytetään viistosti, jotta kolmiulotteisuus hahmottuu (ylänäkymä löytyy napista)
      view = new ArmView(el.querySelector("#fk-view"), { lift: armLift(arm.chain),
        extent: extentOf(arm.chain), az: -60, el: planar ? 50 : 25,
        draw: (v) => drawArm(v, arm.chain, arm.q, { allFrames: adv, extent: extentOf(arm.chain) }),
        draw3d: (g) => drawArm3d(g, arm.chain, arm.q, { allFrames: adv, extent: extentOf(arm.chain) }),
      });
      bindViewTools(el, "fk-vt", view);

      bindPreset(el.querySelector("#fk-preset"), arm, (a) => {
        const keepAdv = arm._adv;
        arm = a; arm._adv = keepAdv;
        saveArm(arm); view.destroy(); render(root, tool);
      });
      // Nollaus päivittää vain nivelet: näkymän kuvakulma ja zoomaus säilyvät
      el.querySelector("#fk-zero").onclick = () => {
        arm.q = arm.chain.joints.map((j) => Math.min(j.max, Math.max(j.min, 0)));
        arm.q.forEach((v, i) => (qs["q" + i] = v));
        el.querySelector("#fk-joints").innerHTML = fieldsHtml(fields, qs, true);
        saveArm(arm);
        update();
      };
      el.querySelector("#fk-adv").onclick = () => { arm._adv = !adv; saveArm(arm); view.destroy(); render(root, tool); };
      update();
    }

    function update() {
      const F = Kin.fk(arm.chain, arm.q);
      const T = F.at(-1);
      el.querySelector("#fk-pose").innerHTML = resultTiles([
        { label: "X", value: fmtLen(T[0][3]), unit: lenLabel() },
        { label: "Y", value: fmtLen(T[1][3]), unit: lenLabel() },
        { label: "Z", value: fmtLen(T[2][3]), unit: lenLabel() },
        ...orientationTiles(T),
      ]);
      const below = armBelowFloor(arm.chain, arm.q);
      el.querySelector("#fk-alerts").innerHTML = below > 1e-4 ? alertsHtml([{ level: "warn", text: floorText(below) }]) : "";
      const mats = el.querySelector("#fk-mats");
      if (mats) mats.innerHTML = matricesHtml(F);
      view.draw();
    }

    return { render, unmount() { view?.destroy(); } };
  })();

  /* ===== Käänteiskinematiikka ===== */
  const IK_DEFAULTS = { useOri: false, phi: 0, elbowUp: true, lambda: 0.05, maxIter: 200, tol: 0.0001 };
  const IK = (() => {
    let el, arm, ik, view, info = {}, frame = 0, gizmo;

    function render(root, tool) {
      el = root;
      arm = loadArm();
      const n = arm.chain.joints.length;
      const planar = Kin.isPlanar(arm.chain);
      const analytic = planar && n === 2;
      ik = getToolState("ik", IK_DEFAULTS);
      if (!ik.target || ik.preset !== arm.preset + n) {
        ik.target = origin(Kin.fk(arm.chain, arm.q).at(-1));
        ik.phi = planar ? Kin.task(arm.chain, arm.q, "planarOri")[2] : 0;
        ik.preset = arm.preset + n;
      }
      const adv = ik._adv ?? settings.advanced;

      const posInfo = (ax) => tr(`Kohdepisteen ${ax}-koordinaatti robotin kantakoordinaatistossa, eli kuinka kaukana työkalun kärjen pitäisi olla kannasta ${ax}-akselin suunnassa. Pienillä opetuskäsivarsilla tyypillisesti alle 1 m.`,
        `Target ${ax} coordinate in the robot base frame, i.e. how far from the base the tool tip should be along the ${ax} axis. Typically under 1 m for small teaching arms.`);
      const fields = [
        // Rajat ovat näyttöyksiköissä: ±1000 m
        { key: "x", label: "X", unit: lenLabel, factor: lenF, min: -1e3 / lenF(), max: 1e3 / lenF(), step: 0.01 / lenF(), info: posInfo("X") },
        { key: "y", label: "Y", unit: lenLabel, factor: lenF, min: -1e3 / lenF(), max: 1e3 / lenF(), step: 0.01 / lenF(), info: posInfo("Y") },
        ...(planar ? [] : [{ key: "z", label: "Z", unit: lenLabel, factor: lenF, min: -1e3 / lenF(), max: 1e3 / lenF(), step: 0.01 / lenF(),
          info: tr("Kohdepisteen korkeus kannan nollatasosta. Esimerkiksi pöydältä poimittaessa tämä on pöydän pinnan korkeus suhteessa robotin kantaan.", "Target height above the base origin. For example when picking from a table, this is the table surface height relative to the robot base.") }]),
        ...(analytic ? [{ key: "elbowUp", label: tr("Kyynärpää", "Elbow"), type: "select", options: [["true", tr("Ylös", "Up")], ["false", tr("Alas", "Down")]],
          info: tr("Kaksinivelinen käsivarsi voi yleensä saavuttaa saman pisteen kahdella tavalla: kyynärpää ylhäällä tai alhaalla. Valitse se, joka välttää esteet tai pysyy nivelrajoissa.", "A two-joint arm can usually reach the same point in two ways: elbow up or elbow down. Pick the one that avoids obstacles or stays within joint limits.") }] : []),
        ...(planar && n >= 3 ? [
          { key: "useOri", label: tr("Määrää työkalun suunta", "Specify tool orientation"), type: "toggle",
            info: tr("Kun päällä, ratkaisija hakee sijainnin lisäksi työkalun kulman tasossa (esim. tarttuja osoittaa suoraan alas). Pois päältä vain kärjen sijainti ratkaistaan.", "When on, the solver also matches the tool angle in the plane (e.g. gripper pointing straight down). When off, only the tip position is solved.") },
          { key: "phi", label: tr("Työkalun suunta φ", "Tool orientation φ"), unit: angLabel, factor: angF, min: -1e4, max: 1e4, step: 1, when: (s) => s.useOri,
            info: tr("Työkalun viimeisen linkin kulma x-akselista mitattuna: 0° = osoittaa +x-suuntaan, 90° = +y, −90° = −y.", "Angle of the last link measured from the x axis: 0° = points along +x, 90° = +y, −90° = −y.") },
        ] : []),
        ...(analytic ? [] : [
          { key: "lambda", label: tr("Vaimennus λ", "Damping λ"), help: tr("Suurempi = vakaampi lähellä singulariteettia, mutta hitaampi", "Higher = more stable near singularities, but slower"), adv: true, min: 0, max: 1, step: 0.01,
            info: tr("DLS-ratkaisijan vaimennuskerroin, joka estää nivelkulmia hyppimästä lähellä singulariteettia. Tyypillisesti 0,01–0,1.", "Damping factor of the DLS solver that keeps joint angles from jumping near singularities. Typically 0.01–0.1.") },
          { key: "maxIter", label: tr("Iteraatioita enintään", "Max iterations"), adv: true, min: 1, max: 5000, step: 10, int: true,
            info: tr("Kuinka monta parannusaskelta ratkaisija enintään ottaa ennen kuin luovuttaa. Yleensä 100–500 riittää.", "How many improvement steps the solver takes at most before giving up. Usually 100–500 is enough.") },
          { key: "tol", label: tr("Toleranssi", "Tolerance"), unit: lenLabel, factor: lenF, adv: true, min: 1e-9 / lenF(), max: 1 / lenF(), step: 0.0001 / lenF(),
            info: tr("Kuinka lähelle kohdetta kärjen pitää päästä, jotta ratkaisu hyväksytään. Tyypillisesti 0,1 mm (0,0001 m).", "How close the tip must get to the target for the solution to be accepted. Typically 0.1 mm (0.0001 m).") },
        ]),
      ];
      const fstate = { ...ik, x: ik.target[0], y: ik.target[1], z: ik.target[2], elbowUp: String(ik.elbowUp) };

      el.innerHTML = `
        ${toolHead(tool, `<a class="btn" href="#/dh">${tr("Muokkaa DH-taulukkoa", "Edit DH table")}</a>`)}
        <div class="tool viz-first">
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Robotti", "Robot")}</h3>
              <div class="fields"><div class="field"><label>${tr("Malli", "Model")}</label><div class="field-ctl">${presetSelect(arm, "ik-preset")}</div></div></div>
              <p class="note" style="margin-top:10px">${analytic ? tr("Ratkaistaan analyyttisesti (tarkka kaava).", "Solved analytically (closed-form).") : tr(`Ratkaistaan numeerisesti (DLS-menetelmä)${planar ? " tasossa" : ", vain sijainti"}.`, `Solved numerically (DLS method)${planar ? " in the plane" : ", position only"}.`)}</p>
            </div>
            <div class="card">
              <h3 class="card-title">${tr("Kohde", "Target")}</h3>
              <div class="fields" id="ik-fields"></div>
              ${analytic ? "" : `<button class="link-btn" id="ik-adv" style="margin-top:12px">${adv ? tr("Piilota ratkaisijan asetukset", "Hide solver settings") : tr("Näytä ratkaisijan asetukset", "Show solver settings")}</button>`}
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Näkymä", "View")} ${viewTools("ik-vt")}</h3>
              <canvas class="view3" id="ik-view"></canvas>
              <p class="note" style="margin-top:8px">${planar
                ? tr("Raahaa nuolta liikuttaaksesi kohdetta vain sen akselin suuntaan, tai palloa vapaasti. Ylänäkymässä klikkaus siirtää kohteen.", "Drag an arrow to move the target along that axis only, or the ball freely. In top view a click moves the target.")
                : tr("Raahaa nuolta (X, Y, Z) liikuttaaksesi kohdetta vain sen akselin suuntaan, tai palloa vaakatasossa.", "Drag an arrow (X, Y, Z) to move the target along that axis only, or the ball in the horizontal plane.")}
                ${viewHint()}</p>
            </div>
            <div id="ik-alerts"></div>
            <div class="card"><h3 class="card-title">${tr("Nivelarvot", "Joint values")}</h3><div id="ik-joints"></div></div>
          </div>
        </div>`;

      const box = el.querySelector("#ik-fields");
      const drawFields = () => { box.innerHTML = fieldsHtml(fields, fstate, adv); };
      drawFields();
      bindFields(box, fields, fstate, (key) => {
        if (key === "x" || key === "y" || key === "z") ik.target = [fstate.x, fstate.y, fstate.z];
        else if (key === "elbowUp") ik.elbowUp = fstate.elbowUp === "true";
        else ik[key] = fstate[key];
        if (key === "useOri") drawFields();
        solve(); persist(); view.draw();
      });
      el.querySelector("#ik-adv")?.addEventListener("click", () => { ik._adv = !adv; persist(); view.destroy(); render(root, tool); });
      bindPreset(el.querySelector("#ik-preset"), arm, (a) => { saveArm(a); view.destroy(); render(root, tool); });

      const ext = extentOf(arm.chain);
      gizmo = { hover: null, drag: null, L: ext * 0.22, axes: planar ? [0, 1] : [0, 1, 2] };
      const update = () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          solve(); view.draw();
          ["x", "y", "z"].forEach((k, i) => (fstate[k] = ik.target[i]));
          box.querySelectorAll('[data-f="x"],[data-f="y"],[data-f="z"]').forEach((inp) => { inp.value = +(fstate[inp.dataset.f] / lenF()).toPrecision(5); inp.classList.remove("invalid"); });
        });
      };
      // Mikä kahva on hiiren kohdalla: "c" = keskipallo (vaakataso), 0/1/2 = akselinuoli (vain sen akselin suuntaan)
      const handleAt = (sx, sy) => {
        const t = ik.target, a = view.project(t);
        if (Math.hypot(a[0] - sx, a[1] - sy) < 11) return "c";
        let best = null, bestD = 9;
        for (const k of gizmo.axes) {
          const b = view.project(t.map((v, i) => v + (i === k ? gizmo.L : 0)));
          const dx = b[0] - a[0], dy = b[1] - a[1], len2 = dx * dx + dy * dy;
          if (len2 < 25) continue; // akseli osoittaa suoraan kameraa kohti
          const u = Math.max(0.25, Math.min(1.08, ((sx - a[0]) * dx + (sy - a[1]) * dy) / len2));
          const d = Math.hypot(a[0] + u * dx - sx, a[1] + u * dy - sy);
          if (d < bestD) { bestD = d; best = k; }
        }
        return best;
      };
      const moveTo = (sx, sy) => {
        const g = gizmo.drag;
        if (g && g.axis !== "c") {
          const len2 = g.d[0] ** 2 + g.d[1] ** 2;
          const delta = (((sx - g.s0[0]) * g.d[0] + (sy - g.s0[1]) * g.d[1]) / len2) * gizmo.L;
          ik.target = g.t0.map((v, i) => v + (i === g.axis ? delta : 0));
        } else {
          const p = view.unproject(sx, sy, ik.target[2]);
          if (!p) return;
          ik.target = [p[0], p[1], ik.target[2]];
        }
        update();
      };
      view = new ArmView(el.querySelector("#ik-view"), { lift: armLift(arm.chain),
        extent: ext, az: planar ? -90 : -60, el: planar ? 89.9 : 25,
        draw: drawView,
        draw3d: drawView3d,
        hoverable: (sx, sy) => {
          const h = handleAt(sx, sy);
          if (h !== gizmo.hover) { gizmo.hover = h; view.draw(); }
          return h !== null;
        },
        onDown: (sx, sy) => {
          const h = handleAt(sx, sy);
          if (h !== null) {
            const t0 = [...ik.target], a = view.project(t0);
            const b = h === "c" ? a : view.project(t0.map((v, i) => v + (i === h ? gizmo.L : 0)));
            gizmo.drag = { axis: h, s0: [sx, sy], t0, d: [b[0] - a[0], b[1] - a[1]] };
            gizmo.hover = h;
            return true;
          }
          if (planar && view.el > 80) { gizmo.drag = { axis: "c" }; moveTo(sx, sy); return true; } // ylänäkymässä klikkaus siirtää kohteen
          return false;
        },
        onDrag: moveTo,
        // Vedon lopuksi ratkaistaan uudelleen myös lattian yläpuolelle jäävän asennon haulla (raskas, ei vedon aikana)
        onEnd: () => { if (gizmo.drag) { gizmo.drag = null; solve(); persist(); view.draw(); } },
      });
      bindViewTools(el, "ik-vt", view);
      const q0 = JSON.stringify(arm.q);
      solve();
      view.draw();
      // Avattaessa ratkaistu asento tallennetaan (ilman kumoamisaskelta), jotta FK ja trajektorigeneraattori näkevät saman asennon
      if (JSON.stringify(arm.q) !== q0) saveToolState("arm", { preset: arm.preset, chain: arm.chain, q: arm.q, _adv: arm._adv }, { undo: false });
    }

    function persist() {
      saveToolState("ik", { ...ik });
      saveArm(arm);
    }

    function solve() {
      const chain = arm.chain, n = chain.joints.length;
      const planar = Kin.isPlanar(chain);
      let q, reachable;
      if (planar && n === 2) {
        const c = Kin.toClassic(chain);
        const r = Kin.ik2R(c, ik.target[0], ik.target[1], ik.elbowUp);
        const other = Kin.ik2R(c, ik.target[0], ik.target[1], !ik.elbowUp);
        q = r.q.map((v, i) => Math.min(chain.joints[i].max, Math.max(chain.joints[i].min, v)));
        reachable = r.reachable;
        info = { analytic: true, other: other.q };
      } else {
        const mode = planar ? (ik.useOri && n >= 3 ? "planarOri" : "planar") : "pos3";
        const target = mode === "pos3" ? ik.target : mode === "planar" ? ik.target.slice(0, 2) : [ik.target[0], ik.target[1], ik.phi];
        const opts = { mode, lambda: ik.lambda, maxIter: ik.maxIter, tol: ik.tol };
        let r = Kin.ikDls(chain, arm.q, target, opts);
        // Jos ratkaisu painuu lattian läpi, kokeillaan muita alkuarvauksia ja valitaan lattian yläpuolelle jäävä.
        // Vedon aikana haku jätetään väliin (jopa kymmeniä ratkaisuja joka ruudulla nykisi): se tehdään vedon lopuksi.
        let below = armBelowFloor(chain, r.q);
        if (below > 1e-3 && ik.target[2] >= 0 && !gizmo?.drag) {
          const seeds = [PRESETS[arm.preset]?.q, ...Array.from({ length: 10 }, (_, s) => chain.joints.map((j, i) => {
            const u = (Math.sin((s + 1) * 12.9898 + (i + 1) * 78.233) * 43758.5453) % 1; // toistettava näennäissatunnainen
            const lo = Math.max(j.min, -Math.PI), hi = Math.min(j.max, Math.PI);
            return lo + Math.abs(u) * (hi - lo);
          }))].filter((s) => s && s.length === n);
          for (const s of seeds) {
            const r2 = Kin.ikDls(chain, s, target, opts);
            if (!r2.converged && r.converged) continue;
            const b2 = armBelowFloor(chain, r2.q);
            if (b2 < below - 1e-6 || (r2.converged && !r.converged)) { r = r2; below = b2; }
            if (below <= 1e-3 && r.converged) break;
          }
        }
        q = r.q;
        reachable = r.converged;
        info = { analytic: false, iters: r.iters, mode };
      }
      arm.q = q;
      const tipP = origin(Kin.fk(chain, q).at(-1));
      const err = planar ? Math.hypot(tipP[0] - ik.target[0], tipP[1] - ik.target[1]) : Math.hypot(...tipP.map((v, i) => v - ik.target[i]));
      const reach = Kin.reach(chain);
      const w = Kin.manipulability(chain, q, planar ? "planar" : "pos3");
      const wRel = w / Math.pow(reach.max || 1, planar ? 2 : 3);
      const hitLimit = q.some((v, i) => Math.abs(v - chain.joints[i].min) < 1e-6 || Math.abs(v - chain.joints[i].max) < 1e-6);

      const alerts = [];
      if (!reachable || err > Math.max(ik.tol * 10, 1e-4)) {
        alerts.push({ level: "warn", text: tr(`Kohde ei ole ulottuvilla — käsivarsi ojentuu lähimpään mahdolliseen pisteeseen (virhe ${fmtLen(err)} ${lenLabel()}).${hitLimit ? " Jokin nivel on rajallaan." : ""}`,
          `Target out of reach — the arm extends to the closest reachable point (error ${fmtLen(err)} ${lenLabel()}).${hitLimit ? " A joint is at its limit." : ""}`) });
      } else {
        alerts.push({ level: "ok", text: tr(`Kohde saavutettu${info.analytic ? "" : ` (${info.iters} iteraatiota)`}.`, `Target reached${info.analytic ? "" : ` (${info.iters} iterations)`}.`) });
      }
      // Singulariteetti on mielekäs vain, jos niveliä on vähintään yhtä monta kuin ohjattavia suureita
      if (n >= (planar ? 2 : 3) && wRel < 0.02) alerts.push({ level: "warn", text: tr("Lähellä singulariteettia: käsivarsi on lähes ojennettu tai taitettu, joten pieni liike kohteessa voi vaatia suuria nivelliikkeitä.", "Near a singularity: the arm is almost fully extended or folded, so a small target motion may require large joint motions.") });
      const below = armBelowFloor(chain, q);
      if (below > 1e-3) alerts.push({ level: "warn", text: floorText(below) + (ik.target[2] < 0 ? tr(" Kohde itse on lattian alapuolella.", " The target itself is below the floor.") : "") });
      el.querySelector("#ik-alerts").innerHTML = alertsHtml(alerts);

      el.querySelector("#ik-joints").innerHTML = resultTiles([
        ...chain.joints.map((j, i) => ({ label: `q${i + 1}`, value: j.type === "R" ? fmtAng(q[i], 1) : fmtLen(q[i]), unit: jl(j),
          sub: info.analytic ? tr(`toinen ratkaisu ${fmtAng(info.other[i], 1)}${angLabel()}`, `other solution ${fmtAng(info.other[i], 1)}${angLabel()}`) : "" })),
        { label: tr("Etäisyys kohteesta", "Distance to target"), value: fmtLen(err, 4), unit: lenLabel() },
        ...(n >= (planar ? 2 : 3) ? [{ label: tr("Manipuloitavuus", "Manipulability"), value: fmt(wRel, 3), sub: tr("0 = singulaarinen", "0 = singular") }] : []),
      ]);
    }

    function drawView(v) {
      const ext = extentOf(arm.chain);
      const planar = Kin.isPlanar(arm.chain);
      const border = cssColor("var(--border-strong)");
      const r = Kin.reach(arm.chain);
      if (planar) {
        v.circle([0, 0, 0], r.max, border, 1, [6, 5]);
        if (r.min > 1e-6) v.circle([0, 0, 0], r.min, border, 1, [6, 5]);
      }
      drawArm(v, arm.chain, arm.q, { extent: ext });
      const t = ik.target, warn = cssColor("var(--warn)");
      if (!planar) v.line([t[0], t[1], 0], t, border, 1, [3, 4]);
      if (planar && ik.useOri && arm.chain.joints.length >= 3) {
        v.line(t, [t[0] + Math.cos(ik.phi) * ext * 0.15, t[1] + Math.sin(ik.phi) * ext * 0.15, t[2]], warn, 2);
      }
      // Siirtokahvat: nuoli jokaisen akselin suuntaan, aktiivinen korostettuna
      const active = gizmo.drag?.axis ?? gizmo.hover;
      for (const k of gizmo.axes) {
        const on = active === k, c = axisColor(k);
        const tip = t.map((x, i) => x + (i === k ? gizmo.L : 0));
        if (gizmo.drag && gizmo.drag.axis === k) { // ohjauskisko koko akselin matkalta
          v.line(t.map((x, i) => x - (i === k ? ext * 2 : 0)), t.map((x, i) => x + (i === k ? ext * 2 : 0)), c, 1, [4, 4]);
        }
        v.line(t, tip, c, on ? 4 : 2.5);
        v.dot(tip, on ? 7 : 5, c);
        v.text(tip, "XYZ"[k], c, 8, -8);
      }
      v.dot(t, active === "c" ? 11 : 9, null, warn);
      v.dot(t, 4, warn);
    }

    // Varjostettu versio: kohde hehkuvana pallona, pystyviiva lattiaan ja ulottuma ympyränä lattiassa
    function drawView3d(g) {
      const ext = extentOf(arm.chain);
      const planar = Kin.isPlanar(arm.chain);
      const r = Kin.reach(arm.chain), border = cssColor("var(--border-strong)"), warn = cssColor("var(--warn)");
      const ring = (rad) => Array.from({ length: 73 }, (_, i) => [Math.cos(i / 36 * Math.PI) * rad, Math.sin(i / 36 * Math.PI) * rad, 0.001]);
      if (planar) { g.line(ring(r.max), border, 0.8); if (r.min > 1e-6) g.line(ring(r.min), border, 0.8); }
      drawArm3d(g, arm.chain, arm.q, { extent: ext });
      const t = ik.target;
      const active = gizmo.drag?.axis ?? gizmo.hover;
      g.sphere(t, ext * (active === "c" ? 0.042 : 0.035), warn, { emissive: true, opacity: 0.9 });
      if (Math.abs(t[2]) > 1e-6) g.line([[t[0], t[1], 0], t], warn, 0.6);
      if (planar && ik.useOri && arm.chain.joints.length >= 3) {
        g.cyl(t, [t[0] + Math.cos(ik.phi) * ext * 0.15, t[1] + Math.sin(ik.phi) * ext * 0.15, t[2]], ext * 0.008, warn);
      }
      // Siirtokahvat: varsi + paksumpi kärki, aktiivinen hehkuu
      for (const k of gizmo.axes) {
        const on = active === k, c = axisColor(k), L = gizmo.L;
        const at = (s) => t.map((x, i) => x + (i === k ? s : 0));
        if (gizmo.drag && gizmo.drag.axis === k) g.line([at(-ext * 2), at(ext * 2)], c, 0.5);
        g.cyl(at(ext * 0.04), at(L * 0.78), ext * (on ? 0.009 : 0.006), c, { emissive: on });
        g.cyl(at(L * 0.78), at(L), ext * (on ? 0.024 : 0.018), c, { emissive: on });
      }
    }

    return { render, unmount() { view?.destroy(); cancelAnimationFrame(frame); } };
  })();

  /* ===== DH-parametrit ===== */
  const DH = (() => {
    let el, arm, view;

    function render(root, tool) {
      el = root;
      arm = loadArm();
      el.innerHTML = `
        ${toolHead(tool, `
          <label class="btn" tabindex="0" role="button">${tr("Tuo…", "Import…")}<input type="file" id="dh-import" accept=".json,application/json" hidden></label>
          <button class="btn" id="dh-export">${tr("Vie JSON", "Export JSON")}</button>`)}
        <div class="card" style="margin-bottom:var(--pad)">
          <h3 class="card-title">${tr("Taulukko", "Table")}
            <span class="view-tools">
              ${presetSelect(arm, "dh-preset")}
              <select id="dh-conv" style="height:28px;min-width:0">
                <option value="classic" ${arm.chain.convention !== "modified" ? "selected" : ""}>${tr("Klassinen DH", "Classic DH")}</option>
                <option value="modified" ${arm.chain.convention === "modified" ? "selected" : ""}>${tr("Modifioitu DH (Craig)", "Modified DH (Craig)")}</option>
              </select>
            </span></h3>
          <div class="table-wrap"><table class="dh-table" id="dh-table"></table></div>
          <div class="row-actions">
            <button class="btn" id="dh-add-r">${tr("+ Kiertyvä nivel", "+ Revolute joint")}</button>
            <button class="btn" id="dh-add-p">${tr("+ Liukuva nivel", "+ Prismatic joint")}</button>
          </div>
        </div>
        <div class="tool" style="grid-template-columns:1fr minmax(260px,340px)">
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Kinemaattinen ketju", "Kinematic chain")} ${viewTools("dh-vt")}</h3>
              <canvas class="view3" id="dh-view"></canvas>
              <p class="note" style="margin-top:8px">${viewHint()}</p>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Mitä parametrit tarkoittavat?", "What do the parameters mean?")}</h3>
              <p class="note" style="line-height:1.6">
                ${tr("Jokainen rivi kuvaa siirtymän edellisestä nivelestä seuraavaan neljällä luvulla:", "Each row describes the transform from one joint to the next with four numbers:")}<br>
                <b>θ</b> — ${tr("kierto z-akselin ympäri (kiertyvän nivelen kulma lisätään tähän)", "rotation about the z-axis (a revolute joint's angle is added here)")}<br>
                <b>d</b> — ${tr("siirto z-akselia pitkin (liukuvan nivelen pituus lisätään tähän)", "offset along the z-axis (a prismatic joint's extension is added here)")}<br>
                <b>a</b> — ${tr("linkin pituus x-akselia pitkin", "link length along the x-axis")}<br>
                <b>α</b> — ${tr("linkin kierre x-akselin ympäri", "link twist about the x-axis")}<br><br>
                ${arm.chain.convention === "modified"
                  ? tr("Modifioidussa muodossa a ja α kuvaavat edellistä linkkiä, ja viimeinen linkki on erillisellä työkalurivillä.", "In the modified convention, a and α describe the previous link, and the last link is on a separate tool row.")
                  : tr("Klassisessa muodossa järjestys on Rz(θ)·Tz(d)·Tx(a)·Rx(α).", "In the classic convention, the order is Rz(θ)·Tz(d)·Tx(a)·Rx(α).")}
                ${tr("Muodon vaihto muuntaa taulukon niin, että robotti pysyy samana.", "Switching convention converts the table so the robot stays the same.")}</p>
            </div>
          </div>
        </div>`;

      drawTable();
      view = new ArmView(el.querySelector("#dh-view"), { lift: armLift(arm.chain),
        extent: extentOf(arm.chain), az: -60, el: 25,
        draw: (v) => drawArm(v, arm.chain, arm.q, { allFrames: true, extent: extentOf(arm.chain) }),
        draw3d: (g) => drawArm3d(g, arm.chain, arm.q, { allFrames: true, extent: view.opts.extent }),
      });
      bindViewTools(el, "dh-vt", view);

      syncPreset();
      el.querySelector("#dh-conv").onchange = (e) => {
        arm.chain = e.target.value === "modified" ? Kin.toModified(arm.chain) : Kin.toClassic(arm.chain);
        saveArm(arm); view.destroy(); render(root, tool);
      };
      el.querySelector("#dh-add-r").onclick = () => addJoint(Rj(0.1));
      el.querySelector("#dh-add-p").onclick = () => addJoint(Pj());
      el.querySelector("#dh-export").onclick = () => downloadFile("robottikasivarsi.json",
        JSON.stringify({ format: "robolab-arm", version: 1, chain: arm.chain, q: arm.q }, null, 2));
      el.querySelector("#dh-import").onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then((txt) => {
          const d = JSON.parse(txt);
          if (d.format !== "robolab-arm" || !Array.isArray(d.chain?.joints)) throw 0;
          const chain = normalizeChain(d.chain);
          arm = { preset: "custom", chain, q: chain.joints.map((_, i) => num(d.q?.[i])) };
          saveArm(arm); view.destroy(); render(root, tool);
          toast(tr("Käsivarsi tuotu", "Arm imported"));
        }).catch(() => toast(tr("Tiedosto ei ole RoboLab-käsivarsi", "File is not a RoboLab arm")));
      };
    }

    function addJoint(j) {
      if (arm.chain.joints.length >= 12) { toast(tr("Enintään 12 niveltä", "At most 12 joints")); return; }
      arm.chain.joints.push(j);
      arm.q.push(0);
      arm.preset = "custom";
      saveArm(arm);
      view.opts.extent = extentOf(arm.chain);
      drawTable(); syncPreset(); view.draw();
    }

    // Taulukon muokkaus tekee mallista oman: valitsin näyttää sen Omat käsivarret -osiossa
    const applyPreset = (a) => { arm = a; saveArm(arm); router(); }; // router piirtää työkalun uudelleen (unmount vapauttaa näkymän)
    function syncPreset() { bindPreset(el.querySelector("#dh-preset"), arm, applyPreset); }

    function drawTable() {
      const adv = settings.advanced;
      const mod = arm.chain.convention === "modified";
      const NAMES = { theta: "θ", d: "d", a: "a", alpha: "α", min: "min", max: "max" };
      const num = (i, key, v, f) => `<td><input type="text" inputmode="decimal" data-j="${i}" data-k="${key}" data-f="${f}" value="${fmtInput(v / f, 5)}" aria-label="${i === "tool" ? tr("Työkalu", "Tool") : i === "base" ? tr("Kanta", "Base") : tr(`Nivel ${i + 1}`, `Joint ${i + 1}`)}: ${NAMES[key]}"></td>`;
      const sub = (s) => (mod ? `${s}<sub>i−1</sub>` : s);
      el.querySelector("#dh-table").innerHTML = `
        <tr><th>#</th><th>${tr("Tyyppi", "Type")}</th><th>θ [${angLabel()}]</th><th>d [${lenLabel()}]</th><th>${sub("a")} [${lenLabel()}]</th><th>${sub("α")} [${angLabel()}]</th>
          ${adv ? "<th>min</th><th>max</th>" : ""}<th></th></tr>
        ${arm.chain.joints.map((j, i) => `<tr>
          <td class="n">${i + 1}</td>
          <td style="width:110px"><select data-j="${i}" data-k="type" aria-label="${tr(`Nivel ${i + 1}: tyyppi`, `Joint ${i + 1}: type`)}">
            <option value="R" ${j.type === "R" ? "selected" : ""}>${tr("Kiertyvä", "Revolute")}</option>
            <option value="P" ${j.type === "P" ? "selected" : ""}>${tr("Liukuva", "Prismatic")}</option></select></td>
          ${num(i, "theta", j.theta, angF())}${num(i, "d", j.d, lenF())}${num(i, "a", j.a, lenF())}${num(i, "alpha", j.alpha, angF())}
          ${adv ? num(i, "min", j.min, jf(j)) + num(i, "max", j.max, jf(j)) : ""}
          <td class="x"><button class="del" data-del="${i}" title="${tr("Poista nivel", "Remove joint")}" aria-label="${tr("Poista nivel", "Remove joint")}">✕</button></td>
        </tr>`).join("")}
        ${mod ? `<tr class="tool-row"><td class="n">T</td><td><span class="note">${tr("Työkalu", "Tool")}</span></td><td></td><td></td>
          ${num("tool", "a", arm.chain.tool.a, lenF())}${num("tool", "alpha", arm.chain.tool.alpha, angF())}${adv ? "<td></td><td></td>" : ""}<td></td></tr>` : ""}
        ${!mod && arm.chain.base && (arm.chain.base.a || arm.chain.base.alpha) ? `<tr class="tool-row" title="${tr("Modifioidun DH:n ensimmäisen rivin a₀ ja α₀: siirtymä ennen ensimmäistä niveltä", "a₀ and α₀ from the first row of modified DH: an offset before the first joint")}"><td class="n">K</td><td><span class="note">${tr("Kanta", "Base")}</span></td><td></td><td></td>
          ${num("base", "a", arm.chain.base.a, lenF())}${num("base", "alpha", arm.chain.base.alpha, angF())}${adv ? "<td></td><td></td>" : ""}<td></td></tr>` : ""}`;

      const table = el.querySelector("#dh-table");
      table.oninput = (e) => {
        const t = e.target, i = t.dataset.j, k = t.dataset.k;
        if (!k) return;
        const target = i === "tool" ? arm.chain.tool : i === "base" ? arm.chain.base : arm.chain.joints[+i];
        if (k === "type") {
          const fresh = t.value === "R" ? Rj(0) : Pj();
          Object.assign(target, { type: t.value, min: fresh.min, max: fresh.max });
          arm.q[+i] = 0;
        } else {
          const v = parseInput(t.value);
          const val = v === null ? null : v * +t.dataset.f;
          // Tarkistus ennen kuin malli muuttuu: min > max tai yli 100 m pituus ei päädy tallennukseen
          const isLen = k === "d" || k === "a" || ((k === "min" || k === "max") && target.type === "P");
          const other = k === "min" ? target.max : k === "max" ? target.min : null;
          const bad = val === null || (isLen && Math.abs(val) > LEN_MAX) || (k === "min" && val > other) || (k === "max" && val < other);
          t.classList.toggle("invalid", bad);
          t.title = bad && val !== null ? (isLen && Math.abs(val) > LEN_MAX ? tr(`Enintään ±${LEN_MAX} m`, `At most ±${LEN_MAX} m`) : "min > max") : "";
          if (bad) return;
          target[k] = val;
          // Toisen rajan virhemerkintä pois, kun pari on taas kunnossa
          if (k === "min" || k === "max") table.querySelectorAll(`[data-j="${i}"][data-k="min"], [data-j="${i}"][data-k="max"]`).forEach((x) => { x.classList.remove("invalid"); x.title = ""; });
          if (i !== "tool" && i !== "base") arm.q[+i] = Math.min(target.max, Math.max(target.min, arm.q[+i]));
        }
        arm.preset = "custom";
        saveArm(arm);
        if (k === "type") drawTable();
        syncPreset();
        view.opts.extent = extentOf(arm.chain);
        view.draw();
      };
      table.onclick = (e) => {
        const d = e.target.dataset.del;
        if (d === undefined) return;
        if (arm.chain.joints.length <= 1) { toast(tr("Käsivarressa pitää olla vähintään yksi nivel", "The arm must have at least one joint")); return; }
        arm.chain.joints.splice(+d, 1);
        arm.q.splice(+d, 1);
        arm.preset = "custom";
        saveArm(arm); drawTable(); syncPreset();
        view.opts.extent = extentOf(arm.chain);
        view.draw();
      };
    }

    return { render, unmount() { view?.destroy(); } };
  })();

  // Trajektorigeneraattori käyttää samaa käsivarsimallia
  window.loadArmModel = loadArm;

  /* ===== Esimerkit ===== */
  // Tallentaa käsivarren ja säilyttää käyttäjän _adv-valinnan
  const armAdv = () => getToolState("arm", {})._adv;
  function exampleArm(id, q) {
    const a = presetArm(id);
    if (q) a.q = q;
    a._adv = armAdv();
    saveArm(a);
    return a;
  }
  // Oma ketju klassisella DH:lla; muunnetaan modifioiduksi, jos asetus niin vaatii
  function exampleChain(chain, q) {
    if (chain.convention !== "modified" && settings.dhConvention === "modified") chain = Kin.toModified(chain);
    saveArm({ preset: "custom", chain, q, _adv: armAdv() });
  }
  // IK-kohde: ik.preset pitää vastata käsivarren mallia, muuten render korvaa kohteen kärjen nykyisellä sijainnilla
  function exampleIk(id, target, opts = {}) {
    const a = exampleArm(id);
    saveToolState("ik", { ...IK_DEFAULTS, ...opts, target, preset: a.preset + a.chain.joints.length, _adv: getToolState("ik", {})._adv });
  }

  FK.examples = [
    { name: tr("2R: kurottaa eteenpäin", "2R: reaching forward"),
      desc: tr("Olka 60°, kyynärpää −60°: kyynärvarsi osoittaa suoraan x-suuntaan.", "Shoulder 60°, elbow −60°: the forearm points straight along x."),
      apply() { exampleArm("2r", [60 * D, -60 * D]); } },
    { name: tr("3R: työkalu osoittaa alas", "3R: tool pointing down"),
      desc: tr("Nivelkulmat 90°, −90°, −90°: viimeinen linkki osoittaa −y-suuntaan.", "Joint angles 90°, −90°, −90°: the last link points along −y."),
      apply() { exampleArm("3r", [90 * D, -90 * D, -90 * D]); } },
    { name: tr("SCARA poimii pöydältä", "SCARA picking from a table"),
      desc: tr("Z-liuku laskettu 18 cm alas, käsivarsi kääntynyt sivulle.", "Z slide lowered by 18 cm, arm swung to the side."),
      apply() { exampleArm("scara", [45 * D, -90 * D, 0.18, 0]); } },
    { name: tr("6-DOF: pystyasento (home)", "6-DOF: upright home pose"),
      desc: tr("UR-robottien tuttu lähtöasento [0, −90°, 0, −90°, 0, 0]: käsivarsi suoraan ylöspäin.", "The familiar UR start pose [0, −90°, 0, −90°, 0, 0]: arm pointing straight up."),
      apply() { exampleArm("ur", [0, -90 * D, 0, -90 * D, 0, 0]); } },
    { name: tr("6-DOF: ojennettu singulaarinen asento", "6-DOF: stretched singular pose"),
      desc: tr("Kaikki nivelet 0°: käsivarsi suorana ja ranteen akselit linjassa (singulariteetti).", "All joints 0°: arm fully stretched and wrist axes aligned (singularity)."),
      apply() { exampleArm("ur", [0, 0, 0, 0, 0, 0]); } },
  ];

  IK.examples = [
    { name: tr("2R: saavutettava kohde", "2R: reachable target"),
      desc: tr("Kohde (0,35; 0,2) m, kyynärpää ylös — näet myös toisen ratkaisun.", "Target (0.35, 0.2) m, elbow up — the other solution is shown too."),
      apply() { exampleIk("2r", [0.35, 0.2, 0], { elbowUp: true }); } },
    { name: tr("2R: kohde liian kaukana", "2R: target out of reach"),
      desc: tr("Kohde 0,67 m päässä, ulottuma vain 0,55 m — käsivarsi ojentuu kohti.", "Target 0.67 m away, reach only 0.55 m — the arm stretches towards it."),
      apply() { exampleIk("2r", [0.6, 0.3, 0], { elbowUp: true }); } },
    { name: tr("3R: tarttuja osoittaa alas", "3R: gripper pointing down"),
      desc: tr("Sijainnin lisäksi määrätään työkalun suunta φ = −90°.", "Besides position, tool orientation φ = −90° is required."),
      apply() { exampleIk("3r", [0.35, 0.25, 0], { useOri: true, phi: -90 * D }); } },
    { name: tr("SCARA: 3D-kohde pöydän yllä", "SCARA: 3D target above a table"),
      desc: tr("Kohde (0,35; 0,2; 0,2) m ratkaistaan numeerisesti, Z-liuku mukaan lukien.", "Target (0.35, 0.2, 0.2) m solved numerically, including the Z slide."),
      apply() { exampleIk("scara", [0.35, 0.2, 0.2]); } },
  ];

  DH.examples = [
    { name: tr("Klassinen 3-DOF nivelkäsivarsi", "Classic 3-DOF articulated arm"),
      desc: tr("Pystyakselin ympäri kääntyvä runko (α = 90°), olka ja kyynärpää.", "Base turning about the vertical axis (α = 90°), shoulder and elbow."),
      apply() { exampleChain({ convention: "classic", joints: [Rj(0, { d: 0.3, alpha: 90 }), Rj(0.3), Rj(0.25)], tool: { a: 0, alpha: 0 } }, [0, 45 * D, -60 * D]); } },
    { name: tr("Karteesinen XYZ-portaalirobotti", "Cartesian XYZ gantry"),
      desc: tr("Kolme liukuvaa niveltä: Z-, Y- ja X-liike; θ ja α kääntävät akselit kohtisuoriksi.", "Three prismatic joints: Z, Y and X motion; θ and α turn the axes perpendicular."),
      // Klassisessa DH:ssa nivel i liikkuu akselia z(i−1) pitkin: z0 = ylös, z1 = y, z2 = x
      apply() { exampleChain({ convention: "classic", joints: [Pj({ d: 0.1, alpha: -90, max: 0.4 }), Pj({ theta: 90, alpha: 90, max: 0.5 }), Pj({ theta: 90, alpha: 90, max: 0.5 })], tool: { a: 0, alpha: 0 } }, [0.2, 0.25, 0.3]); } },
    { name: tr("Tasomainen 2R modifioidulla DH:lla", "Planar 2R in modified DH"),
      desc: tr("Craigin muoto: linkkien pituudet a₁ = 0,3 m ja työkalurivillä 0,25 m.", "Craig's convention: link lengths a₁ = 0.3 m and 0.25 m on the tool row."),
      apply() { saveArm({ preset: "custom", chain: { convention: "modified", joints: [Rj(0), Rj(0.3)], tool: { a: 0.25, alpha: 0 } }, q: [30 * D, 45 * D], _adv: armAdv() }); } },
    { name: tr("6-DOF UR-tyyppinen robotti", "6-DOF UR-style robot"),
      desc: tr("Teollisuuskäsivarren DH-taulukko: vuorottelevat α = ±90° kiertävät nivelakseleita.", "An industrial arm DH table: alternating α = ±90° twist the joint axes."),
      apply() { exampleArm("ur"); } },
  ];

  TOOL_IMPL.fk = FK;
  TOOL_IMPL.ik = IK;
  TOOL_IMPL.dh = DH;
})();
