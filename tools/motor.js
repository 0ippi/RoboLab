"use strict";

/* Moottori ja voimansiirto: moottorin datasheet-arvoista joko pyörärobotin nopeus, vetovoima, mäennousu ja virta
   tai robottikäsivarren nivelen pito- ja kiihdytysmomentti. */
(() => {
  const D = Math.PI / 180;
  // Oletukset: tyypillinen kaksipyöräinen harrasterobotti, "TT"-vaihdemoottorit 6 V:lla.
  // Nivelmoodin oletus: pieni pöytäkäsivarsi (kulmat tallennetaan radiaaneina, pituus millimetreinä).
  const DEFAULTS = {
    kind: "wheel",
    mass: 1.5, wheelD: 65, motors: 2, rpm: 200, stallTorque: 0.08, stallCurrent: 1.5,
    ratio: 1, eff: 100, noLoadCurrent: 0.15, vNom: 6, vBat: 6,
    crr: 0.03, slopeDeg: 0, mu: 0.7, driveShare: 100,
    jPayload: 0.2, jLength: 300, jArmMass: 0.3, jSpeed: 90 * D, jAccel: 180 * D,
  };
  const tq = () => Calc.TORQUE_TO_NM[settings.torqueUnit] || 1;
  const tqLabel = () => Calc.TORQUE_LABEL[settings.torqueUnit] || "N·m";
  const wheel = (s) => s.kind !== "joint", joint = (s) => s.kind === "joint";

  const FIELDS = [
    { key: "kind", label: tr("Mitä mitoitetaan", "What are you sizing"), type: "select",
      options: [["wheel", tr("Pyörärobotin vetomoottorit", "Wheeled robot drive motors")], ["joint", tr("Robottikäsivarren nivel", "Robot arm joint")]],
      info: tr("Pyörärobotti: lasketaan ajonopeus, vetovoima ja mäennousu. Käsivarren nivel: lasketaan, jaksaako moottori pitää ja kiihdyttää vartta kuormineen pahimmassa asennossa (varsi vaakasuorassa).",
        "Wheeled robot: computes driving speed, tractive force and climbing. Arm joint: checks whether the motor can hold and accelerate the arm and payload in the worst pose (arm horizontal).") },
    { key: "jPayload", label: tr("Kuorma kärjessä", "Payload at the tip"), unit: "kg", min: 0, max: 1000, step: 0.05, when: joint,
      info: tr("Tarttujan ja kappaleen massa yhteensä varren päässä. Pienillä pöytäkäsivarsilla tyypillisesti 0,05–0,5 kg.", "Gripper plus object mass at the end of the arm. Typically 0.05–0.5 kg for small desktop arms.") },
    { key: "jLength", label: tr("Varren pituus nivelestä kärkeen", "Arm length from joint to tip"), unit: "mm", min: 1, max: 10000, step: 10, when: joint,
      info: tr("Etäisyys tästä nivelestä kuorman kohdalle, kun varsi on ojennettu. Olkanivelelle koko varren pituus, kyynärnivelelle vain kyynärvarsi. Napista saat arvon kinematiikan käsivarsimallista.", "Distance from this joint to the payload with the arm stretched out. For the shoulder it is the whole arm, for the elbow only the forearm. The button fills it from the kinematics arm model.") },
    { key: "jArmMass", label: tr("Varren massa", "Arm mass"), unit: "kg", min: 0, max: 1000, step: 0.05, when: joint,
      info: tr("Nivelen jälkeisten osien massa ilman kuormaa: linkit, seuraavat moottorit ja johdot. Lasketaan tasaisesti jakautuneena koko pituudelle.", "Mass of everything after this joint without the payload: links, further motors and cables. Treated as spread evenly along the length.") },
    { key: "jSpeed", label: tr("Haluttu nivelnopeus", "Desired joint speed"), unit: () => `${angLabel()}/s`, factor: angF, min: 0, max: 1e5, get step() { return settings.angleUnit === "rad" ? 0.1 : 5; }, when: joint,
      info: tr("Kuinka nopeasti nivelen pitäisi kääntyä kuormassa. Pienillä käsivarsilla tyypillisesti 45–180 °/s. Napista saat arvon trajektorigeneraattorista.", "How fast the joint should turn under load. Typically 45–180 °/s for small arms. The button takes it from the trajectory generator.") },
    { key: "jAccel", label: tr("Haluttu kulmakiihtyvyys", "Desired angular acceleration"), unit: () => `${angLabel()}/s²`, factor: angF, min: 0, max: 1e7, get step() { return settings.angleUnit === "rad" ? 0.2 : 10; }, when: joint,
      info: tr("Kuinka nopeasti nivel kiihtyy. Kiihdytys vaatii momenttia painovoiman lisäksi; tyypillisesti 90–720 °/s².", "How quickly the joint speeds up. Acceleration needs torque on top of gravity; typically 90–720 °/s².") },
    { key: "mass", label: tr("Robotin massa", "Robot mass"), unit: "kg", min: 0.01, max: 10000, step: 0.1, when: wheel,
      info: tr("Koko robotin massa akkuineen ja kuormineen. Pienet opetusrobotit 0,3–2 kg, isommat rover-robotit 3–10 kg.", "Total robot mass including battery and payload. Small educational robots 0.3–2 kg, larger rovers 3–10 kg.") },
    { key: "wheelD", when: wheel, label: tr("Pyörän halkaisija", "Wheel diameter"), unit: "mm", min: 1, max: 5000, step: 1,
      info: tr("Vetävän pyörän ulkohalkaisija. Isompi pyörä antaa enemmän nopeutta mutta vähemmän vetovoimaa; tyypillisesti 30–100 mm.", "Outer diameter of a driven wheel. A bigger wheel gives more speed but less pulling force; typically 30–100 mm.") },
    { key: "motors", when: wheel, label: tr("Vetävien moottorien määrä", "Number of drive motors"), min: 1, max: 32, step: 1, int: true,
      info: tr("Kuinka monta moottoria pyörittää pyöriä. Kaksipyöräinen robotti 2, nelivetoinen 4.", "How many motors drive the wheels. A two-wheel robot has 2, a four-wheel-drive one 4.") },
    { key: "rpm", label: tr("Kierrosnopeus tyhjäkäynnillä", "No-load speed"), unit: "rpm", help: tr("Datasheetin 'no-load speed'", "Datasheet 'no-load speed'"), min: 1, max: 100000, step: 1,
      info: tr("Kuinka nopeasti moottorin akseli pyörii ilman kuormaa nimellisjännitteellä. Vaihdemoottoreilla tyypillisesti 100–500 rpm.", "How fast the motor shaft spins with no load at rated voltage. Typically 100–500 rpm for gearmotors.") },
    { key: "stallTorque", label: tr("Jumimomentti", "Stall torque"), unit: tqLabel, factor: tq, help: tr("Datasheetin 'stall torque'. Yksikön voi vaihtaa asetuksista.", "Datasheet 'stall torque'. The unit can be changed in settings."), min: 0.0001, max: 1e6, step: 0.01,
      info: tr("Suurin vääntö, jonka moottori antaa juuri ennen kuin se pysähtyy. Pienillä vaihdemoottoreilla noin 0,05–1 N·m (0,5–10 kgf·cm).", "The largest torque the motor gives just before it stops turning. About 0.05–1 N·m (0.5–10 kgf·cm) for small gearmotors.") },
    { key: "stallCurrent", label: tr("Jumivirta", "Stall current"), unit: "A", help: tr("Datasheetin 'stall current'", "Datasheet 'stall current'"), min: 0, max: 1000, step: 0.1,
      info: tr("Virta, jonka moottori ottaa jumiutuneena tai käynnistyessä. Moottoriohjaimen ja akun pitää kestää se hetkellisesti; tyypillisesti 0,5–5 A.", "The current the motor draws when stalled or starting. The motor driver and battery must survive it briefly; typically 0.5–5 A.") },

    { key: "ratio", label: tr("Lisävälityssuhde", "Extra gear ratio"), help: tr("1 = arvot ovat jo vaihdemoottorin akselilta", "1 = values are already at the gearmotor output shaft"), min: 0.01, max: 10000, step: 0.1,
      info: tr("Moottorin ja pyörän tai nivelen väliin lisätty hammaspyörä- tai hihnavälitys. Esim. 2 = pyörä tai nivel pyörii puolet hitaammin mutta kaksinkertaisella väännöllä.", "Extra gear or belt reduction between the motor and the wheel or joint. E.g. 2 = it turns half as fast but with twice the torque.") },
    { key: "eff", label: tr("Välityksen hyötysuhde", "Gearing efficiency"), unit: "%", adv: true, min: 1, max: 100, step: 1,
      info: tr("Kuinka suuri osa väännöstä pääsee lisävälityksen läpi kitkahäviöiden jälkeen. Hammaspyörät tyypillisesti 80–95 %; 100 %, jos lisävälitystä ei ole.", "How much of the torque gets through the extra gearing after friction losses. Gears are typically 80–95 %; 100 % if there is no extra gearing.") },
    { key: "noLoadCurrent", label: tr("Tyhjäkäyntivirta", "No-load current"), unit: "A", adv: true, min: 0, max: 100, step: 0.01,
      info: tr("Virta, jonka moottori ottaa pyöriessään vapaasti ilman kuormaa. Pienillä vaihdemoottoreilla tyypillisesti 0,05–0,3 A.", "The current the motor draws spinning freely without load. Typically 0.05–0.3 A for small gearmotors.") },
    { key: "vNom", label: tr("Moottorin nimellisjännite", "Motor rated voltage"), unit: "V", help: tr("Jännite, jolla datasheetin arvot on mitattu", "Voltage at which the datasheet values were measured"), adv: true, min: 0.1, max: 1000, step: 0.1,
      info: tr("Jännite, jolle moottori on suunniteltu ja jolla nopeus- ja momenttiarvot on ilmoitettu. Harrastemoottoreilla yleensä 3, 6 tai 12 V.", "The voltage the motor is designed for and at which speed and torque are specified. Usually 3, 6 or 12 V for hobby motors.") },
    { key: "vBat", label: tr("Käyttöjännite", "Supply voltage"), unit: "V", adv: true, min: 0.1, max: 1000, step: 0.1,
      info: tr("Jännite, jolla moottoria todella ajetaan (akku miinus ohjaimen häviö). Nopeus, momentti ja virta muuttuvat suunnilleen samassa suhteessa.", "The voltage the motor actually runs at (battery minus driver loss). Speed, torque and current scale roughly in the same proportion.") },
    { key: "crr", when: wheel, label: tr("Vierintävastuskerroin", "Rolling resistance coefficient"), help: tr("Kova lattia 0,01–0,02 · matto 0,05 · nurmi 0,1", "Hard floor 0.01–0.02 · carpet 0.05 · grass 0.1"), adv: true, min: 0, max: 1, step: 0.005,
      info: tr("Kuinka paljon alusta ja renkaat jarruttavat vierimistä suhteessa painoon. Pehmeä alusta ja pehmeät renkaat kasvattavat sitä.", "How much the surface and tires resist rolling, relative to weight. Soft ground and soft tires increase it.") },
    { key: "slopeDeg", when: wheel, label: tr("Mäen kaltevuus", "Slope angle"), unit: "°", adv: true, min: 0, max: 60, step: 1,
      info: tr("Ylämäen jyrkkyys asteina. Jo 10° mäki lisää kuormaa selvästi; pyörätuoliramppi on noin 5°.", "The uphill angle in degrees. Even a 10° slope adds a lot of load; a wheelchair ramp is about 5°.") },
    { key: "mu", when: wheel, label: tr("Renkaan kitkakerroin", "Tire friction coefficient"), help: tr("Kumi betonilla ~0,7 · muovi ~0,3", "Rubber on concrete ~0.7 · plastic ~0.3"), adv: true, min: 0.01, max: 2, step: 0.05,
      info: tr("Kuinka hyvin renkaat pitävät alustasta. Määrää, milloin pyörät alkavat luistaa, vaikka moottorissa olisi voimaa.", "How well the tires grip the surface. Decides when the wheels start slipping even if the motor has torque to spare.") },
    { key: "driveShare", when: wheel, label: tr("Paino vetävillä pyörillä", "Weight on drive wheels"), unit: "%", help: tr("Esim. 2 vetävää + tukipyörä ≈ 80 %", "E.g. 2 driven wheels + caster ≈ 80 %"), adv: true, min: 1, max: 100, step: 1,
      info: tr("Kuinka suuri osa robotin painosta lepää vetävien pyörien päällä. Vain tämä paino tuottaa pitoa; nelivetoisella 100 %.", "How much of the robot's weight rests on the driven wheels. Only this weight produces grip; 100 % for four-wheel drive.") },
  ];

  // Esimerkit: tyypillisiä harrasteosien arvoja (ei tarkkoja datasheet-arvoja). stallTorque tallennetaan N·m:nä.
  const applyExample = (values) => {
    const cur = getToolState("motor", DEFAULTS);
    saveToolState("motor", { ...DEFAULTS, ...values, _adv: cur._adv });
  };
  const EXAMPLES = [
    { name: tr("2WD-robotti, TT-vaihdemoottorit 6 V", "2WD robot, TT gearmotors at 6 V"),
      desc: tr("Tyypilliset arvot: keltainen TT 1:48, 200 rpm, ~0,8 kgf·cm", "Typical values: yellow TT 1:48, 200 rpm, ~0.8 kgf·cm"),
      apply: () => applyExample({ mass: 0.8, wheelD: 65, motors: 2, rpm: 200, stallTorque: 0.078, stallCurrent: 1.5, noLoadCurrent: 0.15, vNom: 6, vBat: 6, crr: 0.03, mu: 0.7, driveShare: 80 }) },
    { name: tr("Viivanseuraaja, N20-mikromoottorit", "Line follower, N20 micro gearmotors"),
      desc: tr("Tyypilliset arvot: N20 1:100 6 V, 2S LiPo (7,4 V), kevyt ja nopea", "Typical values: N20 1:100 6 V, 2S LiPo (7.4 V), light and fast"),
      apply: () => applyExample({ mass: 0.3, wheelD: 32, motors: 2, rpm: 300, stallTorque: 0.1, stallCurrent: 0.7, noLoadCurrent: 0.06, vNom: 6, vBat: 7.4, crr: 0.015, mu: 0.8, driveShare: 85 }) },
    { name: tr("4WD-rover, JGB37-520 12 V rampissa", "4WD rover, JGB37-520 at 12 V on a ramp"),
      desc: tr("Tyypilliset arvot: 170 rpm, ~10 kgf·cm; 3 kg rover 15° rampissa", "Typical values: 170 rpm, ~10 kgf·cm; 3 kg rover on a 15° ramp"),
      apply: () => applyExample({ mass: 3, wheelD: 85, motors: 4, rpm: 170, stallTorque: 1.0, stallCurrent: 3.5, noLoadCurrent: 0.12, vNom: 12, vBat: 12, crr: 0.05, slopeDeg: 15, mu: 0.8, driveShare: 100 }) },
    { name: tr("Ylikuormitettu raskas robotti", "Overloaded heavy robot"),
      desc: tr("3 kg robotti TT-moottoreilla matolla ja 5° mäessä — näyttää varoitukset", "3 kg robot on TT motors, carpet and a 5° slope — shows the warnings"),
      apply: () => applyExample({ mass: 3, wheelD: 65, motors: 2, rpm: 200, stallTorque: 0.078, stallCurrent: 1.5, noLoadCurrent: 0.15, vNom: 6, vBat: 6, crr: 0.05, slopeDeg: 5, mu: 0.7, driveShare: 80 }) },
    { name: tr("Käsivarren olkanivel, MG996R-servo", "Arm shoulder joint, MG996R servo"),
      desc: tr("Tyypilliset arvot: ~11 kgf·cm, 0,14 s/60° 6 V:lla; 25 cm varsi, 100 g kuorma", "Typical values: ~11 kgf·cm, 0.14 s/60° at 6 V; 25 cm arm, 100 g payload"),
      apply: () => applyExample({ kind: "joint", jPayload: 0.1, jLength: 250, jArmMass: 0.15, jSpeed: 90 * D, jAccel: 180 * D,
        rpm: 71, stallTorque: 1.08, stallCurrent: 2.5, noLoadCurrent: 0.2, vNom: 6, vBat: 6, ratio: 1, eff: 100 }) },
    { name: tr("Käsivarsi, 12 V vaihdemoottori + 3:1 hihna", "Arm, 12 V gearmotor + 3:1 belt"),
      desc: tr("Tyypilliset arvot: 66 rpm, ~15 kgf·cm; 40 cm varsi, 0,5 kg kuorma", "Typical values: 66 rpm, ~15 kgf·cm; 40 cm arm, 0.5 kg payload"),
      apply: () => applyExample({ kind: "joint", jPayload: 0.5, jLength: 400, jArmMass: 0.6, jSpeed: 60 * D, jAccel: 120 * D,
        rpm: 66, stallTorque: 1.5, stallCurrent: 3.5, noLoadCurrent: 0.15, vNom: 12, vBat: 12, ratio: 3, eff: 90 }) },
  ];

  let state, el;

  function params(s) {
    return { ...s, wheelD: s.wheelD / 1000, eff: s.eff / 100, driveShare: s.driveShare / 100 };
  }

  const realTitle = () => joint(state)
    ? tr("Nivelen kuormitus (varsi vaakasuorassa)", "Joint load (arm horizontal)")
    : state.slopeDeg
      ? tr(`Arvio ajossa (${state.slopeDeg}° mäki)`, `Estimate while driving (${state.slopeDeg}° slope)`)
      : tr("Arvio ajossa (tasaisella)", "Estimate while driving (level ground)");

  function render(root, tool) {
    el = root;
    state = getToolState("motor", DEFAULTS);
    const j = joint(state);
    el.innerHTML = `
      ${toolHead(tool, `<button class="btn" id="m-reset">${tr("Palauta oletukset", "Reset defaults")}</button>`)}
      <div class="tool">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${j ? tr("Nivel ja moottori", "Joint and motor") : tr("Robotti ja moottori", "Robot and motor")}</h3>
            <div class="fields" id="m-fields"></div>
          </div>
        </div>
        <div class="col">
          <div id="m-alerts"></div>
          <div class="card">
            <h3 class="card-title" id="m-real-title">${realTitle()}</h3>
            <div id="m-real"></div>
          </div>
          <div class="card">
            <h3 class="card-title">${j ? tr("Moottorin rajat nivelellä", "Motor limits at the joint") : tr("Teoreettiset rajat", "Theoretical limits")}</h3>
            <div id="m-theory"></div>
            <p class="note" style="margin-top:10px">${tr("Teoreettiset arvot lasketaan nimellisarvoista olettaen lineaarinen DC-moottori. Jumimomentilla moottori ei kestä jatkuvasti.", "Theoretical values are computed from rated values assuming a linear DC motor. A motor cannot run continuously at stall torque.")}</p>
          </div>
        </div>
      </div>`;
    drawFields();
    bindFields(el.querySelector("#m-fields"), FIELDS, state, (key) => {
      saveToolState("motor", state);
      if (key === "kind") { render(root, tool); return; }
      el.querySelector("#m-real-title").textContent = realTitle();
      update();
    });
    el.querySelector("#m-reset").onclick = () => {
      state = { ...DEFAULTS, kind: state.kind, _adv: state._adv };
      saveToolState("motor", state);
      render(root, tool);
    };
    update();
  }

  function drawFields() {
    const adv = state._adv ?? settings.advanced;
    const box = el.querySelector("#m-fields");
    const links = joint(state) ? `<div class="row-actions" style="margin:4px 0 12px">
        <button class="btn" id="m-from-arm" title="${tr("Laskee pituuden kinematiikan käsivarsimallista (olkanivelestä kärkeen)", "Computes the length from the kinematics arm model (shoulder to tip)")}">${tr("Pituus käsivarsimallista", "Length from arm model")}</button>
        <button class="btn" id="m-from-traj" title="${tr("Hakee suurimman nopeuden ja kiihtyvyyden trajektorigeneraattorista", "Takes the max velocity and acceleration from the trajectory generator")}">${tr("Nopeus trajektorista", "Speed from trajectory")}</button>
      </div>` : "";
    box.innerHTML = fieldsHtml(FIELDS.slice(0, 1), state, adv) + links + fieldsHtml(FIELDS.slice(1), state, adv) +
      `<button class="link-btn" id="m-adv">${adv ? tr("Piilota lisäsyötteet", "Hide advanced inputs") : joint(state) ? tr("Näytä lisäsyötteet (jännite, hyötysuhde)", "Show advanced inputs (voltage, efficiency)") : tr("Näytä lisäsyötteet (jännite, mäki, pito)", "Show advanced inputs (voltage, slope, traction)")}</button>`;
    box.querySelector("#m-adv").onclick = () => { state._adv = !adv; saveToolState("motor", state); drawFields(); };
    box.querySelector("#m-from-arm")?.addEventListener("click", () => {
      const arm = window.loadArmModel?.();
      if (!arm) return;
      // Vipuvarsi olkanivelestä (tilakäsivarressa nivel 2, tasomaisessa nivel 1) ojennettuna kärkeen
      const js = arm.chain.joints, start = Kin.isPlanar(arm.chain) ? 0 : Math.min(1, js.length - 1);
      const L = js.slice(start).reduce((s, jt, i) => s + Math.abs(jt.a) + (i > 0 ? Math.abs(jt.d) : 0), 0) + Math.abs(arm.chain.tool?.a || 0);
      if (L <= 0) { toast(tr("Käsivarsimallista ei löytynyt pituutta.", "No length found in the arm model.")); return; }
      state.jLength = Math.round(L * 1000);
      state.jFromArm = true; // kurssi tarkistaa, että pituus haettiin käsivarsimallista
      saveToolState("motor", state); drawFields(); update();
      toast(tr(`Varren pituus ${state.jLength} mm (käsivarsimallin nivelestä ${start + 1} kärkeen).`, `Arm length ${state.jLength} mm (from joint ${start + 1} of the arm model to the tip).`));
    });
    box.querySelector("#m-from-traj")?.addEventListener("click", () => {
      const t = window.trajLimits?.() || {};
      if (!(t.vmax > 0) || !t.angular) { toast(tr("Trajektorigeneraattorissa ei ole kulmaliikettä.", "The trajectory generator has no angular motion.")); return; }
      state.jSpeed = t.vmax; if (t.amax > 0) state.jAccel = t.amax;
      saveToolState("motor", state); drawFields(); update();
      toast(tr("Nopeus ja kiihtyvyys haettu trajektorigeneraattorista.", "Speed and acceleration taken from the trajectory generator."));
    });
  }

  function jointParams(s) {
    return { ...s, length: s.jLength / 1000, payload: s.jPayload, armMass: s.jArmMass, speed: s.jSpeed, accel: s.jAccel, eff: s.eff / 100 };
  }

  function updateJoint() {
    const r = Calc.jointMotor(jointParams(state));
    // Kulmanopeus asteina kokonaislukuna, radiaaneina kahdella desimaalilla (1,57 rad/s ei pyöristy 2:ksi)
    const T = (v) => fmt(v / tq(), 3), A = (w) => fmtAng(w, 0), aU = () => `${angLabel()}/s`;
    const pct = (x) => fmt(x * 100, 0);
    const alerts = [];
    // Ehdotus pyöristetään ylöspäin, jotta se varmasti alittaa 30 %:n rajan
    const up = (x) => Math.ceil(x * 10 - 1e-9) / 10;
    const suggest = tr(` Kokeile välityssuhdetta noin ${fmt(up(Math.max(r.ratioFor30, state.ratio * 1.1)), 1)}, lyhyempää vartta tai kevyempää kuormaa.`,
      ` Try a gear ratio of about ${fmt(up(Math.max(r.ratioFor30, state.ratio * 1.1)), 1)}, a shorter arm or a lighter payload.`);
    if (!r.canHold) alerts.push({ level: "err", text: tr(`Moottori ei jaksa pitää vartta vaakasuorassa: tarvitaan ${T(r.tGrav)} ${tqLabel()}, moottori antaa nivelelle enintään ${T(r.tStallJoint)} ${tqLabel()}.`, `The motor cannot hold the arm horizontal: it needs ${T(r.tGrav)} ${tqLabel()}, the motor gives the joint at most ${T(r.tStallJoint)} ${tqLabel()}.`) + suggest });
    else if (r.holdLoad > 0.5) alerts.push({ level: "err", text: tr(`Pelkkä varren pitäminen kuormittaa moottoria ${pct(r.holdLoad)} % jumimomentista — se ylikuumenee jatkuvassa käytössä.`, `Just holding the arm loads the motor to ${pct(r.holdLoad)} % of stall torque — it will overheat in continuous use.`) + suggest });
    else if (r.holdLoad > 0.3) alerts.push({ level: "warn", text: tr(`Pitokuorma ${pct(r.holdLoad)} % jumimomentista. Jatkuvaan käyttöön suositellaan alle ~30 %.`, `Holding load is ${pct(r.holdLoad)} % of stall torque. Below ~30 % is recommended for continuous use.`) + suggest });
    if (r.canHold && !r.canMove) alerts.push({ level: "warn", text: tr(`Moottori jaksaa pitää varren, mutta ei kiihdyttää sitä halutusti (tarvitaan ${T(r.tPeak)} ${tqLabel()}). Pienennä kiihtyvyyttä tai kasvata välitystä.`, `The motor can hold the arm but not accelerate it as desired (needs ${T(r.tPeak)} ${tqLabel()}). Lower the acceleration or increase the gear ratio.`) });
    if (r.canMove && !r.speedOk) alerts.push({ level: "warn", text: tr(`Nivel ei ehdi haluttuun nopeuteen kuormassa: enintään ${A(r.wAtPeak)} ${aU()} (haluttu ${A(state.jSpeed)}). Nopeampi moottori tai pienempi välitys — mutta pienempi välitys vähentää momenttia.`, `The joint cannot reach the desired speed under load: at most ${A(r.wAtPeak)} ${aU()} (wanted ${A(state.jSpeed)}). Use a faster motor or a lower gear ratio — but a lower ratio reduces torque.`) });
    if (state.vBat > state.vNom * 1.5) alerts.push({ level: "warn", text: tr(`Käyttöjännite on ${fmt(state.vBat / state.vNom, 1)}× nimellinen — moottori voi vaurioitua.`, `Supply voltage is ${fmt(state.vBat / state.vNom, 1)}× rated — the motor may be damaged.`) });
    if (r.holdLoad <= 0.3 && r.canMove && r.speedOk) alerts.push({ level: "ok", text: tr("Moottori riittää tähän niveleen.", "The motor is sufficient for this joint.") });
    el.querySelector("#m-alerts").innerHTML = alertsHtml(alerts);

    const lvl = (x) => (x > 0.5 ? "err" : x > 0.3 ? "warn" : "");
    el.querySelector("#m-real").innerHTML = resultTiles([
      { label: tr("Pitomomentti", "Holding torque"), value: T(r.tGrav), unit: tqLabel(), sub: tr("painovoima, jatkuva", "gravity, continuous") },
      { label: tr("Kiihdytyksen lisä", "Acceleration extra"), value: T(r.tDyn), unit: tqLabel(), sub: `J = ${fmt(r.J, 4)} kg·m²` },
      { label: tr("Huippumomentti", "Peak torque"), value: T(r.tPeak), unit: tqLabel() },
      { label: tr("Pitokuorma", "Holding load"), value: pct(r.holdLoad), unit: tr("% jumista", "% of stall"), level: r.canHold ? lvl(r.holdLoad) : "err" },
      { label: tr("Huippukuorma", "Peak load"), value: pct(r.peakLoad), unit: tr("% jumista", "% of stall"), level: r.canMove ? (r.peakLoad > 0.8 ? "warn" : "") : "err" },
      { label: tr("Nopeus huippukuormalla", "Speed at peak load"), value: A(r.wAtPeak), unit: aU(), sub: tr(`haluttu ${A(state.jSpeed)}`, `wanted ${A(state.jSpeed)}`), level: r.speedOk ? "" : "warn" },
      { label: tr("Virta pidossa", "Current while holding"), value: fmt(r.iHold, 2), unit: "A", sub: tr(`huipussa ${fmt(r.iPeak, 2)} A`, `peak ${fmt(r.iPeak, 2)} A`) },
      { label: tr("Sähköteho huipussa", "Peak electrical power"), value: fmt(r.pPeak, 1), unit: "W" },
    ]);
    el.querySelector("#m-theory").innerHTML = resultTiles([
      { label: tr("Jumimomentti nivelellä", "Stall torque at joint"), value: T(r.tStallJoint), unit: tqLabel(), sub: tr("välityksen jälkeen", "after gearing") },
      { label: tr("Tyhjäkäyntinopeus nivelellä", "No-load speed at joint"), value: A(r.w0), unit: aU() },
      { label: tr("Välitys 30 %:n pitoon", "Gear ratio for 30 % holding"), value: fmt(Math.ceil(r.ratioFor30 * 10 - 1e-9) / 10, 1), sub: r.ratioFor30 > 0 ? tr(`nopeus silloin ${A(r.w0 * state.ratio / r.ratioFor30)} ${aU()}`, `speed then ${A(r.w0 * state.ratio / r.ratioFor30)} ${aU()}`) : tr("ei kuormaa", "no load") },
      { label: tr("Jumivirta", "Stall current"), value: fmt(r.iStall, 2), unit: "A", sub: tr("käynnistyspiikki", "start-up spike") },
    ]);
  }

  function update() {
    if (joint(state)) return updateJoint();
    const r = Calc.motor(params(state));
    const kmh = (v) => fmt(v * 3.6, 2);
    const alerts = [];

    if (!r.moves) alerts.push({ level: "err", text: r.Fres >= r.Ftrac && r.Ftrac < r.Fs
      ? tr("Pyörät luistavat — pito ei riitä tähän mäkeen.", "The wheels slip — not enough traction for this slope.")
      : tr("Robotti ei liiku: moottorit eivät jaksa voittaa vierintävastusta ja mäkeä.", "The robot does not move: the motors cannot overcome rolling resistance and the slope.") });
    else if (r.load > 0.5) alerts.push({ level: "err", text: tr(`Moottorit kuormittuvat ${fmt(r.load * 100, 0)} % jumimomentista — ylikuumenemisen riski. Suurempi välitys tai tehokkaampi moottori.`, `Motors are loaded to ${fmt(r.load * 100, 0)} % of stall torque — risk of overheating. Use a higher gear ratio or a stronger motor.`) });
    else if (r.load > 0.3) alerts.push({ level: "warn", text: tr(`Kuormitus ${fmt(r.load * 100, 0)} % jumimomentista. Jatkuvaan ajoon suositellaan alle ~30 %.`, `Load is ${fmt(r.load * 100, 0)} % of stall torque. Below ~30 % is recommended for continuous driving.`) });
    if (r.tractionLimited) alerts.push({ level: "info", text: tr("Pito rajoittaa ennen moottoria: pyörät alkavat luistaa ennen kuin moottori jumittuu.", "Traction is the limit, not the motor: the wheels start slipping before the motor stalls.") });
    if (state.vBat > state.vNom * 1.5) alerts.push({ level: "warn", text: tr(`Käyttöjännite on ${fmt(state.vBat / state.vNom, 1)}× nimellinen — moottori voi vaurioitua.`, `Supply voltage is ${fmt(state.vBat / state.vNom, 1)}× rated — the motor may be damaged.`) });
    if (r.moves && r.load <= 0.3) alerts.push({ level: "ok", text: tr("Moottorit riittävät hyvin tähän kuormaan.", "The motors handle this load comfortably.") });

    el.querySelector("#m-alerts").innerHTML = alertsHtml(alerts);

    el.querySelector("#m-real").innerHTML = resultTiles([
      { label: tr("Ajonopeus", "Driving speed"), value: fmt(r.vOp, 2), unit: "m/s", sub: kmh(r.vOp) + " km/h" },
      { label: tr("Kuormitus", "Load"), value: fmt(r.load * 100, 0), unit: tr("% jumista", "% of stall"), level: r.load > 0.5 || !r.moves ? "err" : r.load > 0.3 ? "warn" : "" },
      { label: tr("Kiihtyvyys alussa", "Initial acceleration"), value: fmt(r.accel0, 2), unit: "m/s²" },
      { label: tr("Aika 90 % nopeuteen", "Time to 90 % speed"), value: fmt(r.t90, 2), unit: "s" },
      { label: tr("Virta yhteensä", "Total current"), value: fmt(r.iTotal, 2), unit: "A", sub: fmt(r.iMotor, 2) + tr(" A / moottori", " A / motor") },
      { label: tr("Sähköteho", "Electrical power"), value: fmt(r.pEl, 1), unit: "W", sub: tr("mekaaninen ", "mechanical ") + fmt(r.pMech, 1) + " W" },
      { label: tr("Momentti pyörällä", "Torque at wheel"), value: fmt(r.torqueWheelOp / tq(), 3), unit: tqLabel(), sub: tr("/ moottori", "/ motor") },
      { label: tr("Jatkuvaan ajoon sopiva mäki", "Slope for continuous driving"), value: fmt(r.contSlope, 0), unit: "°", sub: tr("≤ 30 % kuorma", "≤ 30 % load") },
    ]);

    el.querySelector("#m-theory").innerHTML = resultTiles([
      { label: tr("Huippunopeus (ei kuormaa)", "Top speed (no load)"), value: fmt(r.v0, 2), unit: "m/s", sub: kmh(r.v0) + " km/h" },
      { label: tr("Jumimomentti pyörällä", "Stall torque at wheel"), value: fmt(r.tStallWheel / tq(), 3), unit: tqLabel(), sub: tr("/ moottori", "/ motor") },
      { label: tr("Suurin vetovoima", "Maximum tractive force"), value: fmt(r.Fs, 1), unit: "N", sub: tr("moottorien raja", "motor limit") },
      { label: tr("Pidon raja", "Traction limit"), value: fmt(r.Ftrac, 1), unit: "N", sub: tr("renkaat alkavat luistaa", "tires start to slip") },
      { label: tr("Jyrkin mäki", "Steepest slope"), value: fmt(r.maxSlope, 0), unit: "°", sub: r.tractionLimited ? tr("pyörät alkavat sutia", "wheels start to slip") : tr("moottorit jumissa", "motors stalled") },
      { label: tr("Jumivirta yhteensä", "Total stall current"), value: fmt(r.iStallTotal, 2), unit: "A", sub: tr("käynnistyspiikki", "start-up spike") },
    ]);
  }

  TOOL_IMPL.motor = { render, examples: EXAMPLES };
  // Sähköjärjestelmä-työkalu lukee moottorien virrat tästä
  // Kurssit: nivelmoodin tulos (null pyörämoodissa)
  window.motorJointResult = () => {
    const s = getToolState("motor", DEFAULTS);
    return s.kind === "joint" ? Calc.jointMotor(jointParams(s)) : null;
  };
  // Kurssit: pyörämoodin tulos (null nivelmoodissa) ja tallennettu tila
  window.motorWheelResult = () => {
    const s = getToolState("motor", DEFAULTS);
    return s.kind === "joint" ? null : { s, r: Calc.motor(params(s)) };
  };
  window.motorSummary = () => {
    const s = getToolState("motor", DEFAULTS);
    if (s.kind === "joint") {
      const r = Calc.jointMotor(jointParams(s));
      return { motors: 1, iMotor: r.iHold, iStall: r.iStall, vBat: s.vBat, joint: true };
    }
    const r = Calc.motor(params(s));
    return { motors: s.motors, iMotor: r.iMotor, iStall: r.iStall, vBat: s.vBat };
  };
})();
