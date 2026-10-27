"use strict";

/* Reittisuunnittelu ja kartoitus ruudukossa — puhdasta laskentaa ilman DOMia (testit: tests.html).
   Ruudukko: { w, h, occ: Uint8Array (1 = este) }. Solun indeksi i = y * w + x.
   Jatkuvat koordinaatit ovat soluyksiköissä; solun (x, y) keskipiste on (x + 0.5, y + 0.5). */
const Plan = (() => {
  const SQRT2 = Math.SQRT2;

  // Toistettava satunnaislukugeneraattori (mulberry32); siemen 0 = satunnainen
  function rng(seed) {
    let a = seed ? seed >>> 0 : (Math.random() * 2 ** 32) >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const free = (g, x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && !g.occ[y * g.w + x];

  // Naapurit; vinoliike sallitaan vain, jos kumpikaan viereinen suora solu ei ole este (ei kulmien leikkausta)
  function neighbors(g, i, diagonal) {
    const x = i % g.w, y = (i / g.w) | 0, out = [];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (free(g, x + dx, y + dy)) out.push([i + dy * g.w + dx, 1]);
    if (diagonal) {
      for (const [dx, dy] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
        if (free(g, x + dx, y + dy) && free(g, x + dx, y) && free(g, x, y + dy)) out.push([i + dy * g.w + dx, SQRT2]);
      }
    }
    return out;
  }

  class Heap {
    constructor() { this.a = []; }
    get size() { return this.a.length; }
    push(item, pri) {
      const a = this.a;
      a.push([pri, item]);
      let i = a.length - 1;
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][0] <= a[i][0]) break; [a[p], a[i]] = [a[i], a[p]]; i = p; }
    }
    pop() {
      const a = this.a, top = a[0], last = a.pop();
      if (a.length) {
        a[0] = last;
        let i = 0;
        for (;;) {
          const l = 2 * i + 1, r = l + 1;
          let m = i;
          if (l < a.length && a[l][0] < a[m][0]) m = l;
          if (r < a.length && a[r][0] < a[m][0]) m = r;
          if (m === i) break;
          [a[m], a[i]] = [a[i], a[m]];
          i = m;
        }
      }
      return top[1];
    }
  }

  // Ruudukkohaut: "astar" | "dijkstra" | "bfs" | "greedy"
  function gridSearch(g, start, goal, { algo = "astar", diagonal = true, weight = 1 } = {}) {
    const N = g.w * g.h;
    const s = start[1] * g.w + start[0], t = goal[1] * g.w + goal[0];
    const expanded = [];
    if (g.occ[s] || g.occ[t]) return { found: false, path: [], cost: 0, expanded, blocked: true };
    const gx = t % g.w, gy = (t / g.w) | 0;
    const hfun = (i) => {
      const dx = Math.abs((i % g.w) - gx), dy = Math.abs(((i / g.w) | 0) - gy);
      return diagonal ? Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy) : dx + dy; // oktiili / Manhattan
    };
    const cost = new Float64Array(N).fill(Infinity);
    const parent = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    cost[s] = 0;

    if (algo === "bfs") {
      const queue = [s];
      closed[s] = 1;
      for (let qi = 0; qi < queue.length; qi++) {
        const i = queue[qi];
        expanded.push(i);
        if (i === t) break;
        for (const [n, c] of neighbors(g, i, diagonal)) {
          if (closed[n]) continue;
          closed[n] = 1; parent[n] = i; cost[n] = cost[i] + c;
          queue.push(n);
        }
      }
    } else {
      const open = new Heap();
      const pri = (i) => algo === "dijkstra" ? cost[i] : algo === "greedy" ? hfun(i) : cost[i] + weight * hfun(i);
      open.push(s, pri(s));
      while (open.size) {
        const i = open.pop();
        if (closed[i]) continue;
        closed[i] = 1;
        expanded.push(i);
        if (i === t) break;
        for (const [n, c] of neighbors(g, i, diagonal)) {
          if (closed[n]) continue;
          const nc = cost[i] + c;
          if (nc < cost[n] || (algo === "greedy" && parent[n] < 0 && n !== s)) {
            cost[n] = nc; parent[n] = i;
            open.push(n, pri(n));
          }
        }
      }
    }

    if (parent[t] < 0 && s !== t) return { found: false, path: [], cost: 0, expanded };
    const path = [];
    for (let i = t; i !== -1; i = parent[i]) path.push(i);
    path.reverse();
    let len = 0;
    for (let k = 1; k < path.length; k++) {
      const a = path[k - 1], b = path[k];
      len += Math.hypot((a % g.w) - (b % g.w), ((a / g.w) | 0) - ((b / g.w) | 0));
    }
    return { found: true, path, cost: len, expanded };
  }

  // Onko janan kaikki pisteet vapaissa soluissa (näytteistys ¼ solun välein)
  function segmentFree(g, ax, ay, bx, by) {
    const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) * 4));
    for (let k = 0; k <= n; k++) {
      const x = ax + ((bx - ax) * k) / n, y = ay + ((by - ay) * k) / n;
      if (!free(g, Math.floor(x), Math.floor(y))) return false;
    }
    return true;
  }

  // RRT ja RRT* jatkuvassa tilassa (soluyksiköt)
  function rrt(g, start, goal, { star = false, iters = 2000, step = 2, goalBias = 0.05, radius = 5, seed = 0 } = {}) {
    const rand = rng(seed);
    const sx = start[0] + 0.5, sy = start[1] + 0.5, gx = goal[0] + 0.5, gy = goal[1] + 0.5;
    const nodes = [{ x: sx, y: sy, parent: -1, cost: 0 }];
    let goalNode = -1;
    if (!free(g, start[0], start[1]) || !free(g, goal[0], goal[1])) return { found: false, nodes, path: [], cost: 0, iterations: 0, blocked: true };
    if (start[0] === goal[0] && start[1] === goal[1]) return { found: true, nodes, path: [[sx, sy]], cost: 0, iterations: 0 };

    let it = 0;
    for (; it < iters; it++) {
      const toGoal = rand() < goalBias;
      const rx = toGoal ? gx : rand() * g.w, ry = toGoal ? gy : rand() * g.h;
      let near = 0, best = Infinity;
      for (let k = 0; k < nodes.length; k++) {
        const d = (nodes[k].x - rx) ** 2 + (nodes[k].y - ry) ** 2;
        if (d < best) { best = d; near = k; }
      }
      const nn = nodes[near], d = Math.sqrt(best);
      if (d < 1e-9) continue;
      const f = Math.min(1, step / d);
      const nx = nn.x + (rx - nn.x) * f, ny = nn.y + (ry - nn.y) * f;
      if (!segmentFree(g, nn.x, nn.y, nx, ny)) continue;

      let parent = near, pcost = nn.cost + Math.hypot(nx - nn.x, ny - nn.y);
      let neigh = [];
      if (star) {
        for (let k = 0; k < nodes.length; k++) {
          const dk = Math.hypot(nodes[k].x - nx, nodes[k].y - ny);
          if (dk <= radius) neigh.push([k, dk]);
        }
        for (const [k, dk] of neigh) {
          if (nodes[k].cost + dk < pcost && segmentFree(g, nodes[k].x, nodes[k].y, nx, ny)) { parent = k; pcost = nodes[k].cost + dk; }
        }
      }
      const id = nodes.push({ x: nx, y: ny, parent, cost: pcost }) - 1;
      if (star) {
        // Uudelleenkytkentä: naapurit, joihin pääsee halvemmin uuden solmun kautta
        for (const [k, dk] of neigh) {
          if (k === parent) continue;
          if (pcost + dk < nodes[k].cost - 1e-9 && segmentFree(g, nx, ny, nodes[k].x, nodes[k].y)) {
            const delta = nodes[k].cost - (pcost + dk);
            nodes[k].parent = id;
            propagate(nodes, k, delta);
          }
        }
      }
      const dg = Math.hypot(nx - gx, ny - gy);
      if (dg <= step && segmentFree(g, nx, ny, gx, gy)) {
        const c = pcost + dg;
        if (goalNode < 0) { goalNode = nodes.push({ x: gx, y: gy, parent: id, cost: c }) - 1; if (!star) { it++; break; } }
        else if (c < nodes[goalNode].cost) { nodes[goalNode].parent = id; nodes[goalNode].cost = c; }
      }
    }
    if (goalNode < 0) return { found: false, nodes, path: [], cost: 0, iterations: it };
    const path = [];
    for (let k = goalNode; k !== -1; k = nodes[k].parent) path.push([nodes[k].x, nodes[k].y]);
    path.reverse();
    let len = 0;
    for (let k = 1; k < path.length; k++) len += Math.hypot(path[k][0] - path[k - 1][0], path[k][1] - path[k - 1][1]);
    return { found: true, nodes, path, cost: len, iterations: it };
  }

  // Päivittää kustannukset alipuuhun uudelleenkytkennän jälkeen
  function propagate(nodes, root, delta) {
    nodes[root].cost -= delta;
    const stack = [root];
    while (stack.length) {
      const p = stack.pop();
      for (let k = 0; k < nodes.length; k++) {
        if (nodes[k].parent === p) { nodes[k].cost = nodes[p].cost + Math.hypot(nodes[k].x - nodes[p].x, nodes[k].y - nodes[p].y); stack.push(k); }
      }
    }
  }

  /* ===== Kartoitus ===== */

  // Käy läpi janan solut (Amanatides & Woo). cb(x, y) → true lopettaa.
  function traverse(g, x0, y0, x1, y1, cb) {
    let x = Math.floor(x0), y = Math.floor(y0);
    const ex = Math.floor(x1), ey = Math.floor(y1);
    const dx = x1 - x0, dy = y1 - y0;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const tdx = sx ? Math.abs(1 / dx) : Infinity, tdy = sy ? Math.abs(1 / dy) : Infinity;
    let tmx = sx > 0 ? (x + 1 - x0) * tdx : sx < 0 ? (x0 - x) * tdx : Infinity;
    let tmy = sy > 0 ? (y + 1 - y0) * tdy : sy < 0 ? (y0 - y) * tdy : Infinity;
    for (let n = 0; n < 4 * (g.w + g.h) + 8; n++) {
      if (cb(x, y)) return;
      if (x === ex && y === ey) return;
      if (Math.min(tmx, tmy) > 1) return; // janan loppu (pyöristysvirheiden varalta)
      if (tmx < tmy) { x += sx; tmx += tdx; } else { y += sy; tmy += tdy; }
    }
  }

  // Lidar-säde: etäisyys ensimmäiseen esteeseen (soluyksiköt), enintään maxRange
  function raycast(g, x, y, angle, maxRange) {
    const x1 = x + Math.cos(angle) * maxRange, y1 = y + Math.sin(angle) * maxRange;
    let dist = maxRange, hit = false;
    traverse(g, x, y, x1, y1, (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h || g.occ[cy * g.w + cx]) {
        dist = Math.min(maxRange, rayCellEntry(x, y, angle, cx, cy));
        hit = dist < maxRange;
        return true;
      }
      return false;
    });
    return { dist, hit };
  }

  // Etäisyys, jolla säde osuu solun reunaan (säteen ja solun laatikon leikkaus)
  function rayCellEntry(x, y, angle, cx, cy) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const t1 = dx ? (cx - x) / dx : -Infinity, t2 = dx ? (cx + 1 - x) / dx : Infinity;
    const t3 = dy ? (cy - y) / dy : -Infinity, t4 = dy ? (cy + 1 - y) / dy : Infinity;
    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4));
    return Math.max(0, tmin);
  }

  // Log-odds-päivitys yhdelle säteelle: vapaat solut säteen varrella, osumasolu varattu
  function updateRay(L, g, x, y, angle, dist, hit, { lOcc = 0.85, lFree = -0.4, lMin = -4, lMax = 4 } = {}) {
    const x1 = x + Math.cos(angle) * dist, y1 = y + Math.sin(angle) * dist;
    const hx = Math.floor(x1 + Math.cos(angle) * 1e-6), hy = Math.floor(y1 + Math.sin(angle) * 1e-6);
    traverse(g, x, y, x1, y1, (cx, cy) => {
      if (cx < 0 || cy < 0 || cx >= g.w || cy >= g.h) return true;
      if (hit && cx === hx && cy === hy) return true;
      const i = cy * g.w + cx;
      L[i] = Math.max(lMin, L[i] + lFree);
      return false;
    });
    if (hit && hx >= 0 && hy >= 0 && hx < g.w && hy < g.h) {
      const i = hy * g.w + hx;
      L[i] = Math.min(lMax, L[i] + lOcc);
    }
  }

  const probability = (l) => 1 - 1 / (1 + Math.exp(l));

  // Lähin tutkimaton reuna: tunnettu vapaa solu, jonka vieressä on tuntematon solu (BFS tunnettuja vapaita pitkin)
  // skip: solut (indeksit), joista on jo luovuttu, koska niiden tuntemattomia naapureita ei saatu selvitettyä
  function nearestFrontier(L, g, start, known = 0.5, skip = null) {
    const s = start[1] * g.w + start[0];
    const seen = new Uint8Array(g.w * g.h);
    const queue = [s];
    seen[s] = 1;
    const unknown = (x, y) => x >= 0 && y >= 0 && x < g.w && y < g.h && Math.abs(L[y * g.w + x]) <= known;
    for (let qi = 0; qi < queue.length; qi++) {
      const i = queue[qi], x = i % g.w, y = (i / g.w) | 0;
      if (i !== s && !skip?.has(i) && (unknown(x + 1, y) || unknown(x - 1, y) || unknown(x, y + 1) || unknown(x, y - 1))) return [x, y];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= g.w || ny >= g.h) continue;
        const n = ny * g.w + nx;
        if (seen[n] || L[n] > -known) continue; // vain tunnetusti vapaita
        seen[n] = 1;
        queue.push(n);
      }
    }
    return null;
  }

  return { rng, free, neighbors, gridSearch, segmentFree, rrt, traverse, raycast, updateRay, probability, nearestFrontier };
})();
