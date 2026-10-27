// Maastot. Aloitusalue (x = -3...3) on aina tasainen, ja maasto jatkuu siitä molempiin suuntiin,
// joten robotti kohtaa saman maaston kulkipa se eteen tai taakse.
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
  const blocks = [];
  const PAD = 3, LEN = 400; // tasainen aloitusalue ±PAD, maastoa LEN metriä kumpaankin suuntaan

  // Yhden puolen profiili aloitusalueen reunasta ulospäin: [etäisyys, korkeus] -pisteet
  function side(phase) {
    const out = [[0, 0]];
    if (type === 'rough' || type === 'hills') {
      let d = 0, y = 0;
      while (d < LEN) {
        d += type === 'rough' ? 0.6 + rng() * 0.6 : 1;
        if (type === 'rough') y = RS.clamp(y + (rng() - 0.5) * 0.35, -1.5, 1.5);
        else y = Math.min(1, d / 6) * (Math.sin(d * 0.35 + phase) * 0.9 + Math.sin(d * 0.11 + 1 + phase) * 1.2);
        out.push([d, y]);
      }
    } else if (type === 'stairs') {
      let d = 0, y = 0;
      while (d < LEN) {
        y += 0.12 + rng() * 0.08;
        out.push([d, y]);
        d += 1.0 + rng() * 0.6;
        out.push([d, y]);
      }
    } else out.push([LEN, 0]);
    return out;
  }
  const right = side(0), left = side(2.1);
  // Pisteet kasvavan x:n järjestyksessä (säteiden binäärihaku olettaa sen): vasen puoli peilattuna
  const points = [
    ...left.slice().reverse().map(([d, y]) => [-PAD - d, y]),
    ...right.map(([d, y]) => [PAD + d, y]),
  ];
  ground.createFixture(new planck.Chain(points.map(([x, y]) => RS.V(x, y)), false), fix);

  if (type === 'blocks') {
    for (const dir of [1, -1]) {
      let d = PAD + 1;
      while (d < LEN) {
        const w = 0.3 + rng() * 0.6;
        const h = 0.1 + rng() * 0.3;
        const x = dir * d;
        ground.createFixture(new planck.Box(w / 2, h / 2, RS.V(x, h / 2), 0), fix);
        blocks.push({ x, y: h / 2, w, h });
        d += 2.5 + rng() * 3;
      }
    }
    blocks.sort((a, b) => a.x - b.x);
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
