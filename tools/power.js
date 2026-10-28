"use strict";

/* Sähköjärjestelmä: akku, säädin, kuormat, johdot ja moottoriohjain → virrat, käyttöaika ja varoitukset. */
(() => {
  const DEFAULTS = {
    bV: 7.4, mAh: 2200, cRate: 25, burstC: 50, usable: 80,
    regType: "buck", vOut: 5, regEff: 85, regMax: 3, dropout: 1.1,
    drvCont: 1.2, drvPeak: 3.2, drvMaxV: 13.5,
    wireLen: 0.3, wireArea: 0.5,
    loads: [
      { name: tr("Mikrokontrolleri", "Microcontroller"), qty: 1, avg: 80, peak: 250, rail: "reg", kind: "other" },
      { name: tr("Etäisyysanturi", "Distance sensor"), qty: 1, avg: 15, peak: 15, rail: "reg", kind: "other" },
      { name: tr("Vetomoottori", "Drive motor"), qty: 2, avg: 300, peak: 1500, rail: "bat", kind: "motor" },
    ],
  };

  const BATTERY = [
    { key: "bV", label: tr("Nimellisjännite", "Nominal voltage"), unit: "V", help: tr("LiPo 3,7 V/kenno · NiMH 1,2 V/kenno", "LiPo 3.7 V/cell · NiMH 1.2 V/cell"), min: 0.5, max: 100, step: 0.1,
      info: tr("Akun jännite normaalikäytössä. Esim. 2S LiPo = 7,4 V, 3S LiPo = 11,1 V, kaksi 18650-kennoa sarjassa = 7,4 V.", "The battery's voltage in normal use. E.g. 2S LiPo = 7.4 V, 3S LiPo = 11.1 V, two 18650 cells in series = 7.4 V.") },
    { key: "mAh", label: tr("Kapasiteetti", "Capacity"), unit: "mAh", min: 1, max: 1e6, step: 100,
      info: tr("Kuinka paljon varausta akkuun mahtuu: 2200 mAh antaa 2,2 A tunnin ajan. Robottiakuissa tyypillisesti 1000–5000 mAh.", "How much charge the battery holds: 2200 mAh supplies 2.2 A for one hour. Typically 1000–5000 mAh for robot batteries.") },
    { key: "cRate", label: tr("Jatkuva purkukyky", "Continuous discharge rating"), unit: "C", help: tr("Akun kyljessä, esim. 25C", "Printed on the battery, e.g. 25C"), min: 0.1, max: 500, step: 1,
      info: tr("Suurin jatkuva virta kapasiteetin monikertana: 25C × 2,2 Ah = 55 A. LiPo 20–50C, 18650-kennot noin 3–10C.", "Maximum continuous current as a multiple of capacity: 25C × 2.2 Ah = 55 A. LiPo 20–50C, 18650 cells about 3–10C.") },
    { key: "burstC", label: tr("Hetkellinen purkukyky", "Burst discharge rating"), unit: "C", adv: true, min: 0.1, max: 1000, step: 1,
      info: tr("Lyhytaikainen (muutaman sekunnin) virtaraja, esim. moottorien käynnistyspiikeille. Yleensä noin kaksinkertainen jatkuvaan verrattuna.", "Short-term (a few seconds) current limit, e.g. for motor start-up spikes. Usually about twice the continuous rating.") },
    { key: "usable", label: tr("Käytettävissä oleva kapasiteetti", "Usable capacity"), unit: "%", help: tr("LiPoa ei kannata purkaa tyhjäksi", "Don't fully discharge a LiPo"), adv: true, min: 1, max: 100, step: 1,
      info: tr("Osuus kapasiteetista, jonka käytät ennen lataamista. LiPolle noin 80 %, jotta kennojännite ei laske alle 3,5 V.", "The share of capacity you use before recharging. About 80 % for LiPo so the cell voltage does not drop below 3.5 V.") },
  ];
  const REG = [
    { key: "regType", label: tr("Jännitesäädin", "Voltage regulator"), type: "select",
      info: tr("Laskee akun jännitteen elektroniikalle sopivaksi (esim. 5 V). Hakkuri on hyötysuhteeltaan hyvä; lineaarinen polttaa jännite-eron lämmöksi.", "Lowers the battery voltage to what the electronics need (e.g. 5 V). A buck converter is efficient; a linear regulator burns the voltage difference as heat."),
      options: [["buck", tr("Hakkuri (buck)", "Switching (buck)")], ["linear", tr("Lineaarinen (esim. 7805, AMS1117)", "Linear (e.g. 7805, AMS1117)")], ["none", tr("Ei säädintä", "No regulator")]] },
    { key: "vOut", label: tr("Lähtöjännite", "Output voltage"), unit: "V", min: 0.5, max: 100, step: 0.1, when: (s) => s.regType !== "none",
      info: tr("Säätimen antama jännite. Arduino ja Raspberry Pi 5 V, ESP32 ja monet anturit 3,3 V.", "The voltage the regulator outputs. Arduino and Raspberry Pi 5 V, ESP32 and many sensors 3.3 V.") },
    { key: "regMax", label: tr("Enimmäisvirta", "Maximum current"), unit: "A", min: 0.01, max: 100, step: 0.1, when: (s) => s.regType !== "none",
      info: tr("Suurin virta, jonka säädin jaksaa antaa. AMS1117 noin 1 A, LM2596-hakkuri noin 2–3 A.", "The largest current the regulator can supply. AMS1117 about 1 A, LM2596 buck about 2–3 A.") },
    { key: "regEff", label: tr("Hyötysuhde", "Efficiency"), unit: "%", adv: true, min: 1, max: 100, step: 1, when: (s) => s.regType === "buck",
      info: tr("Kuinka suuri osa tehosta päätyy lähtöön, loput muuttuu lämmöksi. Hakkureilla tyypillisesti 80–92 %.", "How much of the power reaches the output; the rest becomes heat. Typically 80–92 % for buck converters.") },
    { key: "dropout", label: tr("Pudotusjännite", "Dropout voltage"), unit: "V", help: tr("Pienin ero tulon ja lähdön välillä", "Minimum difference between input and output"), adv: true, min: 0, max: 10, step: 0.1, when: (s) => s.regType === "linear",
      info: tr("Lineaarisäädin tarvitsee tämän verran ylimääräistä jännitettä toimiakseen. AMS1117 noin 1,1 V, 7805 noin 2 V.", "A linear regulator needs this much extra input voltage to work. AMS1117 about 1.1 V, 7805 about 2 V.") },
  ];
  const DRIVER = [
    { key: "drvCont", label: tr("Jatkuva virta / kanava", "Continuous current / channel"), unit: "A", help: tr("TB6612: 1,2 A · L298N: 2 A", "TB6612: 1.2 A · L298N: 2 A"), min: 0.01, max: 1000, step: 0.1,
      info: tr("Virta, jonka moottoriohjain kestää jatkuvasti yhtä moottoria kohden ylikuumenematta. Löytyy ohjaimen datasheetistä.", "The current the motor driver can supply per motor continuously without overheating. Found in the driver's datasheet.") },
    { key: "drvPeak", label: tr("Huippuvirta / kanava", "Peak current / channel"), unit: "A", min: 0.01, max: 1000, step: 0.1,
      info: tr("Lyhytaikainen virta, jonka ohjain kestää esim. moottorin käynnistyessä tai jumittuessa. TB6612 3,2 A, L298N 3 A.", "The short-term current the driver survives, e.g. when a motor starts or stalls. TB6612 3.2 A, L298N 3 A.") },
    { key: "drvMaxV", label: tr("Enimmäisjännite", "Maximum voltage"), unit: "V", min: 1, max: 1000, step: 0.5,
      info: tr("Suurin moottorijännite, jonka ohjain kestää. Akun täyteen ladattu jännite ei saa ylittää tätä (TB6612 noin 13,5 V, L298N 46 V).", "The highest motor voltage the driver can take. A fully charged battery must stay below it (TB6612 about 13.5 V, L298N 46 V).") },
  ];
  const WIRE = [
    { key: "wireLen", label: tr("Akkujohdon pituus (yhteen suuntaan)", "Battery wire length (one way)"), unit: "m", min: 0, max: 100, step: 0.05,
      info: tr("Johdon pituus akulta kuormille. Laskenta huomioi meno- ja paluujohdon; pienissä roboteissa tyypillisesti 0,1–0,5 m.", "Wire length from the battery to the loads. The calculation includes both the supply and return wire; typically 0.1–0.5 m in small robots.") },
    { key: "wireArea", label: tr("Johdon poikkipinta", "Wire cross-section"), type: "select",
      info: tr("Johtimen paksuus. Ohut johto lämpenee ja pudottaa jännitettä suurilla virroilla; moottorivirroille vähintään 0,5 mm² (20 AWG).", "The conductor thickness. Thin wire heats up and drops voltage at high currents; use at least 0.5 mm² (20 AWG) for motor currents."),
      options: [["0.14", tr("0,14 mm² (26 AWG)", "0.14 mm² (26 AWG)")], ["0.25", tr("0,25 mm² (24 AWG)", "0.25 mm² (24 AWG)")], ["0.5", tr("0,5 mm² (20 AWG)", "0.5 mm² (20 AWG)")], ["0.75", tr("0,75 mm² (18 AWG)", "0.75 mm² (18 AWG)")],
                ["1", tr("1,0 mm² (17 AWG)", "1.0 mm² (17 AWG)")], ["1.5", tr("1,5 mm² (16 AWG)", "1.5 mm² (16 AWG)")], ["2.5", tr("2,5 mm² (14 AWG)", "2.5 mm² (14 AWG)")], ["4", "4 mm² (12 AWG)"]] },
  ];
  const ALL = [...BATTERY, ...REG, ...DRIVER, ...WIRE];

  let state, el;

  function render(root, tool) {
    el = root;
    state = getToolState("power", DEFAULTS);
    // Kuormataulukon rivit tarkistetaan: luvut luvuiksi ja tuntemattomat rivit pois (tuotu projekti voi olla mitä vain)
    const num = (v, d) => (Number.isFinite(+v) ? +v : d);
    state.loads = (Array.isArray(state.loads) ? state.loads : DEFAULTS.loads).filter((l) => l && typeof l === "object").map((l) => ({
      ...l, name: String(l.name ?? ""), qty: num(l.qty, 1), avg: num(l.avg, 0), peak: num(l.peak, 0), rail: l.rail === "bat" ? "bat" : "reg",
    }));
    el.innerHTML = `
      ${toolHead(tool, `<button class="btn" id="pw-reset">${tr("Palauta oletukset", "Reset defaults")}</button>`)}
      <div class="tool">
        <div class="col">
          <div class="card"><h3 class="card-title">${tr("Akku", "Battery")}</h3><div class="fields" data-group="battery"></div></div>
          <div class="card"><h3 class="card-title">${tr("Jännitesäädin", "Voltage regulator")}</h3><div class="fields" data-group="reg"></div></div>
          <div class="card"><h3 class="card-title">${tr("Moottoriohjain", "Motor driver")}</h3><div class="fields" data-group="driver"></div></div>
          <button class="link-btn" id="pw-adv"></button>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Kuormat", "Loads")}</h3>
            <div class="table-wrap"><table class="loads" id="pw-loads"></table></div>
            <div class="row-actions">
              <button class="btn" id="pw-add">${tr("+ Lisää kuorma", "+ Add load")}</button>
              <button class="btn" id="pw-motor" title="${tr("Käyttää Moottori ja voimansiirto -työkalun laskemia virtoja", "Uses the currents calculated by the Motor and drivetrain tool")}">${tr("Hae moottorit moottorilaskimesta", "Import motors from motor calculator")}</button>
            </div>
          </div>
          <div id="pw-results"></div>
          <div id="pw-alerts"></div>
          <p class="note">${tr("Laskelmat perustuvat syöttämiisi nimellisarvoihin. Ne eivät takaa turvallisuutta — tarkista raja-arvot komponenttien datasheeteistä ja käytä sulaketta akun perässä.", "Calculations are based on the rated values you entered. They do not guarantee safety — check the limits in the component datasheets and put a fuse after the battery.")}</p>
        </div>
      </div>`;

    drawFields();
    drawLoads();
    const onField = (key) => {
      saveToolState("power", state);
      if (key === "regType") drawFields();
      update();
    };
    el.querySelectorAll("[data-group]").forEach((box) => bindFields(box, ALL, state, onField));

    el.querySelector("#pw-adv").onclick = () => { state._adv = !(state._adv ?? settings.advanced); saveToolState("power", state); drawFields(); };
    el.querySelector("#pw-add").onclick = () => {
      state.loads.push({ name: tr("Uusi kuorma", "New load"), qty: 1, avg: 50, peak: 50, rail: state.regType === "none" ? "bat" : "reg", kind: "other" });
      saveToolState("power", state); drawLoads(); update();
    };
    el.querySelector("#pw-motor").onclick = importMotors;
    el.querySelector("#pw-reset").onclick = () => {
      state = { ...JSON.parse(JSON.stringify(DEFAULTS)), _adv: state._adv };
      saveToolState("power", state);
      render(root, tool);
    };
    update();
  }

  // Korvaa moottori-tyyppiset kuormat moottorilaskimen moottoreilla. Kutsutaan napista ja
  // app.js:stä, kun käyttäjä saapuu moottorityökalun "Seuraava askel" -linkistä.
  function importMotors() {
    if (typeof window.motorSummary !== "function") return;
    const m = window.motorSummary();
    // Jos sivu ei (vielä) ole näkyvissä, muokataan tallennettua tilaa — render lukee sen myöhemmin
    const visible = !!el?.querySelector("#pw-loads");
    const s = visible ? state : getToolState("power", DEFAULTS);
    s.loads = s.loads.filter((l) => l.kind !== "motor");
    s.loads.push({ name: m.joint ? tr("Nivelmoottori", "Joint motor") : tr("Vetomoottori", "Drive motor"), qty: m.motors, avg: Math.round(m.iMotor * 1000), peak: Math.round(m.iStall * 1000), rail: "bat", kind: "motor" });
    saveToolState("power", s);
    if (visible) { drawLoads(); update(); }
    const one = m.motors === 1;
    toast(tr(`Lisätty ${m.motors} ${one ? "moottori" : "moottoria"}: ${Math.round(m.iMotor * 1000)} mA ajossa, ${Math.round(m.iStall * 1000)} mA jumissa`, `Added ${m.motors} ${one ? "motor" : "motors"}: ${Math.round(m.iMotor * 1000)} mA running, ${Math.round(m.iStall * 1000)} mA stalled`));
  }

  function drawFields() {
    const adv = state._adv ?? settings.advanced;
    el.querySelector('[data-group="battery"]').innerHTML = fieldsHtml(BATTERY, state, adv);
    el.querySelector('[data-group="reg"]').innerHTML = fieldsHtml(REG, state, adv);
    el.querySelector('[data-group="driver"]').innerHTML = fieldsHtml(DRIVER, state, adv) +
      (adv ? `<div class="subhead">${tr("Johdotus", "Wiring")}</div>${fieldsHtml(WIRE, state, adv)}` : "");
    el.querySelector("#pw-adv").textContent = adv ? tr("Piilota lisäsyötteet", "Hide advanced inputs") : tr("Näytä lisäsyötteet (purkukyky, hyötysuhde, johdot)", "Show advanced inputs (discharge rating, efficiency, wiring)");
    drawLoads();
  }

  function drawLoads() {
    const noReg = state.regType === "none";
    const table = el.querySelector("#pw-loads");
    table.innerHTML = `
      <tr><th>${tr("Nimi", "Name")}</th><th>${tr("Kpl", "Qty")}</th><th>${tr("Keski mA", "Avg mA")}</th><th>${tr("Huippu mA", "Peak mA")}</th>${noReg ? "" : `<th>${tr("Syöttö", "Supply")}</th>`}<th>${tr("Tyyppi", "Type")}</th><th></th></tr>
      ${state.loads.map((l, i) => `<tr>
        <td class="name"><input type="text" data-l="${i}:name" value="${esc(l.name)}" aria-label="${tr("Nimi", "Name")}"></td>
        <td style="width:54px"><input type="number" data-l="${i}:qty" min="1" max="999" step="1" value="${l.qty}" aria-label="${tr("Määrä", "Quantity")}"></td>
        <td style="width:78px"><input type="number" data-l="${i}:avg" min="0" max="1000000" step="1" value="${l.avg}" aria-label="${tr("Keskivirta", "Average current")}"></td>
        <td style="width:78px"><input type="number" data-l="${i}:peak" min="0" max="1000000" step="1" value="${l.peak}" aria-label="${tr("Huippuvirta", "Peak current")}"></td>
        ${noReg ? "" : `<td style="width:100px"><select data-l="${i}:rail" aria-label="${tr("Syöttö", "Supply")}">
          <option value="reg" ${l.rail === "reg" ? "selected" : ""}>${tr("Säädin", "Regulator")}</option>
          <option value="bat" ${l.rail === "bat" ? "selected" : ""}>${tr("Akku", "Battery")}</option></select></td>`}
        <td style="width:100px"><select data-l="${i}:kind" aria-label="${tr("Tyyppi", "Type")}">
          <option value="other" ${l.kind !== "motor" ? "selected" : ""}>${tr("Muu", "Other")}</option>
          <option value="motor" ${l.kind === "motor" ? "selected" : ""}>${tr("Moottori", "Motor")}</option></select></td>
        <td class="x"><button class="del" data-del="${i}" title="${tr("Poista", "Remove")}" aria-label="${tr("Poista", "Remove")}">✕</button></td>
      </tr>`).join("")}`;
    table.oninput = (e) => {
      const [i, key] = (e.target.dataset.l || "").split(":");
      if (!key) return;
      let v = e.target.value;
      if (e.target.type === "number") {
        const n = parseFloat(v);
        const bad = v === "" || Number.isNaN(n) || n < +e.target.min || n > +e.target.max;
        e.target.classList.toggle("invalid", bad);
        if (bad) return;
        v = n;
      }
      state.loads[i][key] = v;
      saveToolState("power", state); update();
    };
    table.onclick = (e) => {
      const d = e.target.dataset.del;
      if (d === undefined) return;
      state.loads.splice(+d, 1);
      saveToolState("power", state); drawLoads(); update();
    };
  }

  const compute = (s) => {
    const noReg = s.regType === "none";
    return Calc.power({
      battery: { v: s.bV, mAh: s.mAh, cRate: s.cRate, burstC: Math.max(s.burstC, s.cRate), usable: s.usable / 100 },
      reg: { type: s.regType, vOut: s.vOut, eff: s.regEff / 100, maxA: s.regMax, dropout: s.dropout },
      loads: s.loads.map((l) => ({ ...l, rail: noReg ? "bat" : l.rail })),
      wire: { length: s.wireLen, area: parseFloat(s.wireArea) },
      driver: { contA: s.drvCont, peakA: s.drvPeak, maxV: s.drvMaxV },
    });
  };
  // Kurssit: tallennetun tilan tulokset
  window.powerResult = () => { const s = getToolState("power", DEFAULTS); return { s, r: compute(s) }; };

  function update() {
    const noReg = state.regType === "none";
    const r = compute(state);
    const has = (needle) => r.warnings.some((w) => w.level === "err" && w.text.includes(needle));
    const h = r.runtimeH;
    const runtime = !Number.isFinite(h) ? { v: "∞", u: "" } : h < 1 ? { v: fmt(h * 60, 0), u: "min" } : { v: fmt(h, 1), u: "h" };

    const tiles = [
      { label: tr("Arvioitu käyttöaika", "Estimated runtime"), value: runtime.v, unit: runtime.u, sub: tr(`${state.usable} % kapasiteetista, keskivirralla`, `${state.usable} % of capacity, at average current`) },
      { label: tr("Keskivirta akusta", "Average battery current"), value: fmt(r.totAvg, 2), unit: "A", level: has(tr("Keskivirta", "Average current")) ? "err" : "" },
      { label: tr("Huippuvirta akusta", "Peak battery current"), value: fmt(r.totPeak, 2), unit: "A", level: has(tr("Huippuvirta", "Peak current")) ? "err" : r.totPeak > r.contA ? "warn" : "" },
      { label: tr("Akun jatkuva raja", "Battery continuous limit"), value: fmt(r.contA, 1), unit: "A", sub: tr(`hetkellinen ${fmt(r.burstA, 1)} A`, `burst ${fmt(r.burstA, 1)} A`) },
    ];
    if (!noReg) tiles.push(
      { label: tr("Säätimen kuorma", "Regulator load"), value: fmt(r.regAvg, 2), unit: "A", sub: tr(`huippu ${fmt(r.regPeak, 2)} A / max ${state.regMax} A`, `peak ${fmt(r.regPeak, 2)} A / max ${state.regMax} A`), level: r.regPeak > state.regMax ? "err" : "" },
      { label: tr("Säätimen lämpöhäviö", "Regulator heat loss"), value: fmt(r.regLossAvg, 2), unit: "W", level: state.regType === "linear" && r.regLossAvg > 1 ? "warn" : "" },
    );
    tiles.push({ label: tr("Jännitehäviö johdoissa", "Wire voltage drop"), value: fmt(r.dropPeak, 2), unit: "V", sub: tr(`huippuvirralla (${fmt(r.rWire * 1000, 0)} mΩ)`, `at peak current (${fmt(r.rWire * 1000, 0)} mΩ)`) });
    el.querySelector("#pw-results").innerHTML = resultTiles(tiles);

    const alerts = r.warnings.length ? r.warnings : [{ level: "ok", text: tr("Ei havaittuja ylityksiä syötetyillä arvoilla.", "No limits exceeded with the entered values.") }];
    el.querySelector("#pw-alerts").innerHTML = alertsHtml(alerts);
  }

  // Esimerkit: tyypillisiä harrasteosien arvoja, eivät tarkkoja datasheet-arvoja
  const applyExample = (values) => {
    const cur = getToolState("power", DEFAULTS);
    saveToolState("power", { ...JSON.parse(JSON.stringify(DEFAULTS)), ...values, _adv: cur._adv });
  };
  const load = (fi, en, qty, avg, peak, rail, kind = "other") => ({ name: tr(fi, en), qty, avg, peak, rail, kind });
  const EXAMPLES = [
    { name: tr("Arduino 2WD -auto", "Arduino 2WD car"),
      desc: tr("2S LiPo, LM2596-hakkuri 5 V, TB6612FNG ja kaksi TT-moottoria", "2S LiPo, LM2596 buck to 5 V, TB6612FNG and two TT motors"),
      apply: () => applyExample({
        bV: 7.4, mAh: 2200, cRate: 25, burstC: 50, usable: 80,
        regType: "buck", vOut: 5, regEff: 85, regMax: 3, dropout: 1.1,
        drvCont: 1.2, drvPeak: 3.2, drvMaxV: 13.5, wireLen: 0.3, wireArea: "0.5",
        loads: [
          load("Arduino Uno", "Arduino Uno", 1, 50, 80, "reg"),
          load("Ultraäänianturi HC-SR04", "Ultrasonic sensor HC-SR04", 1, 15, 15, "reg"),
          load("IR-viiva-anturi", "IR line sensor", 3, 20, 20, "reg"),
          load("Servo SG90", "Servo SG90", 1, 100, 650, "reg"),
          load("TT-vaihdemoottori", "TT gearmotor", 2, 250, 1500, "bat", "motor"),
        ],
      }) },
    { name: tr("Raspberry Pi -rover", "Raspberry Pi rover"),
      desc: tr("3S LiPo, 5 V 3 A hakkuri, L298N ja 12 V vaihdemoottorit", "3S LiPo, 5 V 3 A buck, L298N and 12 V gearmotors"),
      apply: () => applyExample({
        bV: 11.1, mAh: 5000, cRate: 30, burstC: 60, usable: 80,
        regType: "buck", vOut: 5, regEff: 90, regMax: 3, dropout: 1.1,
        drvCont: 2, drvPeak: 3, drvMaxV: 46, wireLen: 0.3, wireArea: "0.75",
        loads: [
          load("Raspberry Pi 4", "Raspberry Pi 4", 1, 800, 1500, "reg"),
          load("Kameramoduuli", "Camera module", 1, 200, 250, "reg"),
          load("IMU-anturi", "IMU sensor", 1, 10, 10, "reg"),
          load("12 V vaihdemoottori", "12 V gearmotor", 2, 450, 2500, "bat", "motor"),
        ],
      }) },
    { name: tr("ESP32-anturirobotti 18650-akulla", "ESP32 sensor robot on 18650 cells"),
      desc: tr("2 × 18650 (7,4 V), 5 V hakkuri, DRV8833 ja N20-moottorit", "2 × 18650 (7.4 V), 5 V buck, DRV8833 and N20 motors"),
      apply: () => applyExample({
        bV: 7.4, mAh: 3000, cRate: 5, burstC: 7, usable: 80,
        regType: "buck", vOut: 5, regEff: 88, regMax: 2, dropout: 1.1,
        drvCont: 1.5, drvPeak: 2, drvMaxV: 10.8, wireLen: 0.2, wireArea: "0.5",
        loads: [
          load("ESP32 (WiFi päällä)", "ESP32 (WiFi on)", 1, 120, 500, "reg"),
          load("Etäisyysanturi VL53L0X", "Distance sensor VL53L0X", 1, 20, 40, "reg"),
          load("Ympäristöanturi BME280", "Environment sensor BME280", 1, 1, 1, "reg"),
          load("OLED-näyttö", "OLED display", 1, 20, 30, "reg"),
          load("N20-vaihdemoottori", "N20 gearmotor", 2, 120, 700, "bat", "motor"),
        ],
      }) },
    { name: tr("Alimitoitettu kokoonpano", "Undersized setup"),
      desc: tr("AMS1117 ylikuumenee, ohjain ylikuormittuu, ohut johto — näyttää varoitukset", "AMS1117 overheats, driver overloads, thin wire — shows the warnings"),
      apply: () => applyExample({
        bV: 11.1, mAh: 1000, cRate: 20, burstC: 40, usable: 80,
        regType: "linear", vOut: 5, regEff: 85, regMax: 1, dropout: 1.1,
        drvCont: 1.2, drvPeak: 3.2, drvMaxV: 13.5, wireLen: 0.5, wireArea: "0.14",
        loads: [
          load("Arduino Uno", "Arduino Uno", 1, 50, 80, "reg"),
          load("Servo MG996R", "Servo MG996R", 2, 300, 1500, "reg"),
          load("JGB37-520 12 V", "JGB37-520 12 V", 2, 1500, 5000, "bat", "motor"),
        ],
      }) },
  ];

  TOOL_IMPL.power = { render, examples: EXAMPLES, importMotors };
})();
