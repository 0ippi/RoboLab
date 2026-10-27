"use strict";

/* Sarjaportti: Web Serial -yhteys, terminaali, reaaliaikainen kuvaaja ja CSV-tallennus/-avaus.
   Yhteyden tila on moduulitasolla, joten se säilyy, vaikka käyttäjä käy toisella sivulla. */
(() => {
  const BAUDS = [9600, 19200, 38400, 57600, 115200, 230400, 250000, 500000, 921600, 1000000];
  const MAX_LINES = 500, MAX_ROWS = 200000;
  const supported = "serial" in navigator;

  const S = {
    port: null, reader: null, pipe: null, connected: false, busy: false,
    lines: [],          // terminaalin rivit { text, cls }
    rows: [],           // { t, values: {nimi: luku} }
    names: [],          // havaitut sarjat
    t0: 0, source: "",  // "live" | "demo" | tiedostonimi
    demoTimer: 0,
  };

  let el, frame = 0, opts;
  // Kurssit seuraavat, onko dataa tullut (demo tai oikea laite)
  window.serialStatus = () => ({ rows: S.rows.length, series: S.names.length, demo: !!S.demoTimer, live: S.connected });

  const DEFAULTS = { baud: 115200, window: 500, lineEnd: "\n", autoscroll: true };

  /* ----- Data ----- */

  function addLine(text, cls = "") {
    S.lines.push({ text, cls });
    if (S.lines.length > MAX_LINES) S.lines.splice(0, S.lines.length - MAX_LINES);
  }

  function onLine(line) {
    addLine(line);
    const values = Calc.parseLine(line);
    const keys = Object.keys(values);
    if (keys.length) {
      for (const k of keys) if (!S.names.includes(k)) S.names.push(k);
      S.rows.push({ t: (performance.now() - S.t0) / 1000, values });
      if (S.rows.length > MAX_ROWS) S.rows.splice(0, S.rows.length - MAX_ROWS);
    }
    schedule();
  }

  function clearData() {
    S.lines = []; S.rows = []; S.names = []; S.t0 = performance.now();
  }

  /* ----- Yhteys ----- */

  async function connect() {
    if (S.busy) return;
    S.busy = true; draw();
    try {
      const port = await navigator.serial.requestPort();
      await port.open({ baudRate: +opts.baud });
      stopDemo();
      clearData();
      S.port = port; S.connected = true; S.source = "live";
      addLine(tr(`Yhdistetty, ${opts.baud} baud`, `Connected, ${opts.baud} baud`), "sys");
      readLoop();
    } catch (e) {
      if (e.name !== "NotFoundError") { addLine(tr("Virhe: ", "Error: ") + e.message, "sys"); toast(tr("Yhteys epäonnistui: ", "Connection failed: ") + e.message); }
    } finally {
      S.busy = false; draw();
    }
  }

  async function readLoop() {
    const decoder = new TextDecoderStream();
    S.pipe = S.port.readable.pipeTo(decoder.writable).catch(() => {});
    S.reader = decoder.readable.getReader();
    let buf = "";
    try {
      for (;;) {
        const { value, done } = await S.reader.read();
        if (done) break;
        buf += value;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          onLine(buf.slice(0, i).replace(/\r$/, ""));
          buf = buf.slice(i + 1);
        }
      }
    } catch (e) {
      addLine(tr("Yhteys katkesi: ", "Connection lost: ") + e.message, "sys");
    } finally {
      S.reader.releaseLock();
      if (S.connected) await disconnect(true);
    }
  }

  async function disconnect(silent) {
    if (!S.port) return;
    S.connected = false;
    try { await S.reader?.cancel(); } catch {}
    try { await S.pipe; } catch {}
    try { await S.port.close(); } catch {}
    S.port = null;
    if (!silent) addLine(tr("Yhteys suljettu", "Connection closed"), "sys");
    draw();
  }

  async function send(text) {
    if (!S.connected) return;
    const writer = S.port.writable.getWriter();
    try {
      await writer.write(new TextEncoder().encode(text + opts.lineEnd));
      addLine("→ " + text, "tx");
      schedule();
    } finally {
      writer.releaseLock();
    }
  }

  if (supported) navigator.serial.addEventListener("disconnect", (e) => {
    if (e.target === S.port) { addLine(tr("Laite irrotettiin", "Device disconnected"), "sys"); disconnect(true); }
  });

  /* ----- Demo ja tiedostot ----- */

  function startDemo() {
    clearData();
    S.source = "demo";
    addLine(tr("Demodata: simuloitu etäisyysanturi ja IMU", "Demo data: simulated distance sensor and IMU"), "sys");
    let k = 0;
    S.demoTimer = setInterval(() => {
      const t = k++ / 50;
      const dist = 40 + 25 * Math.sin(t * 0.8) + (Math.random() - 0.5) * 3;
      const gyro = 30 * Math.cos(t * 1.7) + (Math.random() - 0.5) * 4;
      onLine(`dist:${dist.toFixed(1)}, gyro:${gyro.toFixed(1)}`);
    }, 20);
    draw();
  }
  function stopDemo() {
    clearInterval(S.demoTimer);
    S.demoTimer = 0;
  }

  function toCsv() {
    const head = ["time_s", ...S.names];
    const lines = [head.join(",")];
    for (const r of S.rows) lines.push([r.t.toFixed(4), ...S.names.map((n) => r.values[n] ?? "")].join(","));
    return lines.join("\n");
  }

  function openCsv(file) {
    file.text().then((txt) => {
      const rows = txt.trim().split(/\r?\n/);
      const head = rows.shift().split(",").map((h) => h.trim());
      const ti = head.findIndex((h) => /^(time|t|aika)/i.test(h));
      stopDemo();
      if (S.connected) disconnect();
      clearData();
      S.source = file.name;
      S.names = head.filter((_, i) => i !== ti);
      rows.forEach((line, idx) => {
        const cells = line.split(",");
        const values = {};
        head.forEach((h, i) => { if (i !== ti && cells[i] !== "" && cells[i] !== undefined && !Number.isNaN(+cells[i])) values[h] = +cells[i]; });
        S.rows.push({ t: ti >= 0 ? +cells[ti] : idx, values });
      });
      addLine(tr(`Avattu ${file.name}: ${S.rows.length} riviä, sarjat ${S.names.join(", ")}`, `Opened ${file.name}: ${S.rows.length} rows, series ${S.names.join(", ")}`), "sys");
      opts.window = 0; // näytä koko tallenne
      save();
      const sel = el?.querySelector("#sr-window");
      if (sel) sel.value = "0";
      draw();
    }).catch(() => toast(tr("CSV-tiedoston lukeminen epäonnistui", "Failed to read the CSV file")));
  }

  /* ----- Näkymä ----- */

  function render(root, tool) {
    el = root;
    opts = { ...DEFAULTS, ...getToolState("serial", DEFAULTS) };
    el.innerHTML = `
      ${toolHead(tool)}
      <div class="tool">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Yhteys", "Connection")} <span class="pill" id="sr-status"></span></h3>
            <div id="sr-conn"></div>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Tallenne", "Recording")}</h3>
            <div class="row-actions" style="margin-top:0">
              <button class="btn" id="sr-save">${tr("Tallenna CSV", "Save CSV")}</button>
              <label class="btn">${tr("Avaa CSV…", "Open CSV…")}<input type="file" id="sr-open" accept=".csv,text/csv" hidden></label>
              <button class="btn" id="sr-clear">${tr("Tyhjennä", "Clear")}</button>
            </div>
            <p class="note" style="margin-top:10px" id="sr-count"></p>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Datan muoto", "Data format")}</h3>
            <p class="note">${tr("Tulosta Arduinosta rivi kerrallaan, esim.", "Print one line at a time from the Arduino, e.g.")}<br>
            <code>Serial.print("dist:"); Serial.print(d); Serial.print(", gyro:"); Serial.println(g);</code><br>
            ${tr("Pelkät luvut", "Plain numbers")} (<code>12.5 30 -4</code>) ${tr("nimetään ch1, ch2…", "are named ch1, ch2…")}</p>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Kuvaaja", "Plot")}
              <span style="display:flex;align-items:center;gap:8px;font-weight:400;font-size:.82rem;color:var(--text-3)">${tr("Näytä", "Show")}
                <select id="sr-window" style="min-width:0;height:28px">
                  ${[[200, tr("200 viim.", "last 200")], [500, tr("500 viim.", "last 500")], [2000, tr("2000 viim.", "last 2000")], [0, tr("kaikki", "all")]].map(([v, l]) => `<option value="${v}" ${+opts.window === v ? "selected" : ""}>${l}</option>`).join("")}
                </select></span></h3>
            <canvas class="plot" id="sr-plot"></canvas>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Terminaali", "Terminal")}</h3>
            <pre class="terminal" id="sr-term"></pre>
            <div class="send-row">
              <input type="text" id="sr-input" placeholder="${tr("Lähetä laitteelle…", "Send to device…")}" autocomplete="off">
              <button class="btn primary" id="sr-send">${tr("Lähetä", "Send")}</button>
            </div>
          </div>
        </div>
      </div>`;

    el.querySelector("#sr-save").onclick = () => {
      if (!S.rows.length) { toast(tr("Ei tallennettavaa dataa", "No data to save")); return; }
      downloadFile(`sarjaportti-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.csv`, toCsv(), "text/csv");
    };
    el.querySelector("#sr-open").onchange = (e) => { if (e.target.files[0]) openCsv(e.target.files[0]); e.target.value = ""; };
    el.querySelector("#sr-clear").onclick = () => { clearData(); draw(); };
    el.querySelector("#sr-window").onchange = (e) => { opts.window = +e.target.value; save(); schedule(); };
    const input = el.querySelector("#sr-input");
    const doSend = () => { if (input.value) { send(input.value); input.value = ""; } };
    el.querySelector("#sr-send").onclick = doSend;
    input.onkeydown = (e) => { if (e.key === "Enter") doSend(); };
    window.addEventListener("resize", schedule);
    draw();
  }

  function save() {
    saveToolState("serial", { baud: opts.baud, window: opts.window, lineEnd: opts.lineEnd });
  }

  // el on sisältöalue, joka säilyy sivua vaihdettaessa — tarkistetaan, että tämä työkalu on yhä näkyvissä
  const visible = () => !!el?.querySelector("#sr-term");

  function draw() {
    if (!visible()) return;
    const status = el.querySelector("#sr-status");
    status.innerHTML = S.connected ? '<i class="dot on"></i>' + tr("Yhdistetty", "Connected")
      : S.demoTimer ? '<i class="dot on"></i>Demo' : '<i class="dot"></i>' + tr("Ei yhteyttä", "Not connected");

    const conn = el.querySelector("#sr-conn");
    if (!supported) {
      conn.innerHTML = `${alertsHtml([{ level: "info", text: tr("Tämä selain ei tue Web Serialia. Käytä Chromea tai Edgeä yhdistääksesi laitteeseen. Voit silti avata tallennetun CSV:n tai kokeilla demodatalla.", "This browser does not support Web Serial. Use Chrome or Edge to connect to a device. You can still open a saved CSV or try the demo data.") }])}
        <div class="row-actions"><button class="btn" id="sr-demo">${S.demoTimer ? tr("Pysäytä demo", "Stop demo") : tr("Kokeile demodatalla", "Try with demo data")}</button></div>`;
    } else {
      conn.innerHTML = `
        <div class="conn-row">
          <select id="sr-baud" ${S.connected ? "disabled" : ""} aria-label="${tr("Baudinopeus", "Baud rate")}">
            ${BAUDS.map((b) => `<option value="${b}" ${+opts.baud === b ? "selected" : ""}>${b} baud</option>`).join("")}
          </select>
          ${S.connected
            ? `<button class="btn" id="sr-disc">${tr("Katkaise", "Disconnect")}</button>`
            : `<button class="btn primary" id="sr-conn-btn" ${S.busy ? "disabled" : ""}>${tr("Yhdistä", "Connect")}</button>`}
        </div>
        <p class="note" style="margin-top:6px">${tr("Baudinopeus on tiedonsiirron nopeus. Sen pitää olla sama kuin laitteen koodissa, esim. Serial.begin(115200) → 115200; väärällä nopeudella näkyy sotkua.", "The baud rate is the data transfer speed. It must match the device code, e.g. Serial.begin(115200) → 115200; a wrong rate shows garbage.")}</p>
        <div class="field" style="margin-top:12px">
          <label>${tr("Rivinvaihto lähetettäessä", "Line ending when sending")}<small>${tr("Merkki, joka lisätään jokaisen lähetetyn viestin perään, jotta laite tunnistaa viestin päättyneen. Arduinolle yleensä LF (\\n).", "A character added after each message you send so the device knows the message ended. Usually LF (\\n) for Arduino.")}</small></label>
          <select id="sr-le">${[["\n", "LF (\\n)"], ["\r\n", "CR+LF (\\r\\n)"], ["\r", "CR (\\r)"], ["", tr("Ei mitään", "None")]].map(([v, l]) => `<option value="${JSON.stringify(v).slice(1, -1)}" ${opts.lineEnd === v ? "selected" : ""}>${l}</option>`).join("")}</select>
        </div>
        <div class="row-actions"><button class="link-btn" id="sr-demo">${S.demoTimer ? tr("Pysäytä demo", "Stop demo") : tr("Ei laitetta? Kokeile demodatalla", "No device? Try with demo data")}</button></div>`;
      conn.querySelector("#sr-baud").onchange = (e) => { opts.baud = +e.target.value; save(); };
      conn.querySelector("#sr-le").onchange = (e) => { opts.lineEnd = JSON.parse(`"${e.target.value}"`); save(); };
      conn.querySelector("#sr-conn-btn")?.addEventListener("click", connect);
      conn.querySelector("#sr-disc")?.addEventListener("click", () => disconnect());
    }
    conn.querySelector("#sr-demo").onclick = () => {
      if (S.demoTimer) { stopDemo(); addLine(tr("Demo pysäytetty", "Demo stopped"), "sys"); draw(); }
      else { if (S.connected) disconnect(); startDemo(); }
    };
    el.querySelector("#sr-input").disabled = !S.connected;
    el.querySelector("#sr-send").disabled = !S.connected;
    schedule();
  }

  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => { frame = 0; drawData(); });
  }

  function drawData() {
    if (!visible()) return;
    const term = el.querySelector("#sr-term");
    const atBottom = term.scrollTop + term.clientHeight >= term.scrollHeight - 8;
    term.innerHTML = S.lines.map((l) => `<span class="${l.cls}">${esc(l.text)}</span>`).join("\n");
    if (atBottom) term.scrollTop = term.scrollHeight;

    const rows = opts.window > 0 ? S.rows.slice(-opts.window) : S.rows;
    const x = rows.map((r) => r.t);
    drawPlot(el.querySelector("#sr-plot"), {
      xLabel: "t [s]",
      series: S.names.map((n) => ({ x, y: rows.map((r) => r.values[n] ?? NaN), label: n, width: 1.5 })),
    });
    el.querySelector("#sr-count").textContent = S.rows.length
      ? tr(`${S.rows.length} mittausriviä · ${S.names.length} sarjaa`, `${S.rows.length} data rows · ${S.names.length} series`) + (S.source && S.source !== "live" && S.source !== "demo" ? " · " + S.source : "")
      : tr("Ei vielä dataa.", "No data yet.");
  }

  // Esimerkit asettavat vain tallennetun baudinopeuden ja rivinvaihdon (avoin yhteys ei muutu)
  const preset = (baud) => () => {
    const cur = { ...DEFAULTS, ...getToolState("serial", DEFAULTS) };
    saveToolState("serial", { baud, window: cur.window, lineEnd: "\n" });
  };

  TOOL_IMPL.serial = {
    render,
    examples: [
      { name: tr("Arduino Uno (9600 baud)", "Arduino Uno (9600 baud)"),
        desc: tr("Arduinon esimerkkien yleinen nopeus: Serial.begin(9600), rivinvaihto LF", "Common speed in Arduino examples: Serial.begin(9600), LF line ending"),
        apply: preset(9600) },
      { name: tr("ESP32 (115200 baud)", "ESP32 (115200 baud)"),
        desc: tr("ESP32:n oletusnopeus: Serial.begin(115200), rivinvaihto LF", "ESP32 default speed: Serial.begin(115200), LF line ending"),
        apply: preset(115200) },
    ],
    // Oikea yhteys jää auki taustalle, demo pysäytetään
    unmount() { window.removeEventListener("resize", schedule); stopDemo(); },
  };
  // Testejä varten: syötä rivi kuin se olisi tullut laitteelta
  window.serialFeed = onLine;
})();
