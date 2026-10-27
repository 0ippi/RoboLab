"use strict";

/* Omat robotit -kirjasto ja mallivalitsin.
   Kirjasto: käyttäjän tallentamat robotit ja käsivarret selaimen muistissa, yhteisiä kaikille projekteille.
     lajit: "robot2d" ja "robot3d" (simulaatioiden mallimuoto), "arm" (DH-ketju ja nivelkulmat)
   Valitsin: painike, joka avaa listan kokoontaitettavine osioineen (Hahmot, Perusmallit, Omat robotit…),
     jotta käyttäjän omat mallit eivät sekoitu valmiisiin. Osioiden auki/kiinni-tila muistetaan. */
const Library = (() => {
  const KEY = "robolab-library-v1";
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === "object") return d; } catch {} return {}; };
  const store = (d) => { try { localStorage.setItem(KEY, JSON.stringify(d)); return true; } catch { toast(tr("Tallennus epäonnistui: selaimen muisti on täynnä.", "Saving failed: browser storage is full.")); return false; } };
  const uid = () => Math.random().toString(36).slice(2, 10);
  // Rikkinäiset merkinnät (esim. käsin muokatusta varmuuskopiosta) ohitetaan, etteivät ne kaada valitsimia
  const valid = (kind, x) => !!x && typeof x.id === "string" && typeof x.name === "string" && !!x.data && typeof x.data === "object"
    && (kind !== "arm" || Array.isArray(x.data.chain?.joints));
  const items = (kind) => { const a = load()[kind]; return Array.isArray(a) ? a.filter((x) => valid(kind, x)) : []; };

  return {
    list: (kind) => items(kind).sort((a, b) => a.name.localeCompare(b.name, LANG)),
    get: (kind, id) => items(kind).find((x) => x.id === id) || null,
    add(kind, name, data) {
      const d = load(), item = { id: uid(), name: String(name).slice(0, 80), data: JSON.parse(JSON.stringify(data)), saved: new Date().toISOString() };
      (d[kind] ||= []).push(item);
      if (!store(d)) return null;
      window.Achievements?.unlock("ownRobot");
      return item.id;
    },
    update(kind, id, data) {
      const d = load(), it = (d[kind] || []).find((x) => x.id === id);
      if (!it) return false;
      it.data = JSON.parse(JSON.stringify(data)); it.saved = new Date().toISOString();
      return store(d);
    },
    rename(kind, id, name) {
      const d = load(), it = (d[kind] || []).find((x) => x.id === id);
      if (it) { it.name = String(name).slice(0, 80); store(d); }
    },
    remove(kind, id) {
      const d = load();
      d[kind] = (d[kind] || []).filter((x) => x.id !== id);
      store(d);
    },
  };
})();

// Kysyy nimen (selaimen oma kysely riittää tähän, koska se on lyhyt ja harvinainen)
function askName(question, def) {
  const n = prompt(question, def || "");
  return n && n.trim() ? n.trim() : null;
}

/* ----- Mallivalitsin -----
   modelPicker(root, {
     value,                        // valittuna oleva arvo
     placeholder,                  // painikkeen teksti, kun mitään ei ole valittu
     sections: [{ id, title, items: [{ value, label, sub?, avatar? (html) }], open?, own?, empty?, action?: { label, run } }],
     onSelect(value), onRemove?(value), onRename?(value), storeKey })
   Palauttaa { close } */
function modelPicker(root, opts) {
  const OPEN_KEY = "robolab-picker-open";
  const openState = () => { try { return JSON.parse(localStorage.getItem(OPEN_KEY)) || {}; } catch { return {}; } };
  const setOpen = (id, on) => { try { const s = openState(); s[(opts.storeKey || "") + ":" + id] = on; localStorage.setItem(OPEN_KEY, JSON.stringify(s)); } catch {} };
  const isOpen = (sec) => { const v = openState()[(opts.storeKey || "") + ":" + sec.id]; return v ?? sec.open ?? true; };
  const all = opts.sections.flatMap((s) => s.items);
  const cur = all.find((i) => i.value === opts.value);

  root.classList.add("mpick");
  root.innerHTML = `<button type="button" class="mpick-btn" aria-haspopup="listbox" aria-expanded="false">
      ${cur?.avatar ? `<span class="mpick-av">${cur.avatar}</span>` : ""}<span class="mpick-label">${esc(cur?.label || opts.placeholder || tr("Valitse…", "Choose…"))}</span><span class="mpick-chev">▾</span></button>
    <div class="mpick-pop" hidden role="listbox">
      ${opts.sections.map((s) => `<details class="mpick-sec ${s.own ? "own" : ""}" data-sec="${esc(s.id)}" ${isOpen(s) ? "open" : ""}>
        <summary><span>${esc(s.title)}</span><small>${s.items.length}</small></summary>
        <div class="mpick-items">
          ${s.items.map((i) => `<div class="mpick-row ${i.value === opts.value ? "on" : ""}">
            <button type="button" class="mpick-item" data-v="${esc(i.value)}" role="option" aria-selected="${i.value === opts.value}">
              ${i.avatar ? `<span class="mpick-av">${i.avatar}</span>` : ""}<span><b>${esc(i.label)}</b>${i.sub ? `<small>${esc(i.sub)}</small>` : ""}</span></button>
            ${s.own && opts.onRename && i.value.startsWith("lib:") ? `<button type="button" class="mpick-mini" data-ren="${esc(i.value)}" title="${tr("Nimeä uudelleen", "Rename")}" aria-label="${tr("Nimeä uudelleen", "Rename")}">✎</button>` : ""}
            ${s.own && opts.onRemove && i.value.startsWith("lib:") ? `<button type="button" class="mpick-mini" data-del="${esc(i.value)}" title="${tr("Poista omista", "Remove from my robots")}" aria-label="${tr("Poista", "Remove")}">✕</button>` : ""}
          </div>`).join("")}
          ${!s.items.length && s.empty ? `<p class="mpick-empty">${esc(s.empty)}</p>` : ""}
          ${s.action ? `<button type="button" class="mpick-action" data-act="${esc(s.id)}">${esc(s.action.label)}</button>` : ""}
        </div></details>`).join("")}
    </div>`;

  const btn = root.querySelector(".mpick-btn"), pop = root.querySelector(".mpick-pop");
  const close = () => { pop.hidden = true; btn.setAttribute("aria-expanded", "false"); document.removeEventListener("pointerdown", outside, true); document.removeEventListener("keydown", onKey, true); };
  const outside = (e) => { if (!root.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") { e.stopPropagation(); close(); btn.focus(); } };
  btn.onclick = () => {
    if (!pop.hidden) { close(); return; }
    pop.hidden = false; btn.setAttribute("aria-expanded", "true");
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("keydown", onKey, true);
    (pop.querySelector(".mpick-row.on .mpick-item") || pop.querySelector(".mpick-item"))?.scrollIntoView({ block: "nearest" });
  };
  pop.addEventListener("toggle", (e) => { const d = e.target.closest("details"); if (d) setOpen(d.dataset.sec, d.open); }, true);
  pop.addEventListener("click", (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.v != null) { close(); if (t.dataset.v !== opts.value) opts.onSelect(t.dataset.v); }
    else if (t.dataset.del) { close(); opts.onRemove(t.dataset.del); }
    else if (t.dataset.ren) { close(); opts.onRename(t.dataset.ren); }
    else if (t.dataset.act) { close(); opts.sections.find((s) => s.id === t.dataset.act)?.action.run(); }
  });
  return { close };
}

// Robottimallien yhteiset osiot: hahmot, perusmallit ja omat robotit
const CHARACTER_KEYS = ["volt", "grip", "wobbly", "dusty", "zippy", "neura"];
function robotSections(models, { prefix = "", own = [], ownExtra = [], ownAction = null, title = null } = {}) {
  const item = (k, m) => ({ value: prefix + k, label: m.name, sub: m.description ? m.description.split(". ")[0] : "",
    avatar: CHARACTER_KEYS.includes(k) && window.Robots ? Robots.svg(k, "idle", { size: 26 }) : "" });
  const entries = Object.entries(models);
  return [
    { id: "chars", title: title ? title + " · " + tr("hahmot", "characters") : tr("Hahmot", "Characters"), items: entries.filter(([k]) => CHARACTER_KEYS.includes(k)).map(([k, m]) => item(k, m)) },
    { id: "base", title: title ? title + " · " + tr("perusmallit", "base models") : tr("Perusmallit", "Base models"), items: entries.filter(([k]) => !CHARACTER_KEYS.includes(k)).map(([k, m]) => item(k, m)) },
    ...(own ? [{ id: "own", own: true, title: tr("Omat robotit", "My robots"), items: [...ownExtra, ...own], action: ownAction,
      empty: tr("Ei vielä omia robotteja. Tallenna robotti, niin se näkyy täällä kaikissa projekteissa.", "No robots of your own yet. Save a robot and it appears here in every project.") }] : []),
  ];
}
