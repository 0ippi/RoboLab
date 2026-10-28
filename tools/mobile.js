"use strict";

/* Mobiilirobotti 2D: differentiaali- tai Ackermann-ohjattu robotti reittisuunnittelun kartalla.
   Todellinen asento integroidaan asetusten integraattorilla; odometria lasketaan kohinaisista
   enkoodereista, joten sen virhe kasvaa ajon aikana. Simulaation tila säilyy sivua vaihdettaessa. */
(() => {
  const DEFAULTS = {
    model: "diff", control: "follow", controller: "pp",
    vmax: 0.4, wmax: 3, amax: 1.0, deltaMax: (30 * Math.PI) / 180,
    wheelR: 0.033, wheelBase: 0.16, L: 0.2, radius: 0.1,
    lookahead: 0.25, kp: 3, ki: 0, kd: 0.2,
    useOdom: false, estop: true, stopDist: 0.08, ticks: 360, noise: null,
  };
  const SENSOR_ANGLES = [-0.5, 0, 0.5], SENSOR_RANGE = 1.0;

  let el, st, map, gv, raf = 0, lastT = 0, acc = 0, sim = null, keys = {}, paused = false, plotAt = 0;
  let arrivals = 0, offGoalArrivals = 0; // kaikki maaliin pääsyt (säilyvät Nollaa-napin yli; kurssit lukevat nämä)
  // Näppäinohjauksella käännytty kulma radiaaneina: paikallaan ja kaarella ajaen (kurssit lukevat nämä)
  let spinTotal = 0, arcTotal = 0;

  const mapKey = (m) => m.w + "x" + m.h + ":" + m.cell + ":" + m.grid.occ.join("");

  function resetSim() {
    const p = [(map.start[0] + 0.5) * map.cell, (map.start[1] + 0.5) * map.cell, 0];
    sim = {
      key: mapKey(map), pose: [...p], odom: [...p], v: 0, w: 0, delta: 0, t: 0, dist: 0,
      collisions: 0, colliding: false, trailTrue: [], trailOdom: [], trailAcc: 0,
      path: [], pathIdx: 0, goal: null, pidState: {}, ranges: [1, 1, 1], estopped: false,
      enc: { l: 0, r: 0, cl: 0, cr: 0 }, rand: Plan.rng(settings.seed), errT: [], errE: [], errAcc: 0, msg: "", msgLevel: "",
    };
  }

  /* ----- Näkymä ----- */
  function render(root, tool) {
    el = root;
    st = getToolState("sim2d", { ...DEFAULTS, noise: settings.noise });
    map = GridMap.load();
    if (!sim || sim.key !== mapKey(map)) resetSim();
    const adv = st._adv ?? settings.advanced;
    const diff = st.model === "diff", follow = st.control === "follow";
    const fields = [
      { key: "model", label: tr("Malli", "Model"), type: "select", options: [["diff", tr("Differentiaaliohjaus (kaksi vetävää pyörää)", "Differential drive (two driven wheels)")], ["ackermann", tr("Ackermann (kääntyvät etupyörät, kuten auto)", "Ackermann steering (steered front wheels, like a car)")]],
        info: tr("Differentiaaliohjattu robotti kääntyy pyörittämällä vasenta ja oikeaa pyörää eri nopeuksilla ja voi kääntyä paikallaan (esim. robotti-imuri). Ackermann-robotti ohjaa etupyörillä kuten auto, eikä pysty kääntymään paikallaan.",
          "A differential-drive robot turns by spinning its left and right wheels at different speeds and can turn on the spot (e.g. a robot vacuum). An Ackermann robot steers with its front wheels like a car and cannot turn in place.") },
      { key: "vmax", label: tr("Suurin nopeus", "Max speed"), unit: "m/s", type: "slider", min: 0.05, max: 2, step: 0.05,
        info: tr("Suurin ajonopeus suoralla. Pienillä opetusroboteilla tyypillisesti 0,2–0,5 m/s; suurempi nopeus vaatii pidemmän katseluetäisyyden ja suuremman kiihtyvyyden, muuten robotti heiluu tai törmää.",
          "Top driving speed on a straight. Small educational robots typically run at 0.2–0.5 m/s; higher speeds need a longer lookahead and more acceleration, otherwise the robot wobbles or crashes.") },
      { key: "wmax", label: tr("Suurin kääntymisnopeus", "Max turn rate"), unit: "rad/s", type: "slider", min: 0.2, max: 10, step: 0.1, when: () => diff,
        info: tr("Kuinka nopeasti robotti voi kääntyä (1 rad/s ≈ 57 °/s). Tyypillisesti 2–5 rad/s; pienempi arvo tekee käännöksistä hitaampia ja leveämpiä.",
          "How fast the robot can rotate (1 rad/s ≈ 57 °/s). Typically 2–5 rad/s; a lower value makes turns slower and wider.") },
      { key: "deltaMax", label: tr("Suurin ohjauskulma", "Max steering angle"), unit: angLabel, factor: angF, type: "slider", min: 5 / (angF() * 180 / Math.PI), max: 45 / (angF() * 180 / Math.PI), step: angF() === 1 ? 0.01 : 1, when: () => !diff,
        info: tr("Kuinka paljon etupyörät voivat kääntyä. Tyypillisesti 25–35°; pieni kulma tarkoittaa suurta kääntösädettä, jolloin robotti ei mahdu tiukkoihin mutkiin.",
          "How far the front wheels can turn. Typically 25–35°; a small angle means a large turning radius, so the robot cannot fit through tight corners.") },
      { key: "amax", label: tr("Suurin kiihtyvyys", "Max acceleration"), unit: "m/s²", adv: true, min: 0.05, max: 20, step: 0.1,
        info: tr("Kuinka nopeasti nopeus voi muuttua kiihdytettäessä ja jarrutettaessa. Tyypillisesti 0,5–3 m/s²; pieni arvo pidentää jarrutusmatkaa ja hidastaa kaarteita.",
          "How quickly the speed can change when accelerating and braking. Typically 0.5–3 m/s²; a small value lengthens braking distance and slows down cornering.") },
      { key: "radius", label: tr("Robotin säde", "Robot radius"), unit: lenLabel, factor: lenF, adv: true, min: 0.02 / lenF(), max: 0.5 / lenF(), step: 0.01 / lenF(),
        info: tr("Robotin rungon säde törmäystarkistuksessa ja reittisuunnittelussa. Pienet robotit ovat noin 0,05–0,15 m; robotin halkaisijan pitää olla selvästi kapeinta käytävää pienempi.",
          "Radius of the robot body used for collision checks and path planning. Small robots are about 0.05–0.15 m; the robot's diameter must be clearly smaller than the narrowest corridor.") },
      { key: "wheelR", label: tr("Pyörän säde", "Wheel radius"), unit: lenLabel, factor: lenF, adv: true, min: 0.005 / lenF(), max: 0.3 / lenF(), step: 0.001 / lenF(),
        info: tr("Vetopyörän säde. Odometria muuntaa pyörän kierrokset ajetuksi matkaksi tällä arvolla; tyypillisesti 0,02–0,05 m pienissä roboteissa.",
          "Radius of the driven wheels. Odometry converts wheel rotations into distance using this value; typically 0.02–0.05 m on small robots.") },
      { key: "wheelBase", label: tr("Pyörien väli", "Track width"), unit: lenLabel, factor: lenF, adv: true, min: 0.02 / lenF(), max: 1 / lenF(), step: 0.01 / lenF(), when: () => diff,
        info: tr("Vasemman ja oikean pyörän välinen etäisyys. Kääntyminen lasketaan pyörien nopeuserosta tämän avulla; yleensä vähän pienempi kuin robotin halkaisija.",
          "Distance between the left and right wheels. Turning is computed from the wheel speed difference using this; usually a bit less than the robot's diameter.") },
      { key: "L", label: tr("Akseliväli", "Wheelbase"), unit: lenLabel, factor: lenF, adv: true, min: 0.02 / lenF(), max: 1 / lenF(), step: 0.01 / lenF(), when: () => !diff,
        info: tr("Etu- ja taka-akselin välinen etäisyys. Pidempi akseliväli tekee ajosta vakaampaa mutta kasvattaa kääntösädettä; RC-autoissa tyypillisesti 0,2–0,3 m.",
          "Distance between the front and rear axles. A longer wheelbase makes driving more stable but increases the turning radius; typically 0.2–0.3 m on RC cars.") },
    ];
    const cfields = [
      { key: "controller", label: tr("Reitinseurannan ohjain", "Path-following controller"), type: "select", options: [["pp", "Pure Pursuit"], ["pid", tr("PID-suuntasäätö", "PID heading control")]], when: () => follow,
        info: tr("Pure Pursuit ohjaa kohti reitillä katseluetäisyyden päässä olevaa pistettä ja on hyvä oletus. PID-suuntasäätö korjaa suuntavirhettä Kp-, Ki- ja Kd-kertoimilla, joita voi kokeilla itse.",
          "Pure Pursuit steers towards a point on the path one lookahead distance ahead and is a good default. PID heading control corrects the heading error using the Kp, Ki and Kd gains, which you can tune yourself.") },
      { key: "lookahead", label: tr("Katseluetäisyys", "Lookahead distance"), unit: lenLabel, factor: lenF, type: "slider", min: 0.05 / lenF(), max: 1 / lenF(), step: 0.01 / lenF(), when: () => follow,
        help: tr("Lyhyt = tarkka mutta heiluva, pitkä = pehmeä mutta oikaisee mutkia", "Short = accurate but oscillating, long = smooth but cuts corners"),
        info: tr("Kuinka kaukana reitillä edessä olevaa pistettä robotti tavoittelee. Lyhyt = tarkka mutta heiluva, pitkä = pehmeä mutta oikaisee mutkia; tyypillisesti 1,5–3 × robotin pituus.",
          "How far ahead on the path the robot aims. Short = accurate but wobbly, long = smooth but cuts corners; typically 1.5–3 × the robot's length.") },
      { key: "kp", label: "Kp", type: "slider", min: 0, max: 20, step: 0.1, when: () => follow && st.controller === "pid",
        info: tr("Suhdeosa: kääntää sitä voimakkaammin, mitä suurempi suuntavirhe on. Aloita noin 2–5:stä; liian suuri arvo saa robotin heilumaan puolelta toiselle.",
          "Proportional gain: turns harder the larger the heading error. Start around 2–5; too large a value makes the robot swing from side to side.") },
      { key: "ki", label: "Ki", type: "slider", min: 0, max: 10, step: 0.1, when: () => follow && st.controller === "pid",
        info: tr("Integraalitermi: poistaa pitkään jatkuvan pienen virheen. Suunnanohjauksessa yleensä 0 tai hyvin pieni; liian suuri arvo aiheuttaa ylitystä ja heilumista.",
          "Integral gain: removes a small error that persists over time. For heading control usually 0 or very small; too large a value causes overshoot and oscillation.") },
      { key: "kd", label: "Kd", type: "slider", min: 0, max: 5, step: 0.05, when: () => follow && st.controller === "pid",
        info: tr("Derivaattatermi: vaimentaa heilumista reagoimalla virheen muutosnopeuteen. Tyypillisesti noin 0,05–0,2 × Kp; liian suuri arvo tekee ohjauksesta nykivän.",
          "Derivative gain: damps oscillation by reacting to how fast the error changes. Typically about 0.05–0.2 × Kp; too large a value makes the steering jerky.") },
      { key: "estop", label: tr("Hätäjarru etuantureilla", "Emergency brake from front sensors"), type: "toggle",
        info: tr("Kun etuanturi näkee esteen jarrutusetäisyyttä lähempänä, robotti pysähtyy. Pidä päällä, ellet halua tutkia törmäyksiä.",
          "When the front sensor sees an obstacle closer than the braking distance, the robot stops. Keep it on unless you want to study collisions.") },
      { key: "useOdom", label: tr("Ohjain käyttää odometriaa", "Controller uses odometry"), help: tr("Realistisempi: robotti ei tiedä todellista asentoaan", "More realistic: the robot does not know its true pose"), type: "toggle", adv: true,
        info: tr("Pois päältä ohjain tietää robotin todellisen asennon. Päällä se käyttää pyörien enkoodereista laskettua arviota, joka ajautuu vähitellen pois todellisesta, kuten oikealla robotilla.",
          "When off, the controller knows the robot's true pose. When on, it uses the estimate computed from the wheel encoders, which slowly drifts away from the truth, just like on a real robot.") },
      { key: "stopDist", label: tr("Jarrutusetäisyys", "Braking distance"), unit: lenLabel, factor: lenF, adv: true, min: 0.01 / lenF(), max: 0.5 / lenF(), step: 0.01 / lenF(),
        info: tr("Etäisyys robotin reunasta esteeseen, jolla hätäjarru laukeaa. Tyypillisesti 0,05–0,15 m; liian suuri arvo pysäyttää robotin turhaan kapeissa paikoissa.",
          "Distance from the robot's edge to an obstacle at which the emergency brake triggers. Typically 0.05–0.15 m; too large a value stops the robot needlessly in narrow places.") },
      { key: "ticks", label: tr("Enkooderin pulssit / kierros", "Encoder ticks per revolution"), adv: true, min: 4, max: 100000, step: 1,
        info: tr("Enkooderin tarkkuus: montako pulssia pyörän yksi kierros antaa. Halvoissa enkoodereissa 20–360, tarkoissa tuhansia; pieni arvo lisää odometrian pyöristysvirhettä.",
          "Encoder resolution: how many pulses one wheel revolution produces. Cheap encoders give 20–360, precise ones thousands; a low value adds rounding error to odometry.") },
      { key: "noise", label: tr("Pyörien luisto (kohina)", "Wheel slip (noise)"), type: "slider", adv: true, min: 0, max: 1, step: 0.05,
        info: tr("Kuinka paljon pyörät luistavat satunnaisesti. 0 = ei luistoa; suurempi arvo kasvattaa odometrian virhettä nopeammin, mikä näkyy odometriajäljen ja todellisen jäljen erona.",
          "How much the wheels randomly slip. 0 = no slip; a higher value makes the odometry error grow faster, visible as the gap between the odometry and true trails.") },
    ];

    el.innerHTML = `
      ${toolHead(tool, `<button class="btn" id="mb-reset">${tr("Nollaa", "Reset")}</button>`)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Ohjaus", "Control")}</h3>
            <div class="seg" id="mb-mode">
              <button data-c="follow" class="${follow ? "on" : ""}">${tr("Seuraa reittiä", "Follow path")}</button>
              <button data-c="keys" class="${!follow ? "on" : ""}">${tr("Näppäimistö", "Keyboard")}</button>
            </div>
            ${follow ? `<div class="row-actions"><button class="btn primary" id="mb-goal">${tr("Aja maaliin", "Drive to goal")}</button></div>` : ""}
            <p class="note" style="margin-top:10px">${follow
              ? tr("Klikkaa karttaa asettaaksesi kohteen, tai aja reittisuunnittelun maaliin.", "Click the map to set a target, or drive to the path planner's goal.")
              : tr("Nuolinäppäimet: ↑ eteen, ↓ taakse, ← → kääntyminen. Välilyönti pysäyttää simulaation.", "Arrow keys: ↑ forward, ↓ reverse, ← → turn. Space pauses the simulation.")}</p>
            <div class="fields" id="mb-cfields" style="margin-top:12px"></div>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Robotti", "Robot")}</h3>
            <div class="fields" id="mb-fields"></div>
          </div>
          <button class="link-btn" id="mb-adv">${adv ? tr("Piilota lisäasetukset", "Hide advanced settings") : tr("Näytä lisäasetukset (mitat, enkooderit, luisto)", "Show advanced settings (dimensions, encoders, slip)")}</button>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Simulaatio", "Simulation")}
              <span class="view-tools"><button id="mb-pause"></button>
              <span class="legend"><i style="background:var(--accent)"></i>${tr("todellinen", "true")} <i style="background:var(--warn)"></i>${tr("odometria", "odometry")}</span></span></h3>
            <canvas class="gridview" id="mb-canvas" tabindex="0" aria-label="${tr("Simulaatio: klikkaa asettaaksesi kohteen", "Simulation: click to set a target")}"></canvas>
            ${!follow ? `<div class="dpad" id="mb-dpad" aria-label="${tr("Ohjaus", "Control")}">
              <button class="up" data-k="ArrowUp" aria-label="${tr("Eteen", "Forward")}">↑</button>
              <button class="left" data-k="ArrowLeft" aria-label="${tr("Vasemmalle", "Left")}">←</button>
              <button class="down" data-k="ArrowDown" aria-label="${tr("Taakse", "Reverse")}">↓</button>
              <button class="right" data-k="ArrowRight" aria-label="${tr("Oikealle", "Right")}">→</button></div>` : ""}
          </div>
          <div id="mb-stats"></div>
          <div id="mb-alerts"></div>
          <div class="card"><h3 class="card-title">${tr("Odometrian virhe", "Odometry error")}</h3><canvas class="plot small" id="mb-plot"></canvas></div>
        </div>
      </div>`;

    const bind = (sel, fs) => {
      const box = el.querySelector(sel);
      box.innerHTML = fieldsHtml(fs, st, adv);
      bindFields(box, fs, st, (key) => {
        saveToolState("sim2d", st);
        if (["model", "controller"].includes(key)) { unmount(); render(root, tool); }
        if (key === "model") resetSim();
      });
    };
    bind("#mb-fields", fields);
    bind("#mb-cfields", cfields);

    el.querySelector("#mb-mode").onclick = (e) => {
      const c = e.target.dataset.c;
      if (!c || c === st.control) return;
      st.control = c; saveToolState("sim2d", st);
      sim.path = []; sim.goal = null;
      unmount(); render(root, tool);
    };
    el.querySelector("#mb-goal")?.addEventListener("click", () => planTo(map.goal));
    el.querySelector("#mb-reset").onclick = () => { resetSim(); };
    el.querySelector("#mb-adv").onclick = () => { st._adv = !adv; saveToolState("sim2d", st); unmount(); render(root, tool); };
    el.querySelector("#mb-pause").onclick = togglePause;
    // Kosketusnäytön ohjausnapit: painettuna pito kuten nuolinäppäin
    const pad = el.querySelector("#mb-dpad");
    if (pad) {
      const press = (e, on) => {
        const b = e.target.closest("[data-k]");
        if (!b) return;
        e.preventDefault();
        keys[b.dataset.k] = on;
        b.classList.toggle("on", on);
        if (on) b.setPointerCapture?.(e.pointerId);
      };
      pad.addEventListener("pointerdown", (e) => press(e, true));
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) pad.addEventListener(ev, (e) => press(e, false));
    }

    gv = new GridView(el.querySelector("#mb-canvas"), {
      draw: drawSim,
      // Näppäimistötilassa nuolet ajavat robottia, eivät siirrä ruudukon kohdistinta
      keyboard: () => st.control !== "keys",
      onPointer: (c, phase) => {
        if (phase !== "down" || !c.inside) return;
        if (st.control !== "follow") { st.control = "follow"; saveToolState("sim2d", st); unmount(); render(root, tool); }
        planTo([c.i, c.j]);
      },
    });
    gv.setSize(map.w, map.h);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    updatePause();
    stats(); // tulosruudut näkyvät heti, ei vasta ensimmäisen ruudunpäivityksen jälkeen
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function togglePause() { paused = !paused; updatePause(); }
  function updatePause() { const b = el.querySelector("#mb-pause"); if (b) b.textContent = paused ? tr("▶ Jatka", "▶ Resume") : tr("❚❚ Tauko", "❚❚ Pause"); }

  function onKey(e) {
    // Lomakekentät ja valikot käyttävät näppäimiä itse; välilyönti painaa kohdistettua nappia eikä tauota
    const a = document.activeElement;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(a?.tagName) || a?.closest?.('[role="menu"], [role="dialog"], .coach')) return;
    if (e.key === " " && /^(BUTTON|A|SUMMARY)$/.test(a?.tagName)) return;
    if (e.key === " " && e.type === "keydown") { e.preventDefault(); togglePause(); return; }
    if (!e.key.startsWith("Arrow")) return;
    e.preventDefault();
    keys[e.key] = e.type === "keydown";
  }

  /* ----- Reitin suunnittelu ----- */

  // Etäisyys lähimpään esteeseen jokaisen solun keskeltä metreinä (kartan reuna on seinä). Kaksivaiheinen
  // etäisyysmuunnos 8-naapurustolla: tarkkuus riittää reitin pitämiseen erossa seinistä.
  function clearance() {
    const g = map.grid, c = map.cell, W = g.w, H = g.h, D = c * Math.SQRT2, d = new Float32Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) d[y * W + x] = g.occ[y * W + x] ? 0 : Math.min(x + 1, y + 1, W - x, H - y) * c;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x;
      let v = d[i];
      if (x > 0) v = Math.min(v, d[i - 1] + c);
      if (y > 0) { v = Math.min(v, d[i - W] + c); if (x > 0) v = Math.min(v, d[i - W - 1] + D); if (x < W - 1) v = Math.min(v, d[i - W + 1] + D); }
      d[i] = v;
    }
    for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) {
      const i = y * W + x;
      let v = d[i];
      if (x < W - 1) v = Math.min(v, d[i + 1] + c);
      if (y < H - 1) { v = Math.min(v, d[i + W] + c); if (x < W - 1) v = Math.min(v, d[i + W + 1] + D); if (x > 0) v = Math.min(v, d[i + W - 1] + D); }
      d[i] = v;
    }
    for (let i = 0; i < d.length; i++) d[i] = Math.max(0, d[i] - c / 2); // solun keskeltä esteen reunaan
    return d;
  }

  // Reitti kulkee mieluummin käytävän keskellä: seinän lähellä oleville soluille lisäkustannus, ja solut,
  // joihin robotti ei mahdu, suljetaan. Seinän viereen asetettu maali siirretään lähimpään kohtaan, johon robotti mahtuu.
  // replan = jumista palautuminen: sama maali, yrityslaskuri säilyy.
  function planTo(goal, { replan = false } = {}) {
    const p = st.useOdom ? sim.odom : sim.pose;
    const W = map.w, H = map.h, start = [Math.floor(p[0] / map.cell), Math.floor(p[1] / map.cell)];
    const clr = clearance(), fit = st.radius + 0.01, si = start[1] * W + start[0];
    // Maalissa auton taka-akseli on maalisolussa ja keula akselivälin päässä: maalin ympärillä pitää olla tilaa myös keulalle
    const goalFit = fit + (st.model === "diff" ? 0 : st.L);
    let target = goal, movedGoal = 0;
    if (Plan.free(map.grid, goal[0], goal[1]) && clr[goal[1] * W + goal[0]] < goalFit) {
      const seen = new Uint8Array(W * H), queue = [goal[1] * W + goal[0]];
      seen[queue[0]] = 1;
      for (let qi = 0; qi < queue.length && qi < 4000; qi++) {
        const i = queue[qi];
        if (clr[i] >= goalFit) { target = [i % W, (i / W) | 0]; movedGoal = Math.hypot(target[0] - goal[0], target[1] - goal[1]) * map.cell; break; }
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const x = (i % W) + dx, y = ((i / W) | 0) + dy, n = y * W + x;
          if (x >= 0 && y >= 0 && x < W && y < H && !seen[n] && Plan.free(map.grid, x, y)) { seen[n] = 1; queue.push(n); }
        }
      }
    }
    // Auto kääntyy leveässä kaaressa (säde L / tan(ohjauskulma)), joten sen reitti pidetään kauempana seinistä
    const comfort = st.radius + (st.model === "diff" ? 0.25 : Math.min(0.6, 0.25 + 0.5 * st.L / Math.tan(st.deltaMax)));
    const cellCost = Float32Array.from(clr, (v) => 6 * Math.max(0, (comfort - v) / comfort) ** 2);
    const blocked = (min) => ({ w: W, h: H, occ: Uint8Array.from(clr, (v) => (v < min ? 1 : 0)) });
    const search = (g, cost) => {
      const occ = g.occ.slice();
      // Seinää koskettava robotti pääsee liikkeelle: lähtösolu ja sen vapaat naapurit avataan
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const x = start[0] + dx, y = start[1] + dy;
        if (x >= 0 && y >= 0 && x < W && y < H && Plan.free(map.grid, x, y)) occ[y * W + x] = 0;
      }
      occ[si] = 0;
      return Plan.gridSearch({ ...g, occ }, start, target, { algo: "astar", diagonal: true, cellCost: cost });
    };
    let r = search(blocked(fit), cellCost);
    if (!r.found) r = search(blocked(st.radius * 0.6), cellCost);
    let tight = false;
    if (!r.found) { r = search(map.grid, null); tight = r.found; }
    sim.pidState = {};
    sim.recover = null;
    sim.prog = { best: Infinity, t: 0, e: 0 };
    if (!replan) sim.recoveries = 0;
    if (!r.found) { sim.path = []; sim.goal = null; sim.msg = tr("Kohteeseen ei ole reittiä.", "No path to the target."); sim.msgLevel = "warn"; return; }
    sim.goal = target;
    if (!replan) sim.tripFrom = sim.dist;
    sim.path = r.path.map((c) => [((c % map.w) + 0.5) * map.cell, (((c / map.w) | 0) + 0.5) * map.cell]);
    sim.remain = new Array(sim.path.length).fill(0);
    for (let i = sim.path.length - 2; i >= 0; i--) sim.remain[i] = sim.remain[i + 1] + Math.hypot(sim.path[i + 1][0] - sim.path[i][0], sim.path[i + 1][1] - sim.path[i][1]);
    sim.pathIdx = 0;
    if (replan) return;
    sim.msg = tight
      ? tr(`Kartta on robotille liian ahdas: reitti kulkee kohdista, jotka ovat kapeampia kuin robotti (halkaisija ${fmtLen(st.radius * 2)} ${lenLabel()}). `
        + "Robotti yrittää, mutta juuttuu todennäköisesti. Valitse Reittisuunnittelussa \"Oletuskartta\" tai piirrä leveämmät käytävät.",
        `The map is too cramped for the robot: the path passes through spots narrower than the robot (diameter ${fmtLen(st.radius * 2)} ${lenLabel()}). `
        + "The robot will try but will probably get stuck. Choose \"Default map\" in Path planning or draw wider corridors.")
      : movedGoal ? tr(`Maali oli liian lähellä seinää robotille, joten se siirrettiin ${fmtLen(movedGoal, 2)} ${lenLabel()} lähimpään kohtaan, johon robotti mahtuu.`,
        `The goal was too close to a wall for the robot, so it was moved ${fmtLen(movedGoal, 2)} ${lenLabel()} to the nearest spot where the robot fits.`) : "";
    sim.msgLevel = tight ? "warn" : "info";
  }

  // Jumista palautuminen: peruutetaan hetki ja suunnitellaan reitti uudelleen nykyisestä paikasta.
  // Jos robotti ei pääse eteenpäin neljällä yrityksellä, reitinseuranta luovuttaa.
  function startRecovery() {
    sim.recoveries = (sim.recoveries || 0) + 1;
    if (sim.recoveries > 4) {
      sim.path = []; sim.goal = null; sim.recover = null;
      sim.msg = st.useOdom && Math.hypot(sim.pose[0] - sim.odom[0], sim.pose[1] - sim.odom[1]) > 0.08
        ? tr("Robotti ei pääse eteenpäin: odometrian virhe on kasvanut niin suureksi, että robotti luulee olevansa muualla kuin on, ja ajaa seinään. Paina Nollaa, niin arvio korjataan.",
          "The robot can't make progress: the odometry error has grown so large that the robot thinks it is somewhere else and drives into a wall. Press Reset to correct the estimate.")
        : st.model !== "diff"
          ? tr("Auto ei pääse eteenpäin. Se ei voi kääntyä paikallaan, joten ahtaassa kulmassa tai seinän vieressä se ei aina mahdu kääntymään. Valitse kohde avoimemmasta paikasta tai kasvata ohjauskulmaa.",
            "The car can't make progress. It cannot turn in place, so in a tight corner or next to a wall it doesn't always have room to turn. Pick a target in a more open spot or increase the steering angle.")
          : tr("Robotti ei pääse eteenpäin, vaikka se yritti peruuttaa ja etsiä uuden reitin. Käytävä on luultavasti liian kapea: valitse Reittisuunnittelussa \"Oletuskartta\", piirrä leveämmät käytävät tai pienennä robotin sädettä.",
            "The robot can't make progress even after backing up and finding a new route. The corridor is probably too narrow: choose \"Default map\" in Path planning, draw wider corridors or reduce the robot's radius.");
      sim.msgLevel = "warn";
      return;
    }
    // Differentiaalirobotti peruuttaa suoraan. Auto liikkuu siihen suuntaan, jossa on enemmän tilaa, ja ohjaa
    // niin, että keula kääntyy kohti reittiä (peruuttaessa ohjaus on käänteinen).
    const front = sim.ranges[1] - st.radius, dir = st.model === "diff" || sim.rear >= front ? -1 : 1;
    const he = sim.lastHe || 0;
    sim.recover = { t: st.model === "diff" ? 0.6 : 0.9, dir, delta: dir * Math.sign(he || 1) * st.deltaMax };
  }

  /* ----- Fysiikka ----- */

  const wallAt = (x, y) => !Plan.free(map.grid, Math.floor(x / map.cell), Math.floor(y / map.cell));
  // Auton (Ackermann) asento on taka-akselilla, mutta runko ulottuu etuakselin yli: taka-akselin ympyrän lisäksi
  // rungon levyiset ympyrät keskellä ja etuakselilla (runko on 1,4 × säde leveä, kuten piirroksessa).
  // Paikallaan kääntyvällä robotilla yksi ympyrä.
  const bodyCircles = (p) => (st.model === "diff" ? [[0, st.radius]] : [[0, st.radius], [st.L / 2, st.radius * 0.7], [st.L, st.radius * 0.7]])
    .map(([o, r]) => [p[0] + Math.cos(p[2]) * o, p[1] + Math.sin(p[2]) * o, r]);
  // Kuinka paljon robotti on seinän sisällä (0 = ei lainkaan): keskipiste painaa eniten, reunapisteet vähemmän
  function penetration(p) {
    let n = 0;
    for (const [x, y, r] of bodyCircles(p)) {
      if (wallAt(x, y)) n += 12;
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2;
        if (wallAt(x + Math.cos(a) * r, y + Math.sin(a) * r)) n++;
      }
    }
    return n;
  }
  // Etuanturien paikka: auton keula (etuakseli), muuten robotin keskipiste
  const sensorOrigin = (p) => (st.model === "diff" ? p : [p[0] + Math.cos(p[2]) * st.L, p[1] + Math.sin(p[2]) * st.L]);
  // Liike sallitaan, jos se ei vie robottia syvemmälle seinään — näin seinää koskettava robotti pääsee irti
  // ja voi liukua seinän vieressä. Keskipisteen paino (12) estää ohuen seinän läpi ajamisen.
  function collides(next) {
    const cur = penetration(sim.pose), pn = penetration(next);
    return cur === 0 ? pn > 0 : pn > cur;
  }

  function gauss() {
    const u = 1 - sim.rand(), v = sim.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function sense() {
    const p = sim.pose, f = sensorOrigin(p);
    const ray = (o, a, max) => Plan.raycast(map.grid, o[0] / map.cell, o[1] / map.cell, a, max / map.cell).dist * map.cell;
    sim.ranges = SENSOR_ANGLES.map((a) => ray(f, p[2] + a, SENSOR_RANGE));
    sim.rear = ray(p, p[2] + Math.PI, SENSOR_RANGE) - st.radius; // peruutuskäännöstä varten
    // Vapaa tila robotin ympärillä (8 suuntaa, autolla myös keulasta) — nopeuden rajoittamiseen ahtaissa paikoissa
    let clear = Infinity;
    for (const o of f === p ? [p] : [p, f]) for (let k = 0; k < 8; k++) clear = Math.min(clear, ray(o, (k / 8) * Math.PI * 2, 1));
    sim.clear = clear - st.radius;
  }

  function command(dt) {
    const diff = st.model === "diff";
    let v = 0, w = 0, delta = 0;
    if (st.control === "keys") {
      const fwd = (keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 0.6 : 0), turn = (keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0);
      v = st.vmax * fwd;
      if (diff) w = st.wmax * turn; else delta = st.deltaMax * turn;
    } else if (sim.recover) {
      // Peruutus jumista; sen jälkeen uusi reitti nykyisestä paikasta samaan maaliin
      sim.recover.t -= dt;
      if (sim.recover.t <= 0) { const g = sim.goal; sim.recover = null; if (g) planTo(g, { replan: true }); }
      else { v = sim.recover.dir * Math.min(0.12, st.vmax); if (!diff) delta = sim.recover.delta; }
    } else if (sim.path.length) {
      const pose = st.useOdom ? sim.odom : sim.pose;
      // Kohdepisteen pitää näkyä ilman seinää välissä, muuten pitkä katseluetäisyys oikaisee mutkat seinän läpi
      const c = map.cell;
      // Tarkistetaan keskiviiva ja robotin molemmat reunat, jotta runko ei osu kulmiin oikaistessa
      const visible = (p) => {
        const dx = p[0] - pose[0], dy = p[1] - pose[1], d = Math.hypot(dx, dy) || 1;
        const ox = (-dy / d) * st.radius, oy = (dx / d) * st.radius;
        return [0, 1, -1].every((s) => Plan.segmentFree(map.grid, (pose[0] + s * ox) / c, (pose[1] + s * oy) / c, (p[0] + s * ox) / c, (p[1] + s * oy) / c));
      };
      const pp = Robot.purePursuit(pose, sim.path, st.lookahead, sim.pathIdx, visible);
      sim.pathIdx = pp.idx;
      sim.lastHe = pp.headingError;
      // Jäljellä oleva matka reittiä pitkin: edistymisen mittari jumiutumisen tunnistukseen
      sim.distLeft = (sim.remain?.[pp.idx] ?? 0) + Math.hypot(sim.path[pp.idx][0] - pose[0], sim.path[pp.idx][1] - pose[1]);
      // Auto ei pääse yhtä tarkasti solun keskelle kuin paikallaan kääntyvä robotti
      if (pp.distToGoal < (diff ? 0.03 : 0.06) && pp.idx >= sim.path.length - 2) {
        sim.path = []; sim.goal = null;
        const offGoal = st.useOdom && Math.hypot(sim.pose[0] - sim.odom[0], sim.pose[1] - sim.odom[1]) > 0.05;
        sim.msg = offGoal
          ? tr("Robotti luulee olevansa maalissa, mutta odometrian virheen vuoksi todellinen asento poikkeaa.", "The robot thinks it has reached the goal, but due to odometry error its true pose differs.")
          : tr("Maali saavutettu.", "Goal reached.");
        sim.msgLevel = offGoal ? "warn" : "ok";
        // Lasketaan vain oikeat ajot (ei "saavutusta", kun robotti oli jo valmiiksi maalissa)
        if (sim.dist - (sim.tripFrom ?? 0) > 0.2) {
          arrivals++;
          if (offGoal) offGoalArrivals++;
        }
      } else {
        v = st.vmax * Math.max(0.25, Math.min(1, pp.distToGoal / 0.3));
        // Nopeussuunnittelu: ehditään pysähtyä ennen edessä olevaa estettä (v ≤ √(2·a·d))
        // ja kaarteessa sivukiihtyvyys pysyy rajoissa (v ≤ √(a/κ)) ja kääntymisnopeus riittää (v ≤ ω/κ)
        // Vain keskimmäinen anturi: sivuanturit näkevät käytävän seinät, jotka eivät ole ajosuunnassa
        const front = sim.ranges[1] - st.radius;
        v = Math.min(v, Math.sqrt(2 * st.amax * Math.max(0, front - 0.02)));
        const kap = Math.abs(pp.curvature);
        if (kap > 1e-6) v = Math.min(v, Math.sqrt(st.amax / kap), diff ? st.wmax / kap : Infinity);
        // Lähellä seiniä ajetaan hitaasti (pieni ryömintänopeus, jotta eteneminen ei pysähdy kokonaan)
        v = Math.min(v, 0.05 + Math.sqrt(2 * st.amax * Math.max(0, sim.clear - 0.01)));
        // Kaarella runko poikkeaa suorasta näköyhteydestä sitä enemmän, mitä suurempi suuntavirhe on
        v *= Math.max(0.2, Math.cos(pp.headingError));
        if (st.controller === "pid") {
          const u = Robot.pid(sim.pidState, pp.headingError, dt, st.kp, st.ki, st.kd);
          v *= Math.max(0, Math.cos(pp.headingError));
          if (diff) w = u; else delta = u;
        } else if (diff) {
          // Jyrkässä mutkassa differentiaalirobotti kääntyy paikallaan
          // (myös silloin, kun este edessä on pysäyttänyt etenemisen)
          if (Math.abs(pp.headingError) > 0.6 || v < 0.02) { v = 0; w = Math.sign(pp.headingError) * Math.min(st.wmax, 3 * Math.abs(pp.headingError)); }
          else w = v * pp.curvature;
        } else {
          delta = Math.atan(st.L * pp.curvature);
          if (Math.abs(pp.headingError) > 1.2) v *= 0.5;
        }
        // Auto ei voi kääntyä paikallaan: pieni ryömintänopeus, ettei se jää seisomaan
        if (!diff) v = Math.max(v, Math.min(0.05, st.vmax));
        // Kohde auton takana: peruutuskäännös (kolmen pisteen käännös). Peruutetaan ohjaus toiseen suuntaan,
        // jolloin keula kääntyy kohti reittiä; jos takana on seinä, ajetaan eteenpäin täydellä ohjauksella.
        if (!diff) {
          const he = pp.headingError;
          if (Math.abs(he) > 1.7) sim.kTurn = true;
          else if (Math.abs(he) < 0.6) sim.kTurn = false;
          if (sim.kTurn) {
            // Suunta vaihtuu, kun tila loppuu: peruutus niin kauan kuin takana on tilaa, sitten eteen (kuten kolmen pisteen käännöksessä)
            const front = sim.ranges[1] - st.radius;
            if (sim.kDir == null || (sim.kDir < 0 && sim.rear < 0.05) || (sim.kDir > 0 && front < 0.05)) sim.kDir = sim.rear > front ? -1 : 1;
            v = sim.kDir * Math.min(sim.kDir < 0 ? 0.15 : 0.1, st.vmax);
            delta = sim.kDir * Math.sign(he) * st.deltaMax;
          } else sim.kDir = null;
        }
      }
    }
    return { v, w, delta };
  }

  function step(dt) {
    const diff = st.model === "diff";
    sense();
    let { v: vCmd, w: wCmd, delta: dCmd } = command(dt);

    // Hätäjarru keskianturilla: sivuanturit näkevät kapean käytävän seinät ja pysäyttäisivät turhaan
    const front = sim.ranges[1] - st.radius;
    sim.estopped = st.estop && vCmd > 0 && front < st.stopDist;
    if (sim.estopped) vCmd = 0;

    // Toimilaitteet: kiihtyvyysraja ja pyörien nopeusraja
    const dv = Math.max(-st.amax * dt, Math.min(st.amax * dt, vCmd - sim.v));
    let v = sim.v + dv, w;
    if (diff) {
      wCmd = Math.max(-st.wmax, Math.min(st.wmax, wCmd));
      const wheelMax = (st.vmax / st.wheelR) * 1.2;
      let [wl, wr] = Robot.limitWheels(...Robot.diffToWheels(v, wCmd, st.wheelR, st.wheelBase), wheelMax);
      [v, w] = Robot.diffFromWheels(wl, wr, st.wheelR, st.wheelBase);
    } else {
      dCmd = Math.max(-st.deltaMax, Math.min(st.deltaMax, dCmd));
      sim.delta += Math.max(-3 * dt, Math.min(3 * dt, dCmd - sim.delta)); // ohjauksen kääntönopeus 3 rad/s
      w = Robot.ackermannOmega(v, sim.delta, st.L);
    }

    let next = Robot.integrate(sim.pose, v, w, dt, settings.integrator);
    let contact = false;
    if (collides(next)) {
      // Kosketus: robotti liukuu seinän suuntaisesti (vain x- tai y-siirtymä) tai kääntyy paikallaan.
      // Pyörät pyörivät silti, joten odometria saa virhettä — kuten oikeassakin robotissa.
      const p = sim.pose;
      next = [[next[0], p[1], next[2]], [p[0], next[1], next[2]], [p[0], p[1], next[2]]].find((c) => !collides(c)) || null;
      contact = true;
      if (!sim.colliding) { sim.collisions++; if (!sim.path.length) { sim.msg = tr("Törmäys! Robotti osui seinään.", "Collision! The robot hit a wall."); sim.msgLevel = "err"; } }
    }
    if (!next) {
      sim.colliding = true;
      sim.v = 0; sim.w = 0;
    } else {
      const moved = Math.hypot(next[0] - sim.pose[0], next[1] - sim.pose[1]);
      sim.colliding = contact;
      sim.dist += moved;
      sim.pose = next;
      sim.v = contact ? moved / dt : v; sim.w = w;
      odometry(v, w, dt);
      if (diff && st.control === "keys") {
        if (Math.abs(v) < 0.02) spinTotal += Math.abs(w) * dt;
        else if (v >= 0.05) arcTotal += Math.abs(w) * dt;
      }
    }

    // Jumiutumisen tunnistus reitinseurannassa: jos jäljellä oleva matka ei lyhene 2,5 sekuntiin tai hätäjarru
    // pitää robottia paikallaan yli 0,6 s (esim. seinän kulma edessä), peruutetaan ja haetaan uusi reitti
    if (st.control === "follow" && sim.path.length && !sim.recover) {
      const pr = (sim.prog ||= { best: Infinity, t: 0, e: 0 });
      if ((sim.distLeft ?? Infinity) < pr.best - 0.02) { pr.best = sim.distLeft; pr.t = 0; } else pr.t += dt;
      pr.e = sim.estopped || (!next && vCmd > 0) ? pr.e + dt : 0;
      if (pr.t > 2.5 || pr.e > 0.6) { pr.t = 0; pr.e = 0; pr.best = Infinity; startRecovery(); }
    }

    sim.t += dt;
    sim.trailAcc += dt;
    if (sim.trailAcc >= 0.05) {
      sim.trailAcc = 0;
      sim.trailTrue.push([sim.pose[0], sim.pose[1]]); sim.trailOdom.push([sim.odom[0], sim.odom[1]]);
      if (sim.trailTrue.length > 4000) { sim.trailTrue.shift(); sim.trailOdom.shift(); }
    }
    sim.errAcc += dt;
    if (sim.errAcc >= 0.1) {
      sim.errAcc = 0;
      sim.errT.push(sim.t); sim.errE.push(Math.hypot(sim.pose[0] - sim.odom[0], sim.pose[1] - sim.odom[1]));
      if (sim.errT.length > 600) { sim.errT.shift(); sim.errE.shift(); }
    }
  }

  // Enkooderit: todellinen pyörän kierto + luisto, pyöristys pulsseiksi → odometria (keskipistemenetelmä)
  function odometry(v, w, dt) {
    const r = st.wheelR, b = st.model === "diff" ? st.wheelBase : 0;
    const slip = () => 1 + (st.noise ?? 0) * 0.05 * gauss();
    const tick = (2 * Math.PI) / st.ticks;
    let dl, dr;
    if (st.model === "diff") {
      const [wl, wr] = Robot.diffToWheels(v, w, r, b);
      sim.enc.l += wl * dt * slip(); sim.enc.r += wr * dt * slip();
    } else {
      const s = (v / r) * dt * slip();
      sim.enc.l += s; sim.enc.r += s;
    }
    const cl = Math.floor(sim.enc.l / tick), cr = Math.floor(sim.enc.r / tick);
    dl = (cl - sim.enc.cl) * tick * r; dr = (cr - sim.enc.cr) * tick * r;
    sim.enc.cl = cl; sim.enc.cr = cr;
    const ds = (dl + dr) / 2;
    const dth = st.model === "diff"
      ? (dr - dl) / b
      : (ds * Math.tan(sim.delta + (st.noise ?? 0) * 0.01 * gauss())) / st.L;
    const o = sim.odom, th = o[2] + dth / 2;
    sim.odom = [o[0] + ds * Math.cos(th), o[1] + ds * Math.sin(th), Robot.wrap(o[2] + dth)];
  }

  function loop(now) {
    if (!el.querySelector("#mb-canvas")) return;
    const real = Math.min(0.1, (now - lastT) / 1000);
    lastT = now;
    if (!paused && !(settings.pauseOnBlur && document.hidden)) {
      acc += real * settings.realtime;
      const dt = Math.max(0.0005, settings.timestep / 1000);
      let n = 0;
      while (acc >= dt && n < 2000) { step(dt); acc -= dt; n++; }
      if (n >= 2000) acc = 0;
    }
    gv.draw();
    if (now - plotAt > 250) { plotAt = now; stats(); }
    raf = requestAnimationFrame(loop);
  }

  function stats() {
    const diff = st.model === "diff";
    const err = Math.hypot(sim.pose[0] - sim.odom[0], sim.pose[1] - sim.odom[1]);
    // Differentiaaliohjaus: pyörien kehänopeudet (eteen +, taakse −) näyttävät, miten nopeusero kääntää robottia
    const wheel = (side) => {
      const u = sim.v + side * sim.w * st.wheelBase / 2, x = Math.abs(u) < 0.005 ? 0 : u;
      return { label: side < 0 ? tr("Vasen pyörä", "Left wheel") : tr("Oikea pyörä", "Right wheel"), value: fmt(x, 2), unit: "m/s",
        sub: x > 0 ? tr("eteen", "forward") : x < 0 ? tr("taakse", "backward") : tr("paikallaan", "still") };
    };
    el.querySelector("#mb-stats").innerHTML = resultTiles([
      { label: tr("Nopeus", "Speed"), value: fmt(sim.v, 2), unit: "m/s" },
      diff ? { label: tr("Kulmanopeus", "Angular velocity"), value: fmt(sim.w, 2), unit: "rad/s" } : { label: tr("Ohjauskulma", "Steering angle"), value: fmtAng(sim.delta, 1), unit: angLabel() },
      ...(diff ? [wheel(-1), wheel(1)] : []),
      { label: tr("Ajettu matka", "Distance driven"), value: fmtLen(sim.dist, 2), unit: lenLabel() },
      { label: tr("Odometrian virhe", "Odometry error"), value: fmtLen(err, 3), unit: lenLabel(), level: err > 0.1 ? "warn" : "" },
      { label: tr("Törmäykset", "Collisions"), value: String(sim.collisions), level: sim.collisions ? "err" : "" },
      { label: tr("Simulaatioaika", "Simulation time"), value: fmt(sim.t, 1), unit: "s", sub: `${settings.integrator === "rk4" ? "RK4" : settings.integrator === "euler" ? "Euler" : "Semi-impl. Euler"}, dt ${settings.timestep} ms` },
    ]);
    const alerts = [];
    if (sim.msg) alerts.push({ level: sim.msgLevel || "warn", text: sim.msg });
    if (sim.estopped) alerts.push({ level: "warn", text: tr("Hätäjarru: este edessä.", "Emergency brake: obstacle ahead.") });
    if (!alerts.length && st.control === "follow" && !sim.path.length) {
      alerts.push({ level: "info", text: tr("Robotti odottaa. Paina \"Aja maaliin\" tai klikkaa karttaa, niin robotti ajaa sinne.", "The robot is waiting. Press \"Drive to goal\" or click the map to send the robot there.") });
    }
    if (!alerts.length && st.control === "keys" && sim.v === 0 && sim.w === 0) {
      alerts.push({ level: "info", text: tr("Aja nuolinäppäimillä tai simulaationäkymän alla olevilla napeilla.", "Drive with the arrow keys or the buttons below the simulation view.") });
    }
    el.querySelector("#mb-alerts").innerHTML = alertsHtml(alerts);
    drawPlot(el.querySelector("#mb-plot"), { xLabel: "t [s]", yMin: 0,
      series: [{ x: sim.errT, y: sim.errE.map((e) => e / lenF()), label: tr(`virhe [${lenLabel()}]`, `error [${lenLabel()}]`), color: cssColor("var(--warn)") }] });
  }

  /* ----- Piirto ----- */
  function drawSim(g) {
    const free = rgbOf("var(--surface)"), wall = mix(rgbOf("var(--text-3)"), free, 0.15);
    const occ = map.grid.occ, w = map.w, c = map.cell;
    g.image((i, j) => (occ[j * w + i] ? wall : free));
    g.gridLines(cssColor("var(--border)"));
    const m = (p) => [p[0] / c, p[1] / c];
    const accent = cssColor("var(--accent)"), warn = cssColor("var(--warn)");
    if (sim.path.length) g.polyline(sim.path.map(m), cssColor("var(--text-3)"), 1.5, [4, 4]);
    if (sim.goal) g.marker(sim.goal[0] + 0.5, sim.goal[1] + 0.5, cssColor("var(--err)"), tr("M", "G"));
    g.polyline(sim.trailOdom.map(m), warn, 1.5);
    g.polyline(sim.trailTrue.map(m), accent, 2);

    // Etäisyysanturit
    const ctx = g.ctx;
    SENSOR_ANGLES.forEach((a, k) => {
      const p = sim.pose, o = sensorOrigin(p), d = sim.ranges[k];
      const [x0, y0] = g.px(o[0] / c, o[1] / c), [x1, y1] = g.px((o[0] + Math.cos(p[2] + a) * d) / c, (o[1] + Math.sin(p[2] + a) * d) / c);
      ctx.strokeStyle = d - st.radius < st.stopDist + 0.05 ? cssColor("var(--err)") : cssColor("var(--ok)");
      ctx.globalAlpha = 0.5; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      ctx.globalAlpha = 1;
    });

    drawBody(g, sim.odom, warn, true);
    drawBody(g, sim.pose, accent, false);
  }

  function drawBody(g, p, color, ghost) {
    const ctx = g.ctx, c = map.cell, s = g.cs / c; // pikseliä metrille
    const [px, py] = g.px(p[0] / c, p[1] / c);
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(-p[2]);
    ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2;
    ctx.setLineDash(ghost ? [4, 3] : []);
    ctx.globalAlpha = ghost ? 0.8 : 1;
    if (st.model === "diff") {
      const r = st.radius * s;
      ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
      if (!ghost) { ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
      if (!ghost) {
        const wb = (st.wheelBase / 2) * s, wr = st.wheelR * s;
        ctx.fillStyle = cssColor("var(--text)");
        ctx.fillRect(-wr, -wb - 2, wr * 2, 4); ctx.fillRect(-wr, wb - 2, wr * 2, 4);
      }
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(r * 1.3, 0); ctx.stroke();
    } else {
      const L = st.L * s, wdt = st.radius * 1.4 * s;
      ctx.beginPath(); ctx.rect(-L * 0.2, -wdt / 2, L * 1.4, wdt);
      if (!ghost) { ctx.globalAlpha = 0.25; ctx.fill(); ctx.globalAlpha = 1; }
      ctx.stroke();
      if (!ghost) {
        ctx.fillStyle = cssColor("var(--text)");
        const wl = st.wheelR * 2 * s;
        for (const y of [-wdt / 2, wdt / 2]) {
          ctx.fillRect(-wl / 2, y - 2, wl, 4); // takapyörät
          ctx.save(); ctx.translate(L, y); ctx.rotate(-sim.delta); ctx.fillRect(-wl / 2, -2, wl, 4); ctx.restore(); // etupyörät
        }
      }
    }
    ctx.restore();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  function unmount() {
    cancelAnimationFrame(raf);
    gv?.destroy();
    keys = {};
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
  }

  /* ----- Esimerkit: tyypillisiä robotteja ----- */
  // Tallentaa täydellisen tilan ja nollaa simulaation, koska malli ja mitat voivat muuttua.
  // Kartta ladataan ensin, jotta resetSim käyttää ajantasaista karttaa; render() ei nollaa uudelleen,
  // koska kartan avain ei muutu.
  function applyPreset(values) {
    const cur = getToolState("sim2d", { ...DEFAULTS, noise: settings.noise });
    saveToolState("sim2d", { ...DEFAULTS, noise: settings.noise, control: "follow", ...values, _adv: cur._adv });
    map = GridMap.load();
    resetSim();
    paused = false;
  }
  const deg = (d) => (d * Math.PI) / 180;
  // Nimet getter-funktioina, jotta kielen vaihto näkyy valikossa heti
  const examples = [
    {
      get name() { return tr("Pieni opetusrobotti", "Small educational robot"); },
      get desc() { return tr("Differentiaaliohjaus, säde 0,1 m, 0,3 m/s, Pure Pursuit", "Differential drive, 0.1 m radius, 0.3 m/s, Pure Pursuit"); },
      apply: () => applyPreset({
        model: "diff", controller: "pp", vmax: 0.3, wmax: 2.5, amax: 0.8,
        wheelR: 0.033, wheelBase: 0.16, radius: 0.1, lookahead: 0.25,
        useOdom: false, estop: true, stopDist: 0.08, ticks: 360,
      }),
    },
    {
      get name() { return tr("Nopea viivanseuraaja", "Fast line-follower"); },
      get desc() { return tr("Kevyt ja pieni, 0,8 m/s, nopeat käännökset", "Light and small, 0.8 m/s, quick turns"); },
      apply: () => applyPreset({
        model: "diff", controller: "pp", vmax: 0.8, wmax: 8, amax: 3,
        wheelR: 0.02, wheelBase: 0.1, radius: 0.06, lookahead: 0.2,
        useOdom: false, estop: true, stopDist: 0.06, ticks: 1024,
      }),
    },
    {
      get name() { return tr("RC-auto (Ackermann)", "RC car (Ackermann)"); },
      get desc() { return tr("Akseliväli 0,25 m, ohjauskulma 30°, Pure Pursuit", "Wheelbase 0.25 m, 30° steering, Pure Pursuit"); },
      apply: () => applyPreset({
        model: "ackermann", controller: "pp", vmax: 0.5, amax: 1.5, deltaMax: deg(30),
        wheelR: 0.03, L: 0.25, radius: 0.1, lookahead: 0.4,
        useOdom: false, estop: true, stopDist: 0.08, ticks: 360,
      }),
    },
    {
      get name() { return tr("PID-suuntasäätö", "PID heading control"); },
      get desc() { return tr("Differentiaalirobotti PID-ohjaimella, Kp 4, Kd 0,3", "Differential robot with the PID controller, Kp 4, Kd 0.3"); },
      apply: () => applyPreset({
        model: "diff", controller: "pid", kp: 4, ki: 0, kd: 0.3, vmax: 0.3, wmax: 3, amax: 1,
        wheelR: 0.033, wheelBase: 0.16, radius: 0.1, lookahead: 0.3,
        useOdom: false, estop: true, stopDist: 0.08, ticks: 360,
      }),
    },
    {
      get name() { return tr("Realistinen odometria", "Realistic odometry"); },
      get desc() { return tr("Ohjain luottaa enkoodereihin, luisto näyttää virheen kasvun", "Controller trusts the encoders; wheel slip shows drift"); },
      apply: () => applyPreset({
        model: "diff", controller: "pp", vmax: 0.3, wmax: 2.5, amax: 0.8,
        wheelR: 0.033, wheelBase: 0.16, radius: 0.08, lookahead: 0.25,
        useOdom: true, noise: 0.6, estop: true, stopDist: 0.08, ticks: 180,
      }),
    },
  ];

  TOOL_IMPL.sim2d = { render, unmount, examples };
  // Kurssit lukevat simulaation tilan tästä (maaliin pääsyt, törmäykset)
  window.sim2dStatus = () => ({ arrivals, offGoalArrivals, collisions: sim?.collisions || 0, spin: spinTotal, arc: arcTotal });
  window.mobileSim = () => sim;
  // Automaattitestit (?memstore): simulaatiota voi ajaa askel kerrallaan ilman animaatiota
  if (/[?&]memstore\b/.test(location.search)) window.__sim2d = { step: (dt) => step(dt), planTo: (g) => planTo(g), reset: () => resetSim(), get st() { return st; }, get map() { return map; } };
})();
