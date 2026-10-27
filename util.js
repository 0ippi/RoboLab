// Yhteiset apufunktiot. Kaikki simulaation osat elävät RS-nimiavaruudessa.
// (RoboSim-työkalut, sovitettu RoboLabiin: kieli, teemat ja kirjastojen lataus tarvittaessa.)
window.RS = window.RS || {};

// 2D-fysiikka (planck.js) ladataan vasta, kun 2D-simulaatio tai -rakentaja avataan ensimmäisen kerran.
RS.PLANCK_URL = 'https://cdn.jsdelivr.net/npm/planck@1.4.2/dist/planck.min.js';
RS.loadPlanck = function () {
  if (window.planck) return Promise.resolve(window.planck);
  RS._planck ||= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = RS.PLANCK_URL;
    s.onload = () => resolve(window.planck);
    s.onerror = () => { RS._planck = null; s.remove(); reject(new Error(tr('Fysiikkakirjastoa (planck.js) ei saatu ladattua. Tarvitset internetyhteyden ensimmäisellä kerralla.', 'Could not load the physics library (planck.js). You need an internet connection the first time.'))); };
    document.head.append(s);
  });
  return RS._planck;
};

// Toistettava satunnaislukugeneraattori (mulberry32).
RS.rng = function (seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

RS.gauss = function (rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
};

RS.randn = () => RS.gauss(Math.random);
RS.deg = (d) => (d * Math.PI) / 180;
RS.clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
RS.uniform = (rng, lo, hi) => lo + (hi - lo) * rng();
RS.V = (x, y) => new planck.Vec2(x, y);
RS.clone = (o) => JSON.parse(JSON.stringify(o));

RS.download = function (filename, text) {
  const blob = new Blob([text], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};

// Kyllä/ei-kysymys sivun omassa ikkunassa. Selaimen confirm() ei toimi kaikissa
// upotetuissa selaimissa (se voi palauttaa heti "ei" näyttämättä mitään).
RS.ask = function (message, okLabel) {
  let dlg = document.getElementById('rs-ask');
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.id = 'rs-ask';
    dlg.className = 'rs-dlg';
    dlg.style.width = 'min(460px, calc(100vw - 32px))';
    dlg.innerHTML =
      '<p class="rs-ask-text"></p>' +
      '<div class="row-actions rs-dlg-foot"><button class="btn" data-no></button><button class="btn primary" data-yes></button></div>';
    document.body.appendChild(dlg);
  }
  dlg.querySelector('.rs-ask-text').textContent = message;
  dlg.querySelector('[data-yes]').textContent = okLabel || tr('Jatka', 'Continue');
  dlg.querySelector('[data-no]').textContent = tr('Peruuta', 'Cancel');
  return new Promise((resolve) => {
    const done = (answer) => {
      dlg.querySelector('[data-yes]').onclick = dlg.querySelector('[data-no]').onclick = dlg.oncancel = null;
      dlg.close();
      resolve(answer);
    };
    dlg.querySelector('[data-yes]').onclick = () => done(true);
    dlg.querySelector('[data-no]').onclick = () => done(false);
    dlg.oncancel = (e) => { e.preventDefault(); done(false); };
    dlg.showModal();
  });
};

RS.readFile = function (file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
};
