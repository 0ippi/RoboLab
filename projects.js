"use strict";

/* Projektit: luonti, vaihto, nimeäminen, kopiointi, vienti, tuonti ja poisto. */
TOOL_IMPL.projects = {
  render(el, tool) {
    const draw = () => {
      const list = Object.values(projects.projects).sort((a, b) => b.updated - a.updated);
      const toolName = (id) => TOOLS.find((t) => t.id === id)?.name || id;
      const date = (ms) => new Date(ms).toLocaleString(tr("fi-FI", "en-GB"), { dateStyle: "short", timeStyle: "short" });
      el.innerHTML = `
        ${toolHead(tool, `
          <label class="btn">${tr("Tuo…", "Import…")}<input type="file" id="p-import" accept="application/json,.json" hidden></label>
          <button class="btn primary" id="p-new">${tr("+ Uusi projekti", "+ New project")}</button>`)}
        <div class="tool">
          <div class="col">
            <div class="proj-list">
              ${list.map((p) => {
                const used = Object.keys(p.tools);
                return `<div class="card proj ${p.id === projects.active ? "active" : ""}" data-id="${p.id}">
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

function refreshCrumbs() {
  const a = document.querySelector(".crumb-proj");
  if (a) a.textContent = activeProject().name;
}

function importProject(file, done) {
  if (!file) return;
  file.text().then((txt) => {
    const data = JSON.parse(txt);
    const isObj = (v) => !!v && typeof v === "object" && !Array.isArray(v);
    if (data.format !== PROJECT_FORMAT || !isObj(data.project) || !isObj(data.project.tools)) throw new Error("format");
    if (data.version > PROJECT_VERSION) throw new Error("version");
    // Vain tunnetut työkalutilat, ja jokaisen pitää olla objekti
    const known = new Set([...TOOLS.map((t) => t.id), "arm", "occ"]);
    const tools = Object.fromEntries(Object.entries(data.project.tools).filter(([k, v]) => known.has(k) && isObj(v)));
    const p = { ...newProject(String(data.project.name || tr("Tuotu projekti", "Imported project")).slice(0, 120)), notes: String(data.project.notes || ""), tools };
    projects.projects[p.id] = p;
    projects.active = p.id;
    saveProjects(); done(); refreshCrumbs();
    toast(tr("Projekti tuotu: ", "Project imported: ") + p.name);
  }).catch((e) => toast(e.message === "version" ? tr("Tiedosto on uudemmasta RoboLab-versiosta", "The file is from a newer RoboLab version") : tr("Tiedosto ei ole RoboLab-projekti", "The file is not a RoboLab project")));
}
