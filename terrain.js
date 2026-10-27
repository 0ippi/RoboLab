// Maastot. Aloitusalue (x = -4...3) on aina tasainen.
RS.TERRAINS = {
  flat: tr('Tasainen', 'Flat'),
  rough: tr('Epätasainen', 'Rough'),
  hills: tr('Mäkinen', 'Hilly'),
  stairs: tr('Portaat', 'Stairs'),
  blocks: tr('Esteet', 'Obstacles')
};

RS.buildTerrain = function (world, type, rng) {
  const ground = world.createBody();
  const fix = { friction: 0.9, userData: 'ground' };
  const points = [];
  const blocks = [];
  const X0 = -60, X1 = 400;

  if (type === 'rough' || type === 'hills') {
    let y = 0, x = X0;
    points.push([X0, 0], [3, 0]);
    x = 3;
    while (x < X1) {
      x += type === 'rough' ? 0.6 + rng() * 0.6 : 1;
      if (type === 'rough') {
        y = RS.clamp(y + (rng() - 0.5) * 0.35, -1.5, 1.5);
      } else {
        const k = Math.min(1, (x - 3) / 6);
        y = k * (Math.sin(x * 0.35) * 0.9 + Math.sin(x * 0.11 + 1) * 1.2);
      }
      points.push([x, y]);
    }
  } else if (type === 'stairs') {
    let x = 3, y = 0;
    points.push([X0, 0], [x, 0]);
    while (x < X1) {
      const w = 1.0 + rng() * 0.6;
      const h = 0.12 + rng() * 0.08;
      y += h;
      points.push([x, y]);
      x += w;
      points.push([x, y]);
    }
  } else {
    points.push([X0, 0], [X1, 0]);
  }

  ground.createFixture(new planck.Chain(points.map(([x, y]) => RS.V(x, y)), false), fix);

  if (type === 'blocks') {
    let x = 4;
    while (x < X1) {
      const w = 0.3 + rng() * 0.6;
      const h = 0.1 + rng() * 0.3;
      ground.createFixture(new planck.Box(w / 2, h / 2, RS.V(x, h / 2), 0), fix);
      blocks.push({ x, y: h / 2, w, h });
      x += 2.5 + rng() * 3;
    }
  }

  return { type, points, blocks };
};

// Säde maastoon: palauttaa osumaosuuden 0..1 (1 = ei osumaa).
// Lasketaan suoraan maaston geometriasta, koska fysiikkamoottorin säde
// joutuisi käymään läpi kaikkien päällekkäisten robottien osat.
function raySegment(px, py, dx, dy, ax, ay, bx, by) {
  const ex = bx - ax, ey = by - ay;
  const den = dx * ey - dy * ex;
  if (Math.abs(den) < 1e-12) return 1;
  const t = ((ax - px) * ey - (ay - py) * ex) / den;
  const u = ((ax - px) * dy - (ay - py) * dx) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? t : 1;
}

RS.terrainRay = function (terrain, px, py, dx, dy) {
  const p = terrain.points;
  const lo = Math.min(px, px + dx), hi = Math.max(px, px + dx);
  let best = 1;
  // Binäärihaku ensimmäiseen janaan, joka voi osua väliin [lo, hi]
  let a = 0, b = p.length - 1;
  while (a < b) {
    const mid = (a + b) >> 1;
    if (p[mid + 1][0] < lo) a = mid + 1; else b = mid;
  }
  for (let i = Math.max(1, a); i < p.length && p[i - 1][0] <= hi; i++) {
    const f = raySegment(px, py, dx, dy, p[i - 1][0], p[i - 1][1], p[i][0], p[i][1]);
    if (f < best) best = f;
  }
  for (const k of terrain.blocks) {
    if (k.x + k.w / 2 < lo || k.x - k.w / 2 > hi) continue;
    const x0 = k.x - k.w / 2, x1 = k.x + k.w / 2, y0 = k.y - k.h / 2, y1 = k.y + k.h / 2;
    best = Math.min(best,
      raySegment(px, py, dx, dy, x0, y1, x1, y1),
      raySegment(px, py, dx, dy, x0, y0, x0, y1),
      raySegment(px, py, dx, dy, x1, y0, x1, y1));
  }
  return best;
};

// Maan korkeus kohdassa x (piirtoa ja kohteiden sijoittelua varten).
RS.groundHeight = function (terrain, x) {
  const p = terrain.points;
  for (let i = 1; i < p.length; i++) {
    if (x <= p[i][0]) {
      const [x0, y0] = p[i - 1], [x1, y1] = p[i];
      if (x1 === x0) return y1;
      return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
    }
  }
  return p[p.length - 1][1];
};
