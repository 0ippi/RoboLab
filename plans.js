"use strict";

/* Tilaustasot: Free, Education, Teacher ja Pro.
   - Hinnat ja tasojen sisältö ovat tässä tiedostossa yhdessä paikassa, jotta niitä on helppo muuttaa.
   - Käyttäjä on aina vähintään Free-tasolla ilman tiliä. Maksullinen taso tulee pilvitilin tilauksesta
     (Supabase: subscriptions, my_plan) tai laitteelle aktivoidusta opettajan luokkakoodista (Education).
   - Tieto tasosta pidetään laitteen välimuistissa, jotta sovellus toimii myös ilman nettiä.
   - Lukitus on sovelluksen puolella: se ohjaa ja mainostaa, mutta ei ole kopiosuojaus (koodi on avointa). */
const Plans = (() => {
  /* ===== Hinnat (€, sis. alv) ===== */
  const PRICES = {
    education: { month: 2, year: 19 },
    teacher: { month: 5, year: 45, seat: 1, included: 5 }, // lisäpaikka €/oppilas/lukuvuosi
    school: { year: 290, seats: 300 },
    pro: { month: 7, year: 59 },
  };

  /* ===== Tasojen sisältö ===== */
  const FREE_TOOLS = ["dashboard", "learn", "projects", "profile", "plans", "build2d", "motor", "power", "sim2d", "units"];
  const EDU_TOOLS = [...FREE_TOOLS, "path", "map", "pid", "cv", "rot", "fk", "ik", "nn2d"];
  const FREE_COURSES = ["start", "sensors", "power"];
  const EDU_COURSES = [...FREE_COURSES, "nav", "pid", "vision", "frames"];
  const ALL = "*";
  const FEATURES = {
    free: { tools: FREE_TOOLS, courses: FREE_COURSES, teach: false },
    education: { tools: EDU_TOOLS, courses: EDU_COURSES, teach: false },
    teacher: { tools: [...EDU_TOOLS, "teach"], courses: EDU_COURSES, teach: true },
    pro: { tools: ALL, courses: ALL, teach: false }, // Opettajille-sivu kuuluu vain Teacher-tasoon
  };
  const NAMES = { free: "Free", education: "Education", teacher: "Teacher", pro: "Pro" };
  const RANK = { free: 0, education: 1, teacher: 2, pro: 3 };

  const CLASS_KEY = "rlclass", PLAN_KEY = "rlplan", DEVICE_KEY = "rldevice"; // laitekohtaisia (eivät kuulu käyttäjän tietoihin)
  const RECHECK = 15 * 60 * 1000;           // luokan tiedot (annetut kurssit, jäsenyys) haetaan 15 minuutin välein
  const OFFLINE_GRACE = 30 * 24 * 3600 * 1000; // ilman nettiä tallennettu taso pysyy voimassa 30 päivää

  const read = (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } };
  const write = (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const valid = (x) => !!x && (!x.until || Date.parse(x.until) > Date.now()) && (!x.checked || Date.now() - x.checked < OFFLINE_GRACE);
  function deviceId() {
    let d = null;
    try { d = localStorage.getItem(DEVICE_KEY); } catch {}
    if (!d) { d = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => b.toString(16).padStart(2, "0")).join(""); try { localStorage.setItem(DEVICE_KEY, d); } catch {} }
    return d;
  }

  /* ===== Nykyinen taso ===== */
  // Lähteet: pilvitilin tilaus ja laitteen luokkakoodi. Ominaisuudet yhdistetään.
  function sources() {
    const out = [];
    const override = window.__robolabPlanOverride; // automaattitestit
    if (override) return String(override).split(",").map((plan) => ({ plan, from: "test" })); // esim. "pro,teacher"
    const acc = typeof Accounts !== "undefined" ? Accounts.current() : null; // const-globaali, ei window-ominaisuus
    if (acc?.cloud) {
      const p = read(PLAN_KEY)?.[acc.cloudUid];
      if (valid(p) && p.plan !== "free") out.push({ plan: p.plan, from: "account", until: p.until, seats: p.seats || 0 });
    }
    const c = read(CLASS_KEY);
    if (valid(c)) out.push({ plan: "education", from: "class", until: c.until, name: c.name, code: c.code });
    return out;
  }
  function current() {
    const src = sources();
    const plan = src.reduce((best, s) => (RANK[s.plan] > RANK[best] ? s.plan : best), "free");
    return { plan, name: NAMES[plan], sources: src };
  }
  const feats = () => {
    const f = { tools: new Set(), courses: new Set(), all: false, teach: false };
    for (const p of ["free", ...current().sources.map((s) => s.plan)]) {
      const x = FEATURES[p];
      if (!x) continue;
      if (x.tools === ALL) f.all = true; else x.tools.forEach((t) => f.tools.add(t));
      if (x.courses !== ALL) x.courses.forEach((c) => f.courses.add(c));
      f.teach ||= x.teach;
    }
    return f;
  };

  function canCourse(id) { const f = feats(); return f.all || f.courses.has(id); }
  // Työkalu on käytössä, jos taso sallii sen tai käynnissä oleva (sallittu) kurssi käyttää sitä
  function canTool(id) {
    const f = feats();
    if (id === "teach") return f.teach;
    if (f.all || f.tools.has(id) || id === "settings") return true;
    const ac = window.Courses?.active?.();
    if (ac && canCourse(ac.id)) return !!Courses._courses.find((c) => c.id === ac.id)?.steps.some((s) => s.tool === id);
    return false;
  }
  const canTeach = () => feats().teach;
  // Halvin taso, joka avaa työkalun tai kurssin
  const tierForTool = (id) => (FEATURES.education.tools.includes(id) ? "education" : id === "teach" ? "teacher" : "pro");
  const tierForCourse = (id) => (FEATURES.free.courses.includes(id) ? "free" : FEATURES.education.courses.includes(id) ? "education" : "pro");

  /* ===== Muutokset ===== */
  const listeners = new Set();
  let last = null;
  function changed() {
    const sig = JSON.stringify(current());
    if (sig === last) return;
    last = sig;
    listeners.forEach((f) => { try { f(current()); } catch {} });
  }

  // Pilvitilin taso ja luokkakoodin voimassaolo tarkistetaan palvelimelta (hiljaa, jos ei nettiä)
  async function refresh({ force = false } = {}) {
    if (!window.Cloud?.configured) return current();
    const acc = Accounts.current();
    if (acc?.cloud) {
      const all = read(PLAN_KEY) || {};
      const p = all[acc.cloudUid];
      if (force || !p || Date.now() - (p.checked || 0) > 60000) {
        try {
          const r = await Cloud.rpc("my_plan");
          let dev = false;
          try { dev = (await Cloud.rpc("am_developer")) === true; } catch {} // puuttuu, jos supabase-dev.sql:ää ei ole ajettu
          all[acc.cloudUid] = { plan: FEATURES[r?.plan] ? r.plan : "free", until: r?.valid_until || null, seats: r?.seats || 0, checked: Date.now(), dev };
          write(PLAN_KEY, all);
        } catch {}
      }
    }
    const c = read(CLASS_KEY);
    if (c && (force || Date.now() - (c.checked || 0) > RECHECK)) {
      try { await activateClass(c.code, { silent: true }); }
      catch (e) { if (/no-code|expired|no-member/.test(e.code || "")) write(CLASS_KEY, null); }
    }
    if (c && read(CLASS_KEY)?.pending) syncProgress();
    changed();
    return current();
  }

  /* ===== Luokkahuone (oppilaan laite) ===== */
  // Oppilas liittyy opettajan luokkaan koodilla ja nimimerkillä: Education tälle laitteelle, tiliä ei tarvita.
  // silent = taustatarkistus: haetaan luokan tiedot (annetut kurssit) kuluttamatta paikkaa.
  async function activateClass(code, { silent = false, alias } = {}) {
    code = String(code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
    if (code.length !== 8) { const e = new Error(tr("Luokkakoodissa on 8 merkkiä.", "A class code has 8 characters.")); e.code = "format"; throw e; }
    const old = read(CLASS_KEY);
    alias = String(alias ?? (old?.code === code ? old.alias : "") ?? "").trim().slice(0, 30);
    if (!silent && !alias) { const e = new Error(tr("Kirjoita nimimerkki, jonka opettaja tunnistaa (ei koko nimeä).", "Type an alias your teacher will recognise (not your full name).")); e.code = "alias"; throw e; }
    let r;
    try {
      r = silent && old?.code === code ? await Cloud.rpc("class_info", { p_code: code, p_device: deviceId() })
        : await Cloud.rpc("join_class", { p_code: code, p_device: deviceId(), p_alias: alias || tr("oppilas", "student") });
    } catch (err) {
      const m = String(err.raw || err.message || "");
      const known = ["no-code", "expired", "full", "no-member", "no-alias"].find((k) => m.includes(k));
      const e = new Error(known === "no-code" ? tr("Luokkakoodia ei löytynyt. Tarkista koodi opettajalta.", "Class code not found. Check the code with your teacher.")
        : known === "expired" ? tr("Luokkakoodi on vanhentunut. Pyydä opettajalta uusi.", "The class code has expired. Ask your teacher for a new one.")
        : known === "full" ? tr("Luokan kaikki paikat on jo käytetty. Pyydä opettajaa lisäämään paikkoja.", "All seats in this class are taken. Ask your teacher to add seats.")
        : known === "no-member" ? tr("Opettaja on poistanut tämän laitteen luokasta.", "Your teacher has removed this device from the class.")
        : known === "no-alias" ? tr("Kirjoita nimimerkki.", "Type an alias.")
        : err.message);
      e.code = known || "network";
      throw e;
    }
    write(CLASS_KEY, { code, name: r?.name || "", alias: r?.alias || alias, until: r?.valid_until || null, courses: Array.isArray(r?.courses) ? r.courses : [],
      checked: Date.now(), sent: old?.code === code ? old.sent : null, pending: old?.code === code ? old.pending : true });
    changed();
    if (!silent) { toast(tr(`Liityit luokkaan${r?.name ? " " + r.name : ""}. Opettaja näkee nyt edistymisesi nimimerkillä ${alias}.`, `You joined the class${r?.name ? " " + r.name : ""}. Your teacher can now see your progress under the alias ${alias}.`)); syncProgress(); }
    return current();
  }
  function removeClass() { write(CLASS_KEY, null); changed(); }
  const classInfo = () => { const c = read(CLASS_KEY); return valid(c) ? c : null; };

  // Kurssien eteneminen opettajalle: vain luvut (vaiheet, suoritus, vihjeet, loppukokeen pisteet), ei vastauksia.
  // Lähetetään viiveellä muutosten jälkeen; jos yhteys puuttuu, yritetään uudelleen seuraavalla tarkistuksella.
  let syncTimer = 0;
  function queueSync() { if (!read(CLASS_KEY)) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncProgress, 2500); }
  async function syncProgress() {
    const c = read(CLASS_KEY);
    if (!c || !window.Cloud?.configured || !window.Courses?.summary) return;
    const assigned = new Set((c.courses || []).map((x) => x.id));
    const items = Courses.summary().filter((p) => p.finished || p.done > 0 || assigned.has(p.id))
      .map((p) => ({ course: p.id, steps: p.steps, done: p.done, finished: p.finished, hints: p.hints, score: p.score ?? null, score_max: p.scoreMax ?? null }));
    const sig = JSON.stringify(items);
    if (sig === c.sent && !c.pending) return;
    try {
      await Cloud.rpc("report_progress", { p_code: c.code, p_device: deviceId(), p_items: items });
      write(CLASS_KEY, { ...read(CLASS_KEY), sent: sig, pending: false });
    } catch (e) {
      if (/no-member|no-code|expired/.test(String(e.raw || ""))) { write(CLASS_KEY, null); changed(); return; }
      write(CLASS_KEY, { ...read(CLASS_KEY), pending: true });
    }
  }

  /* ===== Kehittäjätila ===== */
  // Kehittäjä (Supabase: developers-taulu) voi vaihtaa oman tilinsä tason testausta varten. Palvelin tarkistaa oikeuden.
  function isDeveloper() {
    const acc = typeof Accounts !== "undefined" ? Accounts.current() : null;
    return !!(acc?.cloud && read(PLAN_KEY)?.[acc.cloudUid]?.dev);
  }
  async function devSetPlan(plan, seats = 0) {
    await Cloud.rpc("dev_set_plan", { p_plan: plan, p_seats: seats });
    return refresh({ force: true });
  }
  function devHtml(cur) {
    const acc = Accounts.current();
    const seats = read(PLAN_KEY)?.[acc.cloudUid]?.seats || 0;
    return `<div class="card dev-card">
      <h3 class="card-title">🛠 ${tr("Kehittäjätila", "Developer mode")}</h3>
      <p class="note">${tr("Vaihda oman tilisi tasoa testausta varten. Muutos tallentuu pilvitilillesi ja näkyy kaikilla laitteillasi. Vain kehittäjäksi merkityt tilit näkevät tämän.", "Switch your own account's plan for testing. The change is saved to your cloud account and shows on all your devices. Only accounts marked as developers see this.")}</p>
      <div class="row-actions dev-plans">${Object.keys(FEATURES).map((p) => `<button class="btn ${cur.plan === p ? "primary" : ""}" data-dev-plan="${p}" ${cur.plan === p ? 'aria-pressed="true"' : ""}>${NAMES[p]}</button>`).join("")}</div>
      <label class="dev-seats">${tr("Teacher-lisäpaikat", "Teacher extra seats")} <input type="number" id="dev-seats" min="0" max="995" value="${seats}"></label>
      <h4 class="dev-sub">${tr("Anna lisenssi käyttäjälle", "Give a licence to a user")}</h4>
      <form class="dev-grant" data-plans-form="grant">
        <label>${tr("Pilvitilin sähköposti", "Cloud account email")}<input type="email" id="dg-email" maxlength="200" autocomplete="off" required></label>
        <label>${tr("Taso", "Plan")}<select id="dg-plan">${["education", "teacher", "pro"].map((p) => `<option value="${p}">${NAMES[p]}</option>`).join("")}</select></label>
        <label>${tr("Lisäpaikat", "Extra seats")}<input type="number" id="dg-seats" min="0" max="995" value="0"></label>
        <label>${tr("Voimassa asti", "Valid until")}<input type="date" id="dg-until"></label>
        <button class="btn primary">${tr("Anna lisenssi", "Give licence")}</button>
      </form>
      <p class="note small">${tr("Tyhjä päivämäärä = voimassa toistaiseksi. Lisäpaikat koskevat Teacher-tasoa (5 sisältyy aina). Käyttäjällä pitää olla pilvitili; taso päivittyy hänelle minuutin kuluessa.", "Empty date = valid until further notice. Extra seats apply to the Teacher plan (5 always included). The user needs a cloud account; the plan updates for them within a minute.")}</p>
      <div id="dev-grants" aria-live="polite"><p class="note">${tr("Ladataan lisenssejä…", "Loading licences…")}</p></div>
    </div>`;
  }

  // Kehittäjän lisenssilista (Supabase: dev_list_plans, dev_grant_plan)
  const devError = (err) => {
    const m = String(err.raw || err.message || "");
    return /no-user/.test(m) ? tr("Tällä sähköpostilla ei ole pilvitiliä. Pyydä käyttäjää luomaan pilvitili ensin.", "There is no cloud account with this email. Ask the user to create a cloud account first.")
      : /bad-date/.test(m) ? tr("Päivämäärä on jo mennyt.", "The date has already passed.")
      : /not-developer/.test(m) ? tr("Tililläsi ei ole kehittäjän oikeuksia.", "Your account doesn't have developer rights.") : err.message;
  };
  async function loadGrants(el) {
    const box = el.querySelector("#dev-grants");
    if (!box) return;
    let list;
    try { list = (await Cloud.rpc("dev_list_plans")) || []; } catch (e) { box.innerHTML = `<p class="note">${esc(devError(e))}</p>`; return; }
    const date = (d) => (d ? new Date(d).toLocaleDateString(tr("fi-FI", "en-GB")) : tr("toistaiseksi", "ongoing"));
    box.innerHTML = list.length ? `<div class="edu-table-wrap"><table class="ws-table"><thead><tr><th>${tr("Sähköposti", "Email")}</th><th>${tr("Taso", "Plan")}</th><th>${tr("Lisäpaikat", "Seats")}</th><th>${tr("Voimassa", "Valid until")}</th><th></th></tr></thead>
      <tbody>${list.map((r) => `<tr><td>${esc(r.email)}</td><td>${badge(FEATURES[r.plan] ? r.plan : "free")}${r.source === "dev" ? " <small>dev</small>" : ""}</td><td>${Number(r.seats) || 0}</td><td>${date(r.valid_until)}</td>
        <td><button class="link-btn" data-dev-revoke="${esc(r.email)}">${tr("Poista", "Remove")}</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="note">${tr("Ei voimassa olevia maksullisia tasoja.", "No active paid plans.")}</p>`;
  }
  function bindGrants(el) {
    const f = el.querySelector('[data-plans-form="grant"]');
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button");
      const until = f.querySelector("#dg-until").value;
      btn.disabled = true;
      try {
        const r = await Cloud.rpc("dev_grant_plan", { p_email: f.querySelector("#dg-email").value.trim(), p_plan: f.querySelector("#dg-plan").value,
          p_seats: Math.max(0, Math.round(+f.querySelector("#dg-seats").value || 0)), p_until: until ? new Date(until + "T23:59:59").toISOString() : null });
        toast(tr(`Lisenssi annettu: ${r.email} → ${NAMES[r.plan]}`, `Licence given: ${r.email} → ${NAMES[r.plan]}`));
        f.querySelector("#dg-email").value = "";
        if (r.email === String(Accounts.current()?.email || "").toLowerCase()) await refresh({ force: true });
        loadGrants(el);
      } catch (err) { toast(devError(err)); }
      btn.disabled = false;
    };
    loadGrants(el);
  }

  /* ===== Osto ===== */
  // Maksulinkit (esim. Stripe Payment Links) tulevat cloud-config.js:stä. Tilaus liitetään pilvitiliin.
  const payLinks = () => window.ROBOLAB_CLOUD?.payments || {};
  function buy(key) {
    const url = payLinks()[key];
    const acc = Accounts.current();
    if (!url) { location.hash = "#/plans"; toast(tr("Verkkomaksu avataan pian. Siihen asti tilauksen saa ottamalla yhteyttä (linkki Tasot-sivun lopussa).", "Online payment opens soon. Until then you can order by getting in touch (link at the end of the Plans page).")); return; }
    if (!acc?.cloud) { toast(tr("Kirjaudu tai luo ensin pilvitili, niin tilaus liitetään siihen.", "Sign in or create a cloud account first so the subscription is linked to it.")); window.AccountsUI?.showLogin("cloud"); return; }
    const u = new URL(url);
    u.searchParams.set("client_reference_id", acc.cloudUid);
    if (acc.email) u.searchParams.set("prefilled_email", acc.email);
    window.open(u.toString(), "_blank", "noopener");
    toast(tr("Kun maksu on valmis, palaa tänne ja paina Tarkista tilaus.", "When the payment is done, come back here and press Check subscription."));
  }

  /* ===== Käyttöliittymä ===== */
  const euro = (n) => (Number.isInteger(n) ? String(n) : n.toFixed(2).replace(".", LANG === "en" ? "." : ",")) + " €";
  const badge = (tier) => `<span class="plan-badge plan-${tier}">${NAMES[tier]}</span>`;

  // Lukittu työkalu: esittely ja tie päivitykseen (toimii samalla mainoksena)
  function lockedHtml(tool) {
    const tier = tierForTool(tool.id);
    return `${toolHead(tool)}
      <div class="card locked-card">
        <div class="locked-icon" aria-hidden="true">🔒</div>
        <h2>${esc(tool.name)} ${badge(tier)}</h2>
        <p>${esc(tool.desc)}</p>
        <p class="note">${tier === "teacher" ? tr("Opettajille-sivu kuuluu Teacher-tasoon.", "The For teachers page is part of the Teacher plan.")
          : tr(`Tämä työkalu kuuluu ${NAMES[tier]}-tasoon${tier === "education" ? " (myös Teacher ja Pro)" : ""}. Free-tasolla voit käyttää perustyökaluja ja kolmea ensimmäistä kurssia.`,
            `This tool is part of the ${NAMES[tier]} plan${tier === "education" ? " (also Teacher and Pro)" : ""}. On Free you can use the basic tools and the first three courses.`)}</p>
        <div class="row-actions">
          <a class="btn primary" href="#/plans">⭐ ${tr("Katso tasot ja hinnat", "See plans and prices")}</a>
          ${tier === "education" ? `<a class="btn" href="#/plans" data-focus-class>${tr("Minulla on luokkakoodi", "I have a class code")}</a>` : ""}
        </div>
      </div>`;
  }

  function classBoxHtml() {
    const c = sources().find((s) => s.from === "class"), info = classInfo();
    if (c) return `<div class="class-active">✓ ${tr("Olet luokassa", "You are in the class")} <b>${esc(c.name || c.code)}</b> (${esc(c.code)})${info?.alias ? ` ${tr("nimimerkillä", "as")} <b>${esc(info.alias)}</b>` : ""}${c.until ? ` · ${tr("voimassa", "valid until")} ${new Date(c.until).toLocaleDateString(tr("fi-FI", "en-GB"))}` : ""}
      <button class="link-btn" data-plans="remove-class">${tr("Poistu luokasta tällä laitteella", "Leave the class on this device")}</button></div>`;
    return `<form class="class-form" data-plans-form="class">
      <label>${tr("Luokkakoodi opettajalta", "Class code from your teacher")}<input id="pl-class" maxlength="12" autocomplete="off" placeholder="ABCD2345" spellcheck="false"></label>
      <label>${tr("Nimimerkki", "Alias")}<input id="pl-alias" class="alias" maxlength="30" autocomplete="off" placeholder="${tr("esim. Aino K tai oppilas 12", "e.g. Amy K or student 12")}"></label>
      <button class="btn primary">${tr("Liity luokkaan", "Join the class")}</button></form>
      <p class="note small">${tr("Koodi avaa Education-tason tälle laitteelle, ja opettaja näkee kurssiesi etenemisen nimimerkilläsi. Tiliä, sähköpostia tai koko nimeä ei tarvita.", "The code unlocks the Education plan on this device, and your teacher sees your course progress under your alias. No account, email or full name needed.")}</p>`;
  }

  function render(el, tool) {
    const cur = current();
    const acc = Accounts.current();
    const P = PRICES;
    const per = (m, y) => `<div class="price"><b>${euro(m)}</b><span>/ ${tr("kk", "mo")}</span></div><div class="price-alt">${tr("tai", "or")} ${euro(y)} / ${tr("vuosi", "year")}</div>`;
    const btn = (tier, html) => cur.plan === tier ? `<div class="plan-current">✓ ${tr("Nykyinen tasosi", "Your current plan")}</div>` : html;
    const toolNames = (ids) => ids.map((id) => TOOLS.find((t) => t.id === id)?.name).filter(Boolean);
    const eduExtra = toolNames(EDU_TOOLS.filter((t) => !FREE_TOOLS.includes(t)));
    const proExtra = toolNames(TOOLS.map((t) => t.id).filter((id) => !EDU_TOOLS.includes(id) && id !== "teach" && TOOLS.find((t) => t.id === id).nav !== false));
    const courseNames = (ids) => ids.map((id) => Courses._courses.find((c) => c.id === id)?.title.split(":")[0]).filter(Boolean);
    el.innerHTML = `
      ${toolHead(tool, acc?.cloud ? `<button class="btn" data-plans="refresh">${tr("Tarkista tilaus", "Check subscription")}</button>` : "")}
      <p class="plans-now">${tr("Nykyinen tasosi", "Your plan")}: ${badge(cur.plan)} ${cur.sources.map((s) => s.from === "class" ? tr(" (luokkakoodilla)", " (class code)") : s.until ? ` · ${tr("voimassa", "valid until")} ${new Date(s.until).toLocaleDateString(tr("fi-FI", "en-GB"))}` : "").join("")}</p>
      ${isDeveloper() ? devHtml(cur) : ""}
      <div class="plan-grid">
        <article class="card plan-card">
          <h2>Free</h2><div class="price"><b>0 €</b></div><div class="price-alt">${tr("aina ilmainen, ei tiliä", "always free, no account")}</div>
          <ul><li>${tr("Perustyökalut", "Basic tools")}: ${esc(toolNames(FREE_TOOLS.filter((t) => !["dashboard", "learn", "projects", "profile", "plans"].includes(t))).join(", "))}</li>
            <li>${tr("Kurssit", "Courses")}: ${esc(courseNames(FREE_COURSES).join(", "))}</li><li>${tr("Volt-opas, projektit, offline-käyttö", "Volt guide, projects, offline use")}</li></ul>
          ${btn("free", `<div class="plan-current">${tr("Sisältyy kaikkiin tasoihin", "Included in every plan")}</div>`)}
        </article>
        <article class="card plan-card tier-education">
          <h2>Education ${tr("<small>opiskelijoille</small>", "<small>for students</small>")}</h2>${per(P.education.month, P.education.year)}
          <ul><li>${tr("Kaikki Free-tason sisältö", "Everything in Free")}</li>
            <li>${tr("Lisää työkaluja", "More tools")}: ${esc(eduExtra.join(", "))}</li>
            <li>${tr("Lisää kursseja", "More courses")}: ${esc(courseNames(EDU_COURSES.filter((c) => !FREE_COURSES.includes(c))).join(", "))}</li>
            <li><b>${tr("Ilmainen opettajan luokkakoodilla", "Free with your teacher's class code")}</b></li></ul>
          ${btn("education", `<div class="row-actions"><button class="btn primary" data-buy="education_month">${tr("Tilaa kuukausi", "Monthly")}</button><button class="btn" data-buy="education_year">${tr("Tilaa vuosi", "Yearly")}</button></div>`)}
        </article>
        <article class="card plan-card tier-teacher">
          <h2>Teacher</h2>${per(P.teacher.month, P.teacher.year)}
          <ul><li>${tr("Kaikki Education-tason sisältö", "Everything in Education")}</li><li>${tr("Opettajille-sivu: valmiit oppitunnit, monisteet, ratkaisut ja luokan edistyminen", "For teachers page: ready lessons, worksheets, solutions and class progress")}</li>
            <li>${tr(`Luokkakoodit oppilaille: ${P.teacher.included} oppilasta sisältyy, lisäpaikat ${euro(P.teacher.seat)} / oppilas / lukuvuosi`, `Class codes for students: ${P.teacher.included} students included, extra seats ${euro(P.teacher.seat)} / student / school year`)}</li>
            <li>${tr(`Koululisenssi: ${euro(P.school.year)} / vuosi, kaikki opettajat ja enintään ${P.school.seats} oppilasta, laskulla`, `School licence: ${euro(P.school.year)} / year, all teachers and up to ${P.school.seats} students, invoiced`)}</li></ul>
          ${btn("teacher", `<div class="row-actions"><button class="btn primary" data-buy="teacher_month">${tr("Tilaa kuukausi", "Monthly")}</button><button class="btn" data-buy="teacher_year">${tr("Tilaa vuosi", "Yearly")}</button><button class="btn" data-buy="seats">${tr("Osta oppilaspaikkoja", "Buy student seats")}</button></div>`)}
        </article>
        <article class="card plan-card tier-pro">
          <h2>Pro</h2>${per(P.pro.month, P.pro.year)}
          <ul><li>${tr("Kaikki työkalut ja kaikki kurssit", "All tools and all courses")}</li><li>${tr("Lisäksi", "Also")}: ${esc(proExtra.join(", "))}</li>
            <li>${tr("Kurssit", "Courses")}: ${esc(courseNames(Courses._courses.map((c) => c.id).filter((c) => !EDU_COURSES.includes(c))).join(", "))}</li></ul>
          ${btn("pro", `<div class="row-actions"><button class="btn primary" data-buy="pro_month">${tr("Tilaa kuukausi", "Monthly")}</button><button class="btn" data-buy="pro_year">${tr("Tilaa vuosi", "Yearly")}</button></div>`)}
        </article>
      </div>
      <div class="tool"><div class="col">
        <div class="card"><h3 class="card-title">${tr("Onko sinulla luokkakoodi?", "Do you have a class code?")}</h3>${classBoxHtml()}</div>
      </div><div class="col">
        <div class="card"><h3 class="card-title">${tr("Hyvä tietää", "Good to know")}</h3>
          <ul class="plans-faq">
            <li>${tr("Hinnat sisältävät arvonlisäveron. Tilauksen voi perua milloin tahansa; taso on voimassa maksetun jakson loppuun.", "Prices include VAT. You can cancel at any time; the plan stays on until the end of the paid period.")}</li>
            <li>${tr("Maksullinen taso liitetään pilvitiliin, joten se toimii kaikilla laitteillasi.", "A paid plan is linked to your cloud account, so it works on all your devices.")}</li>
            <li>${tr("Projektisi säilyvät aina, vaikka taso vaihtuisi. Lukittuja työkaluja ei vain voi avata.", "Your projects are always kept, even if your plan changes. Locked tools just can't be opened.")}</li>
            <li>${tr("Koulut ja kunnat: laskutus, pilotit ja koululisenssit sovitaan suoraan.", "Schools and municipalities: invoicing, pilots and school licences are arranged directly.")} <a href="https://github.com/0ippi/RoboLab/issues" target="_blank" rel="noopener">${tr("Ota yhteyttä", "Get in touch")}</a></li>
          </ul></div>
      </div></div>`;
    el.onclick = async (e) => {
      const b = e.target.closest("[data-buy],[data-plans],[data-dev-plan],[data-dev-revoke]");
      if (!b) return;
      if (b.dataset.devRevoke) {
        if (!confirm(tr(`Poistetaanko käyttäjän ${b.dataset.devRevoke} maksullinen taso? Hän palaa Free-tasolle.`, `Remove the paid plan of ${b.dataset.devRevoke}? They go back to Free.`))) return;
        try {
          await Cloud.rpc("dev_grant_plan", { p_email: b.dataset.devRevoke, p_plan: "free", p_seats: 0, p_until: null });
          toast(tr("Taso poistettu", "Plan removed"));
          if (b.dataset.devRevoke === String(Accounts.current()?.email || "").toLowerCase()) { await refresh({ force: true }); router(); return; }
        } catch (err) { toast(devError(err)); }
        loadGrants(el);
        return;
      }
      if (b.dataset.devPlan) {
        el.querySelectorAll("[data-dev-plan]").forEach((x) => (x.disabled = true));
        try {
          await devSetPlan(b.dataset.devPlan, Math.max(0, Math.round(+el.querySelector("#dev-seats")?.value || 0)));
          toast(tr(`Kehittäjätila: tasosi on nyt ${current().name}`, `Developer mode: your plan is now ${current().name}`));
        } catch (err) { toast(err.message); }
        router();
        return;
      }
      if (b.dataset.buy) { buy(b.dataset.buy); return; }
      if (b.dataset.plans === "refresh") { b.disabled = true; await refresh({ force: true }); toast(tr(`Tasosi: ${current().name}`, `Your plan: ${current().name}`)); router(); return; }
      if (b.dataset.plans === "remove-class") { if (confirm(tr("Poistetaanko luokkakoodi tältä laitteelta? Education-taso poistuu käytöstä.", "Remove the class code from this device? The Education plan will be turned off."))) { removeClass(); router(); } }
    };
    bindClassForm(el);
    if (isDeveloper()) bindGrants(el);
    if (location.hash.includes("class") || sessionStorage.getItem("rl-focus-class")) { try { sessionStorage.removeItem("rl-focus-class"); } catch {} el.querySelector("#pl-class")?.focus(); }
  }

  function bindClassForm(root) {
    const f = root.querySelector('[data-plans-form="class"]');
    if (!f) return;
    f.onsubmit = async (e) => {
      e.preventDefault();
      const btn = f.querySelector("button");
      btn.disabled = true;
      try { await activateClass(f.querySelector("#pl-class").value, { alias: f.querySelector("#pl-alias")?.value }); router(); }
      catch (err) { toast(err.message); btn.disabled = false; }
    };
  }

  /* ===== Päivitä-nappi ja tasomerkit ===== */
  function renderUpgrade() {
    const b = document.getElementById("upgrade-btn");
    if (!b) return;
    const cur = current();
    b.hidden = cur.plan === "pro" && !isDeveloper(); // kehittäjä pääsee aina vaihtamaan tasoa
    b.innerHTML = cur.plan === "free" ? `⭐ <span>${tr("Päivitä", "Upgrade")}</span>` : `⭐ <span>${esc(cur.name)}</span>`;
    b.title = cur.plan === "free" ? tr("Avaa lisää kursseja ja työkaluja", "Unlock more courses and tools") : tr("Tasosi ja muut tasot", "Your plan and other plans");
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("#upgrade-btn")) location.hash = "#/plans";
    if (e.target.closest("[data-focus-class]")) { try { sessionStorage.setItem("rl-focus-class", "1"); } catch {} }
  });

  function init() {
    last = JSON.stringify(current());
    renderUpgrade();
    listeners.add(() => { renderUpgrade(); renderNav(); router(); });
    window.Cloud?.onStatus?.((s) => { if (s.state === "ok") refresh(); });
    setTimeout(() => refresh(), 1500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else setTimeout(init);

  TOOL_IMPL.plans = { render };

  return { PRICES, FEATURES, NAMES, current, canTool, canCourse, canTeach, tierForTool, tierForCourse, refresh, activateClass, removeClass, classInfo, queueSync, syncProgress, isDeveloper, devSetPlan,
    lockedHtml, classBoxHtml, bindClassForm, badge, buy, deviceId, onChange: (f) => listeners.add(f), _changed: changed };
})();
window.Plans = Plans;
