"use strict";

/* Reittisuunnittelu: piirrä kartta, valitse algoritmi, katso haku animaationa ja vertaile algoritmeja. */
(() => {
  const ALGOS = {
    astar: { name: "A*", grid: true, info: tr("Etsii lyhimmän reitin ja suuntaa haun maalia kohti arvion avulla — yleensä paras valinta ruudukossa.", "Finds the shortest path and steers the search toward the goal using a heuristic — usually the best choice on a grid.") },
    dijkstra: { name: "Dijkstra", grid: true, info: tr("Takaa lyhimmän reitin, mutta tutkii tasaisesti joka suuntaan, joten se on hitaampi kuin A*.", "Guarantees the shortest path, but explores evenly in every direction, so it is slower than A*.") },
    bfs: { name: tr("Leveyshaku (BFS)", "Breadth-first search (BFS)"), grid: true, info: tr("Löytää reitin, jossa on vähiten askelia. Vinoliikkeiden kanssa se ei välttämättä ole pituudeltaan lyhin.", "Finds the path with the fewest steps. With diagonal moves it is not necessarily the shortest in length.") },
    greedy: { name: tr("Ahne paras ensin", "Greedy best-first"), grid: true, info: tr("Menee suoraan kohti maalia: nopea, mutta reitti voi olla selvästi pidempi kuin lyhin.", "Heads straight for the goal: fast, but the path can be noticeably longer than the shortest.") },
    rrt: { name: "RRT", grid: false, info: tr("Kasvattaa satunnaista puuta jatkuvassa tilassa. Sopii suuriin ja monimutkaisiin tiloihin, mutta reitti ei ole lyhin.", "Grows a random tree in continuous space. Suits large and complex spaces, but the path is not the shortest.") },
    rrtstar: { name: "RRT*", grid: false, info: tr("RRT, joka parantaa reittiä koko ajan uudelleenkytkemällä puuta — lähestyy lyhintä reittiä iteraatioiden kasvaessa.", "RRT that keeps improving the path by rewiring the tree — approaches the shortest path as iterations increase.") },
  };
  const SPEEDS = [1, 2, 4, 8, 16, 32, 64, 128];
  const DEFAULTS = { algo: "astar", diagonal: true, weight: 1, iters: 2000, step: 2, goalBias: 0.05, radius: 5, seed: 1, speed: 4, brush: "wall" };

  let el, st, map, gv, res, anim = { k: 0, playing: false, raf: 0 }, last = null, painting = false;

  function render(root, tool) {
    el = root;
    st = getToolState("path", { ...DEFAULTS, seed: settings.seed || 1 });
    map = GridMap.load();
    const adv = st._adv ?? settings.advanced;
    const A = ALGOS[st.algo];
    const fields = [
      { key: "algo", label: tr("Algoritmi", "Algorithm"), type: "select", options: Object.entries(ALGOS).map(([k, a]) => [k, a.name]),
        info: tr("Hakualgoritmi, joka etsii reitin lähdöstä maaliin. Aloita A*:lla; vertaile muita \"Vertaile kaikkia\" -napilla.", "The search algorithm that finds a path from start to goal. Start with A*; compare the others with the \"Compare all\" button.") },
      { key: "diagonal", label: tr("Salli vinoliike", "Allow diagonal moves"), type: "toggle", when: () => A.grid,
        info: tr("Päällä robotti voi liikkua 8 suuntaan (myös vinottain), jolloin reitit ovat lyhyempiä ja luonnollisempia. Pois päältä vain 4 suuntaa.", "When on, the robot can move in 8 directions (diagonals too), giving shorter, more natural paths. When off, only 4 directions.") },
      { key: "weight", label: tr("Heuristiikan paino", "Heuristic weight"), help: tr("1 = lyhin reitti taattu, suurempi = nopeampi mutta ei aina lyhin", "1 = shortest path guaranteed, higher = faster but not always shortest"), adv: true, min: 0, max: 10, step: 0.1, when: () => st.algo === "astar",
        info: tr("Kerroin etäisyysarviolle maaliin. 0 = Dijkstra, 1 = tavallinen A*, 1,5–3 = painotettu A*, joka tutkii vähemmän soluja mutta voi antaa hieman pidemmän reitin.", "Multiplier for the distance-to-goal estimate. 0 = Dijkstra, 1 = normal A*, 1.5–3 = weighted A*, which explores fewer cells but may return a slightly longer path.") },
      { key: "iters", label: tr("Iteraatioita", "Iterations"), min: 10, max: 20000, step: 100, int: true, when: () => !A.grid,
        info: tr("Kuinka monta satunnaista näytettä puuhun yritetään lisätä. Enemmän = reitti löytyy varmemmin ja RRT* lyhentää sitä lisää, mutta laskenta hidastuu. Tyypillisesti 1000–5000.", "How many random samples are tried for the tree. More = a path is found more reliably and RRT* shortens it further, but computing is slower. Typically 1000–5000.") },
      { key: "step", label: tr("Askelpituus", "Step size"), unit: tr("solua", "cells"), adv: true, min: 0.2, max: 20, step: 0.1, when: () => !A.grid,
        info: tr("Kuinka pitkän oksan puu kasvattaa kerralla. Pieni askel pääsee kapeista käytävistä, suuri täyttää avoimen tilan nopeammin. Tyypillisesti 1–3 solua.", "How long a branch the tree grows at a time. A small step fits through narrow passages, a large one fills open space faster. Typically 1–3 cells.") },
      { key: "goalBias", label: tr("Maaliin suuntaus", "Goal bias"), help: tr("Osuus näytteistä, jotka otetaan suoraan maalista", "Fraction of samples taken directly at the goal"), adv: true, min: 0, max: 1, step: 0.01, when: () => !A.grid,
        info: tr("Esim. 0,05 = joka 20. näyte vedetään kohti maalia. Suurempi arvo löytää reitin nopeammin avoimessa tilassa, mutta voi juuttua esteiden taakse. Tyypillisesti 0,05–0,1.", "E.g. 0.05 = every 20th sample pulls toward the goal. Higher finds a path faster in open space but can get stuck behind obstacles. Typically 0.05–0.1.") },
      { key: "radius", label: tr("Uudelleenkytkennän säde", "Rewire radius"), unit: tr("solua", "cells"), adv: true, min: 0.5, max: 50, step: 0.5, when: () => st.algo === "rrtstar",
        info: tr("RRT* tarkistaa tämän säteen sisällä olevat solmut ja kytkee ne uuteen solmuun, jos reitti lyhenee. Suurempi säde = suorempi reitti, mutta hitaampi. Tyypillisesti 2–3 × askelpituus.", "RRT* checks nodes within this radius and reconnects them through the new node if the path gets shorter. Larger = straighter path but slower. Typically 2–3 × the step size.") },
      { key: "seed", label: tr("Satunnaissiemen", "Random seed"), help: tr("Sama siemen = sama tulos", "Same seed = same result"), adv: true, min: 0, max: 999999, step: 1, when: () => !A.grid,
        info: tr("RRT käyttää satunnaislukuja. Vaihda siementä nähdäksesi, kuinka paljon tulos vaihtelee ajosta toiseen.", "RRT uses random numbers. Change the seed to see how much the result varies from run to run.") },
    ];

    el.innerHTML = `
      ${toolHead(tool)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Kartta", "Map")}</h3>
            <div class="seg" id="pt-brush">
              ${[["wall", tr("Seinä", "Wall")], ["erase", tr("Pyyhi", "Erase")], ["start", tr("Lähtö", "Start")], ["goal", tr("Maali", "Goal")]].map(([k, l]) =>
                `<button data-b="${k}" class="${st.brush === k ? "on" : ""}">${l}</button>`).join("")}
            </div>
            <div class="row-actions">
              <button class="btn" id="pt-clear">${tr("Tyhjennä", "Clear")}</button>
              <button class="btn" id="pt-rand">${tr("Satunnainen", "Random")}</button>
              <button class="btn" id="pt-maze">${tr("Sokkelo", "Maze")}</button>
              <button class="btn" id="pt-default" title="${tr("Väljät käytävät — sopii myös mobiilirobotille", "Wide corridors — also suits a mobile robot")}">${tr("Oletuskartta", "Default map")}</button>
            </div>
            <div class="field" style="margin-top:12px"><label for="pt-size">${tr("Kartan koko", "Map size")}</label>
              <select id="pt-size">
                ${Object.entries(GridMap.SIZES).map(([k, [w, h]]) => `<option value="${k}" ${GridMap.sizeKey(map) === k ? "selected" : ""}>${{ small: tr("Pieni", "Small"), normal: tr("Normaali", "Normal"), large: tr("Suuri", "Large"), huge: tr("Hyvin suuri", "Very large") }[k]} — ${w} × ${h} (${fmt(w * map.cell, 1)} × ${fmt(h * map.cell, 1)} m)</option>`).join("")}
                ${GridMap.sizeKey(map) === "custom" ? `<option value="custom" selected>${map.w} × ${map.h}</option>` : ""}
              </select></div>
            <p class="note" style="margin-top:10px">${tr(`Piirrä hiirellä tai sormella. Kartta on ${fmt(map.w * map.cell, 1)} × ${fmt(map.h * map.cell, 1)} m (solu ${fmt(map.cell * 100, 0)} cm) ja sama kuin varauskartassa.`, `Draw with the mouse or a finger. The map is ${fmt(map.w * map.cell, 1)} × ${fmt(map.h * map.cell, 1)} m (cell ${fmt(map.cell * 100, 0)} cm) and shared with the occupancy grid tool.`)}</p>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Haku", "Search")}</h3>
            <div class="fields" id="pt-fields"></div>
            <p class="note" style="margin-top:10px">${A.info}</p>
            <button class="link-btn" id="pt-adv" style="margin-top:10px">${adv ? tr("Piilota lisäasetukset", "Hide advanced settings") : tr("Näytä lisäasetukset", "Show advanced settings")}</button>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Animaatio", "Animation")}</h3>
            <div class="row-actions" style="margin-top:0">
              <button class="btn primary" id="pt-play">${tr("▶ Toista haku", "▶ Play search")}</button>
              <button class="btn" id="pt-step">${tr("Askel", "Step")}</button>
              <button class="btn" id="pt-end">${tr("Näytä tulos", "Show result")}</button>
            </div>
            <div class="fields" id="pt-speed" style="margin-top:12px"></div>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Ruudukko", "Grid")} <span class="legend">
              <i style="background:var(--ok)"></i>${tr("lähtö", "start")} <i style="background:var(--err)"></i>${tr("maali", "goal")}
              <i style="background:color-mix(in srgb, var(--accent) 35%, transparent)"></i>${tr("tutkittu", "explored")}</span></h3>
            <canvas class="gridview" id="pt-canvas"></canvas>
          </div>
          <div id="pt-results"></div>
          <div id="pt-alerts"></div>
          <div class="card">
            <h3 class="card-title">${tr("Vertailu", "Comparison")} <button class="btn" id="pt-compare">${tr("Vertaile kaikkia", "Compare all")}</button></h3>
            <div id="pt-table"><p class="note">${tr("Ajaa kaikki algoritmit samalla kartalla ja vertaa reitin pituutta, tutkittujen solmujen määrää ja laskenta-aikaa.", "Runs every algorithm on the same map and compares path length, number of explored nodes and computation time.")}</p></div>
          </div>
        </div>
      </div>`;

    const box = el.querySelector("#pt-fields");
    const drawFields = () => { box.innerHTML = fieldsHtml(fields, st, adv); };
    drawFields();
    bindFields(box, fields, st, (key) => {
      save();
      if (key === "algo") { unmount(); render(root, tool); return; }
      run(true);
    });
    const speedF = [{ key: "speed", label: tr("Nopeus", "Speed"), type: "slider", min: 1, max: 8, step: 1,
      info: tr("Animaation nopeus: kuinka monta hakuaskelta näytetään kuvaruutua kohden (1 = yksi, 8 = 128). Ei vaikuta itse hakuun.", "Animation speed: how many search steps are shown per frame (1 = one, 8 = 128). Does not affect the search itself.") }];
    el.querySelector("#pt-speed").innerHTML = fieldsHtml(speedF, st, true);
    bindFields(el.querySelector("#pt-speed"), speedF, st, save);

    el.querySelector("#pt-brush").onclick = (e) => {
      const b = e.target.dataset.b;
      if (!b) return;
      st.brush = b; save();
      el.querySelectorAll("#pt-brush button").forEach((x) => x.classList.toggle("on", x.dataset.b === b));
    };
    el.querySelector("#pt-clear").onclick = () => { map.grid.occ.fill(0); GridMap.save(map); run(true); };
    el.querySelector("#pt-rand").onclick = () => { GridMap.randomize(map, Math.floor(Math.random() * 1e6)); GridMap.save(map); run(true); };
    el.querySelector("#pt-maze").onclick = () => { GridMap.maze(map, Math.floor(Math.random() * 1e6)); GridMap.save(map); run(true); };
    // Koon vaihto säilyttää päällekkäisen alueen; sama kartta näkyy varauskartassa ja mobiilirobotissa
    el.querySelector("#pt-size").onchange = (e) => {
      const s = GridMap.SIZES[e.target.value];
      if (!s) return;
      GridMap.save(GridMap.resize(map, s[0], s[1]));
      router();
    };
    // Oletuskartta voi olla eri kokoinen kuin nykyinen: koko sivu piirretään uudelleen (kokovalinta ja selite ajan tasalle)
    el.querySelector("#pt-default").onclick = () => {
      const d = GridMap.defaultMap();
      GridMap.save({ ...d, grid: { w: d.w, h: d.h, occ: Uint8Array.from(d.occ, (c) => (c === "1" ? 1 : 0)) } });
      router();
    };
    el.querySelector("#pt-adv").onclick = () => { st._adv = !adv; save(); unmount(); render(root, tool); };
    el.querySelector("#pt-play").onclick = () => (anim.playing ? stop() : play());
    el.querySelector("#pt-step").onclick = () => { stop(); anim.k = Math.min(total(), anim.k + SPEEDS[st.speed - 1]); gv.draw(); };
    el.querySelector("#pt-end").onclick = () => { stop(); anim.k = total(); gv.draw(); };
    el.querySelector("#pt-compare").onclick = compare;

    gv = new GridView(el.querySelector("#pt-canvas"), { draw: drawGrid, onPointer });
    gv.setSize(map.w, map.h);
    run(true);
  }

  const save = () => saveToolState("path", st);
  const total = () => (res.kind === "grid" ? res.expanded.length : res.nodes.length);

  function search(algo) {
    const t0 = performance.now();
    const A = ALGOS[algo];
    let r;
    if (A.grid) r = { kind: "grid", ...Plan.gridSearch(map.grid, map.start, map.goal, { algo, diagonal: st.diagonal, weight: algo === "astar" ? st.weight : 1 }) };
    else r = { kind: "rrt", ...Plan.rrt(map.grid, map.start, map.goal, { star: algo === "rrtstar", iters: st.iters, step: st.step, goalBias: st.goalBias, radius: st.radius, seed: st.seed }) };
    r.ms = performance.now() - t0;
    return r;
  }

  function run(showFinal) {
    stop();
    res = search(st.algo);
    anim.k = showFinal ? total() : 0;
    const len = res.cost * map.cell;
    el.querySelector("#pt-results").innerHTML = resultTiles([
      { label: tr("Reitin pituus", "Path length"), value: res.found ? fmtLen(len, 2) : "–", unit: lenLabel() },
      { label: res.kind === "grid" ? tr("Tutkitut solut", "Explored cells") : tr("Puun solmut", "Tree nodes"), value: String(total()) },
      { label: tr("Laskenta-aika", "Computation time"), value: fmt(res.ms, 1), unit: "ms" },
      ...(res.kind === "rrt" ? [{ label: tr("Iteraatiot", "Iterations"), value: String(res.iterations) }] : []),
    ]);
    const alerts = [];
    if (res.blocked) alerts.push({ level: "err", text: tr("Lähtö tai maali on seinän sisällä.", "The start or goal is inside a wall.") });
    else if (!res.found) alerts.push({ level: "err", text: res.kind === "grid" ? tr("Reittiä ei ole — maali on suljettu seinien taakse.", "No path exists — the goal is enclosed by walls.") : tr("Reittiä ei löytynyt näillä iteraatioilla. Lisää iteraatioita tai kokeile toista siementä.", "No path found with these iterations. Add iterations or try another seed.") });
    el.querySelector("#pt-alerts").innerHTML = alertsHtml(alerts);
    gv.draw();
  }

  function play() {
    if (anim.k >= total()) anim.k = 0;
    anim.playing = true;
    el.querySelector("#pt-play").textContent = tr("❚❚ Tauko", "❚❚ Pause");
    const step = () => {
      if (!anim.playing || !el.querySelector("#pt-canvas")) return;
      anim.k = Math.min(total(), anim.k + SPEEDS[st.speed - 1]);
      gv.draw();
      if (anim.k >= total()) { stop(); return; }
      anim.raf = requestAnimationFrame(step);
    };
    anim.raf = requestAnimationFrame(step);
  }
  function stop() {
    anim.playing = false;
    cancelAnimationFrame(anim.raf);
    const b = el?.querySelector("#pt-play");
    if (b) b.textContent = tr("▶ Toista haku", "▶ Play search");
  }

  // Ruudukkohaku on nopea, joten reitti päivittyy vedon aikana. RRT/RRT* voi viedä satoja millisekunteja:
  // sen haku ajetaan vasta, kun veto päättyy (muuten piirtäminen nykii).
  let stale = false;
  const replan = () => { if (ALGOS[st.algo].grid) run(true); else { stale = true; gv.draw(); } };
  function onPointer(c, phase) {
    if (phase === "up") {
      if (painting) GridMap.save(map);
      if (stale) { stale = false; run(true); }
      painting = false; last = null; return;
    }
    if (!c.inside) return;
    const i = c.i, j = c.j, idx = j * map.w + i;
    const isStart = map.start[0] === i && map.start[1] === j, isGoal = map.goal[0] === i && map.goal[1] === j;
    if (st.brush === "start" || st.brush === "goal") {
      if ((st.brush === "start" && isGoal) || (st.brush === "goal" && isStart)) return;
      map[st.brush] = [i, j];
      map.grid.occ[idx] = 0;
      painting = true;
      replan();
      return;
    }
    const val = st.brush === "wall" ? 1 : 0;
    const paint = (x, y) => {
      if ((x === map.start[0] && y === map.start[1]) || (x === map.goal[0] && y === map.goal[1])) return;
      if (x >= 0 && y >= 0 && x < map.w && y < map.h) map.grid.occ[y * map.w + x] = val;
    };
    // Viiva edellisestä solusta, ettei nopea veto jätä aukkoja
    if (last && phase === "move") Plan.traverse(map.grid, last[0] + 0.5, last[1] + 0.5, i + 0.5, j + 0.5, (x, y) => { paint(x, y); return false; });
    else paint(i, j);
    last = [i, j];
    painting = true;
    replan();
  }

  function drawGrid(g) {
    const free = rgbOf("var(--surface)"), wall = mix(rgbOf("var(--text-3)"), rgbOf("var(--surface)"), 0.15);
    const occ = map.grid.occ, w = map.w;
    g.image((i, j) => (occ[j * w + i] ? wall : free));
    g.gridLines(cssColor("var(--border)"));
    const accent = cssColor("var(--accent)");
    const k = anim.k;

    if (res.kind === "grid") {
      g.ctx.globalAlpha = 0.35;
      for (let n = 0; n < k; n++) { const c = res.expanded[n]; g.fillCell(c % w, (c / w) | 0, accent); }
      g.ctx.globalAlpha = 1;
      if (k < total() && k > 0) { const c = res.expanded[k - 1]; g.fillCell(c % w, (c / w) | 0, accent); }
      if (k >= total() && res.found) g.polyline(res.path.map((c) => [(c % w) + 0.5, ((c / w) | 0) + 0.5]), accent, Math.max(2, g.cs * 0.3));
    } else {
      const ctx = g.ctx;
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.45; ctx.lineWidth = 1;
      ctx.beginPath();
      for (let n = 1; n < Math.min(k, res.nodes.length); n++) {
        const a = res.nodes[n], p = res.nodes[a.parent];
        if (!p) continue;
        const [x1, y1] = g.px(a.x, a.y), [x2, y2] = g.px(p.x, p.y);
        ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (k >= total() && res.found) g.polyline(res.path, accent, Math.max(2, g.cs * 0.3));
    }
    g.marker(map.start[0] + 0.5, map.start[1] + 0.5, cssColor("var(--ok)"), tr("L", "S"));
    g.marker(map.goal[0] + 0.5, map.goal[1] + 0.5, cssColor("var(--err)"), tr("M", "G"));
  }

  function compare() {
    const rows = Object.keys(ALGOS).map((a) => ({ a, r: search(a) }));
    const best = Math.min(...rows.filter((x) => x.r.found).map((x) => x.r.cost));
    el.querySelector("#pt-table").innerHTML = `
      <div class="table-wrap"><table class="loads">
        <tr><th>${tr("Algoritmi", "Algorithm")}</th><th>${tr("Pituus", "Length")} [${lenLabel()}]</th><th>${tr("Tutkittu", "Explored")}</th><th>${tr("Aika", "Time")} [ms]</th><th></th></tr>
        ${rows.map(({ a, r }) => `<tr>
          <td>${ALGOS[a].name}</td>
          <td>${r.found ? fmtLen(r.cost * map.cell, 2) : r.kind === "grid" ? tr("ei reittiä", "no path") : tr("ei löytynyt", "not found")}</td>
          <td>${r.kind === "grid" ? r.expanded.length : r.nodes.length}</td>
          <td>${fmt(r.ms, 1)}</td>
          <td>${r.found && Math.abs(r.cost - best) < 1e-6 ? `<span class="badge ok">${tr("lyhin", "shortest")}</span>` : r.found ? `+${fmt(((r.cost - best) / best) * 100, 0)} %` : ""}</td>
        </tr>`).join("")}
      </table></div>
      <p class="note" style="margin-top:8px">${tr("RRT-algoritmien tulokset riippuvat satunnaissiemenestä, ja kapeissa käytävissä ne eivät aina löydä reittiä annetuilla iteraatioilla.", "RRT results depend on the random seed, and in narrow corridors they don't always find a path within the given iterations.")} ${st.diagonal ? tr("Vinoliike sallittu.", "Diagonal moves allowed.") : tr("Vain suorat liikkeet.", "Straight moves only.")}</p>`;
  }

  function unmount() {
    stop();
    gv?.destroy();
  }

  /* ----- Esimerkit: kartta (jaettu tila "map") ja hakuasetukset yhdessä ----- */

  // Oletuskartan kokoinen kartta; clear = ilman seiniä
  function freshMap(clear) {
    const d = GridMap.defaultMap();
    const m = { ...d, grid: { w: d.w, h: d.h, occ: Uint8Array.from(d.occ, (c) => (c === "1" ? 1 : 0)) } };
    if (clear) m.grid.occ.fill(0);
    return m;
  }
  const rect = (m, x0, y0, x1, y1) => { for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.grid.occ[y * m.w + x] = 1; };

  function applyExample(m, cfg) {
    // Lähtö ja maali pidetään aina vapaina
    GridMap.clearAround(m, m.start); GridMap.clearAround(m, m.goal);
    GridMap.save(m);
    const cur = getToolState("path", { ...DEFAULTS, seed: settings.seed || 1 });
    saveToolState("path", { ...DEFAULTS, seed: cur.seed, speed: cur.speed, brush: cur.brush, ...cfg, _adv: cur._adv });
  }

  const examples = [
    { name: tr("A* vs. Dijkstra sokkelossa", "A* vs Dijkstra in a maze"),
      desc: tr("Sama lyhin reitti — paina \"Vertaile kaikkia\" ja katso tutkitut solut", "Same shortest path — press \"Compare all\" and look at explored cells"),
      apply: () => { const m = freshMap(); GridMap.maze(m, 7); applyExample(m, { algo: "astar", diagonal: false, weight: 1 }); } },
    { name: tr("RRT* avoimessa huoneessa", "RRT* in an open room"),
      desc: tr("Muutama este, 5000 iteraatiota — reitti suoristuu uudelleenkytkennällä", "A few obstacles, 5000 iterations — rewiring straightens the path"),
      apply: () => {
        const m = freshMap(true);
        rect(m, 10, 8, 13, 21); rect(m, 22, 0, 24, 11); rect(m, 22, 19, 24, 29); rect(m, 33, 10, 36, 22);
        m.start = [3, 3]; m.goal = [44, 26];
        applyExample(m, { algo: "rrtstar", iters: 5000, step: 2, goalBias: 0.05, radius: 5, seed: 1 });
      } },
    { name: tr("Ahne haku menee ansaan", "Greedy best-first gets fooled"),
      desc: tr("U-muotoinen ansa maalin suunnassa — vertaa A*:iin", "A U-shaped trap toward the goal — compare with A*"),
      apply: () => {
        const m = freshMap(true);
        // U-ansa: aukko lähtöön päin, pohja maalin puolella
        rect(m, 30, 5, 31, 25); rect(m, 16, 5, 31, 6); rect(m, 16, 24, 31, 25);
        m.start = [4, 15]; m.goal = [43, 15];
        applyExample(m, { algo: "greedy", diagonal: true });
      } },
    { name: tr("Reittiä ei ole", "No path exists"),
      desc: tr("Maali on muurattu umpeen — haku tutkii kaiken saavutettavan", "The goal is walled in — the search explores everything reachable"),
      apply: () => {
        const m = freshMap();
        m.start = [3, 3]; m.goal = [44, 26];
        // Seinärengas maalin ympärille
        for (let x = 42; x <= 46; x++) { m.grid.occ[24 * m.w + x] = 1; m.grid.occ[28 * m.w + x] = 1; }
        for (let y = 24; y <= 28; y++) { m.grid.occ[y * m.w + 42] = 1; m.grid.occ[y * m.w + 46] = 1; }
        applyExample(m, { algo: "astar", diagonal: true, weight: 1 });
      } },
    { name: tr("Painotettu A*", "Weighted A*"),
      desc: tr("Paino 3 (lisäasetuksissa): vähemmän tutkittuja soluja, reitti ei aina lyhin", "Weight 3 (advanced settings): fewer explored cells, path not always shortest"),
      apply: () => { const m = freshMap(); applyExample(m, { algo: "astar", diagonal: true, weight: 3 }); } },
  ];

  TOOL_IMPL.path = { render, unmount, examples };
})();
