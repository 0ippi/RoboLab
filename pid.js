"use strict";

/* PID-viritin: säätimen parametrit → simuloitu askelvaste ja tunnusluvut. */
(() => {
  const DEFAULTS = {
    kp: 2, ki: 4, kd: 0, plant: "first", T: 3,
    K: 1, tau: 0.5, m: 1, b: 0.5,
    setpoint: 1, umax: 0, antiWindup: true, dTau: 0.01, distT: 0, distMag: 0,
  };

  const FIELDS = [
    { key: "plant", label: tr("Ohjattava järjestelmä", "Controlled system"), type: "select",
      info: tr("Mitä säädin ohjaa. Moottorin nopeus seuraa ohjausta viiveellä (1. kertaluku); massan asento kiihtyy ja jatkaa liikettään, joten se heilahtaa helpommin (2. kertaluku).", "What the controller drives. Motor speed follows the input with a lag (1st order); a mass position accelerates and keeps moving, so it overshoots more easily (2nd order)."),
      options: [["first", tr("DC-moottorin nopeus (1. kertaluku)", "DC motor speed (1st order)")], ["mass", tr("Massan asento (2. kertaluku)", "Mass position (2nd order)")]] },
    { key: "kp", label: "Kp", help: tr("Vahvistus: reagoi nykyiseen virheeseen", "Proportional: reacts to the current error"), type: "slider", min: 0, max: 50, step: 0.1,
      info: tr("Kuinka voimakkaasti säädin reagoi nykyiseen virheeseen. Tyypillisesti 0,5–10; liian suuri aiheuttaa heilahtelua.", "How strongly the controller reacts to the current error. Typically 0.5–10; too high causes oscillation.") },
    { key: "ki", label: "Ki", help: tr("Integraali: poistaa pysyvän virheen", "Integral: removes steady-state error"), type: "slider", min: 0, max: 50, step: 0.1,
      info: tr("Kasvattaa ohjausta niin kauan kuin virhettä on jäljellä, joten vaste päätyy lopulta tarkalleen asetusarvoon. Liian suuri Ki aiheuttaa ylitystä ja hidasta heilumista.", "Keeps increasing the output as long as an error remains, so the response finally reaches the setpoint exactly. Too much Ki causes overshoot and slow swinging.") },
    { key: "kd", label: "Kd", help: tr("Derivaatta: vaimentaa heilahtelua", "Derivative: damps oscillation"), type: "slider", min: 0, max: 10, step: 0.01,
      info: tr("Jarruttaa, kun vaste muuttuu nopeasti — toimii kuin iskunvaimennin. Tärkeä massan asennolle; moottorin nopeudelle usein 0.", "Brakes when the response changes quickly — works like a shock absorber. Important for mass position; often 0 for motor speed.") },
    { key: "T", label: tr("Simulaation kesto", "Simulation duration"), unit: "s", min: 0.1, max: 120, step: 0.1,
      info: tr("Kuinka pitkä ajanjakso askeleen jälkeen simuloidaan. Valitse niin pitkä, että vaste ehtii asettua, tyypillisesti muutama sekunti.", "How long after the step is simulated. Make it long enough for the response to settle, typically a few seconds.") },
    { key: "K", label: tr("Laitoksen vahvistus K", "Plant gain K"), adv: true, min: 0.01, max: 100, step: 0.01, when: (s) => s.plant === "first",
      info: tr("Kuinka paljon lähtö lopulta muuttuu yhtä ohjausyksikköä kohden. K = 1 tarkoittaa, että ohjaus 1 antaa ajan myötä lähdön 1.", "How much the output finally changes per unit of control. K = 1 means a control of 1 eventually gives an output of 1.") },
    { key: "tau", label: tr("Aikavakio τ", "Time constant τ"), unit: "s", adv: true, min: 0.001, max: 100, step: 0.01, when: (s) => s.plant === "first",
      info: tr("Kuinka hitaasti järjestelmä reagoi: ilman säädintä se saavuttaa 63 % lopullisesta arvosta ajassa τ. Pienillä moottoreilla tyypillisesti 0,05–1 s.", "How slowly the system reacts: without control it reaches 63 % of its final value in time τ. Typically 0.05–1 s for small motors.") },
    { key: "m", label: tr("Massa m", "Mass m"), unit: "kg", adv: true, min: 0.001, max: 1000, step: 0.1, when: (s) => s.plant === "mass",
      info: tr("Liikuteltava massa. Mitä suurempi massa, sitä enemmän voimaa tarvitaan sen kiihdyttämiseen ja jarruttamiseen.", "The mass being moved. The heavier it is, the more force is needed to accelerate and stop it.") },
    { key: "b", label: tr("Vaimennus b", "Damping b"), unit: "N·s/m", adv: true, min: 0, max: 1000, step: 0.1, when: (s) => s.plant === "mass",
      info: tr("Nopeuteen verrannollinen kitka, joka hidastaa liikettä. Pieni arvo (esim. 0,1–1) tarkoittaa liukasta järjestelmää, joka heiluu helposti.", "Speed-proportional friction that slows the motion. A small value (e.g. 0.1–1) means a slippery system that oscillates easily.") },
    { key: "setpoint", label: tr("Asetusarvo (askel)", "Setpoint (step)"), adv: true, min: 0.001, max: 1e6, step: 0.1,
      info: tr("Tavoitearvo, johon säädin yrittää viedä vasteen hetkellä 0 (esim. nopeus tai asento). Yleensä riittää 1.", "The target the controller tries to reach from time 0 (e.g. a speed or position). 1 is usually fine.") },
    { key: "umax", label: tr("Ohjauksen raja ±", "Control output limit ±"), help: tr("0 = ei rajaa (todellisissa moottoreissa aina raja)", "0 = no limit (real motors always have one)"), adv: true, min: 0, max: 1e6, step: 0.1,
      info: tr("Suurin ohjaus, jonka toimilaite pystyy antamaan, esim. akun jännite tai 100 % PWM. Kun raja tulee vastaan, vaste ei nopeudu vahvistuksia kasvattamalla.", "The largest output the actuator can give, e.g. the battery voltage or 100 % PWM. Once it is reached, higher gains cannot make the response faster.") },
    { key: "antiWindup", label: "Anti-windup", help: tr("Pysäyttää integroinnin, kun ohjaus on rajalla", "Stops integrating while the output is saturated"), type: "toggle", adv: true,
      info: tr("Ilman tätä integraali kasvaa rajoituksen aikana valtavaksi ja aiheuttaa ison ylityksen. Pidä yleensä päällä.", "Without it the integral grows huge while the output is limited and causes a big overshoot. Usually keep it on.") },
    { key: "dTau", label: tr("D-termin suodatin", "D-term filter"), unit: "s", help: tr("Alipäästön aikavakio, 0 = ei suodatusta", "Low-pass time constant, 0 = no filtering"), adv: true, min: 0, max: 10, step: 0.001,
      info: tr("Tasoittaa derivaattatermiä, jotta anturikohina ei saa ohjausta värisemään. Tyypillisesti noin 1/10 halutusta vasteajasta, esim. 0,005–0,05 s.", "Smooths the derivative term so sensor noise does not make the output jitter. Typically about 1/10 of the desired response time, e.g. 0.005–0.05 s.") },
    { key: "distT", label: tr("Häiriön alkuhetki", "Disturbance start time"), unit: "s", help: tr("0 = ei häiriötä", "0 = no disturbance"), adv: true, min: 0, max: 120, step: 0.1,
      info: tr("Hetki, jolloin järjestelmään tulee äkillinen ulkoinen kuorma, esim. robotti alkaa nousta mäkeä. Näin näet, kuinka hyvin säädin palauttaa vasteen.", "The moment a sudden external load hits the system, e.g. the robot starts climbing a slope. Shows how well the controller recovers.") },
    { key: "distMag", label: tr("Häiriön suuruus", "Disturbance magnitude"), help: tr("Lisätään ohjaukseen (esim. kuorma)", "Added to the control output (e.g. a load)"), adv: true, min: -1e6, max: 1e6, step: 0.1,
      info: tr("Häiriön voimakkuus ohjauksen yksiköissä. Negatiivinen arvo jarruttaa (kuten kuorma), positiivinen työntää (kuten alamäki).", "Disturbance strength in control-output units. A negative value brakes (like a load), a positive one pushes (like a downhill).") },
  ];

  // Esimerkit: jokainen tallentaa täydellisen tilan ja säilyttää lisäsyötteiden näkyvyyden
  const applyExample = (values) => {
    const cur = getToolState("pid", DEFAULTS);
    saveToolState("pid", { ...DEFAULTS, ...values, _adv: cur._adv });
  };
  const EXAMPLES = [
    { name: tr("Hyvin viritetty moottorin nopeus", "Well-tuned motor speed"),
      desc: tr("PI-säädin, jonka Ki/Kp = 1/τ: nopea vaste ilman ylitystä", "PI controller with Ki/Kp = 1/τ: fast response with no overshoot"),
      // Ki/Kp = 1/τ kumoaa laitoksen navan → suljettu silmukka on 1. kertaluvun, aikavakio τ/(K·Kp)
      apply: () => applyExample({ plant: "first", K: 1, tau: 0.5, kp: 4, ki: 8, kd: 0, T: 2 }) },
    { name: tr("Massa ilman D-termiä heiluu", "Mass without D term oscillates"),
      desc: tr("Pelkkä P-säätö asennolle: vaste heiluu pitkään", "P-only position control: the response swings for a long time"),
      apply: () => applyExample({ plant: "mass", m: 1, b: 0.5, kp: 20, ki: 0, kd: 0, T: 10 }) },
    { name: tr("Massan asento PD-säädöllä", "Mass position with PD control"),
      desc: tr("Sama massa, Kd vaimentaa heilunnan lähes kokonaan", "Same mass, Kd damps the swinging almost completely"),
      apply: () => applyExample({ plant: "mass", m: 1, b: 0.5, kp: 20, ki: 0, kd: 8, T: 4 }) },
    { name: tr("Integraalin windup", "Integral windup"),
      desc: tr("Ohjaus rajattu, anti-windup pois: iso ylitys — kytke anti-windup päälle ja vertaa", "Output limited, anti-windup off: big overshoot — turn anti-windup on to compare"),
      apply: () => applyExample({ plant: "first", K: 1, tau: 0.5, kp: 2, ki: 10, kd: 0, T: 5, umax: 1.3, antiWindup: false }) },
    { name: tr("Kuormahäiriön torjunta", "Load disturbance rejection"),
      desc: tr("Moottoriin tulee kuorma hetkellä 2 s; integraali palauttaa nopeuden", "A load hits the motor at 2 s; the integral restores the speed"),
      apply: () => applyExample({ plant: "first", K: 1, tau: 0.5, kp: 4, ki: 8, kd: 0, T: 5, distT: 2, distMag: -0.5 }) },
  ];

  let state, el, frame = 0;

  function render(root, tool) {
    el = root;
    state = getToolState("pid", DEFAULTS);
    el.innerHTML = `
      ${toolHead(tool, `<button class="btn" id="pid-reset">${tr("Palauta oletukset", "Reset defaults")}</button>`)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Säädin", "Controller")}</h3>
            <div class="fields" id="pid-fields"></div>
          </div>
        </div>
        <div class="col">
          <div id="pid-results"></div>
          <div class="card">
            <h3 class="card-title">${tr("Askelvaste", "Step response")}</h3>
            <canvas class="plot" id="pid-plot"></canvas>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Ohjaussignaali u", "Control signal u")}</h3>
            <canvas class="plot small" id="pid-u"></canvas>
          </div>
          <div id="pid-alerts"></div>
        </div>
      </div>`;
    drawFields();
    bindFields(el.querySelector("#pid-fields"), FIELDS, state, (key) => {
      saveToolState("pid", state);
      if (key === "plant") drawFields();
      schedule();
    });
    el.querySelector("#pid-reset").onclick = () => {
      state = { ...DEFAULTS, _adv: state._adv };
      saveToolState("pid", state);
      render(root, tool);
    };
    window.addEventListener("resize", schedule);
    update();
  }

  function drawFields() {
    const adv = state._adv ?? settings.advanced;
    const box = el.querySelector("#pid-fields");
    box.innerHTML = fieldsHtml(FIELDS, state, adv) +
      `<button class="link-btn" id="pid-adv">${adv ? tr("Piilota lisäsyötteet", "Hide advanced inputs") : tr("Näytä lisäsyötteet", "Show advanced inputs")}</button>`;
    box.querySelector("#pid-adv").onclick = () => { state._adv = !adv; saveToolState("pid", state); drawFields(); };
  }

  function schedule() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }

  function update() {
    if (!el.querySelector("#pid-plot")) return; // sivu vaihdettu
    const sim = Calc.simulatePid(state);
    const m = Calc.stepMetrics(sim, state.setpoint);
    const alerts = [];

    if (sim.unstable) {
      alerts.push({ level: "err", text: tr("Järjestelmä on epästabiili — vaste karkaa. Pienennä Kp:tä tai Ki:tä, tai lisää Kd:tä.", "The system is unstable — the response diverges. Reduce Kp or Ki, or increase Kd.") });
    } else {
      if (sim.growing) alerts.push({ level: "err", text: tr("Säätö on epästabiili: värähtely kasvaa ajan myötä, vaikka se ei vielä näy tässä lyhyessä simulaatiossa. Pidennä kestoa nähdäksesi sen, ja pienennä Ki:tä tai lisää Kd:tä.", "The control loop is unstable: the oscillation grows over time, even if this short simulation does not show it yet. Lengthen the duration to see it, and reduce Ki or increase Kd.") });
      if (m.overshoot > 25) alerts.push({ level: "warn", text: tr(`Ylitys ${fmt(m.overshoot, 0)} % on suuri. Pienennä Kp:tä tai lisää Kd:tä.`, `Overshoot of ${fmt(m.overshoot, 0)} % is large. Reduce Kp or increase Kd.`) });
      if (m.settling === null) alerts.push({ level: "warn", text: tr("Vaste ei asetu 2 %:n tarkkuuteen simulaation aikana. Pidennä kestoa tai viritä uudelleen.", "The response does not settle within 2 % during the simulation. Increase the duration or retune.") });
      // Massan asennossa laitoksessa on jo integraattori: P-säätö ei jätä pysyvää virhettä, vain heiluntaa
      if (state.plant === "first" && m.settling !== null && Math.abs(m.sse) > 0.02 * state.setpoint && state.ki === 0) alerts.push({ level: "info", text: tr("Pysyvä virhe jää, koska Ki = 0. Pieni Ki poistaa sen.", "A steady-state error remains because Ki = 0. A small Ki removes it.") });
      if (state.umax > 0 && sim.u.some((u) => Math.abs(u) >= state.umax)) alerts.push({ level: "info", text: tr("Ohjaus käy rajallaan — vaste ei voi nopeutua enempää vahvistuksia kasvattamalla.", "The control output hits its limit — raising the gains cannot make the response any faster.") });
      if (!alerts.length) alerts.push({ level: "ok", text: tr("Vaste on stabiili ja asettuu ilman suurta ylitystä.", "The response is stable and settles without large overshoot.") });
    }

    const lvl = (bad, warn) => (bad ? "err" : warn ? "warn" : "");
    el.querySelector("#pid-results").innerHTML = resultTiles([
      { label: tr("Nousuaika (10–90 %)", "Rise time (10–90 %)"), value: sim.unstable ? "–" : fmt(m.rise, 3), unit: "s" },
      { label: tr("Ylitys", "Overshoot"), value: sim.unstable ? "–" : fmt(m.overshoot, 1), unit: "%", level: lvl(false, m.overshoot > 25) },
      { label: tr("Asettumisaika (2 %)", "Settling time (2 %)"), value: sim.unstable || m.settling === null ? "–" : fmt(m.settling, 3), unit: "s", level: lvl(sim.unstable, m.settling === null) },
      { label: tr("Pysyvä virhe", "Steady-state error"), value: sim.unstable ? "–" : fmt(m.sse, 3), level: lvl(false, Math.abs(m.sse) > 0.02 * state.setpoint) },
    ]);
    el.querySelector("#pid-alerts").innerHTML = alertsHtml(alerts);

    drawPlot(el.querySelector("#pid-plot"), {
      xLabel: "t [s]",
      yMin: 0,
      series: [
        { x: sim.t, y: sim.r, label: tr("Asetusarvo", "Setpoint"), color: cssColor("var(--text-3)"), dash: [5, 4], width: 1.5 },
        { x: sim.t, y: sim.y, label: tr("Vaste", "Response"), color: seriesColor(0) },
      ],
    });
    drawPlot(el.querySelector("#pid-u"), {
      xLabel: "t [s]",
      series: [{ x: sim.t, y: sim.u, label: "u", color: seriesColor(1), width: 1.5 }],
    });
  }

  TOOL_IMPL.pid = {
    render,
    examples: EXAMPLES,
    unmount() { window.removeEventListener("resize", schedule); cancelAnimationFrame(frame); },
  };
  // Kurssit lukevat säätimen tilan ja askelvasteen tunnusluvut tästä
  window.pidResult = () => {
    const s = getToolState("pid", DEFAULTS), sim = Calc.simulatePid(s);
    return { s, unstable: sim.unstable || sim.growing, m: Calc.stepMetrics(sim, s.setpoint) };
  };
})();
