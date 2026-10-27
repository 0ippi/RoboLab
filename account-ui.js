"use strict";

/* Käyttäjätilien käyttöliittymä (tilit itse: accounts.js) */
(() => {
  const avatarSvg = (key, size) => (window.Robots ? Robots.svg(CHARACTER_KEYS.includes(key) ? key : "volt", "idle", { size }) : "");
  const reload = () => { location.hash = "#/dashboard"; location.reload(); };
  // Tallennustilan loppuminen kesken käyttäjän vaihdon: tiedot on palautettu ennalleen (accounts.js), kerrotaan syy
  const storageErr = () => toast(tr("Käyttäjän vaihto epäonnistui: selaimen tallennustila on täynnä. Tietoja ei muutettu.", "Switching users failed: browser storage is full. No data was changed."));
  const guard = async (fn) => { try { return await fn(); } catch { storageErr(); return null; } };

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
  function showLogin(mode, opts = {}) {
    document.querySelector(".acc-gate")?.remove();
    const gate = document.createElement("div");
    gate.className = "acc-gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    document.body.appendChild(gate);
    let pick = null, av = "volt";
    const accounts = Accounts.list();
    // Pilvitili (cloud.js): kirjautuminen ja luonti sähköpostilla
    const drawCloud = (cmode = "signin", msg = "") => {
      const up = cmode === "signup";
      gate.innerHTML = `<form class="acc-card" id="acc-cloud" novalidate>
        <div class="acc-hero">${avatarSvg("zippy", 72)}</div>
        <h2>${up ? tr("Luo pilvitili", "Create a cloud account") : tr("Kirjaudu pilvitilille", "Sign in to your cloud account")}</h2>
        <p class="note">${tr("Pilvitilillä samat projektit, kurssit ja robotit ovat käytössä kaikilla laitteillasi.", "With a cloud account the same projects, courses and robots are available on all your devices.")}</p>
        ${up ? `<label class="field"><span>${tr("Nimi", "Name")}</span><input id="cl-name" maxlength="40" autocomplete="nickname"></label>` : ""}
        <label class="field"><span>${tr("Sähköposti", "Email")}</span><input id="cl-email" type="email" autocomplete="email" maxlength="200" value="${esc(opts.email || "")}"></label>
        <label class="field"><span>${tr("Salasana", "Password")}${up ? tr(" (vähintään 8 merkkiä)", " (at least 8 characters)") : ""}</span><input id="cl-pw" type="password" autocomplete="${up ? "new-password" : "current-password"}"></label>
        ${up ? `<label class="acc-check"><input type="checkbox" id="cl-age"> ${tr("Olen vähintään 13-vuotias, tai huoltajani on antanut luvan.", "I am at least 13 years old, or my guardian has given permission.")}</label>
        <p class="note small">${tr("Tilin luomalla hyväksyt, että tietosi tallennetaan EU:ssa sijaitsevaan pilveen.", "By creating an account you agree that your data is stored in a cloud in the EU.")} <a href="tietosuoja.html" target="_blank" rel="noopener">${tr("Tietosuojaseloste", "Privacy policy")}</a></p>` : ""}
        <p class="acc-err" id="cl-err" role="alert" ${msg ? "" : "hidden"}>${esc(msg)}</p>
        <div class="acc-actions">
          <button type="button" class="btn" data-back>${tr("Takaisin", "Back")}</button>
          <button class="btn primary" id="cl-go">${up ? tr("Luo pilvitili", "Create cloud account") : tr("Kirjaudu", "Sign in")}</button>
        </div>
        <p class="note small">${up ? `<button type="button" class="link-btn" data-cl="signin">${tr("Onko sinulla jo pilvitili? Kirjaudu", "Already have a cloud account? Sign in")}</button>`
          : `<button type="button" class="link-btn" data-cl="signup">${tr("Ei vielä pilvitiliä? Luo tili", "No cloud account yet? Create one")}</button> · <button type="button" class="link-btn" data-cl="reset">${tr("Unohtuiko salasana?", "Forgot your password?")}</button>`}</p>
        <p class="note small">${tr("Tietosi tallennetaan RoboLabin pilvipalveluun (Supabase, EU). Sähköpostia käytetään vain kirjautumiseen ja salasanan vaihtoon. Voit poistaa pilvitilin ja kaikki sen tiedot milloin tahansa profiilista. Claude API -avain ei koskaan tallennu pilveen.",
          "Your data is stored in RoboLab's cloud service (Supabase, EU). Your email is only used for signing in and resetting your password. You can delete the cloud account and all its data at any time from your profile. A Claude API key is never stored in the cloud.")}</p>
      </form>`;
      const err = (m) => { const e = gate.querySelector("#cl-err"); e.textContent = m; e.hidden = !m; };
      gate.querySelector("[data-back]").onclick = () => (mode === "cloud" ? close() : draw("list"));
      gate.querySelectorAll("[data-cl]").forEach((b) => (b.onclick = async () => {
        const email = gate.querySelector("#cl-email").value.trim();
        if (b.dataset.cl === "reset") {
          if (!email) { err(tr("Kirjoita ensin sähköpostiosoitteesi.", "Type your email address first.")); return; }
          try { await Cloud.resetPassword(email); err(""); toast(tr("Lähetimme salasanan vaihtolinkin sähköpostiisi. Avaa se tällä laitteella.", "We sent a password reset link to your email. Open it on this device.")); }
          catch (e) { err(e.message); }
          return;
        }
        opts.email = email;
        drawCloud(b.dataset.cl);
      }));
      gate.querySelector(up ? "#cl-name" : opts.email ? "#cl-pw" : "#cl-email").focus();
      gate.querySelector("#acc-cloud").onsubmit = async (e) => {
        e.preventDefault();
        const email = gate.querySelector("#cl-email").value.trim(), password = gate.querySelector("#cl-pw").value;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { err(tr("Tarkista sähköpostiosoite.", "Check the email address.")); return; }
        if (up && password.length < 8) { err(tr("Salasanassa pitää olla vähintään 8 merkkiä.", "The password needs at least 8 characters.")); return; }
        if (!password) { err(tr("Kirjoita salasana.", "Type your password.")); return; }
        if (up && !gate.querySelector("#cl-age").checked) { err(tr("Vahvista ikäsi tai huoltajan lupa.", "Confirm your age or your guardian's permission.")); return; }
        const btn = gate.querySelector("#cl-go");
        btn.disabled = true; err("");
        try {
          if (up) {
            const r = await Cloud.signUp({ email, password, name: gate.querySelector("#cl-name").value.trim() || email.split("@")[0] });
            if (r.confirm) { opts.email = email; drawCloud("signin", tr(`Lähetimme vahvistuslinkin osoitteeseen ${email}. Avaa linkki ja kirjaudu sitten tästä.`, `We sent a confirmation link to ${email}. Open the link and then sign in here.`)); return; }
          } else await Cloud.signIn({ email, password });
          reload();
        } catch (e2) { err(e2.message); btn.disabled = false; }
      };
    };
    const draw = (view) => {
      if (view === "cloud") { drawCloud(opts.cloudMode || "signin"); return; }
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
          <p class="note small">${tr("Tilit ja tiedot ovat vain tällä koneella. Salasana estää muita saman koneen käyttäjiä avaamasta tiliäsi, mutta ei ole vahva suojaus: tiedot itse eivät ole salattuja. Älä käytä samaa salasanaa kuin muissa palveluissa. Siirrä tiedot toiselle koneelle profiilin varmuuskopiolla.",
            "Accounts and data live only on this computer. A password stops other people on the same computer from opening your account, but it is not strong security: the data itself is not encrypted. Don't reuse a password from other services. Move your data to another computer with the profile backup.")}</p>
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
          if (!(await guard(() => Accounts.create({ name, password: gate.querySelector("#acc-pw").value, avatar: av, remember: gate.querySelector("#acc-remember").checked })))) return;
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
          const r = await guard(() => Accounts.login(pick, gate.querySelector("#acc-pw").value, gate.querySelector("#acc-remember").checked));
          if (r === null) return;
          if (!r) { gate.querySelector("#acc-err").hidden = false; gate.querySelector("#acc-pw").select(); return; }
          r.switched ? reload() : close();
        };
        return;
      }
      gate.innerHTML = `<div class="acc-card">
        <div class="acc-hero">${avatarSvg("volt", 72)}</div>
        <h2>${tr("Kuka käyttää RoboLabia?", "Who's using RoboLab?")}</h2>
        <div class="acc-list">${accounts.map((a) => `<button class="acc-user" data-uid="${a.id}">${avatarSvg(a.avatar, 40)}<b>${esc(a.name)}</b>${a.hash ? `<span class="acc-lock" title="${tr("Salasana", "Password")}">🔒</span>` : ""}${a.cloud ? `<span class="acc-lock" title="${tr("Pilvitili", "Cloud account")}">☁</span>` : ""}</button>`).join("")}</div>
        <div class="acc-actions">
          ${window.Cloud?.configured ? `<button class="btn" data-cloud>☁ ${tr("Pilvitili", "Cloud account")}</button>` : ""}
          <button class="btn" data-guest>${tr("Jatka vieraana", "Continue as guest")}</button>
          <button class="btn primary" data-new>${tr("+ Uusi käyttäjä", "+ New user")}</button>
        </div>
      </div>`;
      gate.querySelectorAll("[data-uid]").forEach((b) => (b.onclick = async () => {
        pick = b.dataset.uid;
        const acc = Accounts.get(pick);
        if (acc.cloud) {
          // Voimassa oleva istunto riittää; muuten kirjaudutaan pilvitilille
          if (await Cloud.hasSession(acc.cloudUid)) { const r = await guard(() => Accounts.useAccount(acc.id)); if (r) r.switched ? reload() : close(); }
          else { opts.email = acc.email; draw("cloud"); }
          return;
        }
        if (acc.hash) { draw("password"); return; }
        const r = await guard(() => Accounts.login(pick, "", true));
        if (r) r.switched ? reload() : close();
      }));
      gate.querySelector("[data-guest]").onclick = async () => { const r = await guard(() => Accounts.guest()); if (r) r.switched ? reload() : close(); };
      gate.querySelector("[data-new]").onclick = () => draw("create");
      gate.querySelector("[data-cloud]")?.addEventListener("click", () => draw("cloud"));
    };
        // Lukitun käyttäjän sovellus ei saa olla käytettävissä näppäimistöllä eikä ruudunlukijalla kirjautumisen takana
    const others = [...document.body.children].filter((c) => c !== gate);
    const close = () => { gate.remove(); others.forEach((c) => (c.inert = false)); document.body.classList.remove("acc-locked"); renderUserChip(); };
    others.forEach((c) => (c.inert = true));
    document.body.classList.add("acc-locked");
    draw(mode === "create" ? "create" : mode === "cloud" ? "cloud" : "list");
  }

  /* Käyttäjä sivupalkin alaosassa */
  function renderUserChip() {
    const foot = document.querySelector(".sidebar-footer");
    if (!foot) return;
    foot.querySelector(".user-chip")?.remove();
    const a = Accounts.current();
    foot.insertAdjacentHTML("afterbegin", `<a href="#/profile" class="nav-item user-chip" data-route="profile" data-tip="${esc(a ? a.name : tr("Vieras", "Guest"))}">
      <span class="user-av">${avatarSvg(a ? a.avatar : "volt", 22)}</span><span class="label">${a ? esc(a.name) : tr("Vieras — luo tili", "Guest — create account")}${a?.cloud ? ` <span class="cloud-mark" title="${esc(cloudText())}">${cloudIcon()}</span>` : ""}</span></a>`);
  }
  // Pilvisynkronoinnin tila käyttäjäpainikkeessa ja profiilissa
  const cloudIcon = () => ({ ok: "☁✓", syncing: "☁…", error: "☁!", conflict: "☁!", signedout: "☁?" }[window.Cloud?.status.state] || "☁");
  function cloudText() {
    const st = window.Cloud?.status;
    if (!st) return "";
    const t = st.at ? st.at.toLocaleTimeString(tr("fi-FI", "en-GB"), { hour: "2-digit", minute: "2-digit" }) : "";
    return { ok: tr(`Synkronoitu pilveen ${t}`, `Synced to the cloud ${t}`), syncing: tr("Synkronoidaan…", "Syncing…"),
      error: tr("Synkronointi epäonnistui: ", "Sync failed: ") + (st.error || ""), conflict: tr("Pilvessä ja tällä laitteella on eri muutokset", "The cloud and this device have different changes"),
      signedout: tr("Kirjaudu pilvitilille uudelleen, niin muutokset tallentuvat pilveen", "Sign in to the cloud account again so changes are saved to the cloud") }[st.state] || tr("Pilvitili", "Cloud account");
  }
  window.Cloud?.onStatus(() => { renderUserChip(); const box = document.getElementById("pf-cloud-status"); if (box) box.textContent = cloudText(); });

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
                ${a.cloud ? "" : `<div class="row-actions">
                  <button class="btn" id="pf-pw">${a.hash ? tr("Vaihda salasana", "Change password") : tr("Aseta salasana", "Set a password")}</button>
                  ${a.hash ? `<button class="btn" id="pf-nopw">${tr("Poista salasana", "Remove password")}</button>` : ""}
                </div>`}` : `<div class="row-actions"><button class="btn primary" id="pf-create">${tr("Luo tili", "Create account")}</button></div>`}
            </div>
            <div class="stats">
              <div class="card stat"><div class="k">${tr("Projektit", "Projects")}</div><div class="v">${nProj}</div></div>
              <div class="card stat"><div class="k">${tr("Suoritetut kurssit", "Courses finished")}</div><div class="v">${finished}</div></div>
              <div class="card stat"><div class="k">${tr("Omat robotit", "My robots")}</div><div class="v">${robots}</div></div>
            </div>
          </div>
          <div class="col">
            ${window.Cloud?.configured ? (a?.cloud ? `<div class="card">
              <h3 class="card-title">☁ ${tr("Pilvitili", "Cloud account")}</h3>
              <p>${esc(a.email || "")}</p>
              <p class="note" id="pf-cloud-status" aria-live="polite">${esc(cloudText())}</p>
              <div class="row-actions">
                <button class="btn primary" id="pf-sync">${tr("Synkronoi nyt", "Sync now")}</button>
                <button class="btn" id="pf-cloudpw">${tr("Vaihda salasana", "Change password")}</button>
              </div>
              <p class="note small">${tr("Muutokset tallentuvat pilveen automaattisesti noin puolen minuutin välein ja kun suljet sovelluksen. Toisella laitteella kirjaudu samalla sähköpostilla.", "Changes are saved to the cloud automatically about every half minute and when you close the app. On another device, sign in with the same email.")}</p>
            </div>` : `<div class="card">
              <h3 class="card-title">☁ ${tr("Pilvitili: sama tili kaikilla laitteilla", "Cloud account: one account on all devices")}</h3>
              <p class="note">${tr("Pilvitilillä projektit, kurssit, robotit ja asetukset tallentuvat pilveen, ja voit jatkaa millä tahansa laitteella. Pilvitili on vapaaehtoinen.", "With a cloud account your projects, courses, robots and settings are saved to the cloud and you can carry on from any device. A cloud account is optional.")}</p>
              <div class="row-actions"><button class="btn primary" id="pf-cloud">${tr("Kirjaudu tai luo pilvitili", "Sign in or create a cloud account")}</button></div>
              ${a ? `<p class="note small">${tr("Uusi pilvitili alkaa tyhjänä. Siirrä tämän tilin työt sinne viemällä varmuuskopio täältä ja tuomalla se pilvitilillä.", "A new cloud account starts empty. To move the work of this account there, export a backup here and import it in the cloud account.")}</p>` : ""}
            </div>`) : ""}
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
              ${others.length ? `<div class="acc-list">${others.map((x) => `<button class="acc-user" data-switch="${x.id}">${avatarSvg(x.avatar, 32)}<b>${esc(x.name)}</b>${x.hash ? "🔒" : ""}${x.cloud ? "☁" : ""}</button>`).join("")}</div>` : `<p class="note">${tr("Ei muita käyttäjiä.", "No other users.")}</p>`}
              <div class="row-actions"><button class="btn" id="pf-new">${tr("+ Uusi käyttäjä", "+ New user")}</button></div>
            </div>
            ${a ? `<div class="card">
              <h3 class="card-title">${tr("Poista tili", "Delete account")}</h3>
              <p class="note">${a.cloud ? tr("Poistaa pilvitilin ja kaikki sen tiedot pilvestä ja tältä laitteelta. Tätä ei voi perua. Vie varmuuskopio ensin, jos haluat säilyttää työsi.", "Deletes the cloud account and all its data from the cloud and this device. This cannot be undone. Export a backup first if you want to keep your work.")
                : tr("Poistaa tilin ja kaikki sen projektit, kurssit ja robotit tältä koneelta. Vie varmuuskopio ensin, jos haluat säilyttää ne.", "Deletes the account and all its projects, courses and robots from this computer. Export a backup first if you want to keep them.")}</p>
              <div class="row-actions"><button class="btn danger" id="pf-delete">${a.cloud ? tr("Poista pilvitili", "Delete cloud account") : tr("Poista tili", "Delete account")}</button></div>
            </div>` : ""}
          </div>
        </div>`;

      const $q = (s) => el.querySelector(s);
      if (a) {
        $q("#pf-name").onchange = (e) => { const v = e.target.value.trim(); if (v) { Accounts.update({ name: v }); renderUserChip(); toast(tr("Nimi tallennettu", "Name saved")); } };
        $q("#pf-bio").onchange = (e) => Accounts.update({ bio: e.target.value.slice(0, 300) });
        bindAvatars(el, (k) => { Accounts.update({ avatar: k }); $q(".profile-av").innerHTML = avatarSvg(k, 88); renderUserChip(); });
        $q("#pf-logout").onclick = async () => {
          if (a.cloud) { try { await Cloud.signOut(); } catch {} reload(); return; }
          if (await guard(async () => (Accounts.logout(), true))) reload();
        };
        $q("#pf-sync")?.addEventListener("click", () => Cloud.tick());
        $q("#pf-cloudpw")?.addEventListener("click", async () => {
          try { await Cloud.resetPassword(a.email); toast(tr("Lähetimme salasanan vaihtolinkin sähköpostiisi. Avaa se tällä laitteella.", "We sent a password reset link to your email. Open it on this device.")); }
          catch (e) { toast(e.message); }
        });
        if (!a.cloud) $q("#pf-pw").onclick = async () => {
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
          Accounts.update({ salt: acc.salt, hash: acc.hash, iter: acc.iter });
          toast(tr("Salasana asetettu", "Password set"));
          router();
        };
        $q("#pf-nopw")?.addEventListener("click", async () => {
          const old = prompt(tr("Nykyinen salasana:", "Current password:"));
          if (old === null) return;
          if (!(await Accounts.verify(a, old))) { toast(tr("Väärä salasana", "Wrong password")); return; }
          Accounts.update({ salt: undefined, hash: undefined, iter: undefined });
          toast(tr("Salasana poistettu", "Password removed"));
          router();
        });
        $q("#pf-delete").onclick = async () => {
          if (a.cloud) {
            const typed = prompt(tr(`Tämä poistaa pilvitilin ${a.email} ja kaikki sen tiedot pysyvästi. Kirjoita sähköpostiosoite vahvistukseksi:`, `This permanently deletes the cloud account ${a.email} and all its data. Type the email address to confirm:`));
            if (typed === null) return;
            if (typed.trim().toLowerCase() !== String(a.email).toLowerCase()) { toast(tr("Osoite ei täsmää — tiliä ei poistettu", "The address does not match — the account was not deleted")); return; }
            try { await Cloud.deleteAccount(); reload(); } catch (e) { toast(e.message); }
            return;
          }
          const typed = prompt(tr(`Tämä poistaa tilin "${a.name}" ja kaikki sen tiedot. Kirjoita tilin nimi vahvistukseksi:`, `This deletes the account "${a.name}" and all its data. Type the account name to confirm:`));
          if (typed === null) return;
          if (typed.trim() !== a.name) { toast(tr("Nimi ei täsmää — tiliä ei poistettu", "The name doesn't match — the account was not deleted")); return; }
          Accounts.remove(a.id);
          reload();
        };
      } else $q("#pf-create").onclick = () => showLogin("create");
      $q("#pf-cloud")?.addEventListener("click", () => showLogin("cloud"));

      $q("#pf-new").onclick = () => showLogin("create");
      el.querySelectorAll("[data-switch]").forEach((b) => (b.onclick = async () => {
        const target = Accounts.get(b.dataset.switch);
        if (target.cloud) {
          if (await Cloud.hasSession(target.cloudUid)) { if (await guard(() => Accounts.useAccount(target.id))) reload(); }
          else showLogin("cloud", { email: target.email });
          return;
        }
        let pw = "";
        if (target.hash) { pw = prompt(tr(`Käyttäjän ${target.name} salasana:`, `Password for ${target.name}:`)); if (pw === null) return; }
        const r = await guard(() => Accounts.login(target.id, pw, !target.hash));
        if (r === null) return;
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
        }).catch((err) => toast(err.message === "storage" ? tr("Tallennustila loppui kesken: varmuuskopiota ei tuotu ja nykyiset tiedot palautettiin.", "Storage ran out: the backup was not imported and your current data was restored.") : err.message === "version" ? tr("Varmuuskopio on uudemmasta RoboLab-versiosta", "The backup is from a newer RoboLab version") : tr("Tiedosto ei ole RoboLab-varmuuskopio", "The file is not a RoboLab backup")));
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
