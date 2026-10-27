"use strict";

/* Varauskartta (occupancy grid): robotti liikkuu reittisuunnittelun kartalla, simuloitu 2D-lidar
   mittaa ja log-odds-päivitys rakentaa karttaa. Robotin asento oletetaan tunnetuksi (ei paikannusta).
   Simulaation tila säilyy, kun käyttäjä käy toisella sivulla. */
(() => {
  const DEFAULTS = { speed: 0.5, beams: 90, range: 2.5, noise: null, lOcc: 0.85, lFree: -0.4, showTruth: false, showRays: true };
  const KNOWN = 0.5;        // |log-odds| tätä pienempi = tuntematon
  const OCC_PLAN = 0.4;     // suunnittelussa esteeksi tulkittava log-odds
  const SCAN_DT = 0.1, REPLAN_DT = 0.5;

  let el, st, map, gv, raf = 0, lastT = 0, sim = null, keys = {};

  function mapKey(m) { return m.w + "x" + m.h + ":" + m.cell + ":" + m.start + ":" + m.grid.occ.join(""); }

  function resetSim() {
    const n = map.w * map.h;
    sim = {
      key: mapKey(map), L: new Float32Array(n),
      pose: { x: map.start[0] + 0.5, y: map.start[1] + 0.5, th: 0 },
      path: [], goal: null, exploring: false, dist: 0, scans: 0, tries: new Map(), skip: new Set(), bestKnown: 0, stall: 0, stuckT: 0, lastPos: null,
      scanAcc: SCAN_DT, planAcc: 0, rays: [], rand: Plan.rng(settings.seed), msg: "", msgLevel: "warn",
    };
  }

  function render(root, tool) {
    el = root;
    st = getToolState("occ", { ...DEFAULTS, noise: settings.noise });
    map = GridMap.load();
    if (!sim || sim.key !== mapKey(map)) resetSim();
    const adv = st._adv ?? settings.advanced;
    const fields = [
      { key: "speed", label: tr("Robotin nopeus", "Robot speed"), unit: "m/s", type: "slider", min: 0.1, max: 2, step: 0.1,
        info: tr("Kuinka nopeasti robotti ajaa. Pienet sisärobotit ajavat tyypillisesti 0,2–0,5 m/s; hitaampi ajo antaa enemmän mittauksia metriä kohden.", "How fast the robot drives. Small indoor robots typically drive 0.2–0.5 m/s; driving slower gives more scans per metre.") },
      { key: "beams", label: tr("Lidar-säteitä", "Lidar beams"), type: "slider", min: 4, max: 360, step: 1,
        info: tr("Montako etäisyysmittausta lidar tekee yhden kierroksen aikana. Edullinen 360° lidar: noin 360; muutaman ToF-anturin rengas: 4–12. Enemmän säteitä = kartta valmistuu nopeammin.", "How many range measurements the lidar takes per revolution. A cheap 360° lidar: about 360; a ring of a few ToF sensors: 4–12. More beams = the map fills in faster.") },
      { key: "range", label: tr("Lidarin kantama", "Lidar range"), unit: lenLabel, factor: lenF, type: "slider", min: 0.3 / lenF(), max: 10 / lenF(), step: 0.1 / lenF(),
        info: tr("Pisin etäisyys, jonka anturi mittaa. Edullinen lidar 6–12 m, ToF-anturi noin 1–2 m (VL53L1X jopa 4 m). Kantaman ulkopuolelta ei saada tietoa, joten robotin on ajettava lähemmäs.", "The longest distance the sensor measures. A cheap lidar 6–12 m, a ToF sensor about 1–2 m (VL53L1X up to 4 m). Nothing is learned beyond the range, so the robot has to drive closer.") },
      { key: "showTruth", label: tr("Vertaa todellisiin seiniin", "Compare to true walls"), help: tr("Punaiset ääriviivat: missä seinät oikeasti ovat", "Red outlines: where the walls really are"), type: "toggle",
        info: tr("Näyttää simulaation oikeat seinät, jotta näet, missä arvioitu kartta on väärin. Oikealla robotilla tätä tietoa ei ole.", "Shows the simulation's real walls so you can see where the estimated map is wrong. A real robot does not have this information.") },
      { key: "showRays", label: tr("Näytä lidar-säteet", "Show lidar beams"), type: "toggle", adv: true,
        info: tr("Piirtää viimeisimmän mittauksen säteet robotista osumakohtiin.", "Draws the beams of the latest scan from the robot to where they hit.") },
      { key: "noise", label: tr("Mittauskohina", "Measurement noise"), help: tr("Etäisyysmittauksen keskihajonta suhteessa soluun", "Standard deviation of range measurements relative to cell size"), type: "slider", adv: true, min: 0, max: 1, step: 0.05,
        info: tr("Satunnaisvirhe jokaisessa etäisyysmittauksessa. 0,2 tarkoittaa noin viidesosan solun (tässä 2 cm) keskihajontaa, mikä vastaa edullista lidaria. Suuri kohina tekee seinistä sumeita.", "Random error in each range measurement. 0.2 means a standard deviation of about a fifth of a cell (2 cm here), similar to a cheap lidar. High noise makes walls blurry.") },
      { key: "lOcc", label: tr("Log-odds: osuma", "Log-odds: hit"), help: tr("Kuinka paljon yksi osuma lisää varmuutta esteestä", "How much one hit increases confidence in an obstacle"), adv: true, min: 0.01, max: 5, step: 0.05,
        info: tr("Suuri arvo (esim. 2) merkitsee esteen jo yhdestä osumasta, mutta myös kohina tarttuu karttaan. Pieni arvo (0,3–0,6) vaatii useita osumia ja suodattaa satunnaisvirheitä. Tyypillisesti 0,5–1.", "A large value (e.g. 2) marks an obstacle after a single hit, but noise sticks to the map too. A small value (0.3–0.6) needs several hits and filters random errors. Typically 0.5–1.") },
      { key: "lFree", label: tr("Log-odds: vapaa", "Log-odds: free"), help: tr("Negatiivinen: säteen läpäisemät solut", "Negative: cells the beam passes through"), adv: true, min: -5, max: -0.01, step: 0.05,
        info: tr("Kuinka paljon säteen läpäisy vähentää esteen todennäköisyyttä. Yleensä pienempi itseisarvoltaan kuin osuma (esim. −0,4), koska ohi menevä säde on epävarmempi todiste.", "How much a beam passing through lowers the obstacle probability. Usually smaller in magnitude than a hit (e.g. −0.4), because a passing beam is weaker evidence.") },
    ];

    el.innerHTML = `
      ${toolHead(tool)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Ohjaus", "Control")}</h3>
            <div class="row-actions" style="margin-top:0">
              <button class="btn primary" id="oc-explore"></button>
              <button class="btn" id="oc-reset">${tr("Nollaa kartoitus", "Reset mapping")}</button>
            </div>
            <p class="note" style="margin-top:10px">${tr("Klikkaa karttaa ajaaksesi robotin sinne, tai ohjaa nuolinäppäimillä. Robotti suunnittelee reitin sen perusteella, mitä se on jo nähnyt.", "Click the map to drive the robot there, or steer with the arrow keys. The robot plans its path based on what it has already seen.")}</p>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Robotti ja lidar", "Robot and lidar")}</h3>
            <div class="fields" id="oc-fields"></div>
            <button class="link-btn" id="oc-adv" style="margin-top:12px">${adv ? tr("Piilota lisäasetukset", "Hide advanced settings") : tr("Näytä lisäasetukset (kohina, log-odds)", "Show advanced settings (noise, log-odds)")}</button>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Mitä tämä tekee?", "What does this do?")}</h3>
            <p class="note" style="line-height:1.6">${tr(`Robotti ei aluksi tiedä ympäristöstään mitään (harmaa). Lidar mittaa etäisyyksiä joka suuntaan:
              säteen läpäisemät solut merkitään vapaiksi (valkoinen) ja solut, joihin säde osuu, esteiksi (musta).
              Jokainen mittaus lisää varmuutta, joten kohinainenkin data tuottaa lopulta selkeän kartan.
              Valmista karttaa käytetään esimerkiksi ROS:n navigoinnissa reittien suunnitteluun ja robotin paikantamiseen.`, `At first the robot knows nothing about its surroundings (gray). The lidar measures distances in every direction:
              cells the beam passes through are marked free (white) and cells the beam hits are marked as obstacles (black).
              Every measurement increases confidence, so even noisy data eventually produces a clear map.
              A finished map is used, for example, in ROS navigation for path planning and robot localization.`)}</p>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Vienti", "Export")}</h3>
            <div class="row-actions" style="margin-top:0">
              <button class="btn" id="oc-png">${tr("Vie PNG", "Export PNG")}</button>
              <button class="btn" id="oc-pgm">${tr("Vie PGM (ROS)", "Export PGM (ROS)")}</button>
              <button class="btn" id="oc-yaml">${tr("Vie YAML", "Export YAML")}</button>
            </div>
            <p class="note" style="margin-top:8px">${tr("PGM-muodossa vapaa = valkoinen, este = musta ja tuntematon = harmaa. ROS:n map_server tarvitsee lisäksi YAML-tiedoston.", "In PGM format free = white, obstacle = black and unknown = gray. ROS map_server also needs a YAML file.")}</p>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Arvioitu kartta", "Estimated map")} <span class="legend">
              <i style="background:#f2f2f2;border:1px solid var(--border-strong)"></i>${tr("vapaa", "free")}
              <i style="background:#18181c;border:1px solid var(--border-strong)"></i>${tr("este", "obstacle")}
              <i style="background:#808894"></i>${tr("tuntematon", "unknown")}</span></h3>
            <canvas class="gridview" id="oc-canvas" tabindex="0" aria-label="${tr("Kartta: klikkaa ajaaksesi, nuolinäppäimet ohjaavat", "Map: click to drive, arrow keys steer")}"></canvas>
          </div>
          <div id="oc-stats"></div>
          <div id="oc-alerts"></div>
        </div>
      </div>`;

    const box = el.querySelector("#oc-fields");
    box.innerHTML = fieldsHtml(fields, st, adv);
    bindFields(box, fields, st, () => saveToolState("occ", st));
    el.querySelector("#oc-adv").onclick = () => { st._adv = !adv; saveToolState("occ", st); unmount(); render(root, tool); };
    el.querySelector("#oc-explore").onclick = () => {
      sim.exploring = !sim.exploring;
      sim.msg = "";
      if (sim.exploring) { sim.goal = null; sim.path = []; sim.stall = sim.dist; sim.bestKnown = 0; }
      else { sim.path = []; sim.goal = null; }
      updateButtons();
    };
    el.querySelector("#oc-reset").onclick = () => { resetSim(); updateButtons(); };
    el.querySelector("#oc-png").onclick = exportPng;
    el.querySelector("#oc-pgm").onclick = exportPgm;
    el.querySelector("#oc-yaml").onclick = exportYaml;

    gv = new GridView(el.querySelector("#oc-canvas"), {
      draw: drawMap,
      onPointer: (c, phase) => {
        if (phase !== "down" || !c.inside) return;
        sim.exploring = false;
        sim.goal = [c.i, c.j];
        sim.msg = "";
        replan();
        updateButtons();
      },
    });
    gv.setSize(map.w, map.h);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    updateButtons();
    lastT = performance.now();
    raf = requestAnimationFrame(loop);
  }

  function onKey(e) {
    if (!e.key.startsWith("Arrow")) return;
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
    e.preventDefault();
    keys[e.key] = e.type === "keydown";
    if (e.type === "keydown") { sim.exploring = false; sim.path = []; sim.goal = null; updateButtons(); }
  }

  function updateButtons() {
    const b = el.querySelector("#oc-explore");
    if (b) b.textContent = sim.exploring ? tr("❚❚ Pysäytä tutkiminen", "❚❚ Stop exploring") : tr("▶ Tutki automaattisesti", "▶ Explore automatically");
  }

  /* ----- Simulaatio ----- */

  function estimatedGrid() {
    const occ = new Uint8Array(sim.L.length);
    for (let i = 0; i < occ.length; i++) occ[i] = sim.L[i] > OCC_PLAN ? 1 : 0;
    const rc = robotCell();
    occ[rc[1] * map.w + rc[0]] = 0;
    return { w: map.w, h: map.h, occ };
  }
  const robotCell = () => [Math.min(map.w - 1, Math.max(0, Math.floor(sim.pose.x))), Math.min(map.h - 1, Math.max(0, Math.floor(sim.pose.y)))];

  function replan() {
    if (!sim.goal) { sim.path = []; return; }
    const r = Plan.gridSearch(estimatedGrid(), robotCell(), sim.goal, { algo: "astar", diagonal: true });
    if (!r.found) {
      sim.path = [];
      if (!sim.exploring) { sim.msg = tr("Kohteeseen ei löydy reittiä tunnetun kartan perusteella.", "No path to the target based on the known map."); sim.msgLevel = "warn"; sim.goal = null; }
      else sim.goal = null; // valitaan uusi reuna
      return;
    }
    sim.path = r.path.slice(1).map((c) => [(c % map.w) + 0.5, ((c / map.w) | 0) + 0.5]);
  }

  function gauss() {
    const u = 1 - sim.rand(), v = sim.rand();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  function scan() {
    const n = Math.round(st.beams), maxR = st.range / map.cell, sigma = (st.noise ?? 0) * 1.0;
    const { x, y, th } = sim.pose;
    sim.rays = [];
    for (let k = 0; k < n; k++) {
      const a = th + (2 * Math.PI * k) / n;
      const r = Plan.raycast(map.grid, x, y, a, maxR);
      const d = Math.max(0, Math.min(maxR, r.dist + (r.hit ? gauss() * sigma : 0)));
      Plan.updateRay(sim.L, map.grid, x, y, a, d, r.hit, { lOcc: st.lOcc, lFree: st.lFree });
      sim.rays.push([x + Math.cos(a) * d, y + Math.sin(a) * d, r.hit]);
    }
    sim.scans++;
  }

  // Liike tarkistetaan todellista karttaa vasten: robotti ei voi ajaa seinän läpi
  function tryMove(nx, ny) {
    const r = 0.3; // robotin säde soluina
    for (const [dx, dy] of [[r, 0], [-r, 0], [0, r], [0, -r]]) {
      if (!Plan.free(map.grid, Math.floor(nx + dx), Math.floor(ny + dy))) return false;
    }
    sim.dist += Math.hypot(nx - sim.pose.x, ny - sim.pose.y) * map.cell;
    sim.pose.x = nx; sim.pose.y = ny;
    return true;
  }

  function step(dt) {
    const v = st.speed / map.cell; // solua sekunnissa
    if (keys.ArrowUp || keys.ArrowDown || keys.ArrowLeft || keys.ArrowRight) {
      sim.pose.th += ((keys.ArrowLeft ? 1 : 0) - (keys.ArrowRight ? 1 : 0)) * 2.5 * dt;
      const s = ((keys.ArrowUp ? 1 : 0) - (keys.ArrowDown ? 0.6 : 0)) * v * dt;
      tryMove(sim.pose.x + Math.cos(sim.pose.th) * s, sim.pose.y + Math.sin(sim.pose.th) * s);
    } else {
      // Reunoja haetaan vasta ensimmäisen mittauksen jälkeen — tyhjällä kartalla niitä ei vielä ole
      if (sim.exploring && !sim.goal && sim.scans > 0) {
        const f = Plan.nearestFrontier(sim.L, map.grid, robotCell(), KNOWN, sim.skip);
        if (!f) { sim.exploring = false; sim.msg = tr("Kartoitus valmis — saavutettavia tutkimattomia alueita ei ole.", "Mapping complete — no reachable unexplored areas remain."); sim.msgLevel = "ok"; updateButtons(); }
        else {
          // Sama reuna valittu jo monta kertaa ilman että sen ympäristö selviää (kohina, suljettu kolo) → ohitetaan
          const i = f[1] * map.w + f[0], n = (sim.tries.get(i) || 0) + 1;
          sim.tries.set(i, n);
          if (n > 3) sim.skip.add(i);
          else { sim.goal = f; replan(); }
        }
      }
      if (sim.path.length) {
        const [tx, ty] = sim.path[0];
        const dx = tx - sim.pose.x, dy = ty - sim.pose.y, d = Math.hypot(dx, dy);
        if (d < 0.05) sim.path.shift();
        else {
          sim.pose.th = Math.atan2(dy, dx);
          const s = Math.min(d, v * dt), nx = sim.pose.x + (dx / d) * s, ny = sim.pose.y + (dy / d) * s;
          // Kulmassa suora siirto voi osua seinään: liu'utaan seinää pitkin, ja vasta jos sekään ei onnistu, suunnitellaan uudelleen
          if (!tryMove(nx, ny) && !tryMove(nx, sim.pose.y) && !tryMove(sim.pose.x, ny)) replan();
        }
        if (!sim.path.length) {
          const rc = robotCell();
          if (sim.goal && rc[0] === sim.goal[0] && rc[1] === sim.goal[1]) sim.goal = null;
        }
      }
      sim.planAcc += dt;
      if (sim.planAcc >= REPLAN_DT) {
        sim.planAcc = 0;
        // Jumissa: robotilla on kohde, mutta se ei ole liikkunut 3 sekuntiin → kohde hylätään ja valitaan toinen
        if (sim.exploring && sim.goal) {
          const lp = sim.lastPos || [sim.pose.x, sim.pose.y];
          if (Math.hypot(sim.pose.x - lp[0], sim.pose.y - lp[1]) > 0.1) { sim.lastPos = [sim.pose.x, sim.pose.y]; sim.stuckT = 0; }
          else if ((sim.stuckT = (sim.stuckT || 0) + REPLAN_DT) >= 3) {
            sim.skip.add(sim.goal[1] * map.w + sim.goal[0]);
            sim.goal = null; sim.path = []; sim.stuckT = 0;
          }
        }
        // Kohinan takia seinien vierussolut voivat vaihdella tunnetun ja tuntemattoman välillä, jolloin
        // "reunoja" syntyy loputtomasti. Jos kartta ei ole kasvanut, vaikka robotti on ajanut kartan
        // lävistäjän kahdesti, kartoitus on valmis (matka eikä aika: hidas robotti ehtisi muuten liian vähän).
        if (sim.exploring) {
          let known = 0;
          for (let i = 0; i < sim.L.length; i++) if (Math.abs(sim.L[i]) > KNOWN) known++;
          const diag = Math.hypot(map.w, map.h) * map.cell;
          if (known > sim.bestKnown + sim.L.length * 0.002) { sim.bestKnown = known; sim.stall = sim.dist; }
          else if (sim.dist - sim.stall >= 2 * diag) {
            sim.exploring = false; sim.goal = null; sim.path = [];
            sim.msg = tr("Kartoitus valmis — kartta ei enää tarkentunut. Jäljelle jääneet harmaat kohdat ovat esteiden sisällä tai mittauskohinan rajalla.", "Mapping complete — the map stopped improving. Any grey cells left are inside obstacles or at the limit of the measurement noise.");
            sim.msgLevel = "ok"; updateButtons();
          }
        }
        // Uusi este reitillä → suunnitellaan uudelleen. Tutkittaessa myös valmis reuna vaihdetaan.
        if (sim.goal) {
          if (sim.exploring && Math.abs(sim.L[sim.goal[1] * map.w + sim.goal[0]]) > KNOWN && !hasUnknownNeighbor(sim.goal)) { sim.goal = null; sim.path = []; }
          else if (sim.path.some(([x, y]) => sim.L[Math.floor(y) * map.w + Math.floor(x)] > OCC_PLAN)) replan();
        }
      }
    }
    sim.scanAcc += dt;
    if (sim.scanAcc >= SCAN_DT) { sim.scanAcc = 0; scan(); }
  }

  function hasUnknownNeighbor([x, y]) {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < map.w && ny < map.h && Math.abs(sim.L[ny * map.w + nx]) <= KNOWN) return true;
    }
    return false;
  }

  function loop(now) {
    if (!el.querySelector("#oc-canvas")) return;
    const dt = Math.min(0.05, (now - lastT) / 1000) * settings.realtime;
    lastT = now;
    if (!(settings.pauseOnBlur && document.hidden)) {
      // Pilkotaan pieniin askeliin, jotta suuri reaaliaikakerroin ei hyppää seinien läpi
      const n = Math.max(1, Math.ceil(dt / 0.02));
      for (let k = 0; k < n; k++) step(dt / n);
      gv.draw();
      stats();
    }
    raf = requestAnimationFrame(loop);
  }

  let statsAt = 0;
  function stats() {
    const now = performance.now();
    if (now - statsAt < 250) return;
    statsAt = now;
    let known = 0, correct = 0;
    const occ = map.grid.occ;
    for (let i = 0; i < sim.L.length; i++) {
      if (Math.abs(sim.L[i]) > KNOWN) { known++; if ((sim.L[i] > 0) === !!occ[i]) correct++; }
    }
    el.querySelector("#oc-stats").innerHTML = resultTiles([
      { label: tr("Kartoitettu", "Mapped"), value: fmt((known / sim.L.length) * 100, 0), unit: "%" },
      { label: tr("Tarkkuus", "Accuracy"), value: known ? fmt((correct / known) * 100, 1) : "–", unit: "%", sub: tr("verrattuna todelliseen", "compared to ground truth") },
      { label: tr("Ajettu matka", "Distance driven"), value: fmtLen(sim.dist, 2), unit: lenLabel() },
      { label: tr("Mittauksia", "Scans"), value: String(sim.scans), sub: tr(`${Math.round(st.beams)} sädettä / mittaus`, `${Math.round(st.beams)} beams / scan`) },
    ]);
    el.querySelector("#oc-alerts").innerHTML = sim.msg ? alertsHtml([{ level: sim.msgLevel || "warn", text: sim.msg }]) : "";
  }

  /* ----- Piirto ja vienti ----- */

  function drawMap(g) {
    // ROS-kartan värit kaikissa teemoissa: vapaa valkoinen, este musta, tuntematon harmaa (sama kuin PGM-viennissä)
    const free = [242, 242, 242], occC = [24, 24, 28], unk = [128, 136, 148];
    const L = sim.L, w = map.w;
    g.image((i, j) => {
      const l = L[j * w + i];
      if (Math.abs(l) <= KNOWN) return unk;
      return mix(free, occC, Plan.probability(l));
    });
    const ctx = g.ctx;
    if (st.showTruth) {
      ctx.strokeStyle = cssColor("var(--err)"); ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
      for (let j = 0; j < map.h; j++) for (let i = 0; i < w; i++) {
        if (!map.grid.occ[j * w + i]) continue;
        const [x, y] = g.px(i, j + 1);
        ctx.strokeRect(x + 1.5, y + 1.5, g.cs - 3, g.cs - 3);
      }
      ctx.globalAlpha = 1;
    }
    if (st.showRays && sim.rays.length) {
      ctx.strokeStyle = cssColor("var(--warn)"); ctx.globalAlpha = 0.18; ctx.lineWidth = 1;
      ctx.beginPath();
      const [rx, ry] = g.px(sim.pose.x, sim.pose.y);
      for (const [x, y] of sim.rays) { const [px, py] = g.px(x, y); ctx.moveTo(rx, ry); ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    const accent = cssColor("var(--accent)");
    if (sim.path.length) g.polyline([[sim.pose.x, sim.pose.y], ...sim.path], accent, 2, [5, 4]);
    if (sim.goal) g.marker(sim.goal[0] + 0.5, sim.goal[1] + 0.5, cssColor("var(--err)"), tr("M", "G"));
    // Robotti: ympyrä ja suuntaviiva
    const [px, py] = g.px(sim.pose.x, sim.pose.y), r = Math.max(5, g.cs * 0.6);
    ctx.fillStyle = accent; ctx.strokeStyle = cssColor("var(--surface)"); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(px, py, r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + Math.cos(sim.pose.th) * r * 1.6, py - Math.sin(sim.pose.th) * r * 1.6); ctx.stroke();
  }

  // ROS-tyylinen kolmitasoinen kartta: 0 = este, 254 = vapaa, 205 = tuntematon
  const levelAt = (i, j) => {
    const l = sim.L[j * map.w + i];
    if (Math.abs(l) <= KNOWN) return 205;
    return Plan.probability(l) > 0.65 ? 0 : Plan.probability(l) < 0.35 ? 254 : 205;
  };

  function exportPgm() {
    const rows = [];
    for (let j = map.h - 1; j >= 0; j--) {
      const r = [];
      for (let i = 0; i < map.w; i++) r.push(levelAt(i, j));
      rows.push(r.join(" "));
    }
    downloadFile("kartta.pgm", `P2\n# RoboLab varauskartta, solu ${map.cell} m\n${map.w} ${map.h}\n255\n${rows.join("\n")}\n`, "image/x-portable-graymap");
  }

  // Erillinen lataus: selaimet estävät usein kaksi peräkkäistä latausta yhdestä klikkauksesta
  function exportYaml() {
    downloadFile("kartta.yaml", `image: kartta.pgm\nresolution: ${map.cell}\norigin: [0.0, 0.0, 0.0]\nnegate: 0\noccupied_thresh: 0.65\nfree_thresh: 0.196\n`, "text/yaml");
  }

  function exportPng() {
    const s = 8, c = document.createElement("canvas");
    c.width = map.w * s; c.height = map.h * s;
    const ctx = c.getContext("2d");
    for (let j = 0; j < map.h; j++) for (let i = 0; i < map.w; i++) {
      const v = levelAt(i, j);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(i * s, (map.h - 1 - j) * s, s, s);
    }
    c.toBlob((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "kartta.png";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    });
  }

  function unmount() {
    cancelAnimationFrame(raf);
    gv?.destroy();
    keys = {};
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("keyup", onKey);
  }

  /* Esimerkit (tyypillisiä arvoja). Parametrit vaikuttavat seuraavaan mittaukseen ilman nollausta, mutta
     vanha kartta on rakennettu eri asetuksilla — nollataan, jotta vaikutus näkyy puhtaalta pöydältä.
     sim = null → render() aloittaa uuden simulaation. */
  function applyExample(cfg) {
    const cur = getToolState("occ", { ...DEFAULTS, noise: settings.noise });
    saveToolState("occ", { ...DEFAULTS, noise: settings.noise, showTruth: cur.showTruth, showRays: cur.showRays, ...cfg, _adv: cur._adv });
    sim = null;
  }

  const examples = [
    { name: tr("Edullinen 360° lidar (tyypilliset arvot)", "Cheap 360° lidar (typical values)"),
      desc: tr("RPLIDAR A1 -tyyppinen: 360 sädettä, 6 m, pieni kohina", "RPLIDAR A1-like: 360 beams, 6 m, low noise"),
      apply: () => applyExample({ speed: 0.3, beams: 360, range: 6, noise: 0.2, lOcc: 0.85, lFree: -0.4 }) },
    { name: tr("Lyhyen kantaman ToF-rengas", "Short-range ToF sensor ring"),
      desc: tr("8 sädettä, 1 m — kartoitus vaatii paljon ajamista", "8 beams, 1 m — mapping needs a lot of driving"),
      apply: () => applyExample({ speed: 0.3, beams: 8, range: 1, noise: 0.2, lOcc: 0.85, lFree: -0.4 }) },
    { name: tr("Kohinainen anturi", "Noisy sensor"),
      desc: tr("Suuri kohina — seinät sumenevat, vertaa todellisiin seiniin", "High noise — walls get blurry, compare to the true walls"),
      apply: () => applyExample({ speed: 0.5, beams: 90, range: 2.5, noise: 1, lOcc: 0.85, lFree: -0.4, showTruth: true }) },
    { name: tr("Huolellinen kartoitus", "Careful mapping"),
      desc: tr("Pieni log-odds-osuma, 180 sädettä, hidas ajo — kohina suodattuu", "Small log-odds hit, 180 beams, slow driving — noise is filtered out"),
      apply: () => applyExample({ speed: 0.2, beams: 180, range: 3, noise: 0.5, lOcc: 0.4, lFree: -0.2 }) },
  ];

  TOOL_IMPL.map = { render, unmount, examples };
  // Kurssit lukevat kartoituksen edistymisen tästä (osuus tunnetuista soluista 0–1)
  window.occCoverage = () => {
    if (!sim) return 0;
    let known = 0;
    for (let i = 0; i < sim.L.length; i++) if (Math.abs(sim.L[i]) > KNOWN) known++;
    return known / sim.L.length;
  };
  // Testejä varten: simulaation tila
  window.occSim = () => sim;
})();
