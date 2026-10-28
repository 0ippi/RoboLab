"use strict";

/* Paikalliset käyttäjätilit.
   Kirjautuneen käyttäjän tiedot ovat tavallisissa robolab-*-avaimissa, joten muu sovellus ei tiedä tileistä mitään.
   Käyttäjää vaihdettaessa nykyisen käyttäjän avaimet siirretään nimiavaruuteen robolab-u:<id>:<avain>
   ja uuden käyttäjän avaimet palautetaan niistä, minkä jälkeen sivu ladataan uudelleen.
   Tämä tiedosto ladataan ennen i18n.js:ää, jotta kieli ja asetukset luetaan jo oikealta käyttäjältä. */
const Accounts = (() => {
  const ACC = "robolab-accounts", ACTIVE = "robolab-active", REMEMBER = "robolab-remember", SESSION = "robolab-session";
  const NS = "robolab-u:";
  const SYSTEM = new Set([ACC, ACTIVE, REMEMBER]);
  // Salaisuudet ja luokkajäsenyys (käyttäjän paikka luokassa tällä laitteella, plans.js) eivät kuulu varmuuskopioon
  // eivätkä pilvisynkronointiin; tuonti ei myöskään poista niitä
  const NO_EXPORT = new Set(["robolab-ai-key", "robolab-classroom", "robolab-class-member"]);
  const GUEST = "guest";
  const ls = localStorage;

  const isUserKey = (k) => k.startsWith("robolab-") && !SYSTEM.has(k) && !k.startsWith(NS);
  const userKeys = () => Object.keys(ls).filter(isUserKey);
  const nsKeys = (id) => Object.keys(ls).filter((k) => k.startsWith(NS + id + ":"));

  const list = () => { try { const v = JSON.parse(ls.getItem(ACC)); return Array.isArray(v) ? v : []; } catch { return []; } };
  const saveList = (l) => ls.setItem(ACC, JSON.stringify(l));
  const active = () => ls.getItem(ACTIVE) || GUEST;
  const current = () => list().find((a) => a.id === active()) || null;
  const get = (id) => list().find((a) => a.id === id) || null;

  function signedIn() {
    const a = active();
    let ses = null;
    try { ses = sessionStorage.getItem(SESSION); } catch {}
    if (a === GUEST) return ses === GUEST || !list().length;
    return ses === a || ls.getItem(REMEMBER) === a;
  }

  // Nykyisen käyttäjän tiedot talteen omaan nimiavaruuteensa. Avaimet siirretään yksi kerrallaan
  // (kopio ja heti perään alkuperäisen poisto), jotta tallennustila ei koskaan tarvitse kahta kopiota kaikesta.
  // prune: poistetaan nimiavaruudesta avaimet, joita käyttäjällä ei enää ole (ei peruutuksessa).
  function stash(id, prune = true) {
    const keys = userKeys();
    if (prune) { const live = new Set(keys.map((k) => NS + id + ":" + k)); for (const k of nsKeys(id)) if (!live.has(k)) ls.removeItem(k); }
    for (const k of keys) { ls.setItem(NS + id + ":" + k, ls.getItem(k)); ls.removeItem(k); }
  }
  function unstash(id) {
    for (const k of nsKeys(id)) { ls.setItem(k.slice((NS + id + ":").length), ls.getItem(k)); ls.removeItem(k); }
  }
  function switchTo(id) {
    const from = active();
    if (from === id) return;
    // Uusi tai tyhjä käyttäjä saa saman kielen kuin edellinen, ettei kirjautumisnäkymä vaihda kieltä
    let lang = null;
    try { lang = JSON.parse(ls.getItem("robolab-settings-v1"))?.language; } catch {}
    let stage = 0;
    try {
      stash(from); stage = 1;
      unstash(id); stage = 2;
      if (lang && !ls.getItem("robolab-settings-v1")) ls.setItem("robolab-settings-v1", JSON.stringify({ language: lang }));
      ls.setItem(ACTIVE, id);
    } catch (e) {
      // Peruutus: kohdekäyttäjän jo palautetut avaimet takaisin hänen nimiavaruuteensa ja lähtijän tiedot paikalleen.
      // Aktiivinen käyttäjä vaihtuu vain onnistuneessa siirrossa, joten kenenkään tietoja ei sekoiteta.
      try { if (stage >= 1) stash(id, false); unstash(from); } catch {}
      throw new Error("storage");
    }
  }

  function markSession(id, remember) {
    try { sessionStorage.setItem(SESSION, id); } catch {}
    if (remember && id !== GUEST) ls.setItem(REMEMBER, id); else ls.removeItem(REMEMBER);
  }

  /* Salasana: PBKDF2 (SHA-256) WebCryptolla. Suojaa vain saman koneen muilta käyttäjiltä, ei koneen ylläpitäjältä. */
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  // Vanhat salasanat on tiivistetty 150 000 kierroksella; uudet tallentavat kierrosmäärän tiliin
  const ITER_OLD = 150000, ITER = 310000;
  async function hash(password, salt, iterations = ITER_OLD) {
    const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
    return b64(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
  }
  async function setPassword(acc, password) {
    if (!password) { delete acc.salt; delete acc.hash; delete acc.iter; return; }
    const salt = crypto.getRandomValues(new Uint8Array(16));
    acc.salt = b64(salt);
    acc.iter = ITER;
    acc.hash = await hash(password, salt, ITER);
  }
  async function verify(acc, password) {
    if (!acc.hash) return true;
    return (await hash(password || "", unb64(acc.salt), acc.iter || ITER_OLD)) === acc.hash;
  }

  async function create({ name, password, avatar, remember = true }) {
    const l = list();
    const acc = { id: Math.random().toString(36).slice(2, 10), name: String(name).trim().slice(0, 40), avatar: avatar || "volt", created: Date.now(), bio: "" };
    await setPassword(acc, password);
    l.push(acc);
    saveList(l);
    // Vieraana tehty työ siirtyy uudelle tilille; toisen käyttäjän tiedot jäävät hänelle ja uusi tili alkaa tyhjästä
    if (active() === GUEST) {
      for (const k of nsKeys(acc.id)) ls.removeItem(k);
      ls.setItem(ACTIVE, acc.id);
    } else switchTo(acc.id);
    markSession(acc.id, remember);
    return acc;
  }

  async function login(id, password, remember) {
    const acc = get(id);
    // Pilvitilille kirjaudutaan Supabasen kautta (account-ui.js → Cloud), ei paikallisella salasanalla
    if (!acc || acc.cloud || !(await verify(acc, password))) return false;
    const switched = active() !== id;
    switchTo(id);
    markSession(id, remember);
    acc.lastLogin = Date.now();
    saveList(list().map((a) => (a.id === id ? acc : a)));
    return { switched };
  }

  function guest() {
    const switched = active() !== GUEST;
    switchTo(GUEST);
    markSession(GUEST, false);
    return { switched };
  }

  function logout() {
    switchTo(GUEST);
    ls.removeItem(REMEMBER);
    try { sessionStorage.removeItem(SESSION); } catch {}
  }

  function update(patch) {
    const id = active();
    saveList(list().map((a) => (a.id === id ? { ...a, ...patch } : a)));
  }

  // Tilin poisto poistaa myös sen tiedot; kirjautunut käyttäjä siirtyy vieraaksi
  function remove(id) {
    if (active() === id) { for (const k of userKeys()) ls.removeItem(k); unstash(GUEST); ls.setItem(ACTIVE, GUEST); ls.removeItem(REMEMBER); }
    for (const k of nsKeys(id)) ls.removeItem(k);
    saveList(list().filter((a) => a.id !== id));
  }

  /* Varmuuskopio: kaikki käyttäjän tiedot yhdessä JSON-tiedostossa, siirrettävissä toiselle koneelle */
  const BACKUP_FORMAT = "robolab-account";
  function exportData() {
    const acc = current();
    const data = {};
    for (const k of userKeys()) if (!NO_EXPORT.has(k)) data[k] = ls.getItem(k);
    return { format: BACKUP_FORMAT, version: 1, exported: new Date().toISOString(),
      profile: acc ? { name: acc.name, avatar: acc.avatar, bio: acc.bio || "", created: acc.created } : null, data };
  }
  // Tuodun tiedoston oma palkkiofunktion koodi ei saa käynnistyä itsestään: nn.js kysyy ensin luvan
  function distrustCode(json) {
    const s = JSON.parse(json);
    for (const p of Object.values(s.projects || {})) for (const k of ["nn2d", "nn3d"]) {
      const t = p?.tools?.[k];
      if (t && typeof t.taskCode === "string") t.taskCodeUntrusted = true;
    }
    return JSON.stringify(s);
  }
  function importData(obj, { trusted = false } = {}) {
    if (!obj || obj.format !== BACKUP_FORMAT || !obj.data || typeof obj.data !== "object") throw new Error("format");
    if (obj.version > 1) throw new Error("version");
    const entries = Object.entries(obj.data).filter(([k, v]) => isUserKey(k) && !NO_EXPORT.has(k) && typeof v === "string");
    // Pääavainten muoto tarkistetaan ennen kuin mitään poistetaan
    const data = Object.fromEntries(entries);
    try {
      if (data["robolab-projects-v1"] != null) {
        const p = JSON.parse(data["robolab-projects-v1"]);
        if (!p || typeof p.projects !== "object" || !Object.keys(p.projects).length) throw 0;
        if (!trusted) data["robolab-projects-v1"] = distrustCode(data["robolab-projects-v1"]);
      }
      if (data["robolab-library-v1"] != null) { const l = JSON.parse(data["robolab-library-v1"]); if (!l || typeof l !== "object" || Array.isArray(l)) throw 0; }
    } catch { throw new Error("format"); }
    // Vanhat tiedot muistiin: jos tallennustila loppuu kesken, ne palautetaan
    const old = userKeys().filter((k) => !NO_EXPORT.has(k)).map((k) => [k, ls.getItem(k)]);
    try {
      for (const [k] of old) ls.removeItem(k);
      for (const [k, v] of Object.entries(data)) ls.setItem(k, v);
    } catch {
      for (const k of userKeys()) if (!NO_EXPORT.has(k)) ls.removeItem(k);
      for (const [k, v] of old) try { ls.setItem(k, v); } catch {}
      throw new Error("storage");
    }
    const p = obj.profile;
    if (p && current()) update({ name: String(p.name || current().name).slice(0, 40), avatar: p.avatar || current().avatar, bio: String(p.bio || "").slice(0, 300) });
    return entries.length;
  }

  /* Pilvitili (cloud.js): paikallinen tili, joka on sidottu Supabase-käyttäjään. Salasanan tarkistaa Supabase.
     takeGuest: vieraana tehty työ siirtyy tilille (uusi pilvitili), muuten vaihdetaan tilin omiin tietoihin. */
  function cloudAccount({ uid, email, name }, { takeGuest = false } = {}) {
    const l = list();
    let acc = l.find((a) => a.cloudUid === uid);
    if (!acc) {
      acc = { id: "c" + Math.random().toString(36).slice(2, 9), name: String(name || email || "").trim().slice(0, 40) || "RoboLab", avatar: "volt", created: Date.now(), bio: "", cloud: true, cloudUid: uid, email };
      l.push(acc);
      saveList(l);
    } else if (email && acc.email !== email) saveList(l.map((a) => (a.id === acc.id ? { ...a, email } : a)));
    if (active() !== acc.id) {
      if (takeGuest && active() === GUEST) { for (const k of nsKeys(acc.id)) ls.removeItem(k); ls.setItem(ACTIVE, acc.id); }
      else switchTo(acc.id);
    }
    markSession(acc.id, true);
    return get(acc.id);
  }
  // Vaihto tilille ilman salasanaa (pilvitili, jonka istunto on jo voimassa)
  function useAccount(id) {
    const switched = active() !== id;
    switchTo(id);
    markSession(id, true);
    return { switched };
  }

  return { list, active, current, get, signedIn, create, login, guest, logout, update, remove, setPassword, verify, cloudAccount, useAccount,
    exportData, importData, needsLogin: () => list().length > 0 && !signedIn(), GUEST };
})();
