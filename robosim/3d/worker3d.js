// Rinnakkaiskoulutuksen työläinen (3D): laskee osan sukupolven roboteista omassa Rapier-maailmassaan.
// Moduulityöläinen: RS-apufunktiot (perinteisiä skriptejä) ajetaan ensin, sitten ladataan Rapier ja simulaatio.
self.window = self;
let RAPIER = null, Episode3D = null;
const queue = [];
let ready = false;

async function init(d) {
  self.LANG = d.lang;
  self.tr = (fi, en) => (self.LANG === 'en' ? en : fi);
  for (const f of ['../core/util.js', '../core/brain.js']) {
    const src = await (await fetch(new URL(f, import.meta.url))).text();
    (0, eval)(src); // määrittelee globaalin RS-nimiavaruuden kuten sivulla
  }
  RAPIER = (await import(d.rapier)).default;
  await RAPIER.init();
  ({ Episode3D } = await import('./sim3d.js'));
}

function run(d) {
  let ep = null;
  try {
    ep = new Episode3D({
      RAPIER, model: d.model, taskFn: new Function('s', 'm', d.code), terrain: d.terrain, seed: d.seed,
      population: d.population, layers: d.layers, duration: d.duration,
    });
    while (!ep.finished) ep.step();
    postMessage({ type: 'done', id: d.id, fitness: ep.fitness() });
  } catch (err) {
    postMessage({ type: 'done', id: d.id, error: String(err?.message || err) });
  } finally {
    try { ep?.free(); } catch { /* jo vapautettu */ }
  }
}

self.onmessage = async (e) => {
  const d = e.data;
  if (d.type === 'init') {
    try { await init(d); ready = true; postMessage({ type: 'ready' }); }
    catch (err) { postMessage({ type: 'ready', error: String(err?.message || err) }); }
    while (ready && queue.length) run(queue.shift());
    return;
  }
  if (d.type === 'run') { if (ready) run(d); else queue.push(d); }
};
