"use strict";

/* Pilvitili (Supabase): sama käyttäjä usealla laitteella.
   - Pilvitili on tavallinen paikallinen tili (accounts.js), jolla on lisäksi cloud: true ja cloudUid.
     Kun se on aktiivinen, sen tiedot ovat tavallisissa robolab-*-avaimissa kuten muillakin tileillä.
   - Synkronointi: kaikki käyttäjän avaimet (paitsi API-avain ja laitekohtaiset) yhtenä JSON-rivinä
     tauluun user_data (docs/supabase.sql). Rivitason suojaus: jokainen näkee vain oman rivinsä.
   - Kumpi muuttui? Laitteella muistetaan viimeksi synkronoidun pilviversion aika ja omien tietojen tiiviste
     (rlcloud-meta, laitekohtainen). Jos molemmat ovat muuttuneet, käyttäjä valitsee kumpi säilytetään.
   - Supabase-kirjasto ladataan vasta, kun pilvitiliä käytetään. */
const Cloud = (() => {
  const CFG = window.__robolabCloudOverride || window.ROBOLAB_CLOUD || {}; // override: automaattitestit
  const MOCK = window.__robolabSupabaseMock || null; // automaattitestit (tests-app.html)
  const configured = !!MOCK || !!(CFG.url && CFG.anonKey);
  const LIB = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.4/+esm";
  const TABLE = "user_data";
  const META = "rlcloud-meta";
  const AUTH_KEY = "rlcloud-auth"; // Supabasen istunto: laitekohtainen, ei kuulu kenenkään käyttäjän tietoihin
  // Laitekohtaiset avaimet eivät synkronoidu (viimeksi avattu sivu, versio jne.)
  const SKIP = new Set(["robolab-last", "robolab-recent", "robolab-version-seen", "robolab-lesson-size"]);
  const INTERVAL = 30000;

  let client = null, loading = null, running = null, timer = 0;
  const status = { state: configured ? "idle" : "off", at: null, error: "" };
  const listeners = new Set();
  const setStatus = (state, extra = {}) => {
    Object.assign(status, { state, error: "" }, extra);
    listeners.forEach((f) => { try { f(status); } catch {} });
  };

  async function lib() {
    if (MOCK) return MOCK;
    if (!configured) throw new Error("not-configured");
    if (client) return client;
    loading ||= import(LIB).then((m) => m.createClient(CFG.url, CFG.anonKey, {
      auth: { flowType: "pkce", persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: AUTH_KEY },
    }));
    try { client = await loading; } catch (e) { loading = null; throw new Error("network"); }
    return client;
  }

  /* ===== Apufunktiot ===== */
  const readMeta = () => { try { return JSON.parse(localStorage.getItem(META)) || {}; } catch { return {}; } };
  const metaOf = (uid) => readMeta()[uid] || {};
  const writeMeta = (uid, m) => { const all = readMeta(); all[uid] = { ...all[uid], ...m }; try { localStorage.setItem(META, JSON.stringify(all)); } catch {} };

  // Profiili (nimi, hahmo, esittely) kulkee mukana omana kenttänään, jotta se näkyy samana kaikilla laitteilla
  const PROFILE = "robolab-profile";
  function collect() {
    const data = Accounts.exportData().data;
    for (const k of SKIP) delete data[k];
    const a = Accounts.current();
    if (a) data[PROFILE] = JSON.stringify({ name: a.name, avatar: a.avatar, bio: a.bio || "" });
    return data;
  }
  // Tiiviste (FNV-1a) avainjärjestyksestä riippumatta
  function hash(data) {
    const s = JSON.stringify(Object.keys(data).sort().map((k) => [k, data[k]]));
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return (h >>> 0).toString(36) + ":" + s.length;
  }
  function apply(remote) {
    const keep = {};
    for (const k of SKIP) { const v = localStorage.getItem(k); if (v != null) keep[k] = v; }
    remote = { ...(remote || {}) };
    let prof = null;
    try { prof = JSON.parse(remote[PROFILE] || "null"); } catch {}
    delete remote[PROFILE];
    // Omat tiedot omalta tililtä: palkkiokoodia ei merkitä tuoduksi (sen on voinut kirjoittaa vain tilin omistaja)
    Accounts.importData({ format: "robolab-account", version: 1, data: remote || {} }, { trusted: true });
    for (const [k, v] of Object.entries(keep)) try { localStorage.setItem(k, v); } catch {}
    if (prof && typeof prof === "object") Accounts.update({
      name: String(prof.name || Accounts.current()?.name || "").slice(0, 40) || Accounts.current()?.name,
      avatar: CHARACTER_KEYS.includes(prof.avatar) ? prof.avatar : Accounts.current()?.avatar, bio: String(prof.bio || "").slice(0, 300) });
  }

  // Supabasen virheet käyttäjälle ymmärrettäviksi
  function friendly(err) {
    const m = String(err?.message || err || "");
    if (/invalid login credentials/i.test(m)) return tr("Väärä sähköposti tai salasana.", "Wrong email or password.");
    if (/email not confirmed/i.test(m)) return tr("Vahvista ensin sähköpostiosoitteesi sähköpostiin tulleesta linkistä.", "Confirm your email address first with the link in the email.");
    if (/already registered|already been registered/i.test(m)) return tr("Tällä sähköpostilla on jo pilvitili. Kirjaudu sisään.", "There is already a cloud account with this email. Sign in instead.");
    if (/password should be|at least \d+ characters|weak password/i.test(m)) return tr("Salasana on liian lyhyt tai heikko (vähintään 8 merkkiä).", "The password is too short or weak (at least 8 characters).");
    if (/rate limit|too many/i.test(m)) return tr("Liian monta yritystä. Odota hetki ja yritä uudelleen.", "Too many attempts. Wait a moment and try again.");
    if (/valid email|invalid email|unable to validate email/i.test(m)) return tr("Tarkista sähköpostiosoite.", "Check the email address.");
    if (/network|fetch|failed to load|load failed/i.test(m)) return tr("Ei yhteyttä pilveen. Tarkista nettiyhteys.", "Can't reach the cloud. Check your internet connection.");
    if (/not-configured/.test(m)) return tr("Pilvitiliä ei ole otettu käyttöön tässä RoboLabissa.", "Cloud accounts are not set up in this RoboLab.");
    return tr("Pilvitoiminto epäonnistui: ", "The cloud action failed: ") + m.slice(0, 160);
  }
  const fail = (err) => { throw new Error(friendly(err)); };

  async function session() {
    const c = await lib();
    const { data } = await c.auth.getSession();
    return data?.session || null;
  }

  /* ===== Kirjautuminen ===== */
  // Uusi pilvitili. Vieraana tehty työ siirtyy tilille, kuten paikallista tiliä luotaessa.
  async function signUp({ email, password, name }) {
    const c = await lib();
    const { data, error } = await c.auth.signUp({ email, password, options: { data: { name }, emailRedirectTo: location.origin + location.pathname } });
    if (error) fail(error);
    if (!data?.session) return { confirm: true }; // sähköpostivahvistus päällä: kirjaudutaan vahvistuksen jälkeen
    Accounts.cloudAccount({ uid: data.user.id, email, name }, { takeGuest: true });
    await push(data.user.id, collect());
    return { confirm: false };
  }

  // Kirjautuminen olemassa olevalle pilvitilille: pilven tiedot ladataan tälle laitteelle
  async function signIn({ email, password }) {
    const c = await lib();
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error) fail(error);
    const u = data.user;
    // Jos pilvessä ei vielä ole tietoja (tili vahvistettiin sähköpostilla), vieraana tehty työ siirtyy tilille kuten luonnissa
    const head = await c.from(TABLE).select("updated_at").eq("user_id", u.id).maybeSingle();
    const takeGuest = !head.error && !head.data && Accounts.active() === Accounts.GUEST;
    const acc = Accounts.cloudAccount({ uid: u.id, email: u.email || email, name: u.user_metadata?.name || String(email).split("@")[0] }, { takeGuest });
    // Ensimmäinen kirjautuminen tällä laitteella: paikalliset tiedot ovat tyhjät, joten pilven versio voittaa
    if (!takeGuest && !metaOf(u.id).hash) writeMeta(u.id, { remoteAt: null, hash: hash(collect()) });
    const r = await sync({ initial: true });
    return { account: acc, reload: true, result: r };
  }

  // Tallennettu istunto riittää vaihtamaan pilvitilille ilman salasanaa
  async function hasSession(uid) {
    try { const s = await session(); return !!s && s.user.id === uid; } catch { return false; }
  }

  async function signOut() {
    const acc = Accounts.current();
    if (acc?.cloud) { try { await sync(); } catch {} }
    try { const c = await lib(); await c.auth.signOut(); } catch {}
    Accounts.logout();
  }

  async function resetPassword(email) {
    const c = await lib();
    const { error } = await c.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    if (error) fail(error);
  }

  // Pilvitilin ja kaikkien pilvessä olevien tietojen poisto; tämän laitteen tiedot poistetaan myös
  async function deleteAccount() {
    const acc = Accounts.current();
    if (!acc?.cloud) return;
    const c = await lib();
    const s = await session();
    if (!s || s.user.id !== acc.cloudUid) fail(new Error(tr("Kirjaudu pilvitilille uudelleen ennen poistoa.", "Sign in to the cloud account again before deleting it.")));
    const { error } = await c.rpc("delete_my_account");
    if (error) fail(error);
    try { await c.auth.signOut(); } catch {}
    const all = readMeta(); delete all[acc.cloudUid]; try { localStorage.setItem(META, JSON.stringify(all)); } catch {}
    Accounts.remove(acc.id);
  }

  /* ===== Synkronointi ===== */
  async function push(uid, data, h = hash(data)) {
    const c = await lib();
    const { data: row, error } = await c.from(TABLE).upsert({ user_id: uid, data }).select("updated_at").single();
    if (error) fail(error);
    writeMeta(uid, { remoteAt: row.updated_at, hash: h });
    setStatus("ok", { at: new Date() });
  }

  // Palauttaa "ok", "pushed", "reload" (pilven uudempi versio otettiin käyttöön), "conflict" tai "signedout"
  async function sync({ initial = false } = {}) {
    if (running) return running;
    running = (async () => {
      const acc = Accounts.current();
      if (!configured || !acc?.cloud) return "none";
      const uid = acc.cloudUid;
      const s = await session().catch(() => null);
      if (!s || s.user.id !== uid) { setStatus("signedout"); return "signedout"; }
      setStatus("syncing");
      const c = await lib();
      const meta = metaOf(uid);
      const local = collect(), h = hash(local);
      const head = await c.from(TABLE).select("updated_at").eq("user_id", uid).maybeSingle();
      if (head.error) fail(head.error);
      const remoteAt = head.data?.updated_at || null;
      const remoteChanged = !!remoteAt && remoteAt !== meta.remoteAt;
      const localChanged = h !== meta.hash;
      if (!remoteAt) { await push(uid, local, h); return "pushed"; }
      if (remoteChanged && localChanged) {
        const full = await c.from(TABLE).select("data, updated_at").eq("user_id", uid).maybeSingle();
        if (full.error) fail(full.error);
        setStatus("conflict", { remote: full.data });
        return "conflict";
      }
      if (remoteChanged) {
        const full = await c.from(TABLE).select("data, updated_at").eq("user_id", uid).maybeSingle();
        if (full.error) fail(full.error);
        apply(full.data.data);
        writeMeta(uid, { remoteAt: full.data.updated_at, hash: hash(collect()) });
        setStatus("ok", { at: new Date() });
        return "reload";
      }
      if (localChanged) { await push(uid, local, h); return "pushed"; }
      setStatus("ok", { at: new Date() });
      return initial ? "ok" : "ok";
    })().catch((e) => { setStatus("error", { error: e.message }); throw e; })
      .finally(() => { running = null; });
    return running;
  }

  // Ristiriidan ratkaisu: "cloud" = pilven versio tälle laitteelle, "device" = tämän laitteen versio pilveen
  async function resolve(which) {
    const acc = Accounts.current();
    if (!acc?.cloud || status.state !== "conflict" || !status.remote) return;
    const uid = acc.cloudUid, remote = status.remote;
    if (which === "cloud") {
      apply(remote.data);
      writeMeta(uid, { remoteAt: remote.updated_at, hash: hash(collect()) });
      setStatus("ok", { at: new Date(), remote: null });
      return "reload";
    }
    writeMeta(uid, { remoteAt: remote.updated_at });
    await push(uid, collect());
    status.remote = null;
    return "pushed";
  }

  // Ristiriidassa kysytään käyttäjältä (vain kerran per tilanne)
  async function askConflict() {
    const keepCloud = confirm(tr("Pilvitililläsi on uudempia muutoksia toiselta laitteelta, ja myös tällä laitteella on tallentamattomia muutoksia.\n\nOK = käytä pilven versiota (tämän laitteen uudet muutokset korvataan)\nPeruuta = pidä tämän laitteen versio ja tallenna se pilveen",
      "Your cloud account has newer changes from another device, and this device also has unsynced changes.\n\nOK = use the cloud version (this device's new changes are replaced)\nCancel = keep this device's version and save it to the cloud"));
    const r = await resolve(keepCloud ? "cloud" : "device");
    if (r === "reload") location.reload();
  }

  async function tick(initial = false) {
    try {
      const r = await sync({ initial });
      if (r === "reload") { toast(tr("Ladattiin uudemmat tiedot pilvestä.", "Loaded newer data from the cloud.")); setTimeout(() => location.reload(), 600); }
      if (r === "conflict") askConflict();
    } catch {}
  }

  // Salasanan vaihto sähköpostilinkin kautta (PKCE: linkki avataan samalla laitteella)
  async function handleRecovery() {
    if (!/[?&]code=/.test(location.search)) return;
    try {
      const c = await lib();
      c.auth.onAuthStateChange(async (event) => {
        if (event !== "PASSWORD_RECOVERY") return;
        const pw = prompt(tr("Anna uusi salasana pilvitilillesi (vähintään 8 merkkiä):", "Enter a new password for your cloud account (at least 8 characters):"));
        if (!pw) return;
        const { error } = await c.auth.updateUser({ password: pw });
        toast(error ? friendly(error) : tr("Salasana vaihdettu. Kirjaudu sisään uudella salasanalla.", "Password changed. Sign in with the new password."));
      });
      await c.auth.getSession();
    } catch {}
    history.replaceState(null, "", location.pathname + location.hash);
  }

  function start() {
    if (!configured) return;
    handleRecovery();
    if (!Accounts.current()?.cloud || window.__robolabCloudNoAuto) return;
    setTimeout(() => tick(true), 1200);
    clearInterval(timer);
    timer = setInterval(() => tick(), INTERVAL);
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") sync().catch(() => {}); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else setTimeout(start);

  return {
    configured, status, signUp, signIn, signOut, hasSession, resetPassword, deleteAccount, sync, resolve, tick, friendly,
    onStatus: (f) => { listeners.add(f); return () => listeners.delete(f); },
    _hash: hash, _collect: collect, _meta: metaOf,
  };
})();
window.Cloud = Cloud;
