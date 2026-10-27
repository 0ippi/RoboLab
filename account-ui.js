"use strict";

/* Käyttäjätilien käyttöliittymä (tilit itse: accounts.js) */
(() => {
  const avatarSvg = (key, size) => (window.Robots ? Robots.svg(CHARACTER_KEYS.includes(key) ? key : "volt", "idle", { size }) : "");
  const reload = () => { location.hash = "#/dashboard"; location.reload(); };

  function avatarPicker(cur) {
    return `<div class="acc-avatars" role="radiogroup" aria-label="${tr("Hahmo", "Avatar")}">${CHARACTER_KEYS.map((k) =>
      `<button type="button" class="acc-av ${k === cur ? "on" : ""}" data-av="${k}" role="radio" aria-checked="${k === cur}" title="${k[0].toUpperCase() + k.slice(1)}">${avatarSvg(k, 44)}</button>`).join("")}</div>`;
  }
  function bindAvatars(root, onPick) {
    root.querySelectorAll("[data-av]").forEach((b) => (b.onclick = () => {
      root.querySelectorAll("[data-av]").forEach((x) => { x.classList.toggle("on", x === b); x.setAttribute("aria-checked", x === b); });
      onPick(b.dataset.av);
    }));
  }

  /* Kirjautumisnäkymä koko ikkunan päällä */
  function showLogin(mode) {
    document.querySelector(".acc-gate")?.remove();
    const gate = document.createElement("div");
    gate.className = "acc-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    document.body.appendChild(gate);
    let pick = null, av = "volt";
    const accounts = Accounts.list();
    const draw = (view) => {
      if (view === "create") {
        gate.innerHTML = `<form class="acc-card" id="acc-create">
          <div class="acc-hero">${avatarSvg(av, 72)}</div>
          <h2>${tr("Luo käyttäjätili", "Create an account")}</h2>
          <p class="note">${accounts.length ? tr("Jokaisella käyttäjällä on omat projektit, kurssit, robotit ja asetukset.", "Every user has their own projects, courses, robots and settings.")
            : tr("Nykyiset projektisi, kurssisi ja robottisi siirtyvät tälle tilille.", "Your current projects, courses and robots move into this account.")}</p>
          <label class="field"><span>${tr("Nimi", "Name")}</span><input id="acc-name" maxlength="40" required autocomplete="nickname"></label>
          <label class="field"><span>${tr("Salasana (vapaaehtoinen)", "Password (optional)")}</span><input id="acc-pw" type="password" autocomplete="new-password"></label>
          <span class="field-label">${tr("Valitse hahmo", "Pick a character")}</span>
          ${avatarPicker(av)}
          <label class="acc-check"><input type="checkbox" id="acc-remember" checked> ${tr("Pysy kirjautuneena tällä koneella", "Stay signed in on this computer")}</label>
          <div class="acc-actions">
            ${accounts.length || mode === "create" ? `<button type="button" class="btn" data-back>${tr("Takaisin", "Back")}</button>` : ""}
            <button class="btn primary">${tr("Luo tili", "Create account")}</button>
          </div>
          <p class="note small">${tr("Tilit ja tiedot ovat vain tällä koneella. Salasana estää muita saman koneen käyttäjiä avaamasta tiliäsi, mutta ei ole vahva suojaus. Siirrä tiedot toiselle koneelle profiilin varmuuskopiolla.",
            "Accounts and data live only on this computer. A password stops other people on the same computer from opening your account, but it is not strong security. Move your data to another computer with the profile backup.")}</p>
        </form>`;
        bindAvatars(gate, (k) => { av = k; gate.querySelector(".acc-hero").innerHTML = avatarSvg(k, 72); });
        gate.querySelector("[data-back]")?.addEventListener("click", () => (mode === "create" ? close() : draw("list")));
        gate.querySelector("#acc-name").focus();
        gate.querySelector("#acc-create").onsubmit = async (e) => {
          e.preventDefault();
          const name = gate.querySelector("#acc-name").value.trim();
          if (!name) return;
          if (Accounts.list().some((a) => a.name.toLowerCase() === name.toLowerCase())) { toast(tr("Tämän niminen tili on jo olemassa", "An account with this name already exists")); return; }
          const wasGuest = Accounts.active() === Accounts.GUEST;
          await Accounts.create({ name, password: gate.querySelector("#acc-pw").value, avatar: av, remember: gate.querySelector("#acc-remember").checked });
          if (wasGuest) { close(); renderUserChip(); toast(tr(`Tervetuloa, ${name}!`, `Welcome, ${name}!`)); if (currentRoute() === "profile") router(); }
          else reload();
        };
        return;
      }
      if (view === "password") {
        const a = Accounts.get(pick);
        gate.innerHTML = `<form class="acc-card" id="acc-login">
          <div class="acc-hero">${avatarSvg(a.avatar, 72)}</div>
          <h2>${esc(a.name)}</h2>
          <label class="field"><span>${tr("Salasana", "Password")}</span><input id="acc-pw" type="password" autocomplete="current-password"></label>
          <label class="acc-check"><input type="checkbox" id="acc-remember"> ${tr("Pysy kirjautuneena tällä koneella", "Stay signed in on this computer")}</label>
          <p class="acc-err" id="acc-err" hidden>${tr("Väärä salasana", "Wrong password")}</p>
          <div class="acc-actions"><button type="button" class="btn" data-back>${tr("Takaisin", "Back")}</button><button class="btn primary">${tr("Kirjaudu", "Sign in")}</button></div>
        </form>`;
        gate.querySelector("[data-back]").onclick = () => draw("list");
        gate.querySelector("#acc-pw").focus();
        gate.querySelector("#acc-login").onsubmit = async (e) => {
          e.preventDefault();
          const r = await Accounts.login(pick, gate.querySelector("#acc-pw").value, gate.querySelector("#acc-remember").checked);
          if (!r) { gate.querySelector("#acc-err").hidden = false; gate.querySelector("#acc-pw").select(); return; }
          r.switched ? reload() : close();
        };
        return;
      }
      gate.innerHTML = `<div class="acc-card">
        <div class="acc-hero">${avatarSvg("volt", 72)}</div>
        <h2>${tr("Kuka käyttää RoboLabia?", "Who's using RoboLab?")}</h2>
        <div class="acc-list">${accounts.map((a) => `<button class="acc-user" data-uid="${a.id}">${avatarSvg(a.avatar, 40)}<b>${esc(a.name)}</b>${a.hash ? `<span class="acc-lock" title="${tr("Salasana", "Password")}">🔒</span>` : ""}</button>`).join("")}</div>
        <div class="acc-actions">
          <button class="btn" data-guest>${tr("Jatka vieraana", "Continue as guest")}</button>
          <button class="btn primary" data-new>${tr("+ Uusi käyttäjä", "+ New user")}</button>
        </div>
      </div>`;
      gate.querySelectorAll("[data-uid]").forEach((b) => (b.onclick = async () => {
        pick = b.dataset.uid;
        if (Accounts.get(pick).hash) { draw("password"); return; }
        const r = await Accounts.login(pick, "", true);
        r.switched ? reload() : close();
      }));
      gate.querySelector("[data-guest]").onclick = () => { const r = Accounts.guest(); r.switched ? reload() : close(); };
      gate.querySelector("[data-new]").onclick = () => draw("create");
    };
    const close = () => { gate.remove(); document.body.classList.remove("acc-locked"); renderUserChip(); };
    document.body.classList.add("acc-locked");
    draw(mode === "create" ? "create" : "list");
  }

  /* Käyttäjä sivupalkin alaosassa */
  function renderUserChip() {
    const foot = document.querySelector(".sidebar-footer");
    if (!foot) return;
    foot.querySelector(".user-chip")?.remove();
    const a = Accounts.current();
    foot.insertAdjacentHTML("afterbegin", `<a href="#/profile" class="nav-item user-chip" data-route="profile" data-tip="${esc(a ? a.name : tr("Vieras", "Guest"))}">
      <span class="user-av">${avatarSvg(a ? a.avatar : "volt", 22)}</span><span class="label">${a ? esc(a.name) : tr("Vieras — luo tili", "Guest — create account")}</span></a>`);
  }

  /* Profiilisivu */
  TOOL_IMPL.profile = {
    render(el, tool) {
      const a = Accounts.current();
      const finished = (() => { try { return Object.values(JSON.parse(localStorage.getItem("robolab-courses-v1"))?.c || {}).filter((c) => c.finished).length; } catch { return 0; } })();
      const robots = ["robot2d", "robot3d", "arm"].reduce((n, k) => n + (window.Library ? Library.list(k).length : 0), 0);
      const nProj = Object.keys(projects.projects).length;
      const date = (ms) => (ms ? new Date(ms).toLocaleDateString(tr("fi-FI", "en-GB")) : "–");
      const others = Accounts.list().filter((x) => x.id !== Accounts.active());
      el.innerHTML = `
        ${toolHead(tool, a ? `<button class="btn" id="pf-logout">${tr("Kirjaudu ulos", "Sign out")}</button>` : "")}
        <div class="tool">
          <div class="col">
            <div class="card profile-card">
              <div class="profile-top">
                <div class="profile-av">${avatarSvg(a ? a.avatar : "volt", 88)}</div>
                <div>
                  <h2>${a ? esc(a.name) : tr("Vieras", "Guest")}</h2>
                  <p class="note">${a ? tr(`Tili luotu ${date(a.created)}`, `Account created ${date(a.created)}`) : tr("Et ole kirjautunut. Luo tili, niin työsi pysyvät erillään muiden saman koneen käyttäjien töistä.", "You're not signed in. Create an account to keep your work apart from other people on this computer.")}</p>
                </div>
              </div>
              ${a ? `
                <label class="field"><span>${tr("Nimi", "Name")}</span><input id="pf-name" maxlength="40" value="${esc(a.name)}"></label>
                <label class="field"><span>${tr("Tietoa minusta", "About me")}</span><textarea id="pf-bio" maxlength="300" placeholder="${tr("Esim. koulu, robottiprojekti tai tavoite", "E.g. school, robot project or goal")}">${esc(a.bio || "")}</textarea></label>
                <span class="field-label">${tr("Hahmo", "Character")}</span>
                ${avatarPicker(a.avatar)}
                <div class="row-actions">
                  <button class="btn" id="pf-pw">${a.hash ? tr("Vaihda salasana", "Change password") : tr("Aseta salasana", "Set a password")}</button>
                  ${a.hash ? `<button class="btn" id="pf-nopw">${tr("Poista salasana", "Remove password")}</button>` : ""}
                </div>` : `<div class="row-actions"><button class="btn primary" id="pf-create">${tr("Luo tili", "Create account")}</button></div>`}
            </div>
            <div class="stats">
              <div class="card stat"><div class="k">${tr("Projektit", "Projects")}</div><div class="v">${nProj}</div></div>
              <div class="card stat"><div class="k">${tr("Suoritetut kurssit", "Courses finished")}</div><div class="v">${finished}</div></div>
              <div class="card stat"><div class="k">${tr("Omat robotit", "My robots")}</div><div class="v">${robots}</div></div>
            </div>
          </div>
          <div class="col">
            <div class="card">
              <h3 class="card-title">${tr("Varmuuskopio ja siirto", "Backup & transfer")}</h3>
              <p class="note">${tr("Tallenna kaikki tietosi (projektit, kurssit, robotit, asetukset) yhteen tiedostoon. Tuo tiedosto toisella koneella, niin jatkat siitä mihin jäit.",
                "Save all your data (projects, courses, robots, settings) into one file. Import it on another computer to carry on where you left off.")}</p>
              <div class="row-actions">
                <button class="btn primary" id="pf-export">${icon("download")} ${tr("Vie varmuuskopio", "Export backup")}</button>
                <label class="btn">${tr("Tuo varmuuskopio…", "Import backup…")}<input type="file" id="pf-import" accept="application/json,.json" hidden></label>
              </div>
              <p class="note small">${tr("Tekoälyn API-avain ei tallennu varmuuskopioon.", "The AI API key is not included in the backup.")}</p>
            </div>
            <div class="card">
              <h3 class="card-title">${tr("Käyttäjät tällä koneella", "Users on this computer")}</h3>
              ${others.length ? `<div class="acc-list">${others.map((x) => `<button class="acc-user" data-switch="${x.id}">${avatarSvg(x.avatar, 32)}<b>${esc(x.name)}</b>${x.hash ? "🔒" : ""}</button>`).join("")}</div>` : `<p class="note">${tr("Ei muita käyttäjiä.", "No other users.")}</p>`}
              <div class="row-actions"><button class="btn" id="pf-new">${tr("+ Uusi käyttäjä", "+ New user")}</button></div>
            </div>
            ${a ? `<div class="card">
              <h3 class="card-title">${tr("Poista tili", "Delete account")}</h3>
              <p class="note">${tr("Poistaa tilin ja kaikki sen projektit, kurssit ja robotit tältä koneelta. Vie varmuuskopio ensin, jos haluat säilyttää ne.", "Deletes the account and all its projects, courses and robots from this computer. Export a backup first if you want to keep them.")}</p>
              <div class="row-actions"><button class="btn danger" id="pf-delete">${tr("Poista tili", "Delete account")}</button></div>
            </div>` : ""}
          </div>
        </div>`;

      const $q = (s) => el.querySelector(s);
      if (a) {
        $q("#pf-name").onchange = (e) => { const v = e.target.value.trim(); if (v) { Accounts.update({ name: v }); renderUserChip(); toast(tr("Nimi tallennettu", "Name saved")); } };
        $q("#pf-bio").onchange = (e) => Accounts.update({ bio: e.target.value.slice(0, 300) });
        bindAvatars(el, (k) => { Accounts.update({ avatar: k }); $q(".profile-av").innerHTML = avatarSvg(k, 88); renderUserChip(); });
        $q("#pf-logout").onclick = () => { Accounts.logout(); reload(); };
        $q("#pf-pw").onclick = async () => {
          if (a.hash) {
            const old = prompt(tr("Nykyinen salasana:", "Current password:"));
            if (old === null) return;
            if (!(await Accounts.verify(a, old))) { toast(tr("Väärä salasana", "Wrong password")); return; }
          }
          const pw = prompt(tr("Uusi salasana:", "New password:"));
          if (!pw) return;
          if (prompt(tr("Kirjoita salasana uudelleen:", "Type the password again:")) !== pw) { toast(tr("Salasanat eivät täsmää", "The passwords don't match")); return; }
          const acc = { ...a };
          await Accounts.setPassword(acc, pw);
          Accounts.update({ salt: acc.salt, hash: acc.hash });
          toast(tr("Salasana asetettu", "Password set"));
          router();
        };
        $q("#pf-nopw")?.addEventListener("click", async () => {
          const old = prompt(tr("Nykyinen salasana:", "Current password:"));
          if (old === null) return;
          if (!(await Accounts.verify(a, old))) { toast(tr("Väärä salasana", "Wrong password")); return; }
          Accounts.update({ salt: undefined, hash: undefined });
          toast(tr("Salasana poistettu", "Password removed"));
          router();
        });
        $q("#pf-delete").onclick = () => {
          const typed = prompt(tr(`Tämä poistaa tilin "${a.name}" ja kaikki sen tiedot. Kirjoita tilin nimi vahvistukseksi:`, `This deletes the account "${a.name}" and all its data. Type the account name to confirm:`));
          if (typed === null) return;
          if (typed.trim() !== a.name) { toast(tr("Nimi ei täsmää — tiliä ei poistettu", "The name doesn't match — the account was not deleted")); return; }
          Accounts.remove(a.id);
          reload();
        };
      } else $q("#pf-create").onclick = () => showLogin("create");

      $q("#pf-new").onclick = () => showLogin("create");
      el.querySelectorAll("[data-switch]").forEach((b) => (b.onclick = async () => {
        const target = Accounts.get(b.dataset.switch);
        let pw = "";
        if (target.hash) { pw = prompt(tr(`Käyttäjän ${target.name} salasana:`, `Password for ${target.name}:`)); if (pw === null) return; }
        const r = await Accounts.login(target.id, pw, !target.hash);
        if (!r) { toast(tr("Väärä salasana", "Wrong password")); return; }
        reload();
      }));
      $q("#pf-export").onclick = () => {
        const name = (a ? a.name : tr("vieras", "guest")).replace(/[^\w\-åäöÅÄÖ ]+/g, "_");
        downloadFile(`${name}.robolab-backup.json`, JSON.stringify(Accounts.exportData()));
      };
      $q("#pf-import").onchange = (e) => {
        const f = e.target.files[0];
        if (!f) return;
        f.text().then((txt) => {
          if (!confirm(tr("Varmuuskopio korvaa tämän käyttäjän nykyiset projektit, kurssit, robotit ja asetukset. Jatketaanko?", "The backup replaces this user's current projects, courses, robots and settings. Continue?"))) return;
          Accounts.importData(JSON.parse(txt));
          reload();
        }).catch((err) => toast(err.message === "version" ? tr("Varmuuskopio on uudemmasta RoboLab-versiosta", "The backup is from a newer RoboLab version") : tr("Tiedosto ei ole RoboLab-varmuuskopio", "The file is not a RoboLab backup")));
      };
    },
  };

  function init() {
    renderUserChip();
    if (Accounts.needsLogin()) showLogin();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else setTimeout(init);
  window.AccountsUI = { showLogin, renderUserChip };
})();
