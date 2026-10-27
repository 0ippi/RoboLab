"use strict";

/* Rotaatiomuunnin: jokainen esitystapa on muokattava kortti. Muokattu kortti päivittää yhteisen
   kvaternion, ja muut kortit sekä 3D-näkymä seuraavat. */
(() => {
  const ORDERS = ["ZYX", "XYZ", "ZXY", "YXZ", "ZYZ", "ZXZ"];
  const RPY = { ZYX: ["yaw", "pitch", "roll"], XYZ: ["roll", "pitch", "yaw"] };
  let state, el, view;

  const quatIdx = () => (settings.quatOrder === "wxyz" ? [3, 0, 1, 2] : [0, 1, 2, 3]);
  const quatNames = () => quatIdx().map((i) => "xyzw"[i]);

  function render(root, tool) {
    el = root;
    state = getToolState("rot", { q: [0, 0, 0, 1], order: settings.eulerOrder, frame: settings.eulerFrame });
    const adv = state._adv ?? settings.advanced;
    const input = (card, i, label) => `
      <div class="field"><label>${label}</label>
        <div class="field-ctl"><span class="num"><input type="text" inputmode="decimal" data-card="${card}" data-i="${i}" aria-label="${label}"></span></div></div>`;

    el.innerHTML = `
      ${toolHead(tool, `<button class="btn" id="r-reset">${tr("Nollaa", "Reset")}</button>`)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Euler-kulmat", "Euler angles")} <span class="badge">${angLabel()}</span></h3>
            <div class="fields">
              <div class="field"><label>${tr("Järjestys", "Order")}</label><div class="field-ctl">
                <select id="r-order">${ORDERS.map((o) => `<option ${o === state.order ? "selected" : ""}>${o}</option>`).join("")}</select>
                ${adv ? `<select id="r-frame">
                  <option value="intrinsic" ${state.frame === "intrinsic" ? "selected" : ""}>${tr("Sisäinen", "Intrinsic")}</option>
                  <option value="extrinsic" ${state.frame === "extrinsic" ? "selected" : ""}>${tr("Ulkoinen", "Extrinsic")}</option></select>` : ""}
              </div></div>
              <div class="tri" id="r-euler-fields"></div>
            </div>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Kvaternio", "Quaternion")} <span class="badge">${quatNames().join(", ")}</span></h3>
            <div class="quad">${quatNames().map((n, i) => input("quat", i, n)).join("")}</div>
            <p class="note" id="r-qnote" style="margin-top:8px"></p>
          </div>
          ${adv ? `
          <div class="card">
            <h3 class="card-title">${tr("Akseli–kulma", "Axis–angle")}</h3>
            <div class="quad">${["x", "y", "z"].map((n, i) => input("aa", i, tr("akseli ", "axis ") + n)).join("")}${input("aa", 3, tr("kulma ", "angle ") + angLabel())}</div>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Rotaatiomatriisi", "Rotation matrix")}</h3>
            <div class="matrix">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map((i) => `<input type="text" inputmode="decimal" data-card="mat" data-i="${i}" aria-label="R${Math.floor(i / 3) + 1}${i % 3 + 1}">`).join("")}</div>
          </div>` : ""}
          <button class="link-btn" id="r-adv">${adv ? tr("Piilota lisäesitykset", "Hide extra representations") : tr("Näytä akseli–kulma ja matriisi", "Show axis–angle and matrix")}</button>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Koordinaatisto", "Coordinate frame")} <span class="note">${tr("vedä kääntääksesi näkymää", "drag to rotate the view")}</span></h3>
            <canvas class="view3" id="r-view"></canvas>
          </div>
          <div id="r-alerts"></div>
        </div>
      </div>`;

    drawEulerFields();
    view = new View3(el.querySelector("#r-view"), { up: settings.upAxis, extent: 1.15, az: -55, el: 22, draw: drawView });

    el.querySelector("#r-order").onchange = (e) => { state.order = e.target.value; save(); drawEulerFields(); refresh(null); };
    el.querySelector("#r-frame")?.addEventListener("change", (e) => { state.frame = e.target.value; save(); refresh(null); });
    el.querySelector("#r-adv").onclick = () => { state._adv = !adv; save(); view.destroy(); render(root, tool); };
    el.querySelector("#r-reset").onclick = () => { state.q = [0, 0, 0, 1]; save(); refresh(null); };
    el.querySelector(".tool").addEventListener("input", onInput);
    refresh(null);
  }

  function drawEulerFields() {
    const names = RPY[state.order] || [];
    el.querySelector("#r-euler-fields").innerHTML = [0, 1, 2].map((i) => {
      const label = `${i + 1}. ${state.order[i]}${names[i] ? ` (${names[i]})` : ""}`;
      return `<div class="field"><label>${label}</label><div class="field-ctl"><span class="num">
        <input type="text" inputmode="decimal" data-card="euler" data-i="${i}" aria-label="${label}"></span></div></div>`;
    }).join("");
  }

  const save = () => saveToolState("rot", state);

  function onInput(e) {
    const card = e.target.dataset.card;
    if (!card) return;
    const inputs = [...el.querySelectorAll(`[data-card="${card}"]`)];
    const vals = inputs.map((i) => parseInput(i.value));
    inputs.forEach((inp, i) => inp.classList.toggle("invalid", vals[i] === null));
    if (vals.includes(null)) return;

    let q, note = "";
    if (card === "euler") {
      q = Kin.matToQuat(Kin.eulerToMat(vals.map((v) => v * angF()), state.order, state.frame));
    } else if (card === "quat") {
      const raw = [0, 0, 0, 0];
      quatIdx().forEach((k, i) => (raw[k] = vals[i]));
      const n = Math.hypot(...raw);
      if (n < 1e-9) { inputs.forEach((i) => i.classList.add("invalid")); return; }
      if (Math.abs(n - 1) > 1e-6) note = tr(`Normalisoitu (pituus oli ${fmt(n, 4)}).`, `Normalized (norm was ${fmt(n, 4)}).`);
      q = Kin.quatNormalize(raw);
    } else if (card === "aa") {
      if (Math.hypot(vals[0], vals[1], vals[2]) < 1e-9) { inputs.slice(0, 3).forEach((i) => i.classList.add("invalid")); return; }
      q = Kin.axisAngleToQuat(vals.slice(0, 3), vals[3] * angF());
    } else if (card === "mat") {
      const R = [vals.slice(0, 3), vals.slice(3, 6), vals.slice(6, 9)];
      const err = Kin.orthoError(R);
      if (err > 1e-3) {
        inputs.forEach((i) => i.classList.add("invalid"));
        el.querySelector("#r-alerts").innerHTML = alertsHtml([{ level: "err", text: tr(`Matriisi ei ole rotaatiomatriisi: sarakkeiden pitää olla yksikkövektoreita, kohtisuorassa toisiaan vastaan ja determinantin 1 (poikkeama ${fmt(err, 3)}).`, `Not a rotation matrix: columns must be mutually orthogonal unit vectors and the determinant must be 1 (deviation ${fmt(err, 3)}).`) }]);
        return;
      }
      q = Kin.matToQuat(R);
    }
    state.q = q;
    save();
    refresh(card, note);
  }

  // Päivittää kaikki kortit paitsi sen, jota käyttäjä parhaillaan muokkaa
  function refresh(skip, note = "") {
    const R = Kin.quatToMat(state.q);
    const euler = Kin.matToEuler(R, state.order, state.frame);
    const aa = Kin.quatToAxisAngle(state.q);
    const fill = (card, values) => {
      if (card === skip) return;
      el.querySelectorAll(`[data-card="${card}"]`).forEach((inp, i) => { inp.value = fmtInput(values[i]); inp.classList.remove("invalid"); });
    };
    fill("euler", euler.map((v) => v / angF()));
    fill("quat", quatIdx().map((k) => state.q[k]));
    fill("aa", [...aa.axis, aa.angle / angF()]);
    fill("mat", R.flat());
    el.querySelector("#r-qnote").textContent = note;

    const alerts = [];
    if (Kin.gimbalLocked(euler, state.order)) {
      alerts.push({ level: "warn", text: tr(`Kardaanilukko: ${state.order[0] === state.order[2] ? "keskimmäinen kulma on 0° tai 180°" : "keskimmäinen kulma on ±90°"}. Ensimmäinen ja kolmas akseli osuvat samaan suuntaan, joten kulmien jako niiden välillä ei ole yksikäsitteinen. Kvaternio ei kärsi tästä.`,
        `Gimbal lock: ${state.order[0] === state.order[2] ? "the middle angle is 0° or 180°" : "the middle angle is ±90°"}. The first and third axes are aligned, so the split of rotation between them is not unique. The quaternion is unaffected.`) });
    }
    alerts.push({ level: "info", text: `Euler ${state.order} ${state.frame === "intrinsic" ? tr("sisäinen (liikkuva koordinaatisto)", "intrinsic (moving frame)") : tr("ulkoinen (kiinteä koordinaatisto)", "extrinsic (fixed frame)")}: R = ${
      (state.frame === "intrinsic" ? [0, 1, 2] : [2, 1, 0]).map((i) => `R${state.order[i].toLowerCase()}(${["α", "β", "γ"][i]})`).join(" · ")}` });
    el.querySelector("#r-alerts").innerHTML = alertsHtml(alerts);
    view.draw();
  }

  function drawView(v) {
    const border = cssColor("var(--border-strong)"), text3 = cssColor("var(--text-3)");
    if (settings.showGrid) v.grid(1, 0.25, cssColor("var(--border)"));
    v.frame(Kin.identity(3), 1, { width: 1.5, alpha: 0.35, labels: settings.frameLabels });
    const R = Kin.quatToMat(state.q);
    v.frame(R, 0.9, { width: 3.5, labels: settings.frameLabels });
    // Kiertoakseli katkoviivana
    const aa = Kin.quatToAxisAngle(state.q);
    if (aa.angle > 1e-6) {
      v.line(aa.axis.map((c) => -c * 1.1), aa.axis.map((c) => c * 1.1), border, 1.5, [5, 5]);
      v.text(aa.axis.map((c) => c * 1.1), tr(`akseli ${fmtAng(aa.angle, 1)}${angLabel()}`, `axis ${fmtAng(aa.angle, 1)}${angLabel()}`), text3);
    }
    v.dot([0, 0, 0], 3, text3);
  }

  // Esimerkit: Euler ZYX sisäinen = [yaw, pitch, roll] asteina; _adv säilyy ennallaan
  const D = Math.PI / 180;
  const saveRot = (q) => saveToolState("rot", { q, order: "ZYX", frame: "intrinsic", _adv: getToolState("rot", {})._adv });
  const zyx = (yaw, pitch, roll) => Kin.matToQuat(Kin.eulerToMat([yaw * D, pitch * D, roll * D], "ZYX", "intrinsic"));
  const examples = [
    { name: tr("Käännös 90° vasemmalle (yaw)", "Turn 90° left (yaw)"),
      desc: tr("Kierto pystyakselin z ympäri, kuten mobiilirobotti kääntyy paikallaan.", "Rotation about the vertical z axis, like a mobile robot turning in place."),
      apply() { saveRot(zyx(90, 0, 0)); } },
    { name: tr("ROS-kameran optinen koordinaatisto", "ROS camera optical frame"),
      desc: tr("Roll −90°, yaw −90°: z eteen, x oikealle, y alas (camera_optical_frame).", "Roll −90°, yaw −90°: z forward, x right, y down (camera_optical_frame)."),
      apply() { saveRot(zyx(-90, 0, -90)); } },
    { name: tr("Kardaanilukko (pitch 90°)", "Gimbal lock (pitch 90°)"),
      desc: tr("ZYX-järjestyksessä pitch ±90° tekee yaw- ja roll-kulmista erottamattomat.", "In ZYX order, pitch ±90° makes yaw and roll indistinguishable."),
      apply() { saveRot(zyx(30, 90, 0)); } },
    { name: tr("Ylösalaisin: 180° x-akselin ympäri", "Upside down: 180° about X"),
      desc: tr("Esim. alaspäin osoittava tarttuja: y ja z vaihtavat suuntaa.", "E.g. a downward-facing gripper: y and z flip direction."),
      apply() { saveRot(Kin.axisAngleToQuat([1, 0, 0], Math.PI)); } },
    { name: tr("Mielivaltainen 3D-asento", "Arbitrary 3D orientation"),
      desc: tr("Yaw 45°, pitch 30°, roll 20° — vertaa esitystapoja keskenään.", "Yaw 45°, pitch 30°, roll 20° — compare the representations."),
      apply() { saveRot(zyx(45, 30, 20)); } },
  ];

  TOOL_IMPL.rot = { render, unmount() { view?.destroy(); }, examples };
})();
