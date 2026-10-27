"use strict";

/* Tekoälyavustaja Volt. Kolme tilaa:
   - Ilmainen Volt: pieni kielimalli (WebLLM) ajetaan selaimessa WebGPU:lla. Malli ladataan kerran ja toimii sen jälkeen ilman nettiä.
   - Käyttäjän omalla Claude API -avaimella: Claude vastaa ja voi avata työkaluja ja asetuksia työkalukutsuilla.
   - Ilman WebGPU:ta tai mallin ollessa pois päältä: paikallinen opas (työkalujen haku + usein kysytyt kysymykset).
   Kirjastot ladataan vasta ensimmäisellä kysymyksellä, joten muu sovellus toimii ilman verkkoa. */
const Assistant = (() => {
  const SDK_URL = "https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.71.0/+esm";
  const WEBLLM_URL = "https://cdn.jsdelivr.net/npm/@mlc-ai/web-llm@0.2.82/+esm";
  const MAX_TOOL_ROUNDS = 5;

  let panel, list, input, sendBtn;
  let open = false, busy = false, stream = null, Anthropic = null;
  let history = [];   // API-keskustelu (sisältää myös työkalukutsut ja thinking-lohkot sellaisenaan)
  let localHistory = []; // ilmaisen Voltin keskustelu (pelkkää tekstiä)
  let rendered = [];  // näytettävät viestit { role, html }

  const hasKey = () => !!getAiKey();
  const modelName = () => (AI_MODELS.find(([id]) => id === settings.aiModel) || AI_MODELS[0])[1].split(" — ")[0];

  /* ===== Ilmainen Volt (WebLLM) ===== */
  const local = { lib: null, engine: null, loading: null, modelId: null, gpu: undefined, f16: false, soft: false, gpuName: "", pending: null, progress: 0, tps: 0, lastCtx: "", slowTold: false };
  const voltModel = () => VOLT_MODELS.find(([id]) => id === settings.voltModel && id !== "off");
  async function gpuInfo() {
    if (local.gpu !== undefined) return local.gpu;
    try {
      // Kannettavissa on usein kaksi näytönohjainta: pyydetään tehokkaampaa
      const a = navigator.gpu && await navigator.gpu.requestAdapter({ powerPreference: "high-performance" });
      // Ohjelmistollinen WebGPU (ei oikeaa näytönohjainta) on satoja kertoja liian hidas kielimallille
      local.soft = !!(a?.isFallbackAdapter || a?.info?.isFallbackAdapter);
      local.gpu = !!a && !local.soft;
      local.f16 = !!a?.features?.has("shader-f16");
      local.gpuName = [a?.info?.vendor, a?.info?.architecture, a?.info?.description].filter(Boolean).join(" ");
    } catch { local.gpu = false; }
    return local.gpu;
  }
  // Tila päätetään joka kysymyksellä: avain voitetaan aina, ilmainen malli vaatii WebGPU:n
  async function mode() {
    if (hasKey()) return "claude";
    if (voltModel() && await gpuInfo()) return "local";
    return "guide";
  }
  const localModelId = () => voltModel()[1] + (local.f16 ? "-q4f16_1-MLC" : "-q4f32_1-MLC");

  async function loadLocal() {
    const id = localModelId();
    if (local.engine && local.modelId === id) return local.engine;
    if (local.loading) return local.loading;
    local.loading = (async () => {
      local.lib ||= await import(WEBLLM_URL);
      if (local.engine) { try { await local.engine.unload(); } catch {} local.engine = null; }
      const idx = push("assistant", progressHtml(0, tr("Ladataan Voltin aivoja…", "Loading Volt's brain…")));
      try {
        const opts = { initProgressCallback: (r) => { local.progress = r.progress || 0; setMsg(idx, progressHtml(local.progress, r.text)); } };
        // Malli ajetaan taustasäikeessä, jotta muu sovellus ei jäädy vastauksen ajaksi
        let worker = null;
        try { worker = new Worker(new URL("volt-worker.js", document.baseURI), { type: "module" }); } catch {}
        local.engine = worker ? await local.lib.CreateWebWorkerMLCEngine(worker, id, opts) : await local.lib.CreateMLCEngine(id, opts);
        local.lastCtx = "";
        local.modelId = id;
        setMsg(idx, md(tr("**Valmista!** Voltin aivot ovat nyt tällä koneella ja toimivat ilman nettiä. Beep boop! 🤖", "**Done!** Volt's brain is now on this computer and works offline. Beep boop! 🤖")));
        return local.engine;
      } catch (err) {
        setMsg(idx, md("⚠ " + tr(`Mallin lataus epäonnistui: ${err?.message || err}. Volt käyttää paikallista opasta. Voit kokeilla kevyempää mallia asetuksista.`,
          `Loading the model failed: ${err?.message || err}. Volt uses the local guide instead. You can try a lighter model in settings.`))
          + `<div class="ai-chips"><button class="chip" data-settings="ai">${icon("gear")} ${tr("Tekoälyasetukset", "AI settings")}</button></div>`);
        throw err;
      } finally { local.loading = null; }
    })();
    return local.loading;
  }
  const progressHtml = (p, text) => `<div class="ai-progress"><div class="bar"><span style="width:${Math.round(p * 100)}%"></span></div><small>${esc(String(text || "").slice(0, 160))}</small></div>`;

  async function isCached() {
    try { local.lib ||= await import(WEBLLM_URL); return await local.lib.hasModelInCache(localModelId()); } catch { return false; }
  }

  // Ensimmäisellä kerralla kysytään lupa isoon lataukseen; kysymys odottaa ja vastataan latauksen jälkeen
  function offerDownload(text) {
    local.pending = text;
    const size = { "qwen0.5": "0,4", "qwen1.5": "1", "qwen3": "2" }[voltModel()[0]];
    push("assistant", md(tr(`Hei! Jotta voin vastata ilmaiseksi, lataan aivoni (noin ${size} Gt) tälle koneelle. Lataus tehdään vain kerran, ja sen jälkeen toimin myös ilman nettiä.`,
      `Hi! To answer for free I need to download my brain (about ${size.replace(",", ".")} GB) to this computer. It only happens once, and after that I also work offline.`))
      + `<div class="ai-chips"><button class="chip" data-local="download">${icon("download")} ${tr("Lataa Volt", "Download Volt")}</button><button class="chip" data-local="guide">${tr("Ei nyt — vastaa oppaalla", "Not now — answer from the guide")}</button></div>`);
  }

  async function prepareLocal() {
    if (busy) return;
    if (!voltModel()) { toast(tr("Ilmainen Volt on pois päältä asetuksissa", "Free Volt is turned off in settings")); return; }
    if (!(await gpuInfo())) { push("assistant", md(noGpuText())); return; }
    setBusy(true);
    try { await loadLocal(); } catch {} finally { setBusy(false); }
    updateMode();
    const q = local.pending;
    local.pending = null;
    if (q && local.engine) askLocal(q);
  }

  const noGpuText = () => local.soft
    ? tr("Selain ei löytänyt näytönohjainta (WebGPU toimii vain ohjelmallisesti), joten ilmainen malli olisi tällä koneella erittäin hidas. Vastaan paikallisella oppaalla. Päivitä näytönohjaimen ajurit tai kokeile toista selainta.",
      "The browser found no graphics card (WebGPU runs in software only), so the free model would be extremely slow on this computer. I'll answer from the local guide. Update your graphics drivers or try another browser.")
    : tr("Tämä selain ei tue WebGPU:ta, joten ilmainen malli ei toimi täällä. Käytä Chromea tai Edgeä — paikallinen opas toimii silti.", "This browser doesn't support WebGPU, so the free model can't run here. Use Chrome or Edge — the local guide still works.");

  // Järjestelmäkehote pysyy samana koko keskustelun ajan: silloin malli jatkaa edellisestä eikä lue kaikkea uudelleen
  const LOCAL_SYSTEM = `You are Volt, the friendly little robot assistant inside RoboLab, a robotics learning app. Answer in ${LANG === "en" ? "English" : "Finnish (suomeksi)"} unless the user writes in another language.
Be short, clear and correct: at most 100 words, simple words, a short list when it helps. If you are not sure, say so. Never invent features.
To open a tool for the user, write its marker on its own line, for example [[open:pid]]. Only use these ids:
${TOOLS.filter((t) => t.id !== "dashboard" && t.nav !== false).map((t) => `${t.id} = ${t.name}`).join("; ")}.`;
  const localSystem = () => LOCAL_SYSTEM;

  // Pienen mallin viestiin vain tarpeellinen: oppaan faktat aiheesta ja sivun tiedot vain, kun ne ovat muuttuneet
  function localMessage(text) {
    const words = text.toLowerCase();
    const notes = KB.filter((e) => e.k.some((k) => words.includes(k.trim()))).slice(0, 2).map((e) => "- " + tr(e.fi, e.en)).join("\n");
    const ctx = (Courses.context() + appContext()).slice(0, 1000);
    const newCtx = ctx && ctx !== local.lastCtx ? ctx : "";
    local.lastCtx = ctx;
    return (notes ? `Facts you can rely on:\n${notes}\n\n` : "") + newCtx + text;
  }

  async function askLocal(text) {
    setBusy(true);
    const idx = push("assistant", `<span class="ai-typing">${tr("Mietitään…", "Thinking…")}</span>`);
    let out = "", chips = "";
    const render = () => setMsg(idx, (out ? md(stripMarkers(out)) : `<span class="ai-typing">${tr("Mietitään…", "Thinking…")}</span>`) + chips);
    try {
      const engine = await loadLocal();
      localHistory.push({ role: "user", content: localMessage(text) });
      // Historia lyhennetään harvoin ja kerralla: jokainen lyhennys pakottaa mallin lukemaan keskustelun alusta
      if (localHistory.length > 10) localHistory = localHistory.slice(-3);
      const chunks = await engine.chat.completions.create({
        messages: [{ role: "system", content: LOCAL_SYSTEM }, ...localHistory], stream: true, temperature: 0.4, max_tokens: 350,
      });
      let frame = 0, n = 0, t1 = 0;
      for await (const c of chunks) {
        const d = c.choices[0]?.delta?.content || "";
        if (d) { if (!n) t1 = performance.now(); n++; }
        out += d;
        if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
      }
      const secs = (performance.now() - t1) / 1000;
      if (n > 8 && secs > 0) { local.tps = (n - 1) / secs; updateMode(); }
      localHistory.push({ role: "assistant", content: out });
      // Hidas kone: ehdotetaan kevyempää mallia (kerran)
      if (local.tps && local.tps < 4 && !local.slowTold) {
        local.slowTold = true;
        const light = voltModel()?.[0] === "qwen0.5";
        chips += `<div class="ai-note">${esc(light
          ? tr("Tämä kone on hidas kielimallille. Nopeampiin ja parempiin vastauksiin voit lisätä Claude API -avaimen asetuksista.", "This computer is slow for a language model. For faster and better answers you can add a Claude API key in settings.")
          : tr(`Vastaan hitaasti (noin ${wps()} sanaa sekunnissa). Kevyt malli on tällä koneella paljon nopeampi.`, `I'm answering slowly (about ${wps()} words per second). The light model is much faster on this computer.`))}</div>
          <div class="ai-chips">${light ? `<button class="chip" data-settings="ai">${icon("gear")} ${tr("Tekoälyasetukset", "AI settings")}</button>`
            : `<button class="chip" data-local="light">${tr("Vaihda kevyeen malliin (0,4 Gt)", "Switch to the light model (0.4 GB)")}</button>`}</div>`;
      }
      const ids = [...new Set([...out.matchAll(/\[\[open:([\w-]+)\]\]/g)].map((m) => m[1]).filter((id) => TOOLS.some((t) => t.id === id)))];
      if (ids.length) {
        chips = `<div class="ai-chips">${ids.map(toolChip).join("")}</div>`;
        if (NAV.test(text)) location.hash = "#/" + ids[0];
      }
    } catch (err) {
      if (!out) { rendered.splice(idx, 1); draw(); localAnswer(text); setBusy(false); return; }
      out += "\n\n⚠ " + String(err?.message || err);
    }
    render();
    setBusy(false);
  }
  const wps = () => (local.tps * 0.75).toFixed(1).replace(".", LANG === "en" ? "." : ","); // noin 0,75 sanaa per token
  async function switchLight() {
    set("voltModel", "qwen0.5");
    local.slowTold = false;
    local.tps = 0;
    localHistory = [];
    setBusy(true);
    try { await loadLocal(); } catch {} finally { setBusy(false); }
    updateMode();
  }
  // Valmiiksi ladattu malli käynnistetään taustalla heti, kun paneeli avataan
  async function preload() {
    if (local.engine || local.loading || busy) return;
    if ((await mode()) !== "local" || !(await isCached())) return;
    setBusy(true);
    try { await loadLocal(); } catch {} finally { setBusy(false); }
    updateMode();
  }
  const stripMarkers = (s) => s.replace(/\[\[open:[\w-]*\]\]/g, "").replace(/\[\[[^\]]*$/, "").trim();

  /* ===== Paneeli ===== */
  function build() {
    $("#ai-fab").innerHTML = `${Robots.svg("volt", "idle", { size: 34 })}<span>Volt</span>`;
    $("#ai-fab").title = tr("Volt, tekoälyavustajasi (Ctrl+I)", "Volt, your AI assistant (Ctrl+I)");
    $("#ai-fab").onclick = toggle;
    panel = $("#ai-panel");
    panel.innerHTML = `
      <div class="ai-head">
        <div class="ai-title"><span class="ai-avatar" id="ai-avatar">${Robots.svg("volt", "happy", { size: 40 })}</span>
          <div><b id="ai-title">Volt</b><small id="ai-mode"></small></div></div>
        <div class="ai-actions">
          <button class="icon-btn" id="ai-clear" title="${tr("Uusi keskustelu", "New conversation")}" aria-label="${tr("Uusi keskustelu", "New conversation")}">${icon("rotate")}</button>
          <button class="icon-btn" id="ai-close" title="${tr("Sulje (Esc)", "Close (Esc)")}" aria-label="${tr("Sulje", "Close")}"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
        </div>
      </div>
      <div class="ai-list" id="ai-list" aria-live="polite"></div>
      <form class="ai-form" id="ai-form">
        <textarea id="ai-input" rows="2" placeholder="${tr("Kysy robotiikasta tai kirjoita, mitä haluat tehdä…", "Ask about robotics or say what you want to do…")}"></textarea>
        <button class="btn primary" id="ai-send" type="submit">${tr("Lähetä", "Send")}</button>
      </form>
      <p class="ai-foot">${tr("Enter lähettää · Shift+Enter rivinvaihto · Ctrl+I avaa ja sulkee", "Enter sends · Shift+Enter new line · Ctrl+I opens and closes")}</p>`;
    list = $("#ai-list"); input = $("#ai-input"); sendBtn = $("#ai-send");
    $("#ai-close").onclick = close;
    $("#ai-clear").onclick = () => { if (busy) stop(); history = []; localHistory = []; local.lastCtx = ""; rendered = []; draw(); };
    $("#ai-form").onsubmit = (e) => { e.preventDefault(); busy ? stop() : send(input.value); };
    input.onkeydown = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); if (!busy) send(input.value); } };
    list.addEventListener("click", onListClick);
  }

  function updateMode() {
    const el = $("#ai-mode");
    if (hasKey()) { el.textContent = modelName(); return; }
    el.textContent = voltModel() ? (local.engine ? tr("Ilmainen Volt · toimii koneellasi", "Free Volt · runs on your computer") + (local.tps ? ` · ${wps()} ${tr("sanaa/s", "words/s")}` : "") : tr("Ilmainen Volt", "Free Volt")) : tr("Paikallinen opas", "Local guide");
    mode().then((m) => { if (m === "guide" && voltModel()) el.textContent = local.soft ? tr("Paikallinen opas (ei näytönohjainta)", "Local guide (no graphics card found)") : tr("Paikallinen opas (selain ei tue WebGPU:ta)", "Local guide (browser has no WebGPU)"); });
  }

  function show() { open = true; panel.hidden = false; document.body.classList.add("ai-open"); updateMode(); draw(); setTimeout(() => input.focus(), 30); preload(); }
  function close() { if (!open) return; open = false; panel.hidden = true; document.body.classList.remove("ai-open"); }
  function toggle() { open ? close() : show(); }

  /* ===== Viestien piirto ===== */
  function draw() {
    if (!rendered.length) {
      const smart = hasKey() || !!voltModel();
      const sugg = smart
        ? [tr("Miten viritän PID-säätimen?", "How do I tune a PID controller?"), tr("Miksi robottini törmää mutkissa?", "Why does my robot hit walls in corners?"), tr("Selitä kvaterniot yksinkertaisesti", "Explain quaternions simply")]
        : [tr("Avaa reittisuunnittelu", "Open path planning"), tr("Miten PID viritetään?", "How do I tune PID?"), tr("Mikä on kardaanilukko?", "What is gimbal lock?")];
      list.innerHTML = `<div class="ai-empty">
        <div class="ai-hello">${Robots.svg("volt", "wink", { size: 88 })}</div>
        <p><b>${tr("Hei, olen Volt!", "Hi, I'm Volt!")}</b> ${smart
          ? tr("Kysy mitä tahansa robotiikasta tai pyydä minua avaamaan työkalu. Olen ilmainen ja kaikkien käytössä.", "Ask me anything about robotics or ask me to open a tool. I'm free for everyone.")
          : tr("Autan löytämään työkalut ja vastaan yleisimpiin robotiikkakysymyksiin.", "I help you find tools and answer common robotics questions.")}</p>
        <div class="ai-chips">${sugg.map((s) => `<button class="chip" data-ask="${esc(s)}">${esc(s)}</button>`).join("")}</div>
        <button class="link-btn" data-settings="ai">${tr("Tekoälyasetukset", "AI settings")}</button>
      </div>`;
      return;
    }
    list.innerHTML = rendered.map(msgHtml).join("");
    list.scrollTop = list.scrollHeight;
  }

  // Voltin vastaukset näytetään hänen kasvojensa vieressä; miettiessä Volt näyttää mietteliäältä
  const voltFace = (html) => Robots.svg("volt", html.includes("ai-typing") ? "think" : "idle", { size: 32 });
  const msgHtml = (m) => (m.role === "assistant"
    ? `<div class="ai-row"><span class="ai-face">${voltFace(m.html)}</span><div class="ai-msg assistant">${m.html}</div></div>`
    : `<div class="ai-msg ${m.role}">${m.html}</div>`);

  function onListClick(e) {
    const ask = e.target.closest("[data-ask]");
    if (ask) { send(ask.dataset.ask); return; }
    const loc = e.target.closest("[data-local]");
    if (loc) {
      loc.closest(".ai-chips")?.remove();
      if (loc.dataset.local === "download") prepareLocal();
      else if (loc.dataset.local === "light") switchLight();
      else { const q = local.pending; local.pending = null; if (q) localAnswer(q); }
      return;
    }
    const openT = e.target.closest("[data-open]");
    if (openT) { location.hash = "#/" + openT.dataset.open; return; }
    const sec = e.target.closest("[data-settings]");
    if (sec) openSettingsSection(sec.dataset.settings);
  }

  // Kevyt markdown: teksti escapetaan ensin, sitten sallitaan koodilohkot, `koodi`, **lihavointi**, otsikot ja listat
  function md(src) {
    const blocks = [];
    let s = esc(src).replace(/```[\w-]*\n?([\s\S]*?)```/g, (_, code) => `\u0000${blocks.push(`<pre><code>${code.replace(/\n$/, "")}</code></pre>`) - 1}\u0000`);
    s = s.replace(/`([^`\n]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
      .replace(/(^|[\s(])[*_]([^*_\n]+)[*_](?=$|[\s).,!?:;])/gm, "$1<i>$2</i>")
      .replace(/^#{1,4} (.+)$/gm, "<h4>$1</h4>")
      .replace(/^(?:[-*] .+(?:\n|$))+/gm, (m) => `<ul>${m.trim().split("\n").map((l) => `<li>${l.replace(/^[-*] /, "")}</li>`).join("")}</ul>`)
      .replace(/^(?:\d+\. .+(?:\n|$))+/gm, (m) => `<ol>${m.trim().split("\n").map((l) => `<li>${l.replace(/^\d+\. /, "")}</li>`).join("")}</ol>`)
      .replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>");
    s = `<p>${s}</p>`.replace(/<p>(<(?:ul|ol|h4|pre)[\s\S]*?<\/(?:ul|ol|h4|pre)>)<\/p>/g, "$1");
    return s.replace(/\u0000(\d+)\u0000/g, (_, i) => blocks[+i]);
  }

  const toolChip = (id) => {
    const t = TOOLS.find((x) => x.id === id);
    return t ? `<button class="chip" data-open="${t.id}">${icon(t.icon)} ${esc(t.name)}</button>` : "";
  };

  function push(role, html) { rendered.push({ role, html }); draw(); return rendered.length - 1; }
  function setMsg(i, html) {
    const wasTyping = rendered[i].html.includes("ai-typing");
    rendered[i].html = html;
    const el = list.children[i];
    if (!el) draw();
    else if (rendered[i].role !== "assistant") el.innerHTML = html;
    else {
      el.querySelector(".ai-msg").innerHTML = html;
      if (wasTyping !== html.includes("ai-typing")) el.querySelector(".ai-face").innerHTML = voltFace(html);
    }
    list.scrollTop = list.scrollHeight;
  }

  function setBusy(b) {
    busy = b;
    sendBtn.textContent = b ? tr("Pysäytä", "Stop") : tr("Lähetä", "Send");
    sendBtn.classList.toggle("danger", b);
  }

  /* ===== Lähetys ===== */
  function send(text) {
    text = text.trim();
    if (!text) return;
    input.value = "";
    push("user", md(text));
    route(text);
  }
  async function route(text) {
    const m = await mode();
    if (m === "claude") askClaude(text);
    else if (m === "local") {
      if (local.engine || local.loading || await isCached()) askLocal(text);
      else offerDownload(text);
    } else localAnswer(text);
  }

  /* ===== Paikallinen opas (ilman API-avainta) ===== */
  const KB = [
    { k: ["pid", "kp", "ki", "kd", "säädin", "controller", "viritä", "tune", "tuning", "ylitys", "overshoot"], tools: ["pid"],
      fi: "**PID-virityksen perusjärjestys:** aloita Ki = Kd = 0. Nosta **Kp**:tä, kunnes vaste on nopea mutta heilahtelee hieman. Lisää **Kd**, kunnes heilahtelu vaimenee. Lisää lopuksi pieni **Ki**, joka poistaa pysyvän virheen. Liian suuri Ki aiheuttaa ylitystä ja hidasta heiluntaa.",
      en: "**Basic PID tuning order:** start with Ki = Kd = 0. Raise **Kp** until the response is fast but oscillates slightly. Add **Kd** until the oscillation dies down. Finally add a small **Ki** to remove the steady-state error. Too much Ki causes overshoot and slow oscillation." },
    { k: ["kardaani", "gimbal", "euler", "kvaterni", "quaternion", "rotaatio", "rotation"], tools: ["rot"],
      fi: "**Kardaanilukko** syntyy Euler-kulmissa, kun keskimmäinen kierto on ±90° (esim. pitch): ensimmäinen ja kolmas akseli osoittavat samaan suuntaan, jolloin yksi vapausaste katoaa. **Kvaterniot** (4 lukua) esittävät minkä tahansa asennon ilman tätä ongelmaa, ja niitä on helppo interpoloida — siksi ROS ja useimmat robotit käyttävät niitä sisäisesti.",
      en: "**Gimbal lock** happens with Euler angles when the middle rotation is ±90° (e.g. pitch): the first and third axes line up and one degree of freedom is lost. **Quaternions** (4 numbers) represent any orientation without this problem and interpolate smoothly — which is why ROS and most robots use them internally." },
    { k: ["dh", "denavit", "hartenberg"], tools: ["dh", "fk"],
      fi: "**DH-parametrit** kuvaavat robottikäsivarren jokaisen nivelen neljällä luvulla: θ (kierto z:n ympäri), d (siirto z:aa pitkin), a (linkin pituus x:ää pitkin) ja α (kierre x:n ympäri). Kertomalla nivelten muunnosmatriisit saadaan työkalun asento — eli eteenpäin kinematiikka.",
      en: "**DH parameters** describe each joint of a robot arm with four numbers: θ (rotation about z), d (offset along z), a (link length along x) and α (twist about x). Multiplying the joint transforms gives the tool pose — i.e. forward kinematics." },
    { k: ["käänteis", "inverse", "ik", "singular", "ulottuma", "reach"], tools: ["ik"],
      fi: "**Käänteiskinematiikka** ratkaisee nivelkulmat, joilla työkalu päätyy haluttuun kohtaan. 2-niveliselle käsivarrelle on tarkka kaava (kaksi ratkaisua: kyynärpää ylös/alas), monimutkaisemmille käytetään iteratiivisia menetelmiä. **Singulariteetissa** (käsivarsi suorana tai taitettuna) pieni liike kohteessa vaatii valtavia nivelliikkeitä.",
      en: "**Inverse kinematics** solves the joint angles that put the tool at a desired point. A 2-joint arm has an exact formula (two solutions: elbow up/down); more complex arms use iterative methods. At a **singularity** (arm fully stretched or folded) a small target motion needs huge joint motions." },
    { k: ["a*", "astar", "dijkstra", "rrt", "reitti", "path", "planning", "suunnittelu"], tools: ["path"],
      fi: "**A*** löytää lyhimmän reitin ruudukossa ja on yleensä paras valinta. **Dijkstra** löytää saman reitin, mutta tutkii enemmän. **RRT** sopii suuriin ja jatkuviin tiloihin (esim. robottikäsivarret), mutta sen reitti ei ole lyhin — **RRT*** parantaa reittiä ajan kanssa.",
      en: "**A*** finds the shortest path on a grid and is usually the best choice. **Dijkstra** finds the same path but explores more. **RRT** suits large continuous spaces (e.g. robot arms) but its path isn't shortest — **RRT*** improves it over time." },
    { k: ["odometr", "drift", "enkooder", "encoder", "luisto", "slip"], tools: ["sim2d"],
      fi: "**Odometria** arvioi robotin sijainnin pyörien kierroksista. Virhe kasvaa koko ajan pyörien luiston ja mittaustarkkuuden takia, joten pitkillä matkoilla tarvitaan lisäksi muita antureita (esim. lidar, IMU) ja paikannusta.",
      en: "**Odometry** estimates the robot's position from wheel rotations. The error keeps growing because of wheel slip and limited resolution, so long runs need other sensors too (e.g. lidar, IMU) plus localisation." },
    { k: ["varauskartta", "occupancy", "lidar", "slam", "kartoit", "mapping"], tools: ["map"],
      fi: "**Varauskartta** jakaa ympäristön soluihin, joilla on todennäköisyys olla este. Lidarin säteen läpäisemät solut merkitään vapaiksi ja osumakohdat esteiksi. Jokainen mittaus lisää varmuutta (log-odds), joten kohinainenkin data tuottaa selkeän kartan.",
      en: "An **occupancy grid** splits the world into cells, each with a probability of being occupied. Cells a lidar beam passes through are marked free and hit points occupied. Each scan adds confidence (log-odds), so even noisy data yields a clear map." },
    { k: ["moottori", "motor", "jumi", "stall", "momentti", "torque", "vääntö", "rpm", "välitys", "gear"], tools: ["motor"],
      fi: "Moottorin **jumimomentti** on suurin momentti, kun akseli ei pyöri — moottori ei kestä sitä jatkuvasti. Nyrkkisääntö: jatkuva kuorma enintään **~30 % jumimomentista**. Välityssuhde kasvattaa momenttia ja pienentää nopeutta samassa suhteessa.",
      en: "A motor's **stall torque** is its maximum torque with the shaft stopped — it can't sustain it. Rule of thumb: keep the continuous load below **~30 % of stall torque**. A gear ratio multiplies torque and divides speed by the same factor." },
    { k: ["akku", "battery", "lipo", "virta", "current", "säädin", "regulator", "mah", "käyttöaika", "runtime"], tools: ["power"],
      fi: "**Käyttöaika** ≈ käytettävä kapasiteetti (Ah) / keskivirta (A). Akun **C-luku** kertoo suurimman virran: 2200 mAh × 25C = 55 A. Lineaarisäädin hukkaa (Vin − Vout) × I lämmöksi, joten suurilla virroilla kannattaa käyttää hakkuria (buck). Tarkista aina raja-arvot datasheeteistä.",
      en: "**Runtime** ≈ usable capacity (Ah) / average current (A). A battery's **C rating** gives its max current: 2200 mAh × 25C = 55 A. A linear regulator wastes (Vin − Vout) × I as heat, so use a switching (buck) regulator for high currents. Always check limits in the datasheets." },
    { k: ["trajekt", "trajectory", "trapetsi", "trapezoid", "s-käyrä", "s-curve", "jerk", "nykäys", "liikerata"], tools: ["traj"],
      fi: "**Trapetsiprofiili** on nopein annetuilla nopeus- ja kiihtyvyysrajoilla, mutta kiihtyvyys muuttuu hyppäyksellisesti (nykäys). **S-käyrä** rajoittaa myös nykäystä, jolloin liike on pehmeämpi ja tärinää on vähemmän — siksi sitä käytetään CNC-koneissa ja teollisuusroboteissa.",
      en: "A **trapezoidal profile** is the fastest for given velocity and acceleration limits, but acceleration jumps (jerk). An **S-curve** also limits jerk, giving smoother motion with less vibration — which is why CNC machines and industrial robots use it." },
    { k: ["sarja", "serial", "arduino", "esp32", "baud", "uart"], tools: ["serial"],
      fi: "Tulosta mikrokontrollerista yksi rivi kerrallaan muodossa `nimi:arvo, nimi2:arvo2`, niin Sarjaportti-työkalu piirtää jokaisen nimen omaksi käyräkseen. Valitse sama baudinopeus kuin koodissa (esim. `Serial.begin(115200)`). Yhteys toimii Chromessa ja Edgessä.",
      en: "Print one line at a time from the microcontroller as `name:value, name2:value2` and the Serial port tool plots each name as its own curve. Pick the same baud rate as in your code (e.g. `Serial.begin(115200)`). Works in Chrome and Edge." },
    { k: ["neuro", "neural", "verkko", "network", "evoluut", "evolution", "geneet", "genetic", "koulut", "train", "palkki", "reward", "populaat", "aivot", "brain", "oppi"], tools: ["nn2d", "nn3d"],
      fi: "**Neuroverkkosimulaatiossa** robotin aivot ovat pieni neuroverkko: sisään tulevat anturit (kulmat, nopeudet, maakosketus, lidar), ulos moottorikomennot. Verkkoa ei opeteta esimerkeillä vaan **evoluutiolla**: populaatio robotteja kokeilee hieman erilaisia painoja, ja paremmin **palkkiofunktion** mukaan pärjänneiden suuntaan siirrytään. Aloita pyöräautosta (oppii alle minuutissa); kävelijät tarvitsevat satoja sukupolvia. Jos oppiminen jumittuu, nosta mutaatiota σ tai paranna palkkiofunktiota — palkitse haluttua käytöstä pienin askelin joka hetki.",
      en: "In the **neural network simulation** the robot's brain is a small neural network: sensors go in (angles, speeds, ground contact, lidar), motor commands come out. It is not taught with examples but by **evolution**: a population of robots tries slightly different weights and moves toward those that scored better on the **reward function**. Start with the car (learns in under a minute); walkers need hundreds of generations. If learning stalls, raise the mutation σ or improve the reward — reward the wanted behaviour in small steps every moment." },
    { k: ["rakenta", "builder", "nivel", "joint", "servo", "pyörä", "wheel", "jalka", "leg"], tools: ["build2d", "build3d"],
      fi: "**Robottirakentajassa** robotti tehdään osista (laatikko, pallo, sylinteri, kapseli) ja nivelistä. **Servo**-nivel kääntyy rajojen välillä (jalat), **pyörä** pyörii ympäri. Valitse kaksi osaa Shift+klikkauksella ja paina J yhdistääksesi ne, peilaa M:llä. Testaa fysiikka ja lähetä robotti koulutukseen napilla *Kouluta simulaatiossa*.",
      en: "In the **robot builder** a robot is made of parts (box, sphere, cylinder, capsule) and joints. A **servo** joint turns between limits (legs), a **wheel** spins all the way round. Select two parts with Shift+click and press J to join them, mirror with M. Test the physics and send the robot to training with *Train in simulation*." },
    { k: ["arduino", "esp32", "pico", "micropython", "mikrokontrolle", "microcontroller", "chip", "siru", "oikea robotti", "real robot", "vie robotille", "deploy"], tools: ["nn2d", "nn3d"],
      fi: "Koulutetut aivot saa omalle robotille simulaation napista **Vie omalle robotille**: Arduino-luonnos (.ino), C/C++-otsake (ESP32, STM32, Pico SDK), MicroPython/Python tai JSON. Täytä koodin TODO-kohdat antureilla ja moottoreilla dialogin taulukon mukaan ja aja aivot 60 kertaa sekunnissa. Itsetesti sarjamonitorissa kertoo, laskeeko laite verkon kuten simulaatio. Oikean robotin pitää vastata mallia (moottorit samassa järjestyksessä), ja siirtymä simulaatiosta todellisuuteen onnistuu parhaiten, kun mitat ja moottorien nopeudet täsmäävät.",
      en: "Get a trained brain onto a real robot with the simulation's **Put on a real robot** button: an Arduino sketch (.ino), a C/C++ header (ESP32, STM32, Pico SDK), MicroPython/Python or JSON. Fill the TODO lines with your sensors and motors following the dialog's table and run the brain 60 times per second. The self-test in the serial monitor tells whether the device computes the network like the simulation. The real robot must match the model (motors in the same order), and sim-to-real works best when sizes and motor speeds match." },
    { k: ["konenäkö", "vision", "kamera", "camera", "opencv", "kynnys", "threshold", "pikseli", "pixel", "hsv", "sobel", "viivanseuraaja", "line follow"], tools: ["cv"],
      fi: "**Konenäkö** muuttaa kamerakuvan tiedoksi: kuva muutetaan harmaasävyksi tai HSV-väreiksi, kohde erotetaan **kynnystyksellä** tai **värillä**, ja kohteen **keskipisteestä** saadaan ohjaus (vasemmalla → käänny vasemmalle). Reunat löytyvät Sobel-suotimella. Konenäkö-työkalu näyttää jokaisen vaiheen ja antaa valmiin OpenCV-koodin.",
      en: "**Computer vision** turns a camera image into information: the image is converted to grayscale or HSV colours, the object is separated with a **threshold** or by **colour**, and the object's **centroid** gives the steering (on the left → turn left). Edges are found with a Sobel filter. The Computer vision tool shows every stage and gives ready OpenCV code." },
    { k: ["urdf", "tf", "kehys", "frame", "ros", "muunnos", "transform"], tools: ["sim3d"],
      fi: "**TF-puu** kuvaa robotin koordinaatistot (esim. base_link → lidar_link) ja niiden väliset siirrot ja kierrot. **URDF** on ROS:n XML-muoto, jossa robotti kuvataan linkkeinä ja niveliä. TF-puu ja URDF -työkalussa voit rakentaa TF-puun ja ladata oman URDF-tiedostosi.",
      en: "A **TF tree** describes a robot's coordinate frames (e.g. base_link → lidar_link) and the translations and rotations between them. **URDF** is ROS's XML format describing a robot as links and joints. In the TF tree & URDF tool you can build a TF tree and load your own URDF file." },
  ];
  // Navigointisanat: tunnistetaan "avaa X" -tyyppiset pyynnöt
  const NAV = /\b(avaa|mene|siirry|näytä|open|go to|show|take me)\b/i;
  const SETTING_WORDS = [
    [["teema", "theme", "tumma", "dark", "vaalea", "light", "väri", "colour", "color"], "appearance"],
    [["kieli", "language", "english", "suomi"], "appearance"],
    [["yksikkö", "yksiköt", "unit", "tuuma", "inch", "millimetri", "radiaan", "radian", "desimaal", "decimal"], "units"],
    [["api", "avain", "key", "claude", "tekoäly", " ai"], "ai"],
    [["pikanäppäin", "shortcut", "ctrl"], "shortcuts"],
    [["simulaatio", "aika-askel", "timestep", "integraat", "integrator", "siemen", "seed"], "sim"],
  ];

  // Yleissanat eivät saa ohjata hakua (esim. "miten" esiintyy monen työkalun kuvauksessa)
  const STOP = new Set(["miten", "mikä", "mitä", "mitkä", "kuinka", "miksi", "voin", "voinko", "haluan", "avaa", "näytä", "mene", "siirry",
    "tämä", "joka", "kanssa", "ilman", "olla", "minun", "sinun", "what", "which", "where", "when", "does", "with", "show", "open",
    "want", "need", "this", "that", "from", "about", "have", "make", "into", "your", "take"]);

  function localAnswer(q) {
    const words = q.toLowerCase().split(/[^\p{L}\p{N}*-]+/u).filter(Boolean);
    const content = words.filter((w) => w.length > 3 && !STOP.has(w));
    // Lyhyet avainsanat (pid, dh, tf, ik…) vaativat kokonaisen sanan, pidemmät riittää sanan alkuna
    const hit = (k) => k.trim().length <= 3 ? words.includes(k.trim()) : words.some((w) => w.startsWith(k.trim()));
    // Työkalut: nimen sana painaa enemmän kuin kuvauksen sana
    const toolScore = TOOLS.filter((t) => t.id !== "dashboard").map((t) => {
      const name = t.name.toLowerCase(), desc = t.desc.toLowerCase();
      const sc = content.reduce((a, w) => a + (name.includes(w.slice(0, 6)) ? 3 : w.length >= 5 && desc.includes(w.slice(0, 6)) ? 1 : 0), 0);
      return [t.id, sc];
    }).filter(([, sc]) => sc > 0).sort((a, b) => b[1] - a[1]);
    const kb = KB.map((e) => [e, e.k.reduce((a, k) => a + (hit(k) ? 1 : 0), 0)]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
    const sett = SETTING_WORDS.filter(([ks]) => ks.some(hit)).map(([, id]) => id);

    const parts = [];
    const tools = new Set();
    if (NAV.test(q) && toolScore.length) {
      const id = toolScore[0][0];
      location.hash = "#/" + id;
      parts.push(md(tr(`Avasin työkalun **${TOOLS.find((t) => t.id === id).name}**.`, `Opened **${TOOLS.find((t) => t.id === id).name}**.`)));
    } else if (kb.length) {
      const [e] = kb[0];
      parts.push(md(tr(e.fi, e.en)));
      e.tools.forEach((id) => tools.add(id));
    }
    toolScore.slice(0, 3).forEach(([id]) => tools.add(id));
    if (sett.length && !kb.length) {
      const sec = SECTIONS.find((x) => x.id === sett[0]);
      parts.push(md(tr(`Tämä löytyy asetuksista kohdasta **${sec.title}**.`, `You'll find this in settings under **${sec.title}**.`))
        + `<div class="ai-chips"><button class="chip" data-settings="${sec.id}">${icon("gear")} ${esc(sec.title)}</button></div>`);
    }
    if (!parts.length && !tools.size) {
      parts.push(md(tr("En löytänyt vastausta paikallisesta oppaasta. Kokeile hakusanoja kuten *PID*, *akku*, *reitti* tai *kvaternio* — tai lisää Claude API -avain, niin vastaan mihin tahansa kysymykseen.",
        "I couldn't find an answer in the local guide. Try keywords like *PID*, *battery*, *path* or *quaternion* — or add a Claude API key and I can answer any question.")));
      parts.push(`<div class="ai-chips"><button class="chip" data-settings="ai">${icon("gear")} ${tr("Lisää API-avain", "Add API key")}</button></div>`);
    }
    if (tools.size) parts.push(`<div class="ai-chips">${[...tools].map(toolChip).join("")}</div>`);
    push("assistant", parts.join(""));
  }

  /* ===== Claude ===== */
  const TOOL_IDS = TOOLS.map((t) => t.id);
  const COURSE_IDS = Courses._courses.map((c) => c.id);
  const API_TOOLS = () => [
    {
      name: "open_tool",
      description: "Navigate the RoboLab app to one of its tools. Use when the user asks to open, show or go to a tool, or when a tool would clearly help them with their question.",
      eager_input_streaming: true,
      strict: true,
      input_schema: { type: "object", properties: { tool_id: { type: "string", enum: TOOL_IDS } }, required: ["tool_id"], additionalProperties: false },
    },
    {
      name: "start_course",
      description: "Start or resume one of RoboLab's guided courses. Use when the user wants to learn a topic step by step that a course covers.",
      eager_input_streaming: true,
      strict: true,
      input_schema: { type: "object", properties: { course_id: { type: "string", enum: COURSE_IDS } }, required: ["course_id"], additionalProperties: false },
    },
    {
      name: "open_settings",
      description: "Open the RoboLab settings page at a section (appearance = language/theme/colours, units, frames = rotation conventions, sim, viz, ai, a11y, shortcuts, data).",
      eager_input_streaming: true,
      strict: true,
      input_schema: { type: "object", properties: { section: { type: "string", enum: SECTIONS.map((s) => s.id) } }, required: ["section"], additionalProperties: false },
    },
  ];

  // Vakaa järjestelmäkehote (välimuistiystävällinen): muuttuvat tiedot lähetetään käyttäjän viestissä
  const SYSTEM = `You are Volt, RoboLab's own robot and built-in assistant. RoboLab is a browser app with robotics tools for both beginners and professionals.

Your character: a friendly, curious little base robot with a screen face and an antenna. You are warm and encouraging, a little playful (an occasional "beep boop" or robot joke is fine, but never more than one per reply), and you never let personality get in the way of a clear answer. Speak in the first person as Volt. You guide the "Start here" and "Power and batteries" courses yourself. Your robot friends guide the others: Grip (robot arm, arm and ROS courses), Wobbly (self-balancing robot, PID and sensors courses), Dusty (robot vacuum, navigation course), Zippy (drone, frames and computer vision courses) and Neura (four-legged learning robot, robot AI course). You may mention them when it fits, but you are the one answering.

Your two jobs:
1. Help users find their way around the app: when they want to open something, call open_tool or open_settings instead of describing where it is.
2. Help with robotics problems: kinematics, control, motion planning, mobile robots, sensors, motors, batteries and electronics, ROS concepts, and debugging the user's own setup.

The app's tools (id — name: description):
${TOOLS.map((t) => `- ${t.id} — ${t.name}: ${t.desc}`).join("\n")}

Settings sections: ${SECTIONS.map((s) => `${s.id} (${s.title})`).join(", ")}.
Guided courses (start with start_course): ${Courses._courses.map((c) => `${c.id} (${c.title}: ${c.desc})`).join("; ")}.
Useful app facts: Ctrl+K searches, Ctrl+Z/Ctrl+Y undo/redo, Ctrl+I opens you. Each project stores tool inputs separately. Most tools hide advanced inputs behind a "show more inputs" link. Values are stored in SI units and shown in the units chosen in settings.

How to answer:
- Reply in the language the user writes in (the app UI language is ${LANG === "en" ? "English" : "Finnish"}).
- Be concise and practical. Start with the direct answer, then the reasoning if useful. Use short lists and formulas with units where they help; avoid long essays.
- Match the user's level: plain words for beginners, precise terms and equations when the user is clearly an expert.
- When the message includes <app_context>, use it: it describes the page the user is on and that tool's current inputs (SI units). Refer to concrete values from it when diagnosing a problem.
- You can only navigate; you cannot change values in the tools. Tell the user exactly which input to change and to what.
- For electrical and mechanical sizing, give estimates and remind the user to check component datasheets; never present an estimate as a safety guarantee.

When the message includes <course_context>, the user is a learner taking that course step, and you are their tutor. The goal is that they understand and can do it themselves, not that the task gets done:
- Keep replies short (usually under 150 words) and tied to the current step, its tool and its tasks.
- Guide instead of giving the answer: point to the next small action or ask one question that leads them there. Give the full solution only if they are still stuck after a hint, and then explain why it works.
- Never reveal the quiz's correct option before the learner has tried at least twice; instead help them reason with the step's theory. After a wrong answer, explain what their chosen option gets wrong.
- For reflection answers, grade against the model answer: name what is right, then the one or two most important missing ideas, and invite them to improve it. Don't paste the model answer.
- When explaining a concept, use an everyday analogy and end with one short check question the learner can answer.
- If <app_context> shows their current values, use them concretely ("your Kp is 2, try…").`;

  function appContext() {
    if (!settings.aiContext) return "";
    const route = currentRoute() || "dashboard";
    const tool = TOOLS.find((t) => t.id === route);
    const keys = STATE_KEYS[route] || [route];
    const state = {};
    for (const k of keys) if (activeProject().tools[k]) state[k] = activeProject().tools[k];
    let json = JSON.stringify(state);
    if (json.length > 8000) json = json.slice(0, 8000) + "…(truncated)";
    return `<app_context>
page: ${route === "settings" ? "settings" : `${route} (${tool?.name || ""})`}
display units: length ${settings.lengthUnit}, angle ${settings.angleUnit}, torque ${settings.torqueUnit}
saved inputs for this page (SI units; empty means defaults): ${json}
</app_context>

`;
  }

  async function loadSdk() {
    if (Anthropic) return Anthropic;
    const mod = await import(SDK_URL);
    Anthropic = mod.default;
    return Anthropic;
  }

  function errorText(err) {
    if (Anthropic && err instanceof Anthropic.AuthenticationError) return tr("API-avain ei kelpaa. Tarkista se asetuksista.", "The API key is not valid. Check it in settings.");
    if (Anthropic && err instanceof Anthropic.PermissionDeniedError) return tr("API-avaimella ei ole oikeutta tähän malliin.", "The API key has no access to this model.");
    if (Anthropic && err instanceof Anthropic.RateLimitError) return tr("Liian monta pyyntöä tai käyttöraja täynnä. Odota hetki ja yritä uudelleen.", "Too many requests or usage limit reached. Wait a moment and try again.");
    if (Anthropic && err instanceof Anthropic.APIConnectionError) return tr("Yhteys Claude API:in epäonnistui. Tarkista internetyhteys.", "Could not reach the Claude API. Check your internet connection.");
    if (Anthropic && err instanceof Anthropic.APIError) return tr(`Claude API palautti virheen (${err.status ?? "?"}): ${err.message}`, `The Claude API returned an error (${err.status ?? "?"}): ${err.message}`);
    if (!Anthropic) return tr("Tekoälykirjaston lataus epäonnistui. Tarvitset internetyhteyden tekoälyvastauksiin.", "Could not load the AI library. AI answers need an internet connection.");
    return String(err?.message || err);
  }

  async function askClaude(text) {
    setBusy(true);
    const idx = push("assistant", `<span class="ai-typing">${tr("Mietitään…", "Thinking…")}</span>`);
    history.push({ role: "user", content: Courses.context() + appContext() + text });
    let out = "", chips = "", aborted = false;
    const render = () => setMsg(idx, (out ? md(out) : `<span class="ai-typing">${tr("Mietitään…", "Thinking…")}</span>`) + chips);

    try {
      await loadSdk();
      const client = new Anthropic({ apiKey: getAiKey(), dangerouslyAllowBrowser: true });
      const model = settings.aiModel;
      // Palvelinpuolen varamalli kieltäytymistilanteisiin (Opus ja Sonnet; Haikulla ei ole)
      const fallback = model === "claude-haiku-5-5" ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" };

      for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
        stream = client.beta.messages.stream({
          model,
          max_tokens: 64000,
          system: SYSTEM,
          cache_control: { type: "ephemeral" },
          output_config: { effort: "medium" },
          tools: API_TOOLS(),
          messages: history,
          ...fallback,
        });
        let frame = 0;
        stream.on("text", (delta) => {
          out += delta;
          if (!frame) frame = requestAnimationFrame(() => { frame = 0; render(); });
        });
        const msg = await stream.finalMessage();
        stream = null;
        history.push({ role: "assistant", content: msg.content });

        if (msg.stop_reason === "refusal") {
          out += (out ? "\n\n" : "") + tr("_En voi vastata tähän pyyntöön._", "_I can't help with this request._");
          break;
        }
        const calls = msg.content.filter((b) => b.type === "tool_use");
        if (!calls.length || msg.stop_reason !== "tool_use") break;

        const results = calls.map((c) => {
          // Syöte tarkistetaan ennen suoritusta (virtautettu syöte voi olla katkennut)
          const inp = c.input || {};
          if (c.name === "open_tool" && TOOL_IDS.includes(inp.tool_id)) {
            location.hash = "#/" + inp.tool_id;
            chips += `<div class="ai-chips">${toolChip(inp.tool_id)}</div>`;
            return { type: "tool_result", tool_use_id: c.id, content: `Opened ${inp.tool_id}.` };
          }
          if (c.name === "start_course" && COURSE_IDS.includes(inp.course_id)) {
            Courses.start(inp.course_id);
            return { type: "tool_result", tool_use_id: c.id, content: `Started course ${inp.course_id}; the lesson panel is open next to the tool.` };
          }
          if (c.name === "open_settings" && SECTIONS.some((s) => s.id === inp.section)) {
            openSettingsSection(inp.section);
            const sec = SECTIONS.find((s) => s.id === inp.section);
            chips += `<div class="ai-chips"><button class="chip" data-settings="${sec.id}">${icon("gear")} ${esc(sec.title)}</button></div>`;
            return { type: "tool_result", tool_use_id: c.id, content: `Opened settings section ${inp.section}.` };
          }
          return { type: "tool_result", tool_use_id: c.id, is_error: true, content: "INVALID_INPUT: " + JSON.stringify(inp) };
        });
        history.push({ role: "user", content: results });
        if (out && !out.endsWith("\n")) out += "\n\n";
        render();
      }
    } catch (err) {
      if (err?.name === "APIUserAbortError" || (Anthropic && err instanceof Anthropic.APIUserAbortError)) aborted = true;
      else {
        out += (out ? "\n\n" : "") + "⚠ " + errorText(err);
        // Epäonnistunut käyttäjäviesti poistetaan historiasta, jotta seuraava kysymys alkaa puhtaasti
        if (history.at(-1)?.role === "user") history.pop();
      }
    } finally {
      stream = null;
      if (aborted) out += (out ? "\n\n" : "") + tr("_(pysäytetty)_", "_(stopped)_");
      render();
      setBusy(false);
    }
  }

  function stop() {
    try { stream?.abort(); } catch {}
    try { local.engine?.interruptGenerate(); } catch {}
  }

  // Avaa paneelin valmiilla kysymyksellä. Paikallisessa tilassa vastataan heti; Claude-tilassa käyttäjä
  // lähettää itse, koska jokainen kysymys maksaa.
  function prefill(text) {
    show();
    if (!hasKey() && !voltModel()) {
      // Ilman avainta: työkalun perusohje paikallisesta oppaasta + ohje Claude-tilaan
      const route = currentRoute();
      const e = KB.find((x) => x.tools.includes(route));
      push("user", md(text));
      push("assistant", (e ? md(tr(e.fi, e.en)) : md(TOOLS.find((t) => t.id === route)?.desc || ""))
        + md(tr("Tulostesi tarkempaan analyysiin tarvitaan Claude API -avain — silloin näen tämän työkalun arvot ja voin neuvoa juuri sinun tilanteessasi.",
          "A detailed analysis of your results needs a Claude API key — then I can see this tool's values and advise on your exact situation."))
        + `<div class="ai-chips"><button class="chip" data-settings="ai">${icon("gear")} ${tr("Lisää API-avain", "Add API key")}</button></div>`);
      return;
    }
    input.value = text;
    input.focus();
    input.setSelectionRange(text.length, text.length);
  }

  // Kurssin opettajanapit: kysymys lähtee heti. Ilman API-avainta vastataan kurssin omalla materiaalilla.
  function ask(text, { offline } = {}) {
    show();
    if (busy) return;
    if (hasKey() || voltModel()) {
      // Ilmainen Volt vastaa kurssin materiaalin pohjalta, kunnes malli on ladattu
      if (!hasKey() && !local.engine && offline) { push("user", md(text)); push("assistant", md(offline)); mode().then((m) => { if (m === "local") isCached().then((c) => { if (!c) offerDownload(text); }); }); return; }
      send(text); return;
    }
    push("user", md(text));
    push("assistant", md(offline || ""));
  }

  document.addEventListener("DOMContentLoaded", build);
  return { open: show, close, toggle, prefill, ask, prepareLocal, localStatus: () => ({ ready: !!local.engine, model: local.modelId }),
    _localAnswer: localAnswer, _md: md, _system: () => SYSTEM, _context: appContext, _localSystem: localSystem, _mode: mode };
})();
window.Assistant = Assistant;
