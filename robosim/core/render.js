// Piirto canvasille. Maailman koordinaatit: metrit, y ylöspäin.

// Värin vaalennus (k > 0) tai tummennus (k < 0); hex-värit muodossa #rrggbb tai #rgb
RS.shade = function (hex, k) {
  let h = String(hex).replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16), t = k > 0 ? 255 : 0, a = Math.abs(k);
  const ch = (v) => Math.round(v + (t - v) * a);
  return `rgb(${ch(n >> 16)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
};

RS.Renderer = class {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.scale = 70; // pikseliä per metri
    this.camX = 0;
    this.camY = 1;
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = this.canvas.getBoundingClientRect();
    this.canvas.width = Math.max(1, Math.round(r.width * dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * dpr));
    this.dpr = dpr;
  }

  zoom(factor) {
    this.scale = RS.clamp(this.scale * factor, 10, 300);
  }

  follow(x, y, snap) {
    // Jos robotti on karkaamassa ruudulta, kamera hyppää sen kohdalle.
    const far = Math.abs(x - this.camX) * this.scale * (this.dpr || 1) > this.canvas.width * 0.35;
    const k = snap || far ? 1 : 0.1;
    this.camX += (x - this.camX) * k;
    this.camY += (Math.max(y - 0.8, 0.5) - this.camY) * k;
  }

  worldTransform() {
    const s = this.scale * this.dpr;
    const W = this.canvas.width, H = this.canvas.height;
    this.ctx.setTransform(s, 0, 0, -s, W / 2 - this.camX * s, H * 0.62 + this.camY * s);
  }

  // Värit RoboLabin teemasta (luetaan kerran sekunnissa, jotta teeman vaihto näkyy heti mutta piirto pysyy kevyenä)
  colors() {
    const now = performance.now();
    if (!this._c || now - this._cAt > 1000) {
      this._cAt = now;
      this._c = {
        sky0: cssColor('var(--bg-2)'), sky1: cssColor('var(--surface-2)'), grid: cssColor('var(--border)'),
        ground: cssColor('var(--surface)'), groundLine: cssColor('var(--border-strong)'), block: cssColor('var(--hover)'),
        start: cssColor('var(--accent)'), target: cssColor('var(--warn)'), text: cssColor('var(--text-3)')
      };
    }
    return this._c;
  }

  // Kappaleen sijainti ja kulma. Hidastetussa uusinnassa (opts.lerp) liike tasoitetaan kahden
  // fysiikka-askeleen välillä, jotta 0,1× nopeuskin näyttää sujuvalta.
  pose(body) {
    const p = body.getPosition(), a = body.getAngle(), L = this.lerp;
    const q = L && L.prev.get(body);
    if (!q) return { x: p.x, y: p.y, a };
    const k = L.alpha;
    let da = a - q.a;
    da -= Math.round(da / (2 * Math.PI)) * 2 * Math.PI;
    return { x: q.x + (p.x - q.x) * k, y: q.y + (p.y - q.y) * k, a: q.a + da * k };
  }

  // opts: { focus, showAll, showTarget, race: värit kisaajille, rays: anturisäteet, lerp, waypoints: [{x, y}] }
  draw(episode, opts) {
    const ctx = this.ctx;
    const W = this.canvas.width, H = this.canvas.height;
    const C = this.colors();
    this.lerp = opts.lerp || null;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, C.sky0);
    sky.addColorStop(1, C.sky1);
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    if (!episode) return;

    const s = this.scale * this.dpr;
    const viewL = this.camX - W / 2 / s - 1, viewR = this.camX + W / 2 / s + 1;

    this.worldTransform();
    // Pystyviivat metrin välein
    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = C.grid;
    for (let x = Math.floor(viewL); x <= viewR; x++) {
      ctx.globalAlpha = x % 5 === 0 ? 0.9 : 0.4;
      ctx.beginPath(); ctx.moveTo(x, -30); ctx.lineTo(x, 60); ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Maa
    const t = episode.terrain;
    const q = this.quality();
    ctx.beginPath();
    let started = false;
    for (const [x, y] of t.points) {
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    const lastX = t.points[t.points.length - 1][0];
    ctx.lineTo(lastX, -40); ctx.lineTo(t.points[0][0], -40); ctx.closePath();
    if (q === 'low') ctx.fillStyle = C.ground;
    else {
      // Maa tummuu syvemmälle mentäessä
      const g = ctx.createLinearGradient(0, 0.2, 0, -3);
      g.addColorStop(0, C.ground); g.addColorStop(1, C.sky0);
      ctx.fillStyle = g;
    }
    ctx.fill();
    ctx.strokeStyle = q === 'low' ? C.groundLine : C.start;
    ctx.globalAlpha = q === 'low' ? 1 : 0.55;
    ctx.lineWidth = (q === 'low' ? 2 : 3.5) / s;
    ctx.beginPath();
    t.points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
    for (const b of t.blocks) {
      if (b.x < viewL - 2 || b.x > viewR + 2) continue;
      if (q === 'low') { ctx.fillStyle = C.block; ctx.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); continue; }
      RS.roundRectPath(ctx, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h, Math.min(b.w, b.h) * 0.15);
      ctx.fillStyle = C.block; ctx.fill();
      ctx.strokeStyle = C.groundLine; ctx.lineWidth = 2 / s; ctx.stroke();
    }

    // Aloitusviiva
    const start = episode.agents[0].robot.startX;
    ctx.strokeStyle = C.start;
    ctx.globalAlpha = 0.45;
    ctx.setLineDash([0.1, 0.1]);
    ctx.beginPath(); ctx.moveTo(start, 0); ctx.lineTo(start, 3); ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    const focus = opts.focus;
    // Omat reittipisteet: katkoviiva järjestyksessä ja numerot (piirretään vain, kun tehtävä käyttää kohteita)
    const wps = opts.showTarget && episode.targets?.length && opts.waypoints?.length ? episode.targets : null;
    if (wps) {
      ctx.strokeStyle = C.target; ctx.lineWidth = 2 / s; ctx.globalAlpha = 0.5;
      ctx.setLineDash([0.12, 0.1]);
      ctx.beginPath();
      wps.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      wps.forEach((p) => { ctx.fillStyle = C.target; ctx.beginPath(); ctx.arc(p.x, p.y, 0.09, 0, Math.PI * 2); ctx.fill(); });
    }
    // Kohde
    if (opts.showTarget && focus >= 0) {
      const tg = episode.targetOf(episode.agents[focus]);
      ctx.fillStyle = C.target;
      ctx.globalAlpha = 0.25;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, 0.4, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.beginPath(); ctx.arc(tg.x, tg.y, 0.12, 0, Math.PI * 2); ctx.fill();
    }

    if (opts.race) {
      // Kisa: kaikki kilpailijat täysin näkyvinä, jokaisen yllä oma värillinen lippu
      episode.agents.forEach((a) => { if (a.robot.parts.length) this.drawRobot(a.robot, s, true, q); });
      episode.agents.forEach((a, i) => { if (a.robot.parts.length) this.drawFlag(a.robot, opts.race[i], s); });
    } else {
      // Robotit: ensin muut haaleina ja yksinkertaisina, sitten seurattava kaikkine yksityiskohtineen
      if (opts.showAll) {
        ctx.globalAlpha = 0.16;
        episode.agents.forEach((a, i) => { if (i !== focus) this.drawRobot(a.robot, s, false, 'low'); });
      }
      ctx.globalAlpha = 1;
      if (focus >= 0) {
        if (q === 'high') this.drawShadow(episode.agents[focus].robot, t);
        this.drawRobot(episode.agents[focus].robot, s, true, q);
      }
    }

    // Etäisyysanturien säteet: viiva osumaan asti ja piste osumakohdassa
    if (opts.rays) {
      ctx.lineWidth = 2 / s;
      for (const r of opts.rays) {
        ctx.strokeStyle = r.hit ? C.target : C.text;
        ctx.globalAlpha = r.hit ? 0.85 : 0.35;
        ctx.beginPath(); ctx.moveTo(r.x0, r.y0); ctx.lineTo(r.x1, r.y1); ctx.stroke();
        if (r.hit) { ctx.fillStyle = C.target; ctx.beginPath(); ctx.arc(r.x1, r.y1, 0.05, 0, Math.PI * 2); ctx.fill(); }
      }
      ctx.globalAlpha = 1;
    }

    // Etäisyysmerkit
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.text;
    ctx.font = `${11 * this.dpr}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    const baseY = H * 0.62 + this.camY * s;
    for (let x = Math.ceil(viewL / 5) * 5; x <= viewR; x += 5) {
      const sx = W / 2 + (x - this.camX) * s;
      const gy = baseY - RS.groundHeight(t, x) * s;
      ctx.fillText(`${x} m`, sx, Math.min(H - 6 * this.dpr, gy + 18 * this.dpr));
    }
    // Reittipisteiden numerot ruudun koordinaateissa, jotta teksti ei ole peilikuva
    if (wps) {
      ctx.font = `600 ${11 * this.dpr}px system-ui, sans-serif`;
      ctx.fillStyle = C.target;
      wps.forEach((p, i) => ctx.fillText(String(i + 1), W / 2 + (p.x - this.camX) * s, baseY - p.y * s - 10 * this.dpr));
    }
  }

  // Ruudun piste (clientX, clientY) maailman koordinaateiksi: reittipisteiden asettamista varten
  toWorld(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect(), d = this.dpr || 1, s = this.scale * d;
    const px = (clientX - r.left) * d, py = (clientY - r.top) * d;
    return { x: (px - this.canvas.width / 2) / s + this.camX, y: (this.canvas.height * 0.62 + this.camY * s - py) / s };
  }

  // Kisaajan lippu rungon yläpuolella
  drawFlag(robot, color, s) {
    const ctx = this.ctx, p = this.pose(robot.root);
    let top = -Infinity;
    for (const { body } of robot.parts) top = Math.max(top, this.pose(body).y);
    const x = p.x, y0 = top + 0.35, y1 = y0 + 0.45;
    ctx.strokeStyle = RS.DECO.INK; ctx.lineWidth = 2 / s;
    ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x + 0.32, y1 - 0.1); ctx.lineTo(x, y1 - 0.2); ctx.closePath();
    ctx.fill(); ctx.stroke();
  }

  // Laatu luetaan asetuksista kerran sekunnissa
  quality() {
    const now = performance.now();
    if (!this._q || now - this._qAt > 1000) { this._qAt = now; this._q = RS.quality(); }
    return this._q;
  }

  // Pehmeä varjo maahan robotin alle
  drawShadow(robot, terrain) {
    const ctx = this.ctx;
    let lo = Infinity, hi = -Infinity, minY = Infinity;
    for (const { body } of robot.parts) { const p = body.getPosition(); lo = Math.min(lo, p.x); hi = Math.max(hi, p.x); minY = Math.min(minY, p.y); }
    if (!isFinite(lo)) return;
    const cx = (lo + hi) / 2, gy = RS.groundHeight(terrain, cx), half = (hi - lo) / 2 + 0.4;
    const fade = RS.clamp(1 - (minY - gy) / 3, 0.15, 1);
    ctx.save();
    ctx.globalAlpha = 0.28 * fade;
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(cx, gy + 0.01, half, 0.07, 0, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  drawRobot(robot, s, highlight, q = 'normal') {
    const ctx = this.ctx;
    const ink = RS.DECO.INK, lw = (q === 'low' ? 1.5 : 2.4) / s;
    for (const { body, spec } of robot.parts) {
      const p = this.pose(body);
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.a);
      for (const sh of spec.shapes) {
        const color = sh.color || spec.color || '#9fb3c8';
        ctx.save();
        ctx.translate(sh.x, sh.y);
        ctx.rotate(RS.deg(sh.angle));
        if (q === 'low') {
          // Kevyt piirto: tasavärit, ohut reuna
          ctx.fillStyle = color;
          ctx.strokeStyle = highlight ? 'rgba(0,0,0,0.55)' : 'rgba(0,0,0,0.3)';
          ctx.lineWidth = lw;
          ctx.beginPath();
          if (sh.type === 'circle') { ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(sh.r, 0); ctx.stroke(); }
          else { ctx.rect(-sh.w / 2, -sh.h / 2, sh.w, sh.h); ctx.fill(); ctx.stroke(); }
        } else if (sh.type === 'circle' && !sh.deco && !sh.plain) {
          this.drawWheel(sh.r, color, lw);
        } else {
          const w = sh.type === 'circle' ? sh.r * 2 : sh.w, h = sh.type === 'circle' ? sh.r * 2 : sh.h;
          // Täyttö liukuvärillä: ylhäältä vaalea, alhaalta tumma — antaa muodolle syvyyttä
          const g = ctx.createLinearGradient(0, h / 2, 0, -h / 2);
          g.addColorStop(0, RS.shade(color, 0.28)); g.addColorStop(0.55, color); g.addColorStop(1, RS.shade(color, -0.22));
          ctx.beginPath();
          if (sh.type === 'circle') ctx.arc(0, 0, sh.r, 0, Math.PI * 2);
          else RS.roundRectPath(ctx, -w / 2, -h / 2, w, h, Math.min(w, h) * (sh.round ?? 0.22));
          ctx.fillStyle = g; ctx.fill();
          ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
          if (sh.deco) RS.drawDeco(ctx, sh.deco, w, h);
          if (sh.deco === 'brain' && sh.type === 'circle') { // lasikuvun heijastus
            ctx.beginPath(); ctx.arc(0, 0, sh.r * 0.78, Math.PI * 0.6, Math.PI * 0.9);
            ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = sh.r * 0.07; ctx.stroke();
          }
        }
        ctx.restore();
      }
      ctx.restore();
    }
    if (highlight && q !== 'low') this.drawThrust(robot);
  }

  // Pyörä: tumma rengas, värillinen vanne ja pinnat, joista pyöriminen näkyy
  drawWheel(r, color, lw) {
    const ctx = this.ctx, ink = RS.DECO.INK;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#2b2f3a'; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = lw; ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.62, 0, Math.PI * 2);
    ctx.fillStyle = color; ctx.fill(); ctx.stroke();
    ctx.strokeStyle = RS.shade(color, -0.35); ctx.lineWidth = r * 0.1;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI * 2) / 3;
      ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.15, Math.sin(a) * r * 0.15); ctx.lineTo(Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55); ctx.stroke();
    }
    ctx.beginPath(); ctx.arc(0, 0, r * 0.16, 0, Math.PI * 2);
    ctx.fillStyle = '#c9d4df'; ctx.fill();
  }

  // Roottorien työntövoima liekkinä/ilmavirtana, pituus työntövoiman mukaan
  drawThrust(robot) {
    const ctx = this.ctx;
    for (const t of robot.thrusters || []) {
      if (!t.level) continue;
      const p = t.body.getWorldPoint(t.local), d = t.body.getWorldVector(t.dir);
      const len = 0.15 + t.level * 0.45, nx = -d.y, ny = d.x;
      ctx.save();
      ctx.globalAlpha = 0.35 + t.level * 0.4;
      ctx.fillStyle = RS.DECO.GLOW;
      ctx.beginPath();
      ctx.moveTo(p.x + nx * 0.12, p.y + ny * 0.12);
      ctx.lineTo(p.x - d.x * len, p.y - d.y * len);
      ctx.lineTo(p.x - nx * 0.12, p.y - ny * 0.12);
      ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
};

// Pieni viivakaavio koulutuksen etenemisestä.
RS.drawChart = function (canvas, history) {
  const dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(r.width * dpr));
  canvas.height = Math.max(1, Math.round(r.height * dpr));
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height, pad = 6 * dpr;
  ctx.clearRect(0, 0, W, H);
  if (history.length < 2) {
    ctx.fillStyle = '#6b7f93';
    ctx.font = `${12 * dpr}px system-ui, sans-serif`;
    ctx.fillText('Kaavio näkyy, kun koulutus on edennyt pari sukupolvea.', pad * 2, H / 2);
    return;
  }
  let lo = Infinity, hi = -Infinity;
  for (const h of history) { lo = Math.min(lo, h.mean, h.best); hi = Math.max(hi, h.mean, h.best); }
  if (hi - lo < 1e-6) hi = lo + 1;
  const X = (i) => pad + (i / (history.length - 1)) * (W - 2 * pad);
  const Y = (v) => H - pad - ((v - lo) / (hi - lo)) * (H - 2 * pad);
  if (lo < 0 && hi > 0) {
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.beginPath(); ctx.moveTo(pad, Y(0)); ctx.lineTo(W - pad, Y(0)); ctx.stroke();
  }
  const line = (key, color, width) => {
    ctx.strokeStyle = color; ctx.lineWidth = width * dpr;
    ctx.beginPath();
    history.forEach((h, i) => (i ? ctx.lineTo(X(i), Y(h[key])) : ctx.moveTo(X(i), Y(h[key]))));
    ctx.stroke();
  };
  line('mean', '#6b7f93', 1.5);
  line('best', '#7aa2ff', 2);
};
