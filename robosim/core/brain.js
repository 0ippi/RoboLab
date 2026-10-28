// Neuroverkko (monikerroksinen perceptroni, tanh-aktivaatiot).
// Painot ovat yhdessä Float32Array-taulukossa, jotta evoluutioalgoritmit voivat käsitellä niitä suoraan.
RS.Brain = class {
  // layers esim. [obsSize, 32, 32, actSize]
  constructor(layers) {
    this.layers = layers.slice();
    this.size = RS.Brain.paramCount(layers);
    this.buffers = layers.map((n) => new Float32Array(n));
  }

  static paramCount(layers) {
    let n = 0;
    for (let i = 1; i < layers.length; i++) n += layers[i] * (layers[i - 1] + 1);
    return n;
  }

  static randomParams(layers) {
    const p = new Float32Array(RS.Brain.paramCount(layers));
    let k = 0;
    for (let i = 1; i < layers.length; i++) {
      const fanIn = layers[i - 1];
      const scale = 1 / Math.sqrt(fanIn);
      for (let o = 0; o < layers[i]; o++) {
        for (let j = 0; j < fanIn; j++) p[k++] = RS.randn() * scale;
        p[k++] = 0; // bias
      }
    }
    return p;
  }

  // Laskee verkon ulostulon; palauttaa sisäisen puskurin (ei saa säilyttää).
  forward(params, input) {
    const L = this.layers;
    this.buffers[0].set(input);
    let k = 0;
    for (let i = 1; i < L.length; i++) {
      const inp = this.buffers[i - 1], out = this.buffers[i];
      const nIn = L[i - 1];
      for (let o = 0; o < L[i]; o++) {
        let sum = 0;
        for (let j = 0; j < nIn; j++) sum += params[k++] * inp[j];
        sum += params[k++];
        out[o] = Math.tanh(sum);
      }
    }
    return this.buffers[L.length - 1];
  }
};

RS.parseHidden = function (text) {
  const h = String(text).split(/[,\s]+/).filter(Boolean).map((v) => parseInt(v, 10));
  if (h.some((v) => !(v > 0 && v <= 512))) throw new Error(tr('Piilokerrokset: anna esim. 32,32', 'Hidden layers: enter e.g. 32,32'));
  return h;
};
// Uusien aivojen koko (vanhat tallennukset latautuvat yhä parseHiddenillä): isommat eivät mahdu selaimen
// tallennukseen koulutusajoineen eivätkä jakolinkkiin
RS.HIDDEN_MAX = { layers: 4, neurons: 256, params: 60000 };
