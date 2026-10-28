"use strict";

/* 3D-näkymä: TF-puun editori (kehysten väliset muunnokset) ja URDF-mallien katselu nivelsäätimin. */
(() => {
  const D = Math.PI / 180;
  const DEFAULT_FRAMES = [
    { name: "world", parent: "", xyz: [0, 0, 0], rpy: [0, 0, 0] },
    { name: "base_link", parent: "world", xyz: [0, 0, 0.05], rpy: [0, 0, 0] },
    { name: "lidar_link", parent: "base_link", xyz: [0.1, 0, 0.15], rpy: [0, 0, 0] },
    { name: "camera_link", parent: "base_link", xyz: [0.15, 0, 0.1], rpy: [0, 15 * D, 0] },
    { name: "camera_optical", parent: "camera_link", xyz: [0, 0, 0], rpy: [-90 * D, 0, -90 * D] },
    { name: "arm_base", parent: "base_link", xyz: [-0.05, 0, 0.12], rpy: [0, 0, 0] },
  ];

  const SAMPLE_URDF = `<?xml version="1.0"?>
<robot name="robolab_bot">
  <material name="sininen"><color rgba="0.3 0.55 1 1"/></material>
  <material name="musta"><color rgba="0.45 0.45 0.5 1"/></material>
  <material name="oranssi"><color rgba="1 0.6 0.2 1"/></material>

  <link name="base_footprint"/>
  <link name="base_link">
    <visual><geometry><box size="0.3 0.2 0.08"/></geometry><material name="sininen"/></visual>
  </link>
  <joint name="base_joint" type="fixed">
    <parent link="base_footprint"/><child link="base_link"/><origin xyz="0 0 0.07"/>
  </joint>

  <link name="left_wheel">
    <visual><origin rpy="1.5708 0 0"/><geometry><cylinder radius="0.04" length="0.03"/></geometry><material name="musta"/></visual>
  </link>
  <joint name="left_wheel_joint" type="continuous">
    <parent link="base_link"/><child link="left_wheel"/><origin xyz="0.05 0.12 -0.03"/><axis xyz="0 1 0"/>
  </joint>
  <link name="right_wheel">
    <visual><origin rpy="1.5708 0 0"/><geometry><cylinder radius="0.04" length="0.03"/></geometry><material name="musta"/></visual>
  </link>
  <joint name="right_wheel_joint" type="continuous">
    <parent link="base_link"/><child link="right_wheel"/><origin xyz="0.05 -0.12 -0.03"/><axis xyz="0 1 0"/>
  </joint>
  <link name="caster"><visual><geometry><sphere radius="0.02"/></geometry><material name="musta"/></visual></link>
  <joint name="caster_joint" type="fixed">
    <parent link="base_link"/><child link="caster"/><origin xyz="-0.11 0 -0.05"/>
  </joint>

  <link name="lidar_link">
    <visual><geometry><cylinder radius="0.035" length="0.04"/></geometry><material name="oranssi"/></visual>
  </link>
  <joint name="lidar_joint" type="fixed">
    <parent link="base_link"/><child link="lidar_link"/><origin xyz="0.08 0 0.06"/>
  </joint>
  <link name="camera_link">
    <visual><geometry><box size="0.02 0.06 0.02"/></geometry><material name="musta"/></visual>
  </link>
  <joint name="camera_joint" type="fixed">
    <parent link="base_link"/><child link="camera_link"/><origin xyz="0.15 0 0.02" rpy="0 0.2 0"/>
  </joint>

  <link name="arm_link1">
    <visual><origin xyz="0 0 0.06"/><geometry><cylinder radius="0.015" length="0.12"/></geometry><material name="oranssi"/></visual>
  </link>
  <joint name="shoulder_yaw" type="revolute">
    <parent link="base_link"/><child link="arm_link1"/><origin xyz="-0.06 0 0.04"/>
    <axis xyz="0 0 1"/><limit lower="-3.14" upper="3.14" effort="1" velocity="1"/>
  </joint>
  <link name="arm_link2">
    <visual><origin xyz="0.06 0 0" rpy="0 1.5708 0"/><geometry><cylinder radius="0.012" length="0.12"/></geometry><material name="oranssi"/></visual>
  </link>
  <joint name="elbow" type="revolute">
    <parent link="arm_link1"/><child link="arm_link2"/><origin xyz="0 0 0.12"/>
    <axis xyz="0 -1 0"/><limit lower="-1.57" upper="1.57" effort="1" velocity="1"/>
  </joint>
  <link name="gripper">
    <visual><geometry><box size="0.03 0.04 0.02"/></geometry></visual>
  </link>
  <joint name="gripper_slide" type="prismatic">
    <parent link="arm_link2"/><child link="gripper"/><origin xyz="0.12 0 0"/>
    <axis xyz="1 0 0"/><limit lower="0" upper="0.04" effort="1" velocity="1"/>
  </joint>
</robot>`;

  const DEFAULTS = { mode: "tf", frames: DEFAULT_FRAMES, sel: "camera_optical", from: "base_link", to: "camera_optical", armFrame: "",
    urdf: SAMPLE_URDF, q: {}, showFrames: true, showVisual: true, shaded: true, shadows: true };

  let el, st, view, model, parseTimer = 0;
  let gl = null, glFailed = false; // varjostettu Three.js-näkymä URDF-tilassa (ladataan tarvittaessa)

  const save = () => saveToolState("sim3d", st);

  function render(root, tool) {
    el = root;
    st = getToolState("sim3d", DEFAULTS);
    st.frames = st.frames.map((f) => ({ ...f, xyz: [...f.xyz], rpy: [...f.rpy] }));
    const tf = st.mode === "tf";
    el.innerHTML = `
      ${toolHead(tool)}
      <div id="s3-top"></div>
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <div class="seg" id="s3-mode">
              <button data-m="tf" class="${tf ? "on" : ""}">${tr("TF-puu", "TF tree")}</button>
              <button data-m="urdf" class="${!tf ? "on" : ""}">${tr("URDF-malli", "URDF model")}</button>
            </div>
            <p class="note" style="margin-top:10px">${tf
              ? tr("Rakenna koordinaatistojen puu (kuten ROS:n tf2) ja laske muunnos minkä tahansa kahden kehyksen välillä.", "Build a tree of coordinate frames (like ROS tf2) and compute the transform between any two frames.")
              : tr("Lataa robotin URDF-tiedosto ja liikuta sen niveliä. Mesh-tiedostoja ei ladata — niiden paikka näytetään merkillä.", "Load a robot URDF file and move its joints. Mesh files are not loaded — their location is shown with a marker.")}</p>
          </div>
          <div id="s3-left"></div>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Näkymä", "View")} <span class="view-tools" id="s3-vt">
              ${!tf ? `<span class="seg small" role="group" aria-label="${tr("Piirtotapa", "Render style")}">
                <button data-render="wire" class="${!st.shaded ? "on" : ""}" aria-pressed="${!st.shaded}">${tr("Rautalanka", "Wireframe")}</button>
                <button data-render="shaded" class="${st.shaded ? "on" : ""}" aria-pressed="${!!st.shaded}">${tr("Varjostettu", "Shaded")}</button>
              </span>
              <label class="mini-toggle" title="${tr("Kappaleet luovat varjon maahan ja toisiinsa", "Parts cast shadows on the ground and each other")}" ${st.shaded ? "" : "hidden"}>
                <input type="checkbox" id="s3-shadows" ${st.shadows ? "checked" : ""}> ${tr("Varjot", "Shadows")}</label>` : ""}
              <button data-v="3d">3D</button><button data-v="top">${tr("Ylhäältä", "Top")}</button><button data-v="front">${tr("Edestä", "Front")}</button></span></h3>
            <canvas class="view3" id="s3-view" style="height:min(460px, 60vh)"></canvas>
            <canvas class="view3" id="s3-gl" style="height:min(460px, 60vh)" hidden aria-label="${tr("Varjostettu 3D-näkymä robottimallista. Nuolinäppäimet kääntävät, plus ja miinus zoomaavat, 0 palauttaa.", "Shaded 3D view of the robot model. Arrow keys rotate, plus and minus zoom, 0 resets.")}"></canvas>
            <p class="note" style="margin-top:8px">${viewHint()} ${settings.axisColors === "cmy" ? tr("Akselit: x oranssi, y sininen, z violetti.", "Axes: x orange, y blue, z purple.") : tr("Akselit: x punainen, y vihreä, z sininen.", "Axes: x red, y green, z blue.")}</p>
          </div>
          <div id="s3-right"></div>
        </div>
      </div>`;

    el.querySelector("#s3-mode").onclick = (e) => {
      const m = e.target.dataset.m;
      if (!m || m === st.mode) return;
      st.mode = m; save(); unmount(); render(root, tool);
    };
    view = new View3(el.querySelector("#s3-view"), { up: settings.upAxis, extent: 0.4, az: -55, el: 25, draw: drawScene });
    el.querySelector("#s3-shadows")?.addEventListener("change", (e) => { st.shadows = e.target.checked; save(); refresh(); });
    el.querySelector("#s3-vt").onclick = (e) => {
      const r = e.target.closest("[data-render]")?.dataset.render;
      if (r) {
        st.shaded = r === "shaded";
        if (st.shaded) glFailed = false; // uusi yritys, jos lataus epäonnistui aiemmin
        save();
        el.querySelectorAll("[data-render]").forEach((b) => { b.classList.toggle("on", b.dataset.render === r); b.setAttribute("aria-pressed", b.dataset.render === r); });
        el.querySelector(".mini-toggle").hidden = !st.shaded;
        refresh();
        return;
      }
      const v = e.target.dataset.v;
      const views = { "3d": [-55, 25], top: [-90, 89.9], front: [0, 0.1] };
      if (!views[v]) return;
      view.setView(...views[v]);
      // Three.js-näkymässä atsimuutti on peilattu (malli käännetty Y-ylös-koordinaatteihin)
      gl?.setView(-views[v][0], Math.min(89, views[v][1]));
    };
    if (tf) renderTf(); else renderUrdf();
  }

  /* ===== TF-puu ===== */
  function renderTf() {
    const left = el.querySelector("#s3-left"), top = el.querySelector("#s3-top");
    const names = st.frames.map((f) => f.name);
    const AX = ["x", "y", "z", "roll", "pitch", "yaw"];
    const num = (i, k, j, v, f) => `<td><input type="text" inputmode="decimal" data-i="${i}" data-k="${k}" data-j="${j}" data-f="${f}" value="${fmtInput(v / f, 5)}" aria-label="${esc(st.frames[i].name)}: ${AX[(k === "rpy" ? 3 : 0) + j]}"></td>`;
    // Vanhemmaksi ei voi valita kehyksen omaa jälkeläistä (silmukka): jälkeläiset jätetään valikosta pois
    const descendantsOf = (name) => {
      const out = new Set([name]);
      for (let added = true; added;) { added = false; for (const x of st.frames) if (out.has(x.parent) && !out.has(x.name)) { out.add(x.name); added = true; } }
      return out;
    };
    const parentOptions = (f) => {
      const own = descendantsOf(f.name);
      return names.filter((n) => !own.has(n) || n === f.parent).map((n) => `<option ${n === f.parent ? "selected" : ""}>${esc(n)}</option>`).join("");
    };
    // Kehystaulukko on leveä, joten se on koko leveydellä sarakkeiden yläpuolella
    top.innerHTML = `
      <div class="card" style="margin-bottom:var(--pad)">
        <h3 class="card-title">${tr("Kehykset", "Frames")}</h3>
        <div class="table-wrap"><table class="dh-table" id="s3-frames">
          <tr><th>${tr("Nimi", "Name")}</th><th>${tr("Vanhempi", "Parent")}</th><th>x</th><th>y</th><th>z</th><th>roll</th><th>pitch</th><th>yaw</th><th></th></tr>
          ${st.frames.map((f, i) => `<tr class="${f.name === st.sel ? "sel" : ""}">
            <td><input type="text" data-i="${i}" data-k="name" value="${esc(f.name)}" style="min-width:110px;font-family:var(--mono)" aria-label="${tr("Kehyksen nimi", "Frame name")}"></td>
            <td><select data-i="${i}" data-k="parent" style="min-width:110px" aria-label="${esc(tr(`Kehyksen ${f.name} vanhempi`, `Parent of frame ${f.name}`))}">
              <option value="">—</option>
              ${parentOptions(f)}
            </select></td>
            ${[0, 1, 2].map((j) => num(i, "xyz", j, f.xyz[j], lenF())).join("")}
            ${[0, 1, 2].map((j) => num(i, "rpy", j, f.rpy[j], angF())).join("")}
            <td class="x"><button class="del" data-del="${i}" title="${tr("Poista kehys", "Delete frame")}" aria-label="${tr("Poista kehys", "Delete frame")}">✕</button></td>
          </tr>`).join("")}
        </table></div>
        <div class="row-actions">
          <button class="btn" id="s3-add">${tr("+ Lisää kehys", "+ Add frame")}</button>
          <button class="btn" id="s3-reset">${tr("Esimerkkipuu", "Example tree")}</button>
        </div>
        <p class="note" style="margin-top:8px">${tr(`Sijainti [${lenLabel()}], kulmat [${angLabel()}] ROS-konvention mukaan: R = Rz(yaw)·Ry(pitch)·Rx(roll).`, `Position [${lenLabel()}], angles [${angLabel()}] per ROS convention: R = Rz(yaw)·Ry(pitch)·Rx(roll).`)}</p>
      </div>`;
    left.innerHTML = `
      <div class="card">
        <h3 class="card-title">${tr("Robottikäsivarsi", "Robot arm")}</h3>
        <div class="field"><label>${tr("Kiinnitä kinematiikkatyökalun käsivarsi kehykseen", "Attach the kinematics tool's arm to frame")}</label>
          <select id="s3-arm"><option value="">${tr("Ei käsivartta", "No arm")}</option>${names.map((n) => `<option ${n === st.armFrame ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      </div>`;

    el.querySelector("#s3-right").innerHTML = `
      <div class="card">
        <h3 class="card-title">${tr("Muunnos kehysten välillä", "Transform between frames")}</h3>
        <div class="field-ctl" style="flex-wrap:wrap">
          <select id="s3-from" aria-label="${tr("Lähtökehys", "Source frame")}">${names.map((n) => `<option ${n === st.from ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
          <span class="note">→</span>
          <select id="s3-to" aria-label="${tr("Kohdekehys", "Target frame")}">${names.map((n) => `<option ${n === st.to ? "selected" : ""}>${esc(n)}</option>`).join("")}</select>
        </div>
        <p class="note" style="margin:8px 0 12px">${tr(`Kehyksen <b>${esc(st.to)}</b> asento kehyksessä <b>${esc(st.from)}</b> (vrt. <code>tf2_echo ${esc(st.from)} ${esc(st.to)}</code>).`, `Pose of frame <b>${esc(st.to)}</b> in frame <b>${esc(st.from)}</b> (cf. <code>tf2_echo ${esc(st.from)} ${esc(st.to)}</code>).`)}</p>
        <div id="s3-tf"></div>
      </div>
      <div id="s3-alerts"></div>`;

    const table = el.querySelector("#s3-frames");
    table.oninput = (e) => {
      const t = e.target, i = +t.dataset.i, k = t.dataset.k;
      if (!k) return;
      const f = st.frames[i];
      if (k === "name") {
        const n = t.value.trim();
        const bad = !n || st.frames.some((x, j) => j !== i && x.name === n);
        t.classList.toggle("invalid", bad);
        t.title = bad ? tr("Nimen pitää olla yksilöllinen", "The name must be unique") : "";
        if (bad) return;
        for (const x of st.frames) if (x.parent === f.name) x.parent = n;
        for (const key of ["sel", "from", "to", "armFrame"]) if (st[key] === f.name) st[key] = n;
        f.name = n;
        save(); updateTf();
        return;
      }
      if (k === "parent") { f.parent = t.value; save(); renderTf(); return; }
      // Sijainti enintään ±1 km: valtava luku tekisi näkymän ruudukosta liian raskaan
      const v = parseInput(t.value), bad = v === null || (k === "xyz" && Math.abs(v * +t.dataset.f) > 1000);
      t.classList.toggle("invalid", bad);
      t.title = bad && v !== null ? tr("Sijainti enintään ±1000 m", "Position at most ±1000 m") : "";
      if (bad) return;
      f[k][+t.dataset.j] = v * +t.dataset.f;
      save(); updateTf();
    };
    // Rivin valinta korostaa kehyksen näkymässä; nimen muutos piirretään taulukko uudelleen vasta, kun kenttä menettää fokuksen
    table.addEventListener("focusin", (e) => {
      const i = e.target.dataset.i;
      if (i === undefined) return;
      st.sel = st.frames[+i].name;
      table.querySelectorAll("tr").forEach((tr, r) => tr.classList.toggle("sel", r - 1 === +i));
      view.draw();
    });
    table.addEventListener("change", (e) => { if (e.target.dataset.k === "name") renderTf(); });
    table.onclick = (e) => {
      const d = e.target.dataset.del;
      if (d === undefined) return;
      const f = st.frames[+d];
      if (st.frames.some((x) => x.parent === f.name)) { toast(tr(`Kehyksellä "${f.name}" on lapsia — poista tai siirrä ne ensin`, `Frame "${f.name}" has children — delete or move them first`)); return; }
      st.frames.splice(+d, 1);
      // Poistettuun kehykseen viittaavat valinnat ensimmäiseen jäljellä olevaan
      for (const key of ["sel", "from", "to"]) if (st[key] === f.name) st[key] = st.frames[0]?.name || "";
      if (st.armFrame === f.name) st.armFrame = "";
      save(); renderTf();
    };
    el.querySelector("#s3-add").onclick = () => {
      let k = 1;
      while (st.frames.some((f) => f.name === "frame_" + k)) k++;
      st.frames.push({ name: "frame_" + k, parent: st.sel || st.frames[0]?.name || "", xyz: [0.1, 0, 0], rpy: [0, 0, 0] });
      st.sel = "frame_" + k;
      save(); renderTf();
    };
    el.querySelector("#s3-reset").onclick = () => {
      // Oma puu korvataan vain luvalla (muutoksen voi kumota)
      const custom = JSON.stringify(st.frames) !== JSON.stringify(DEFAULT_FRAMES);
      if (custom && settings.confirmReset && !confirm(tr("Korvataanko oma TF-puusi esimerkkipuulla? Voit kumota muutoksen (Ctrl+Z).", "Replace your own TF tree with the example tree? You can undo the change (Ctrl+Z)."))) return;
      st.frames = DEFAULT_FRAMES.map((f) => ({ ...f, xyz: [...f.xyz], rpy: [...f.rpy] }));
      Object.assign(st, { sel: "camera_optical", from: "base_link", to: "camera_optical", armFrame: "" });
      save(); renderTf();
    };
    el.querySelector("#s3-arm").onchange = (e) => { st.armFrame = e.target.value; save(); updateTf(); };
    el.querySelector("#s3-from").onchange = (e) => { st.from = e.target.value; save(); renderTf(); };
    el.querySelector("#s3-to").onchange = (e) => { st.to = e.target.value; save(); renderTf(); };
    updateTf();
  }

  let tfWorld = {};
  function updateTf() {
    const r = TF.resolveFrames(st.frames);
    tfWorld = r.world;
    const alerts = r.errors.map((t) => ({ level: "err", text: t }));
    const roots = st.frames.filter((f) => !f.parent);
    if (roots.length > 1) alerts.push({ level: "warn", text: tr(`Puussa on useita juurikehyksiä (${roots.map((f) => f.name).join(", ")}). Niiden välille ei voi laskea muunnosta.`, `The tree has multiple root frames (${roots.map((f) => f.name).join(", ")}). No transform can be computed between them.`) });

    const A = tfWorld[st.from], B = tfWorld[st.to];
    const box = el.querySelector("#s3-tf");
    if (A && B && sameTree(st.from, st.to)) {
      const T = Kin.mul(TF.inverse(A), B);
      const R = [0, 1, 2].map((i) => [T[i][0], T[i][1], T[i][2]]);
      const rpy = Kin.matToEuler(R, "ZYX"); // [yaw, pitch, roll]
      const q = Kin.matToQuat(R), qi = settings.quatOrder === "wxyz" ? [3, 0, 1, 2] : [0, 1, 2, 3];
      box.innerHTML = resultTiles([
        { label: "x", value: fmtLen(T[0][3]), unit: lenLabel() },
        { label: "y", value: fmtLen(T[1][3]), unit: lenLabel() },
        { label: "z", value: fmtLen(T[2][3]), unit: lenLabel() },
        { label: tr("Etäisyys", "Distance"), value: fmtLen(Math.hypot(T[0][3], T[1][3], T[2][3])), unit: lenLabel() },
        { label: "roll / pitch / yaw", value: [rpy[2], rpy[1], rpy[0]].map((a) => fmtAng(a, 1)).join("  "), unit: angLabel() },
        { label: tr(`Kvaternio (${qi.map((i) => "xyzw"[i]).join(", ")})`, `Quaternion (${qi.map((i) => "xyzw"[i]).join(", ")})`), value: qi.map((i) => fmt(q[i], 3)).join("  ") },
      ]) + (settings.advanced ? `<div class="mat4" style="margin-top:10px"><b>${tr("Homogeeninen muunnos", "Homogeneous transform")}</b><table>${T.map((r) => `<tr>${r.map((x) => `<td>${fmt(x, 4)}</td>`).join("")}</tr>`).join("")}</table></div>` : "");
    } else {
      box.innerHTML = `<p class="note">${tr("Muunnosta ei voi laskea: kehykset eivät ole samassa puussa.", "Cannot compute the transform: the frames are not in the same tree.")}</p>`;
    }
    el.querySelector("#s3-alerts").innerHTML = alertsHtml(alerts);
    const pts = Object.values(tfWorld).map((T) => [T[0][3], T[1][3], T[2][3]]);
    const base = st.armFrame && tfWorld[st.armFrame];
    if (base) {
      const arm = window.loadArmModel();
      Kin.fk(arm.chain, arm.q).forEach((T) => { const M = Kin.mul(base, T); pts.push([M[0][3], M[1][3], M[2][3]]); });
    }
    fitView(pts);
    view.draw();
  }

  function rootOf(name) {
    const by = Object.fromEntries(st.frames.map((f) => [f.name, f]));
    const seen = new Set();
    while (by[name]?.parent && !seen.has(name)) { seen.add(name); name = by[name].parent; }
    return name;
  }
  const sameTree = (a, b) => rootOf(a) === rootOf(b);

  /* ===== URDF ===== */
  function renderUrdf() {
    const left = el.querySelector("#s3-left");
    left.innerHTML = `
      <div class="card">
        <h3 class="card-title">${tr("Malli", "Model")}</h3>
        <div class="row-actions" style="margin-top:0">
          <label class="btn" tabindex="0" role="button">${tr("Lataa URDF…", "Load URDF…")}<input type="file" id="s3-file" accept=".urdf,.xml,text/xml" hidden></label>
          <button class="btn" id="s3-sample">${tr("Esimerkkirobotti", "Example robot")}</button>
        </div>
        <details style="margin-top:12px">
          <summary class="link-btn" style="cursor:pointer">${tr("Muokkaa URDF-tekstiä", "Edit URDF text")}</summary>
          <textarea id="s3-text" spellcheck="false" style="min-height:260px;margin-top:8px;font:.78rem/1.5 var(--mono)">${esc(st.urdf)}</textarea>
        </details>
      </div>
      <div class="card">
        <h3 class="card-title">${tr("Nivelet", "Joints")} <button class="link-btn" id="s3-zero">${tr("Nollaa", "Reset")}</button></h3>
        <div class="fields" id="s3-joints"></div>
      </div>
      <div class="card">
        <div class="fields" id="s3-show"></div>
      </div>`;
    el.querySelector("#s3-right").innerHTML = `<div id="s3-info"></div><div id="s3-alerts"></div>`;

    const show = [
      { key: "showVisual", label: tr("Näytä geometria", "Show geometry"), type: "toggle" },
      { key: "showFrames", label: tr("Näytä linkkien koordinaatistot", "Show link frames"), type: "toggle" },
    ];
    el.querySelector("#s3-show").innerHTML = fieldsHtml(show, st, true);
    bindFields(el.querySelector("#s3-show"), show, st, () => { save(); refresh(); });

    el.querySelector("#s3-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      f.text().then((txt) => { st.urdf = txt; st.q = {}; save(); renderUrdf(); });
    };
    el.querySelector("#s3-sample").onclick = () => {
      if (st.urdf !== SAMPLE_URDF && settings.confirmReset && !confirm(tr("Korvataanko URDF-teksti esimerkkirobotilla? Voit kumota muutoksen (Ctrl+Z).", "Replace the URDF text with the example robot? You can undo the change (Ctrl+Z)."))) return;
      st.urdf = SAMPLE_URDF; st.q = {}; save(); renderUrdf();
    };
    el.querySelector("#s3-zero").onclick = () => { st.q = {}; save(); drawJoints(); refresh(); };
    el.querySelector("#s3-text").oninput = (e) => {
      clearTimeout(parseTimer);
      parseTimer = setTimeout(() => { st.urdf = e.target.value; save(); parse(); drawJoints(); }, 400);
    };
    parse();
    drawJoints();
  }

  function parse() {
    model = TF.parseUrdf(st.urdf);
    const alerts = [];
    if (/xacro:/.test(st.urdf)) alerts.push({ level: "warn", text: tr("Tiedostossa on Xacro-makroja, joita ei tueta. Muunna se ensin tavalliseksi URDF:ksi: xacro robotti.urdf.xacro > robotti.urdf", "The file contains Xacro macros, which are not supported. Convert it to plain URDF first: xacro robot.urdf.xacro > robot.urdf") });
    if (model.error) alerts.push({ level: "err", text: model.error });
    else model.errors.forEach((t) => alerts.push({ level: "err", text: t }));
    el.querySelector("#s3-alerts").innerHTML = alertsHtml(alerts);
    if (model.error) { el.querySelector("#s3-info").innerHTML = ""; refresh(); return; }
    const movable = model.joints.filter((j) => ["revolute", "continuous", "prismatic"].includes(j.type));
    const meshes = Object.values(model.links).flatMap((l) => l.visuals).filter((v) => v.geom?.type === "mesh").length;
    el.querySelector("#s3-info").innerHTML = resultTiles([
      { label: tr("Robotti", "Robot"), value: esc(model.name) },
      { label: tr("Linkit", "Links"), value: String(Object.keys(model.links).length) },
      { label: tr("Nivelet", "Joints"), value: String(model.joints.length), sub: tr(`${movable.length} liikkuvaa`, `${movable.length} movable`) },
      ...(meshes ? [{ label: tr("Mesh-geometriat", "Mesh geometries"), value: String(meshes), sub: tr("näytetään merkkeinä", "shown as markers") }] : []),
    ]);
    const T = TF.urdfFk(model, st.q);
    fitView(Object.values(T).map((M) => [M[0][3], M[1][3], M[2][3]]));
    refresh();
  }

  // URDF-tilan piirto: varjostettu Three.js-näkymä, jos se on valittu ja ladattavissa, muuten rautalanka
  function refresh() {
    const glCanvas = el.querySelector("#s3-gl");
    const useGL = st.mode === "urdf" && st.shaded && !glFailed && model && !model.error && glCanvas;
    if (glCanvas) glCanvas.hidden = !useGL;
    el.querySelector("#s3-view").hidden = !!useGL;
    if (!useGL) { view.draw(); return; }
    const draw = () => {
      if (!gl || !el.querySelector("#s3-gl")) return;
      gl.setModel(model);
      gl.update(TF.urdfFk(model, st.q), { showFrames: st.showFrames, showVisual: st.showVisual, shadows: st.shadows });
    };
    if (gl) { draw(); return; }
    ThreeView.load().then(() => {
      const cv = el.querySelector("#s3-gl");
      if (!cv || gl) return draw();
      gl = new ThreeView.Scene(cv, { up: settings.upAxis });
      draw();
    }).catch(() => {
      glFailed = true;
      toast(tr("Varjostettua näkymää ei voitu ladata (ei internetyhteyttä?) — näytetään rautalankamalli.", "Could not load the shaded view (no internet?) — showing the wireframe model."));
      refresh();
    });
  }

  function drawJoints() {
    // Uusi elementti joka kerta, jotta vanhat kuuntelijat (vanhalla nivellistalla) eivät jää eloon
    const old = el.querySelector("#s3-joints"), box = old.cloneNode(false);
    old.replaceWith(box);
    if (!model || model.error) { box.innerHTML = `<p class="note">${tr("Ei mallia.", "No model.")}</p>`; return; }
    const movable = model.joints.filter((j) => ["revolute", "continuous", "prismatic"].includes(j.type));
    if (!movable.length) { box.innerHTML = `<p class="note">${tr("Mallissa ei ole liikkuvia niveliä.", "The model has no movable joints.")}</p>`; return; }
    const qs = Object.fromEntries(movable.map((j, i) => ["j" + i, st.q[j.name] ?? 0]));
    const fields = movable.map((j, i) => {
      const lin = j.type === "prismatic", fct = lin ? lenF() : angF();
      return { key: "j" + i, label: `${esc(j.name)} · ${lin ? tr("liukuva", "prismatic") : j.type === "continuous" ? tr("jatkuva", "continuous") : tr("kiertyvä", "revolute")}`, type: "slider",
        unit: lin ? lenLabel() : angLabel(), factor: fct,
        min: +(j.lower / fct).toFixed(4), max: +(j.upper / fct).toFixed(4),
        step: "any" };
    });
    box.innerHTML = fieldsHtml(fields, qs, true);
    bindFields(box, fields, qs, (key) => {
      st.q[movable[+key.slice(1)].name] = qs[key];
      save(); refresh();
    });
  }

  /* ===== Piirto ===== */
  function fitView(points) {
    // Marginaali, jotta liikkuvat nivelet eivät karkaa näkymästä
    const r = Math.max(0.15, ...points.map((p) => Math.hypot(...p)));
    view.opts.extent = r * (st.mode === "urdf" ? 1.5 : 1.15);
  }

  function drawScene(v) {
    const ext = v.opts.extent;
    if (settings.showGrid) {
      const step = ext > 0.6 ? View3.gridStep(ext) : 0.05; // iso puu: harvempi ruudukko (enintään ~24 viivaa)
      v.grid(Math.ceil(ext / step) * step, step, cssColor("var(--border)"));
    }
    if (st.mode === "tf") drawTf(v, ext); else drawUrdf(v, ext);
  }

  function drawTf(v, ext) {
    const text2 = cssColor("var(--text-2)"), text3 = cssColor("var(--text-3)"), accent = cssColor("var(--accent)");
    const o = (T) => [T[0][3], T[1][3], T[2][3]];
    for (const f of st.frames) {
      const T = tfWorld[f.name], P = tfWorld[f.parent];
      if (T && P) v.line(o(P), o(T), text3, 1, [3, 4]);
    }
    for (const f of st.frames) {
      const T = tfWorld[f.name];
      if (!T) continue;
      const sel = f.name === st.sel;
      v.frame(T, ext * (sel ? 0.16 : 0.1), { width: sel ? 3 : 1.8 });
      if (settings.frameLabels || sel) v.text(o(T), f.name, sel ? accent : text2, 8, 10);
    }
    // Käsivarsi kiinnitettynä valittuun kehykseen
    const base = st.armFrame && tfWorld[st.armFrame];
    if (base) {
      // Sama värikoodattu piirto kuin kinematiikkatyökaluissa
      const arm = window.loadArmModel();
      drawArm(v, arm.chain, arm.q, { extent: ext * 0.6, grid: false, base });
    }
  }

  function drawUrdf(v, ext) {
    if (!model || model.error) return;
    const T = TF.urdfFk(model, st.q);
    const o = (M) => [M[0][3], M[1][3], M[2][3]];
    const text3 = cssColor("var(--text-3)"), accent = cssColor("var(--accent)");
    for (const j of model.joints) if (T[j.parent] && T[j.child]) v.line(o(T[j.parent]), o(T[j.child]), text3, 1, [3, 4]);
    if (st.showVisual) {
      for (const link of Object.values(model.links)) {
        const L = T[link.name];
        if (!L) continue;
        for (const vis of link.visuals) {
          if (!vis.geom) continue;
          const M = Kin.mul(L, TF.fromXyzRpy(vis.xyz, vis.rpy));
          const c = vis.rgba ? `rgb(${vis.rgba.slice(0, 3).map((x) => Math.round(x * 255)).join(",")})` : accent;
          const g = vis.geom;
          if (g.type === "box") v.box(M, g.size, c);
          else if (g.type === "cylinder") v.cylinder(M, g.radius, g.length, c);
          else if (g.type === "sphere") v.sphere(M, g.radius, c);
          else if (g.type === "mesh") { v.dot(o(M), 5, null, c); v.text(o(M), "mesh", text3); }
        }
      }
    }
    if (st.showFrames) {
      for (const [name, M] of Object.entries(T)) {
        v.frame(M, ext * 0.07, { width: 1.5 });
        if (settings.frameLabels) v.text(o(M), name, text3, 6, 8);
      }
    }
  }

  function unmount() {
    clearTimeout(parseTimer);
    view?.destroy();
    gl?.dispose();
    gl = null;
  }

  // Pieni kaksiniveliseen käsivarteen perustuva URDF-esimerkki
  const ARM_URDF = `<?xml version="1.0"?>
<robot name="desk_arm">
  <material name="harmaa"><color rgba="0.55 0.58 0.62 1"/></material>
  <material name="sininen"><color rgba="0.3 0.55 1 1"/></material>
  <link name="base"><visual><origin xyz="0 0 0.02"/><geometry><cylinder radius="0.08" length="0.04"/></geometry><material name="harmaa"/></visual></link>
  <link name="turret"><visual><origin xyz="0 0 0.05"/><geometry><cylinder radius="0.04" length="0.1"/></geometry><material name="sininen"/></visual></link>
  <joint name="base_yaw" type="revolute"><parent link="base"/><child link="turret"/><origin xyz="0 0 0.04"/><axis xyz="0 0 1"/><limit lower="-3.14" upper="3.14" effort="1" velocity="1"/></joint>
  <link name="upper_arm"><visual><origin xyz="0 0 0.1"/><geometry><box size="0.04 0.04 0.2"/></geometry><material name="harmaa"/></visual></link>
  <joint name="shoulder" type="revolute"><parent link="turret"/><child link="upper_arm"/><origin xyz="0 0 0.1"/><axis xyz="0 1 0"/><limit lower="-1.6" upper="1.6" effort="1" velocity="1"/></joint>
  <link name="forearm"><visual><origin xyz="0 0 0.08"/><geometry><box size="0.03 0.03 0.16"/></geometry><material name="sininen"/></visual></link>
  <joint name="elbow" type="revolute"><parent link="upper_arm"/><child link="forearm"/><origin xyz="0 0 0.2"/><axis xyz="0 1 0"/><limit lower="-2.5" upper="2.5" effort="1" velocity="1"/></joint>
  <link name="gripper"><visual><geometry><sphere radius="0.025"/></geometry><material name="harmaa"/></visual></link>
  <joint name="wrist" type="fixed"><parent link="forearm"/><child link="gripper"/><origin xyz="0 0 0.17"/></joint>
</robot>`;

  const keep = () => ({ _adv: getToolState("sim3d", DEFAULTS)._adv });
  const examples = [
    { name: tr("Mobiilirobotin anturikehykset", "Mobile robot sensor frames"), desc: tr("base_link, lidar ja kamera ROS-konventiolla", "base_link, lidar and camera in ROS convention"),
      apply: () => saveToolState("sim3d", { ...DEFAULTS, ...keep(), mode: "tf" }) },
    { name: tr("Kameran optinen kehys", "Camera optical frame"), desc: tr("Miksi kameran z osoittaa eteenpäin: base_link → camera_optical", "Why the camera's z points forward: base_link → camera_optical"),
      apply: () => saveToolState("sim3d", { ...DEFAULTS, ...keep(), mode: "tf", sel: "camera_optical", from: "camera_link", to: "camera_optical" }) },
    { name: tr("Robotti ja käsivarsi", "Robot with an arm"), desc: tr("Kinematiikkatyökalun käsivarsi kiinnitettynä robotin TF-puuhun", "The kinematics tool's arm attached to the robot's TF tree"),
      apply: () => saveToolState("sim3d", { ...DEFAULTS, ...keep(), mode: "tf", armFrame: "arm_base", from: "world", to: "arm_base" }) },
    { name: tr("URDF: mobiilirobotti", "URDF: mobile robot"), desc: tr("Pyörät, lidar, kamera ja pieni käsivarsi", "Wheels, lidar, camera and a small arm"),
      apply: () => saveToolState("sim3d", { ...DEFAULTS, ...keep(), mode: "urdf", urdf: SAMPLE_URDF, q: { shoulder_yaw: 0.6, elbow: 0.7 } }) },
    { name: tr("URDF: pöytäkäsivarsi", "URDF: desk arm"), desc: tr("Kolme kiertyvää niveltä — liikuta liukusäätimillä", "Three revolute joints — move them with the sliders"),
      apply: () => saveToolState("sim3d", { ...DEFAULTS, ...keep(), mode: "urdf", urdf: ARM_URDF, q: { base_yaw: 0.5, shoulder: 0.5, elbow: 1.0 } }) },
  ];

  TOOL_IMPL.sim3d = { render, unmount, examples };
})();
