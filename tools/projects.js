"use strict";

/* Projektit: luonti, vaihto, nimeäminen, kopiointi, vienti, tuonti ja poisto. */
TOOL_IMPL.projects = {
  render(el, tool) {
    const draw = () => {
      const list = Object.values(projects.projects).sort((a, b) => b.updated - a.updated);
      const toolName = (id) => TOOLS.find((t) => t.id === id)?.name;
      const date = (ms) => new Date(ms).toLocaleString(tr("fi-FI", "en-GB"), { dateStyle: "short", timeStyle: "short" });
      el.innerHTML = `
        ${toolHead(tool, `
          <label class="btn" tabindex="0" role="button">${tr("Tuo…", "Import…")}<input type="file" id="p-import" accept="application/json,.json" hidden></label>
          <button class="btn" id="p-example" title="${tr("Luo tai palauta valmis esimerkkiprojekti", "Create or restore a ready example project")}">${tr("Esimerkkiprojekti", "Example project")}</button>
          <button class="btn primary" id="p-new">${tr("+ Uusi projekti", "+ New project")}</button>`)}
        <div class="tool">
          <div class="col">
            <div class="proj-list">
              ${list.map((p) => {
                // Vain työkalut: jaetut tilat (esim. "arm" = käsivarsimalli, nn2dRuns) eivät ole työkaluja
                const used = Object.keys(p.tools).filter((id) => TOOLS.some((t) => t.id === id));
                return `<div class="card proj ${p.id === projects.active ? "active" : ""}" data-id="${esc(p.id)}">
                  <div class="card-icon">${icon("folder")}</div>
                  <div class="meta"><b>${esc(p.name)}</b>
                    <span>${used.length ? used.map((id) => esc(toolName(id))).join(", ") : tr("Ei vielä tallennettuja työkaluja", "No saved tools yet")} · ${tr("muokattu", "modified")} ${date(p.updated)}</span></div>
                  <div class="acts">
                    <button data-act="rename">${tr("Nimeä", "Rename")}</button>
                    <button data-act="copy">${tr("Kopioi", "Duplicate")}</button>
                    <button data-act="export">${tr("Vie", "Export")}</button>
                    <button data-act="delete" class="danger" ${list.length < 2 ? `disabled title='${tr("Viimeistä projektia ei voi poistaa", "The last project cannot be deleted")}'` : ""}>${tr("Poista", "Delete")}</button>
                  </div>
                </div>`;
              }).join("")}
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Muistiinpanot", "Notes")} — ${esc(activeProject().name)}</h3>
              <textarea id="p-notes" placeholder="${tr("Esim. käytetyt osat, mitat, ideat…", "E.g. parts used, dimensions, ideas…")}">${esc(activeProject().notes || "")}</textarea>
              <p class="note" style="margin-top:8px">${tr("Valitun projektin tiedot tallentuvat tähän selaimeen automaattisesti.", "The selected project's data is saved automatically in this browser.")}</p>
            </div>
          </div>
        </div>`;
      // Projektikortit ovat vasemmassa sarakkeessa — vaihdetaan järjestys niin, että lista on leveämpi
      el.querySelector(".tool").style.gridTemplateColumns = "1fr minmax(260px, 340px)";

      el.querySelector("#p-new").onclick = () => {
        const name = prompt(tr("Projektin nimi:", "Project name:"), tr("Uusi projekti", "New project"));
        if (!name) return;
        const p = newProject(name.trim() || tr("Uusi projekti", "New project"));
        projects.projects[p.id] = p;
        projects.active = p.id;
        saveProjects(); draw(); refreshCrumbs();
        toast(tr("Projekti luotu", "Project created"));
      };
      el.querySelector("#p-example").onclick = () => {
        const old = Object.values(projects.projects).filter((x) => x.example);
        if (old.length && !confirm(tr("Palautetaanko esimerkkiprojekti alkuperäiseksi? Siihen tehdyt muutokset korvataan.", "Restore the example project to its original state? Changes made to it will be replaced."))) return;
        const p = exampleProject();
        projects.projects[p.id] = p;
        projects.active = p.id;
        for (const x of old) delete projects.projects[x.id];
        saveProjects(); draw(); refreshCrumbs();
        toast(tr("Esimerkkiprojekti avattu — katso muistiinpanot oikealta.", "Example project opened — see the notes on the right."));
      };
      el.querySelector("#p-import").onchange = (e) => importProject(e.target.files[0], draw);
      el.querySelector("#p-notes").oninput = (e) => {
        activeProject().notes = e.target.value;
        activeProject().updated = Date.now();
        saveProjects();
      };
      el.querySelector(".proj-list").onclick = (e) => {
        const card = e.target.closest(".proj");
        if (!card) return;
        const p = projects.projects[card.dataset.id];
        const act = e.target.closest("[data-act]")?.dataset.act;
        if (!act) {
          if (projects.active !== p.id) { projects.active = p.id; saveProjects(); draw(); refreshCrumbs(); toast(tr("Avattu: ", "Opened: ") + p.name); }
          return;
        }
        if (act === "rename") {
          const name = prompt(tr("Uusi nimi:", "New name:"), p.name);
          if (name && name.trim()) { p.name = name.trim(); p.updated = Date.now(); }
        } else if (act === "copy") {
          const c = { ...JSON.parse(JSON.stringify(p)), id: uid(), name: p.name + tr(" (kopio)", " (copy)"), created: Date.now(), updated: Date.now() };
          projects.projects[c.id] = c;
        } else if (act === "export") {
          const data = { format: PROJECT_FORMAT, version: PROJECT_VERSION, exported: new Date().toISOString(), project: p };
          downloadFile(p.name.replace(/[^\w\-åäöÅÄÖ ]+/g, "_") + ".robolab.json", JSON.stringify(data, null, 2));
          return;
        } else if (act === "delete") {
          if (Object.keys(projects.projects).length < 2) return;
          if (settings.confirmReset && !confirm(tr(`Poistetaanko projekti "${p.name}"? Tätä ei voi perua.`, `Delete project "${p.name}"? This cannot be undone.`))) return;
          delete projects.projects[p.id];
          if (projects.active === p.id) projects.active = Object.keys(projects.projects)[0];
        }
        saveProjects(); draw(); refreshCrumbs();
      };
    };
    draw();
  },
};

// Valmis esimerkki: pienen kaksipyöräisen robotin moottori- ja säätöarvot sekä ohjeet, mitä kokeilla
function exampleProject() {
  const p = newProject(tr("Esimerkki: pieni kaksipyöräinen robotti", "Example: small two-wheeled robot"));
  p.example = true;
  p.notes = tr("Tämä esimerkki kuvaa pientä kaksipyöräistä robottia (0,8 kg, 65 mm pyörät, kaksi 6 V:n vaihdemoottoria).\n\nKokeile:\n1. Moottori ja voimansiirto: kuinka nopeasti robotti kulkee? Muuta pyörän halkaisijaa.\n2. Sähköjärjestelmä: kauanko akku kestää? Hae moottorien virrat napilla.\n3. PID-viritin: moottorin nopeuden säätö on valmiiksi viritetty. Muuta Kp:tä ja katso vastetta.\n4. Mobiilirobotti 2D: paina Aja maaliin.\n\nVoit palauttaa esimerkin alkuperäiseksi Projektit-sivun Esimerkkiprojekti-napista.",
    "This example describes a small two-wheeled robot (0.8 kg, 65 mm wheels, two 6 V gear motors).\n\nTry:\n1. Motor & drivetrain: how fast does the robot go? Change the wheel diameter.\n2. Power system: how long does the battery last? Fetch the motor currents with the button.\n3. PID tuner: the motor speed control is already tuned. Change Kp and watch the response.\n4. Mobile robot 2D: press Drive to goal.\n\nYou can restore the example with the Example project button on the Projects page.");
  p.tools = {
    motor: { mass: 0.8, wheelD: 65, motors: 2, rpm: 200, stallTorque: 0.078, stallCurrent: 1.5, noLoadCurrent: 0.15, vNom: 6, vBat: 6, crr: 0.03, mu: 0.7, driveShare: 80 },
    pid: { plant: "first", K: 1, tau: 0.5, kp: 4, ki: 8, kd: 0, T: 2 },
  };
  return p;
}

function refreshCrumbs() {
  const a = document.querySelector(".crumb-proj");
  if (a) a.textContent = activeProject().name;
}

function importProject(file, done) {
  if (!file) return;
  (file.size > 20 * 1024 * 1024 ? Promise.reject(new Error("size")) : file.text()).then((txt) => {
    const data = JSON.parse(txt);
    const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    if (data.format !== PROJECT_FORMAT || !isObj(data.project) || !isObj(data.project.tools)) throw new Error("format");
    if (data.version > PROJECT_VERSION) throw new Error("version");
    // Vain tunnetut työkalutilat, ja jokaisen pitää olla objekti
    // Koulutetut aivot, koulutuksen tilastot ja tallennetut koulutusajot tallentuvat omiin lohkoihinsa (nn2dBrain, nn2dStats, nn2dRuns…)
    const known = new Set([...TOOLS.map((t) => t.id), "arm", "occ", "nn2dBrain", "nn3dBrain", "nn2dStats", "nn3dStats", "nn2dRuns", "nn3dRuns"]);
    const tools = Object.fromEntries(Object.entries(data.project.tools).filter(([k, v]) => known.has(k) && isObj(v)));
    // Tiedoston oma palkkiofunktio on koodia: se ajetaan vasta, kun käyttäjä on tarkistanut sen (tools/nn.js)
    for (const k of ["nn2d", "nn3d"]) if (typeof tools[k]?.taskCode === "string") tools[k].taskCodeUntrusted = true;
    const p = { ...newProject(String(data.project.name || tr("Tuotu projekti", "Imported project")).slice(0, 120)), notes: String(data.project.notes || ""), tools };
    const prevActive = projects.active;
    projects.projects[p.id] = p;
    projects.active = p.id;
    if (!saveProjects()) {
      // Liian iso tiedosto: perutaan, ettei koko projektitallennus jää jumiin
      delete projects.projects[p.id];
      projects.active = prevActive;
      saveProjects();
      throw new Error("storage");
    }
    done(); refreshCrumbs();
    toast(tr("Projekti tuotu: ", "Project imported: ") + p.name);
  }).catch((e) => toast(e.message === "version" ? tr("Tiedosto on uudemmasta RoboLab-versiosta", "The file is from a newer RoboLab version")
    : e.message === "storage" ? tr("Projekti on liian suuri selaimen tallennustilaan, eikä sitä tuotu.", "The project is too big for the browser's storage and was not imported.")
    : e.message === "size" ? tr("Tiedosto on liian suuri (yli 20 Mt).", "The file is too big (over 20 MB).")
    : tr("Tiedosto ei ole RoboLab-projekti", "The file is not a RoboLab project")));
}
