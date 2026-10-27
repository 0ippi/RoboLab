/* RoboLabin service worker: tekee sovelluksesta asennettavan ja toimii ilman nettiä / palvelinta.
   - Omat tiedostot: ensin verkosta (aina uusin versio, kun palvelin on päällä), muuten välimuistista.
   - CDN-kirjastot (three.js, Rapier, planck): versioidut osoitteet eivät muutu, joten välimuisti ensin.
   - Tekoälyavustajan API-kutsut (POST) menevät aina suoraan verkkoon. */
const VERSION = "robolab-v1";
const APP = VERSION + "-app", LIBS = "robolab-libs-v1";

const APP_FILES = [
  "./", "index.html", "styles.css", "manifest.webmanifest", "version.js",
  "i18n.js", "calc.js", "kin.js", "motion.js", "plan.js", "robot.js", "app.js", "plot.js", "view3d.js", "gridmap.js",
  "three-view.js", "arm-view.js", "courses.js", "education.js", "assistant.js", "robots.js", "library.js", "accounts.js", "account-ui.js", "volt-worker.js",
  "tools/traj.js", "tools/path.js", "tools/occmap.js", "tools/mobile.js", "tools/scene3d.js", "tools/units.js",
  "tools/rotation.js", "tools/arm.js", "tools/projects.js", "tools/pid.js", "tools/motor.js", "tools/power.js",
  "tools/serial.js", "tools/vision.js","tools/nn.js", "tools/builder.js",
  "robosim/core/util.js", "robosim/core/models.js", "robosim/core/tasks.js", "robosim/core/terrain.js",
  "robosim/core/robot.js", "robosim/core/brain.js", "robosim/core/deploy.js", "robosim/core/usb.js","robosim/core/trainer.js",
  "robosim/core/sim.js", "robosim/core/render.js", "robosim/core/deco.js", "robosim/3d/look.js",
  "robosim/3d/api.js", "robosim/3d/models3d.js", "robosim/3d/tasks3d.js", "robosim/3d/terrain3d.js",
  "robosim/3d/robot3d.js", "robosim/3d/sim3d.js", "robosim/3d/view3d.js",
  "robosim/builder/ui.js", "robosim/builder/model.js", "robosim/builder/viewport.js", "robosim/builder/physics.js",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png", "icons/favicon-32.png",
];

// Kirjastot haetaan valmiiksi, jotta 3D-työkalut ja simulaatiot toimivat ilman nettiä heti asennuksen jälkeen
const LIB_FILES = [
  "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.js",
  "https://cdn.jsdelivr.net/npm/three@0.184.0/build/three.core.js",
  "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/controls/TransformControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/geometries/RoundedBoxGeometry.js",
  "https://cdn.jsdelivr.net/npm/three@0.184.0/examples/jsm/environments/RoomEnvironment.js",
  "https://cdn.jsdelivr.net/npm/@dimforge/rapier3d-compat@0.19.3/rapier.mjs",
  "https://cdn.jsdelivr.net/npm/planck@1.4.2/dist/planck.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    await (await caches.open(APP)).addAll(APP_FILES);
    // Kirjastot parhaan yrityksen mukaan: puuttuva netti ei saa estää asennusta
    const libs = await caches.open(LIBS);
    await Promise.all(LIB_FILES.map(async (u) => {
      if (await libs.match(u)) return;
      try { const r = await fetch(u, { mode: "cors" }); if (r.ok) await libs.put(u, r); } catch {}
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== APP && k !== LIBS) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Päivitys: sovellus pyytää hakemaan kaikki omat tiedostot uudelleen, jotta offline-versio on kokonaan uusi
self.addEventListener("message", (e) => {
  if (e.data?.type !== "refresh") return;
  const reply = e.ports[0];
  e.waitUntil((async () => {
    const cache = await caches.open(APP);
    let failed = 0;
    await Promise.all(APP_FILES.map(async (f) => {
      try { const r = await fetch(f, { cache: "no-store" }); if (r.ok) await cache.put(f, r); else failed++; } catch { failed++; }
    }));
    reply?.postMessage({ ok: failed === 0, failed });
  })());
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    e.respondWith((async () => {
      const cache = await caches.open(APP);
      try {
        const res = await fetch(req, { cache: "no-store" });
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req, { ignoreSearch: true }) || (req.mode === "navigate" && await cache.match("index.html"));
        if (!hit) return new Response("Offline", { status: 503, statusText: "Offline" });
        // Merkitään tallennetuksi versioksi, jotta päivitystarkistus tietää, ettei palvelinta tavoitettu
        const headers = new Headers(hit.headers);
        headers.set("x-robolab-offline", "1");
        return new Response(hit.body, { status: hit.status, statusText: hit.statusText, headers });
      }
    })());
    return;
  }

  if (url.hostname === "cdn.jsdelivr.net") {
    e.respondWith((async () => {
      const cache = await caches.open(LIBS);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok || res.type === "opaque") cache.put(req, res.clone());
      return res;
    })());
  }
});
