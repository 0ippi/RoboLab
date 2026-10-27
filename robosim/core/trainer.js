// Koulutusalgoritmit. Molemmilla on sama rajapinta:
//   ask()  -> taulukko parametrivektoreita, jotka arvioidaan yhdessä episodissa
//   tell(fitness) -> päivittää populaation tulosten perusteella
//   best, bestFitness -> paras koskaan löydetty

function trackBest(trainer, pop, fitness) {
  for (let i = 0; i < pop.length; i++) {
    if (fitness[i] > trainer.bestFitness) {
      trainer.bestFitness = fitness[i];
      trainer.best = pop[i].slice();
    }
  }
}

// Evoluutiostrategia (OpenAI ES): peilatut kohinanäytteet, sijoituspohjainen
// kelpoisuuden muokkaus ja Adam-päivitys. Populaation ensimmäinen jäsen on keskiarvo itse.
RS.ES = class {
  constructor(size, opts, init) {
    this.size = size;
    this.opts = opts;
    this.mean = init ? init.slice() : null;
    this.m = new Float32Array(size);
    this.v = new Float32Array(size);
    this.step = 0;
    this.best = init ? init.slice() : null;
    this.bestFitness = -Infinity;
  }

  ask() {
    const { popSize, sigma } = this.opts;
    if (!this.mean) this.mean = RS.Brain.randomParams(this.layers);
    const pairs = Math.max(1, Math.floor((popSize - 1) / 2));
    this.noise = [];
    const pop = [this.mean.slice()];
    for (let i = 0; i < pairs; i++) {
      const eps = new Float32Array(this.size);
      for (let k = 0; k < this.size; k++) eps[k] = RS.randn();
      this.noise.push(eps);
      const a = new Float32Array(this.size), b = new Float32Array(this.size);
      for (let k = 0; k < this.size; k++) {
        a[k] = this.mean[k] + sigma * eps[k];
        b[k] = this.mean[k] - sigma * eps[k];
      }
      pop.push(a, b);
    }
    this.pop = pop;
    return pop;
  }

  tell(fitness) {
    trackBest(this, this.pop, fitness);
    const { sigma, lr } = this.opts;
    const n = this.noise.length;
    // Sijoitukset välille [-0.5, 0.5]
    const idx = fitness.slice(1).map((f, i) => [f, i]).sort((x, y) => x[0] - y[0]);
    const shaped = new Float32Array(2 * n);
    idx.forEach(([, i], rank) => { shaped[i] = rank / (2 * n - 1) - 0.5; });
    const grad = new Float32Array(this.size);
    for (let p = 0; p < n; p++) {
      const w = shaped[2 * p] - shaped[2 * p + 1];
      const eps = this.noise[p];
      for (let k = 0; k < this.size; k++) grad[k] += w * eps[k];
    }
    const b1 = 0.9, b2 = 0.999;
    this.step++;
    for (let k = 0; k < this.size; k++) {
      const g = grad[k] / (2 * n * sigma) - 0.005 * this.mean[k];
      this.m[k] = b1 * this.m[k] + (1 - b1) * g;
      this.v[k] = b2 * this.v[k] + (1 - b2) * g * g;
      const mh = this.m[k] / (1 - Math.pow(b1, this.step));
      const vh = this.v[k] / (1 - Math.pow(b2, this.step));
      this.mean[k] += lr * mh / (Math.sqrt(vh) + 1e-8);
    }
  }
};

// Geneettinen algoritmi: eliitti säilyy, lapset syntyvät turnausvalinnalla,
// tasaisella risteytyksellä ja gaussisella mutaatiolla.
RS.GA = class {
  constructor(size, opts, init) {
    this.size = size;
    this.opts = opts;
    this.pop = null;
    this.init = init;
    this.best = init ? init.slice() : null;
    this.bestFitness = -Infinity;
  }

  mutate(p) {
    const { sigma } = this.opts;
    const c = p.slice();
    for (let k = 0; k < c.length; k++) if (Math.random() < 0.25) c[k] += sigma * RS.randn();
    return c;
  }

  ask() {
    if (!this.pop) {
      const n = this.opts.popSize;
      if (this.init) {
        this.pop = [this.init.slice()];
        while (this.pop.length < n) this.pop.push(this.mutate(this.init));
      } else {
        this.pop = [];
        while (this.pop.length < n) this.pop.push(RS.Brain.randomParams(this.layers));
      }
    }
    return this.pop;
  }

  tell(fitness) {
    trackBest(this, this.pop, fitness);
    const n = this.opts.popSize;
    const order = fitness.map((f, i) => [f, i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i);
    const eliteN = Math.max(1, Math.round(n * 0.1));
    const pick = () => {
      let best = -1;
      for (let t = 0; t < 3; t++) {
        const i = Math.floor(Math.random() * this.pop.length);
        if (best < 0 || fitness[i] > fitness[best]) best = i;
      }
      return this.pop[best];
    };
    const next = order.slice(0, eliteN).map((i) => this.pop[i].slice());
    while (next.length < n) {
      const a = pick(), b = pick();
      const child = new Float32Array(this.size);
      for (let k = 0; k < this.size; k++) child[k] = Math.random() < 0.5 ? a[k] : b[k];
      next.push(this.mutate(child));
    }
    this.pop = next;
  }
};

RS.makeTrainer = function (algo, layers, opts, init) {
  const size = RS.Brain.paramCount(layers);
  const t = algo === 'ga' ? new RS.GA(size, opts, init) : new RS.ES(size, opts, init);
  t.layers = layers;
  t.algo = algo;
  return t;
};
