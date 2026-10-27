// Grafiikan laatu ja robottien koristeet (kasvot, kamerasilmä, aivoverkko, valot).
// Samat piirtofunktiot käyvät 2D-näkymään (maailman koordinaatit, y ylöspäin) ja 3D-tekstuureihin.

// Laatu: 'low' | 'normal' | 'high'. Automaattinen valinta katsoo laitteen muistia ja ytimiä.
RS.quality = function () {
  const q = (typeof settings !== 'undefined' && settings.graphics) || 'auto';
  if (q !== 'auto') return q;
  const mem = navigator.deviceMemory || 8, cores = navigator.hardwareConcurrency || 8;
  return mem <= 4 || cores <= 4 ? 'low' : 'normal';
};

RS.DECO = { INK: '#1b2a44', SCREEN: '#14213d', GLOW: '#5ee7ff', PINK: '#ff7eb6', MINT: '#7cf5c2' };

// Pyöristetty suorakulmio polkuna (ctx.roundRect ei ole kaikissa selaimissa)
RS.roundRectPath = function (ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y); ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r); ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h); ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r); ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
};

// Piirtää koristeen laatikkoon, jonka keskipiste on origo ja koko w × h. y kasvaa ylöspäin.
RS.drawDeco = function (ctx, deco, w, h) {
  const D = RS.DECO, m = Math.min(w, h);
  const pill = (x, y, pw, ph, color) => { RS.roundRectPath(ctx, x - pw / 2, y - ph / 2, pw, ph, pw / 2); ctx.fillStyle = color; ctx.fill(); };
  const dot = (x, y, r, color) => { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); };
  ctx.save();
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  switch (deco) {
    case 'face': { // Volt: näyttö, silmät ja hymy
      RS.roundRectPath(ctx, -w * 0.39, -h * 0.36, w * 0.78, h * 0.72, m * 0.18);
      ctx.fillStyle = D.SCREEN; ctx.fill();
      pill(-w * 0.17, h * 0.06, m * 0.1, m * 0.17, D.GLOW);
      pill(w * 0.17, h * 0.06, m * 0.1, m * 0.17, D.GLOW);
      ctx.beginPath(); ctx.arc(0, -h * 0.06, m * 0.11, Math.PI * 1.15, Math.PI * 1.85);
      ctx.strokeStyle = D.GLOW; ctx.lineWidth = m * 0.045; ctx.stroke();
      break;
    }
    case 'soft': { // Wobbly: isot silmät heijastuksilla, ripset ja posket
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.ellipse(s * m * 0.17, m * 0.08, m * 0.075, m * 0.1, 0, 0, Math.PI * 2); ctx.fillStyle = '#2a1f4a'; ctx.fill();
        dot(s * m * 0.17 + m * 0.025, m * 0.115, m * 0.028, '#fff');
        ctx.beginPath(); ctx.moveTo(s * m * 0.22, m * 0.16); ctx.lineTo(s * m * 0.27, m * 0.21);
        ctx.strokeStyle = '#2a1f4a'; ctx.lineWidth = m * 0.022; ctx.stroke();
        ctx.beginPath(); ctx.ellipse(s * m * 0.29, -m * 0.03, m * 0.065, m * 0.038, 0, 0, Math.PI * 2);
        ctx.globalAlpha = 0.6; ctx.fillStyle = D.PINK; ctx.fill(); ctx.globalAlpha = 1;
      }
      ctx.beginPath(); ctx.arc(0, -m * 0.02, m * 0.06, Math.PI * 1.2, Math.PI * 1.8);
      ctx.strokeStyle = '#2a1f4a'; ctx.lineWidth = m * 0.028; ctx.stroke();
      break;
    }
    case 'eye': { // Zippy: kamerasilmä
      dot(0, 0, m * 0.42, '#2b2f3a');
      dot(0, 0, m * 0.31, D.SCREEN);
      dot(0, 0, m * 0.16, D.GLOW);
      dot(0, 0, m * 0.07, D.SCREEN);
      dot(-m * 0.07, m * 0.08, m * 0.035, '#fff');
      break;
    }
    case 'brain': { // Neura: hehkuva neuroverkko lasikuvun sisällä
      const L = [[-0.24, [-0.12, 0.12]], [0, [-0.22, 0, 0.22]], [0.24, [-0.12, 0.12]]];
      ctx.strokeStyle = D.MINT; ctx.lineWidth = m * 0.018; ctx.globalAlpha = 0.7;
      for (let i = 0; i < 2; i++) for (const ya of L[i][1]) for (const yb of L[i + 1][1]) {
        ctx.beginPath(); ctx.moveTo(L[i][0] * m, ya * m); ctx.lineTo(L[i + 1][0] * m, yb * m); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      for (const [x, ys] of L) for (const y of ys) dot(x * m, y * m, m * 0.045, D.MINT);
      break;
    }
    case 'visor': { // Neuran anturipalkki
      RS.roundRectPath(ctx, -w * 0.45, -h * 0.35, w * 0.9, h * 0.7, h * 0.35);
      ctx.fillStyle = D.SCREEN; ctx.fill();
      pill(w * 0.12, 0, w * 0.4, h * 0.22, D.MINT);
      break;
    }
    case 'ring': { // Dustyn valorengas ylhäältä katsottuna / sivulta viivana
      ctx.beginPath(); ctx.moveTo(-w * 0.32, h * 0.18); ctx.lineTo(w * 0.32, h * 0.18);
      ctx.strokeStyle = D.GLOW; ctx.lineWidth = m * 0.12; ctx.stroke();
      break;
    }
    case 'led':
      dot(0, 0, m * 0.32, D.GLOW);
      break;
    case 'stripe': // runkoa kiertävä korostusraita
      RS.roundRectPath(ctx, -w * 0.42, -h * 0.08, w * 0.84, h * 0.16, h * 0.08);
      ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.fill();
      break;
  }
  ctx.restore();
};

// Tekstuuria varten: koriste piirrettynä neliöön (y alaspäin kuvassa, joten käännetään)
RS.decoCanvas = function (deco, aspect = 1, size = 256) {
  const c = document.createElement('canvas');
  c.width = size; c.height = Math.round(size / aspect);
  const ctx = c.getContext('2d');
  ctx.translate(c.width / 2, c.height / 2);
  ctx.scale(c.width, -c.width);
  RS.drawDeco(ctx, deco, 1, 1 / aspect);
  return c;
};
