// Rinnakkaiskoulutuksen työläinen (2D): laskee osan sukupolven roboteista omassa planck-maailmassaan.
// Pääsäie lähettää mallin, palkkiofunktion koodin, maaston ja siemenen. Sama siemen = sama maasto ja samat
// kohteet kuin muilla työläisillä, joten kaikkien robottien tulokset ovat vertailukelpoisia.
self.window = self;

self.onmessage = (e) => {
  const d = e.data;
  if (d.type === 'init') {
    self.LANG = d.lang;
    self.tr = (fi, en) => (self.LANG === 'en' ? en : fi);
    try {
      importScripts(d.planck, 'util.js', 'brain.js', 'robot.js', 'terrain.js', 'sim.js');
      postMessage({ type: 'ready' });
    } catch (err) {
      postMessage({ type: 'ready', error: String(err?.message || err) });
    }
    return;
  }
  if (d.type === 'run') {
    try {
      const ep = new RS.Episode({
        model: d.model, taskFn: new Function('s', 'm', d.code), terrain: d.terrain, seed: d.seed,
        population: d.population, layers: d.layers, duration: d.duration, targets: d.targets,
      });
      while (!ep.finished) ep.step();
      postMessage({ type: 'done', id: d.id, fitness: ep.fitness() });
    } catch (err) {
      postMessage({ type: 'done', id: d.id, error: String(err?.message || err) });
    }
  }
};
