// 3D-maastot. Aloitusalue (3 m alkupisteen ympärillä) on aina tasainen, ja maasto ympäröi sen joka suunnasta,
// joten robotti kohtaa saman maaston, mihin suuntaan tahansa se lähtee.
export const TERRAINS3D = {
  flat: tr('Tasainen', 'Flat'),
  rough: tr('Epätasainen', 'Rough'),
  hills: tr('Mäkinen', 'Hilly'),
  stairs: tr('Portaat', 'Stairs'),
  blocks: tr('Esteet', 'Obstacles')
};

export const GROUND_GROUPS = 0x0001ffff; // jäsen: ryhmä 1, törmää kaikkeen
const X0 = -80, X1 = 150, Z0 = -40, Z1 = 40, PAD = 3;

// Rakentaa maaston Rapier-maailmaan. Palauttaa kuvauksen, jota piirto ja sensorit käyttävät.
export function buildTerrain3D(RAPIER, world, type, rng) {
  const t = { type, mesh: null, boxes: [], colliders: new Set() };
  const add = (desc) => {
    const c = world.createCollider(desc.setFriction(0.9).setCollisionGroups(GROUND_GROUPS));
    t.colliders.add(c.handle);
  };

  if (type === 'rough' || type === 'hills') {
    // Satunnaiset korkeudet 2 m:n ruudukossa, interpoloidaan tasaisesti.
    const cell = 2, nx = Math.ceil((X1 - X0) / cell) + 1, nz = Math.ceil((Z1 - Z0) / cell) + 1;
    const grid = new Float32Array(nx * nz);
    for (let i = 0; i < grid.length; i++) grid[i] = (rng() - 0.5) * 0.9;
    // Korkeus kasvaa tasaisesti aloitusalueen reunalta joka suuntaan
    const ramp = (x, z) => RS.clamp((Math.hypot(x, z) - PAD) / 6, 0, 1);
    t.heightAt = type === 'hills'
      ? (x, z) => ramp(x, z) * (Math.sin(x * 0.3) * 0.9 + Math.sin(x * 0.11 + z * 0.17) * 1.1 + Math.sin(z * 0.4) * 0.3)
      : (x, z) => {
        const gx = RS.clamp((x - X0) / cell, 0, nx - 1.001), gz = RS.clamp((z - Z0) / cell, 0, nz - 1.001);
        const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
        const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
        const g = (a, b) => grid[a * nz + b];
        const h = (g(ix, iz) * (1 - sx) + g(ix + 1, iz) * sx) * (1 - sz) + (g(ix, iz + 1) * (1 - sx) + g(ix + 1, iz + 1) * sx) * sz;
        return ramp(x, z) * h;
      };
    // Kolmioverkko 1 m:n välein
    const res = 1, mx = Math.round((X1 - X0) / res) + 1, mz = Math.round((Z1 - Z0) / res) + 1;
    const verts = new Float32Array(mx * mz * 3);
    for (let i = 0; i < mx; i++) {
      for (let j = 0; j < mz; j++) {
        const x = X0 + i * res, z = Z0 + j * res, k = (i * mz + j) * 3;
        verts[k] = x; verts[k + 1] = t.heightAt(x, z); verts[k + 2] = z;
      }
    }
    const idx = new Uint32Array((mx - 1) * (mz - 1) * 6);
    let k = 0;
    for (let i = 0; i < mx - 1; i++) {
      for (let j = 0; j < mz - 1; j++) {
        const a = i * mz + j, b = a + mz, c = a + 1, d = b + 1;
        idx[k++] = a; idx[k++] = c; idx[k++] = b;
        idx[k++] = b; idx[k++] = c; idx[k++] = d;
      }
    }
    add(RAPIER.ColliderDesc.trimesh(verts, idx));
    t.mesh = { verts, idx };
  } else {
    add(RAPIER.ColliderDesc.cuboid((X1 - X0) / 2, 0.5, (Z1 - Z0) / 2).setTranslation((X0 + X1) / 2, -0.5, 0));
    const boxes = [];
    // Laatikko maailman rajojen sisällä (x0..x1, z0..z1), korkeus 0..h
    const box = (x0, x1, z0, z1, h) => {
      x0 = Math.max(x0, X0); x1 = Math.min(x1, X1); z0 = Math.max(z0, Z0); z1 = Math.min(z1, Z1);
      if (x1 - x0 > 0.01 && z1 - z0 > 0.01) boxes.push({ x: (x0 + x1) / 2, y: h / 2, z: (z0 + z1) / 2, w: x1 - x0, h, d: z1 - z0 });
    };
    if (type === 'stairs') {
      // Portaat neliön muotoisina kehinä aloitusalueen ympärillä: jokainen kehä on edellistä korkeampi
      const rings = [];
      let r = PAD, y = 0;
      const far = Math.max(-X0, X1, -Z0, Z1);
      while (r < far) {
        const w = 1.0 + rng() * 0.6;
        y += 0.12 + rng() * 0.08;
        rings.push({ r0: r, r1: r + w, y });
        box(r, r + w, -(r + w), r + w, y);          // itä (+x)
        box(-(r + w), -r, -(r + w), r + w, y);      // länsi (−x)
        box(-r, r, r, r + w, y);                    // etelä (+z)
        box(-r, r, -(r + w), -r, y);                // pohjoinen (−z)
        r += w;
      }
      t.heightAt = (x, z) => {
        const d = Math.max(Math.abs(x), Math.abs(z));
        if (d < PAD) return 0;
        let lo = 0, hi = rings.length - 1;
        while (lo < hi) { const mid = (lo + hi) >> 1; if (rings[mid].r1 <= d) lo = mid + 1; else hi = mid; }
        return rings[lo].y;
      };
    } else if (type === 'blocks') {
      // Esteitä koko alueella aloitusalueen ulkopuolella
      for (let i = 0; i < 520; i++) {
        const w = 0.3 + rng() * 0.8, d = 0.3 + rng() * 0.8, h = 0.1 + rng() * 0.3;
        const x = RS.uniform(rng, X0 + 2, X1 - 2), z = RS.uniform(rng, Z0 + 2, Z1 - 2);
        if (Math.hypot(x, z) < PAD + 1) continue;
        boxes.push({ x, y: h / 2, z, w, h, d });
      }
    }
    for (const b of boxes) {
      add(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z));
    }
    t.boxes = boxes;
    if (!t.heightAt) {
      // Esteet 2 m:n ruutuihin, jotta korkeusanturit eivät käy läpi kaikkia satoja laatikoita joka askeleella
      const CELL = 2, cells = new Map(), keyOf = (i, j) => i * 100003 + j;
      for (const b of boxes) {
        for (let i = Math.floor((b.x - b.w / 2) / CELL); i <= Math.floor((b.x + b.w / 2) / CELL); i++) {
          for (let j = Math.floor((b.z - b.d / 2) / CELL); j <= Math.floor((b.z + b.d / 2) / CELL); j++) {
            const k = keyOf(i, j);
            if (!cells.has(k)) cells.set(k, []);
            cells.get(k).push(b);
          }
        }
      }
      t.heightAt = (x, z) => {
        let h = 0;
        for (const b of cells.get(keyOf(Math.floor(x / CELL), Math.floor(z / CELL))) || []) {
          if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2 && b.h > h) h = b.h;
        }
        return h;
      };
    }
  }
  t.bounds = { X0, X1, Z0, Z1 };
  return t;
}
