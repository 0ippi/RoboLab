"use strict";

/* Yksikkömuunnin: kirjoita mihin tahansa kenttään, muut päivittyvät. Sisäisesti SI-yksiköissä. */
const UNIT_CATEGORIES = [
  { id: "torque", name: tr("Momentti", "Torque"), units: [
    ["N·m", 1], ["N·mm", 1e-3], ["N·cm", 1e-2], ["kgf·cm", 0.0980665], ["kgf·m", 9.80665], ["oz·in", 0.00706155181], ["lbf·in", 0.112984829], ["lbf·ft", 1.3558179483]] },
  { id: "angvel", name: tr("Kulmanopeus", "Angular velocity"), units: [
    ["rad/s", 1], ["rpm", (2 * Math.PI) / 60], ["°/s", Math.PI / 180], [tr("kierrosta/s", "rev/s"), 2 * Math.PI]] },
  { id: "length", name: tr("Pituus", "Length"), units: [
    ["m", 1], ["mm", 1e-3], ["cm", 1e-2], ["km", 1e3], ["in", 0.0254], ["ft", 0.3048], ["yd", 0.9144], ["mi", 1609.344]] },
  { id: "mass", name: tr("Massa", "Mass"), units: [
    ["kg", 1], ["g", 1e-3], ["mg", 1e-6], ["t", 1e3], ["lb", 0.45359237], ["oz", 0.028349523125]] },
  { id: "force", name: tr("Voima", "Force"), units: [
    ["N", 1], ["kN", 1e3], ["kgf", 9.80665], ["gf", 0.00980665], ["lbf", 4.4482216152605], ["ozf", 0.27801385]] },
  { id: "angle", name: tr("Kulma", "Angle"), units: [
    ["rad", 1], ["°", Math.PI / 180], [tr("kierros", "revolution"), 2 * Math.PI], [tr("gooni", "gon"), Math.PI / 200], [tr("kaariminuutti", "arcminute"), Math.PI / 10800]] },
  { id: "speed", name: tr("Nopeus", "Speed"), units: [
    ["m/s", 1], ["km/h", 1 / 3.6], ["mm/s", 1e-3], ["mph", 0.44704], ["ft/s", 0.3048], [tr("solmu", "knot"), 1852 / 3600]] },
  { id: "accel", name: tr("Kiihtyvyys", "Acceleration"), units: [
    ["m/s²", 1], ["g", 9.80665], ["ft/s²", 0.3048]] },
  { id: "power", name: tr("Teho", "Power"), units: [
    ["W", 1], ["mW", 1e-3], ["kW", 1e3], [tr("hv (metrinen)", "hp (metric)"), 735.49875], [tr("hp (mekaaninen)", "hp (mechanical)"), 745.69987]] },
  { id: "energy", name: tr("Energia", "Energy"), units: [
    ["J", 1], ["kJ", 1e3], ["Wh", 3600], ["kWh", 3.6e6], ["cal", 4.184], ["kcal", 4184]] },
  { id: "pressure", name: tr("Paine", "Pressure"), units: [
    ["Pa", 1], ["kPa", 1e3], ["MPa", 1e6], ["bar", 1e5], ["psi", 6894.757293], ["atm", 101325]] },
  { id: "temp", name: tr("Lämpötila", "Temperature"), units: [
    ["°C", { to: (v) => v + 273.15, from: (k) => k - 273.15 }],
    ["K", 1],
    ["°F", { to: (v) => ((v - 32) * 5) / 9 + 273.15, from: (k) => ((k - 273.15) * 9) / 5 + 32 }]] },
];

const unitToSi = (u, v) => (typeof u[1] === "number" ? v * u[1] : u[1].to(v));
const unitFromSi = (u, si) => (typeof u[1] === "number" ? si / u[1] : u[1].from(si));

TOOL_IMPL.units = {
  render(el, tool) {
    const state = getToolState("units", { cat: "torque", values: {} });
    const DEFAULT_VALUE = { temp: 293.15 };

    const formatNum = (v) => {
      if (!Number.isFinite(v)) return "";
      let s = Math.abs(v) >= 1e9 || (Math.abs(v) < 1e-6 && v !== 0) ? v.toExponential(5) : String(+v.toPrecision(7));
      return settings.decimalSep === "," ? s.replace(".", ",") : s;
    };

    const draw = () => {
      const cat = UNIT_CATEGORIES.find((c) => c.id === state.cat) || UNIT_CATEGORIES[0];
      const si = state.values[cat.id] ?? DEFAULT_VALUE[cat.id] ?? 1;
      el.innerHTML = `
        ${toolHead(tool)}
        <div class="settings">
          <nav class="settings-nav" id="u-cats">
            ${UNIT_CATEGORIES.map((c) => `<a href="#" data-cat="${c.id}" class="${c.id === cat.id ? "active" : ""}">${c.name}</a>`).join("")}
          </nav>
          <div class="card set-list" style="max-width:560px">
            ${cat.units.map((u, i) => `
              <div class="set-row">
                <div class="txt"><b>${u[0]}</b></div>
                <div class="ctl"><input type="text" inputmode="decimal" data-u="${i}" value="${formatNum(unitFromSi(u, si))}" aria-label="${u[0]}" style="width:200px;font-family:var(--mono)"></div>
              </div>`).join("")}
          </div>
        </div>`;

      el.querySelector("#u-cats").onclick = (e) => {
        const a = e.target.closest("[data-cat]");
        if (!a) return;
        e.preventDefault();
        state.cat = a.dataset.cat;
        saveToolState("units", state);
        draw();
      };
      el.querySelector(".set-list").oninput = (e) => {
        const i = e.target.dataset.u;
        if (i === undefined) return;
        const raw = e.target.value.trim().replace(",", ".");
        const v = Number(raw);
        const bad = raw === "" || !Number.isFinite(v);
        e.target.classList.toggle("invalid", bad);
        if (bad) return;
        const newSi = unitToSi(cat.units[i], v);
        if (cat.id === "temp" && newSi < 0) { e.target.classList.add("invalid"); e.target.title = tr("Alle absoluuttisen nollapisteen", "Below absolute zero"); return; }
        e.target.title = "";
        state.values[cat.id] = newSi;
        saveToolState("units", state);
        el.querySelectorAll("[data-u]").forEach((inp) => {
          if (inp !== e.target) { inp.value = formatNum(unitFromSi(cat.units[inp.dataset.u], newSi)); inp.classList.remove("invalid"); }
        });
      };
    };
    draw();
  },
};

// Esimerkit: valitsee kategorian ja asettaa arvon SI-yksikössä; muiden kategorioiden arvot säilyvät
const unitExample = (cat, si) => {
  const s = getToolState("units", { cat: "torque", values: {} });
  saveToolState("units", { ...s, cat, values: { ...(s.values || {}), [cat]: si } });
};
TOOL_IMPL.units.examples = [
  { name: tr("Servo 20 kg·cm — paljonko N·m?", "Servo 20 kg·cm — how many N·m?"),
    desc: tr("Harrasteservojen momentti ilmoitetaan usein kgf·cm:nä.", "Hobby servo torque is often given in kgf·cm."),
    apply() { unitExample("torque", 20 * 0.0980665); } },
  { name: tr("Moottori 200 rpm — paljonko rad/s?", "Motor 200 rpm — how many rad/s?"),
    desc: tr("Kaavoissa (v = ω·r) kulmanopeus tarvitaan rad/s:na.", "Formulas (v = ω·r) need angular velocity in rad/s."),
    apply() { unitExample("angvel", (200 * 2 * Math.PI) / 60); } },
  { name: tr("Robotti 0,5 m/s — paljonko km/h?", "Robot 0.5 m/s — how many km/h?"),
    desc: tr("Tyypillinen sisätilojen mobiilirobotin nopeus.", "A typical indoor mobile robot speed."),
    apply() { unitExample("speed", 0.5); } },
  { name: tr("Akku 1 kWh — paljonko Wh ja J?", "Battery 1 kWh — how many Wh and J?"),
    desc: tr("Akun energiasisältö eri yksiköissä.", "Battery energy content in different units."),
    apply() { unitExample("energy", 3.6e6); } },
  { name: tr("Huoneenlämpö 22 °C — paljonko °F ja K?", "Room temperature 22 °C — how many °F and K?"),
    desc: tr("Lämpötilamuunnos ei ole pelkkä kerroin, vaan siinä on myös siirtymä.", "Temperature conversion is not just a factor; it also has an offset."),
    apply() { unitExample("temp", 22 + 273.15); } },
];
