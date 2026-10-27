// 3D-maastot. Aloitusalue (x < 3) on aina tasainen.
export const TERRAINS3D = {
  flat: tr('Tasainen', 'Flat'),
  rough: tr('Epätasainen', 'Rough'),
  hills: tr('Mäkinen', 'Hilly'),
  stairs: tr('Portaat', 'Stairs'),
  blocks: tr('Esteet', 'Obstacles')
};

export const GROUND_GROUPS = 0x0001ffff; // jäsen: ryhmä 1, törmää kaikkeen
const X0 = -30, X1 = 150, Z0 = -40, Z1 = 40;

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
    const ramp = (x) => RS.clamp((x - 3) / 6, 0, 1);
    t.heightAt = type === 'hills'
      ? (x, z) => ramp(x) * (Math.sin(x * 0.3) * 0.9 + Math.sin(x * 0.11 + z * 0.17) * 1.1 + Math.sin(z * 0.4) * 0.3)
      : (x, z) => {
        const gx = RS.clamp((x - X0) / cell, 0, nx - 1.001), gz = RS.clamp((z - Z0) / cell, 0, nz - 1.001);
        const ix = Math.floor(gx), iz = Math.floor(gz), fx = gx - ix, fz = gz - iz;
        const sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
        const g = (a, b) => grid[a * nz + b];
        const h = (g(ix, iz) * (1 - sx) + g(ix + 1, iz) * sx) * (1 - sz) + (g(ix, iz + 1) * (1 - sx) + g(ix + 1, iz + 1) * sx) * sz;
        return ramp(x) * h;
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
    if (type === 'stairs') {
      let x = 3, y = 0;
      while (x < X1) {
        const w = 1.0 + rng() * 0.6;
        y += 0.12 + rng() * 0.08;
        boxes.push({ x: x + w / 2, y: y / 2, z: 0, w, h: y, d: Z1 - Z0 });
        x += w;
      }
    } else if (type === 'blocks') {
      for (let i = 0; i < 160; i++) {
        const w = 0.3 + rng() * 0.8, d = 0.3 + rng() * 0.8, h = 0.1 + rng() * 0.3;
        const x = 4 + rng() * 100, z = (rng() - 0.5) * 30;
        boxes.push({ x, y: h / 2, z, w, h, d });
      }
    }
    for (const b of boxes) {
      add(RAPIER.ColliderDesc.cuboid(b.w / 2, b.h / 2, b.d / 2).setTranslation(b.x, b.y, b.z));
    }
    t.boxes = boxes;
    t.heightAt = (x, z) => {
      let h = 0;
      for (const b of boxes) {
        if (Math.abs(x - b.x) <= b.w / 2 && Math.abs(z - b.z) <= b.d / 2 && b.h > h) h = b.h;
      }
      return h;
    };
  }
  t.bounds = { X0, X1, Z0, Z1 };
  return t;
}
