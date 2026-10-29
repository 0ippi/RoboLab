"use strict";

/* Ohjeet ja tuki (#/help) sekä tietosuojaseloste sovelluksen sisällä (#/privacy).
   - Usein kysytyt kysymykset viittaavat sovelluksen omiin sivuihin ja nappeihin.
   - Viesti kehittäjälle lähtee Supabaseen (send_feedback, docs/supabase-feedback.sql) ilman tiliä: ei GitHub-tiliä eikä
     sähköpostiohjelmaa. Mukaan liitetään versio, sivu, jolta tultiin, kieli ja selaimen tunniste vianetsintää varten.
   - Kehittäjä (Plans.isDeveloper) näkee saapuneet viestit samalla sivulla.
   - Tietosuojaseloste luetaan tietosuoja.html-tiedostosta: sama teksti kuin erillisellä sivulla, toimii myös ilman nettiä. */
(() => {
  const TOPIC_KEY = "rl-help-topic", MSG_KEY = "rl-help-msg"; // sessionStorage: aihe ja valmis viesti lomakkeeseen
  const MAX = 2000;
  const topics = () => [
    ["bug", tr("Ongelma tai virhe", "A problem or bug")],
    ["question", tr("Kysymys", "A question")],
    ["idea", tr("Palaute tai toive", "Feedback or a wish")],
    ["school", tr("Tilaukset, koulut ja laskutus", "Orders, schools and invoicing")],
    ["privacy", tr("Tietosuoja", "Privacy")],
  ];
  const topicName = (id) => (topics().find(([k]) => k === id) || [, id])[1];

  // Sivu, jolta Ohjeet avattiin: liitetään viestiin, jotta ongelman paikka löytyy
  let from = "";
  const routeOf = (url) => (String(url).split("#/")[1] || "").split(/[?#/]/)[0];
  window.addEventListener("hashchange", (e) => { if (routeOf(e.newURL) === "help" && routeOf(e.oldURL) !== "help") from = routeOf(e.oldURL); });
  // Linkit, jotka avaavat lomakkeen valmiiksi valitulla aiheella (esim. Ilmoita ongelmasta, Ota yhteyttä)
  document.addEventListener("click", (e) => {
    const a = e.target.closest("[data-help-topic]");
    if (a) { try { sessionStorage.setItem(TOPIC_KEY, a.dataset.helpTopic); } catch {} }
  });

  function faqHtml() {
    const faq = [
      [tr("Miten aloitan?", "How do I get started?"),
        `<p>${tr("Etusivun <b>Aloita kurssi</b> avaa ensimmäisen kurssin: robotti Volt opastaa vaihe vaiheelta, eikä ohjelmointia tai tiliä tarvita. Voit myös avata minkä tahansa työkalun sivupalkista ja kokeilla vapaasti.",
          "<b>Start the course</b> on the home page opens the first course: Volt the robot guides you step by step, and no programming or account is needed. You can also open any tool from the sidebar and experiment freely.")}</p>
        <button class="btn primary" data-resume="start">${tr("Aloita ensimmäinen kurssi", "Start the first course")} →</button>`],
      [tr("Mistä löydän kurssit?", "Where are the courses?"),
        `<p>${tr("Sivupalkin <b>Kurssit</b>-sivulla ovat kaikki kurssit ja niiden eteneminen. Kesken jäänyt kurssi jatkuu etusivun <b>Jatka kurssia</b> -napista. Kurssin aikana oppitunti näkyy työkalun vieressä, puhelimessa ruudun alaosassa. Ruksi keskeyttää kurssin, ja edistyminen säilyy.",
          "The <b>Courses</b> page in the sidebar lists every course and your progress. A course you left continues from <b>Continue course</b> on the home page. During a course the lesson is shown next to the tool, on a phone at the bottom of the screen. The cross pauses the course and your progress is kept.")}</p>
        <a class="btn" href="#/learn">${tr("Kurssit", "Courses")} →</a>`],
      [tr("Mihin työni tallentuu? Mikä on Oma projekti?", "Where is my work saved? What is “My project”?"),
        `<p>${tr("Kaikki tekemäsi tallentuu automaattisesti <b>projektiin</b>, jonka nimi näkyy yläpalkissa työkalun nimen vieressä. Aluksi sinulla on yksi projekti, <b>Oma projekti</b>. Kurssit tekevät itselleen oman projektin, jotta muut työsi pysyvät ennallaan.",
          "Everything you do is saved automatically in a <b>project</b>, whose name is shown in the top bar next to the tool's name. At first you have one project, <b>My project</b>. Courses make a project of their own so your other work stays untouched.")}</p>
        <p>${tr("Projektit-sivulla voit vaihtaa projektia, tehdä uusia sekä viedä ja tuoda niitä tiedostoina. Tiedot ovat tässä selaimessa. Pilvitilillä ne kulkevat mukanasi muille laitteille.",
          "On the Projects page you can switch projects, make new ones and export or import them as files. The data is in this browser. With a cloud account it goes with you to your other devices.")}</p>`],
      [tr("Mitä tasot tarkoittavat? Mikä on luokkakoodi?", "What do the plans mean? What is a class code?"),
        `<p>${tr("<b>Free</b> on ilmainen: perustyökalut ja kolme ensimmäistä kurssia. <b>Education</b> avaa oppilaille lisää työkaluja ja kursseja, ja opettajan luokkakoodilla se on maksuton. <b>Pro</b> on itseopiskelijalle (kaikki työkalut ja kurssit) ja <b>Teacher</b> opettajalle (luokkahuoneet ja oppilaiden seuranta).",
          "<b>Free</b> costs nothing: the basic tools and the first three courses. <b>Education</b> unlocks more tools and courses for students, and with a teacher's class code it is free. <b>Pro</b> is for self-learners (every tool and course) and <b>Teacher</b> for teachers (classrooms and student progress).")}</p>
        <a class="btn" href="#/plans" data-focus-class>${tr("Syötä luokkakoodi tai katso tasot", "Enter a class code or see the plans")} →</a>`],
      [tr("Jokin ei toimi. Mitä teen?", "Something doesn't work. What can I do?"),
        `<ul>
          <li>${tr("Lataa sivu uudelleen. Jos ylhäällä näkyy <b>Päivitä nyt</b> -palkki, paina sitä: uusi versio korjaa usein ongelman.", "Reload the page. If an <b>Update now</b> bar shows at the top, press it: a new version often fixes the problem.")}</li>
          <li>${tr("Jos yksi työkalu ei aukea, sen virhesivulla on nappi, joka palauttaa työkalun oletukset tässä projektissa. Muut työsi säilyvät.", "If one tool won't open, its error page has a button that resets the tool's defaults in this project. Your other work is kept.")}</li>
          <li>${tr("3D-työkalut ja nopea koulutus tarvitsevat ajantasaisen selaimen. Chrome ja Edge toimivat parhaiten.", "The 3D tools and fast training need an up-to-date browser. Chrome and Edge work best.")}</li>
          <li>${tr("Yksityisessä ikkunassa tiedot katoavat, kun ikkuna suljetaan. Tee tärkeistä töistä varmuuskopio profiilista.", "In a private window your data disappears when the window closes. Back up important work from your profile.")}</li>
          <li>${tr("Jos ongelma jatkuu, kerro siitä alla olevalla lomakkeella.", "If the problem continues, tell us with the form below.")}</li>
        </ul>`],
      [tr("Toimiiko RoboLab ilman nettiä?", "Does RoboLab work offline?"),
        `<p>${tr("Kyllä. Kun RoboLab on avattu kerran, se toimii myös ilman nettiä. Yläpalkin <b>Asenna sovellus</b> -napilla (jos selaimesi tukee sitä) saat RoboLabin omaksi sovellukseksi.",
          "Yes. Once RoboLab has been opened, it also works without the internet. The <b>Install app</b> button in the top bar (if your browser supports it) makes RoboLab an app of its own.")}</p>`],
      [tr("Mistä saan apua tehtävään?", "Where can I get help with a task?"),
        `<p>${tr("Volt vastaa kysymyksiin oikean alakulman robottinapista (Ctrl+I) ja kurssin <b>Kysy Voltilta</b> -napeista. Pikanäppäimet näet ?-näppäimellä.",
          "Volt answers questions from the robot button in the bottom right corner (Ctrl+I) and from the <b>Ask Volt</b> buttons in courses. Press ? to see the keyboard shortcuts.")}</p>
        <div class="row-actions"><button class="btn" data-help="ai">${tr("Kysy Voltilta", "Ask Volt")}</button><button class="btn" data-help="keys">${tr("Pikanäppäimet", "Keyboard shortcuts")}</button></div>`],
    ];
    return `<div class="help-faq">${faq.map(([q, a], i) => `<details ${i === 0 ? "open" : ""}><summary>${q}</summary><div>${a}</div></details>`).join("")}</div>`;
  }

  function formHtml() {
    if (!window.Cloud?.configured) {
      return `<p class="note">${tr("Viestien lähetys ei ole käytössä tässä RoboLabin versiossa.", "Sending messages is not available in this version of RoboLab.")}
        <a href="https://github.com/0ippi/RoboLab/issues" target="_blank" rel="noopener">${tr("Kehittäjän GitHub-sivu", "The developer's GitHub page")}</a></p>`;
    }
    return `<form class="help-form" id="help-form">
      <label>${tr("Aihe", "Topic")}<select id="hf-topic">${topics().map(([k, v]) => `<option value="${k}">${esc(v)}</option>`).join("")}</select></label>
      <label>${tr("Viesti", "Message")}<textarea id="hf-msg" rows="6" maxlength="${MAX}" required></textarea></label>
      <span class="help-count" id="hf-count" aria-live="polite">0 / ${MAX}</span>
      <label>${tr("Sähköposti vastausta varten (vapaaehtoinen)", "Email for a reply (optional)")}<input type="email" id="hf-contact" maxlength="120" autocomplete="email"></label>
      <p class="note small">${tr("Viestiin liitetään sovelluksen versio, sivu, jolta tulit, ja selaimen tiedot vianetsintää varten. Älä kirjoita salasanoja tai muiden ihmisten tietoja. Jos olet alle 13-vuotias, jätä sähköposti pois tai pyydä aikuista lähettämään viesti.",
        "The app version, the page you came from and your browser details are attached to help find the problem. Don't write passwords or other people's details. If you are under 13, leave out the email or ask an adult to send the message.")}
        <a href="#/privacy">${tr("Tietosuojaseloste", "Privacy policy")}</a></p>
      <div class="row-actions"><button class="btn primary" id="hf-send">${tr("Lähetä viesti", "Send message")}</button></div>
      <p class="help-sent" id="hf-sent" hidden>✓ ${tr("Kiitos! Viestisi on lähetetty kehittäjälle.", "Thanks! Your message was sent to the developer.")}</p>
    </form>`;
  }

  const placeholder = (topic) => topic === "bug"
    ? tr("Kerro, mitä teit, mitä odotit tapahtuvan ja mitä tapahtui.", "Tell us what you did, what you expected and what happened.")
    : topic === "school" ? tr("Kerro, mitä haluat tilata, tai koulusta, ryhmän koosta ja tarpeista (esim. pilotti, koululisenssi, laskutus).", "Tell us what you'd like to order, or about the school, the group size and your needs (e.g. a pilot, a school licence, invoicing).")
      : tr("Kirjoita viestisi tähän.", "Write your message here.");

  function bindForm(el) {
    const f = el.querySelector("#help-form");
    if (!f) return;
    const topic = f.querySelector("#hf-topic"), msg = f.querySelector("#hf-msg"), count = f.querySelector("#hf-count");
    const sync = () => { msg.placeholder = placeholder(topic.value); count.textContent = `${msg.value.length} / ${MAX}`; };
    let pre = null, text = null;
    try { pre = sessionStorage.getItem(TOPIC_KEY); text = sessionStorage.getItem(MSG_KEY); sessionStorage.removeItem(TOPIC_KEY); sessionStorage.removeItem(MSG_KEY); } catch {}
    if (text && !msg.value) msg.value = text.slice(0, MAX); // esim. tilaus Tasot-sivulta, kun verkkomaksu ei ole käytössä
    if (pre && topics().some(([k]) => k === pre)) {
      topic.value = pre;
      setTimeout(() => { f.scrollIntoView({ block: "start" }); msg.focus({ preventScroll: true }); msg.setSelectionRange(msg.value.length, msg.value.length); }, 50);
    }
    sync();
    topic.onchange = sync;
    msg.oninput = () => { sync(); f.querySelector("#hf-sent").hidden = true; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      const text = msg.value.trim();
      if (text.length < 3) { toast(tr("Kirjoita viesti ensin.", "Write a message first.")); msg.focus(); return; }
      const btn = f.querySelector("#hf-send");
      btn.disabled = true;
      try {
        await Cloud.rpc("send_feedback", { p_topic: topic.value, p_message: text, p_contact: f.querySelector("#hf-contact").value.trim(),
          p_page: from, p_version: VERSION, p_lang: LANG, p_agent: navigator.userAgent.slice(0, 200) });
        msg.value = "";
        sync();
        f.querySelector("#hf-sent").hidden = false;
        toast(tr("Kiitos! Viestisi on lähetetty kehittäjälle.", "Thanks! Your message was sent to the developer."));
      } catch (err) {
        const m = String(err.raw || err.message || "");
        // Palvelimen funktio puuttuu, jos docs/supabase-feedback.sql:ää ei ole vielä ajettu
        toast(/rate/.test(m) ? tr("Viestejä on tullut juuri nyt paljon. Yritä hetken päästä uudelleen.", "A lot of messages have arrived just now. Please try again in a while.")
          : /could not find the function|schema cache/i.test(m) ? tr("Viestien lähetys ei ole vielä käytössä. Yritä myöhemmin uudelleen: viestisi on yhä kentässä.", "Sending messages isn't available yet. Please try again later: your message is still in the box.")
          : tr("Viestin lähetys ei onnistunut. Tarkista nettiyhteys ja yritä uudelleen: viestisi on yhä kentässä.", "The message could not be sent. Check your internet connection and try again: your message is still in the box."));
      }
      btn.disabled = false;
    };
  }

  /* ----- Kehittäjä: saapuneet viestit (dev_list_feedback, dev_mark_feedback, dev_delete_feedback) ----- */
  async function loadInbox(el) {
    const box = el.querySelector("#hf-inbox");
    if (!box) return;
    let list;
    try { list = (await Cloud.rpc("dev_list_feedback")) || []; }
    catch (e) { box.innerHTML = `<p class="note">${esc(/not-developer/.test(String(e.raw || e.message)) ? tr("Tililläsi ei ole kehittäjän oikeuksia.", "Your account doesn't have developer rights.") : e.message)}</p>`; return; }
    const fresh = list.filter((f) => !f.handled).length;
    const mail = (c) => (/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(c) ? `<a href="mailto:${esc(c)}">${esc(c)}</a>` : esc(c));
    box.innerHTML = `<p class="note">${tr(`${fresh} uutta, yhteensä ${list.length} (viimeisimmät 100).`, `${fresh} new, ${list.length} in total (latest 100).`)}</p>` + (list.length ? list.map((f) => `
      <div class="fb ${f.handled ? "done" : ""}">
        <div class="fb-meta"><b>${esc(topicName(f.topic))}</b><span>${new Date(f.created_at).toLocaleString(tr("fi-FI", "en-GB"))}</span>
          ${f.page ? `<span>#/${esc(f.page)}</span>` : ""}<span>v${esc(f.version || "?")}</span><span>${esc(f.lang || "")}</span>${f.contact ? `<span>${mail(f.contact)}</span>` : ""}</div>
        <p class="fb-msg">${esc(f.message)}</p>
        ${f.agent ? `<small class="fb-agent">${esc(f.agent)}</small>` : ""}
        <div class="row-actions"><button class="link-btn" data-fb-mark="${f.id}" data-done="${f.handled ? 0 : 1}">${f.handled ? tr("Palauta uudeksi", "Mark as new") : tr("Merkitse käsitellyksi", "Mark as handled")}</button>
          <button class="link-btn" data-fb-del="${f.id}">${tr("Poista", "Delete")}</button></div>
      </div>`).join("") : "");
  }
  async function onInboxClick(e, el) {
    const mark = e.target.closest("[data-fb-mark]"), del = e.target.closest("[data-fb-del]");
    if (!mark && !del) return;
    if (del && !confirm(tr("Poistetaanko viesti pysyvästi?", "Delete the message permanently?"))) return;
    try {
      if (mark) await Cloud.rpc("dev_mark_feedback", { p_id: +mark.dataset.fbMark, p_handled: mark.dataset.done === "1" });
      else await Cloud.rpc("dev_delete_feedback", { p_id: +del.dataset.fbDel });
    } catch (err) { toast(err.message); }
    loadInbox(el);
  }

  function render(el, tool) {
    const dev = !!window.Plans?.isDeveloper?.();
    el.innerHTML = `${toolHead(tool)}
      ${faqHtml()}
      <div class="card help-contact" id="help-contact">
        <h2 class="card-title">${tr("Viesti kehittäjälle", "Message the developer")}</h2>
        <p class="note">${tr("Kysymys, ongelma tai toive? Viesti menee suoraan RoboLabin kehittäjälle, eikä tiliä tarvita.", "A question, a problem or a wish? The message goes straight to RoboLab's developer, and no account is needed.")}</p>
        ${formHtml()}
      </div>
      ${dev ? `<div class="card dev-card help-inbox"><h3 class="card-title">🛠 ${tr("Saapuneet viestit", "Received messages")}</h3><div id="hf-inbox"><p class="note">${tr("Ladataan…", "Loading…")}</p></div></div>` : ""}
      <p class="note dash-links"><a href="#/privacy">${tr("Tietosuojaseloste", "Privacy policy")}</a>
        · <a href="website/" target="_blank" rel="noopener">${tr("Tietoa RoboLabista", "About RoboLab")}</a> · RoboLab v${esc(VERSION)}</p>`;
    bindForm(el);
    el.onclick = (e) => {
      const h = e.target.closest("[data-help]")?.dataset.help;
      if (h === "ai") window.Assistant?.open();
      else if (h === "keys") openShortcuts();
      if (dev) onInboxClick(e, el);
    };
    if (dev) loadInbox(el);
  }

  /* ----- Tietosuojaseloste sovelluksen sisällä ----- */
  async function renderPrivacy(el, tool) {
    el.innerHTML = `${toolHead(tool)}<div class="card privacy-doc"><p class="note">${tr("Ladataan…", "Loading…")}</p></div>`;
    const box = el.querySelector(".privacy-doc");
    let doc;
    try {
      const r = await fetch("tietosuoja.html");
      if (!r.ok) throw new Error(r.status);
      doc = new DOMParser().parseFromString(await r.text(), "text/html");
    } catch {
      box.innerHTML = `<p>${tr("Tietosuojaselostetta ei voitu ladata.", "The privacy policy could not be loaded.")} <a href="tietosuoja.html" target="_blank" rel="noopener">${tr("Avaa erillisenä sivuna", "Open as a separate page")}</a></p>`;
      return;
    }
    if (!box.isConnected) return; // käyttäjä siirtyi jo muualle
    const main = doc.querySelector("main");
    main.querySelectorAll("script, style, nav, h1").forEach((x) => x.remove());
    // Englanniksi tiivistelmä ensin, suomenkielinen koko teksti sen jälkeen
    const en = main.querySelector("#en");
    if (LANG === "en" && en) { const card = en.nextElementSibling; main.prepend(en, card); }
    main.querySelectorAll("table").forEach((t) => { const wrap = doc.createElement("div"); wrap.className = "edu-table-wrap"; t.replaceWith(wrap); wrap.append(t); });
    // Sovelluksen sivut avautuvat samaan ikkunaan, ulkoiset linkit uuteen
    main.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href"), inApp = href.match(/^(?:\.\/|index\.html)?(#\/[\w-]+)$/);
      if (inApp) a.setAttribute("href", inApp[1]);
      else if (/^https?:/i.test(href)) { a.target = "_blank"; a.rel = "noopener"; }
    });
    box.innerHTML = main.innerHTML;
  }

  TOOL_IMPL.help = { render };
  TOOL_IMPL.privacy = { render: renderPrivacy };
})();
