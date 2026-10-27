"use strict";

/* Konenäkö: kameran kuva → harmaasävy → kynnystys / reunat / väritunnistus → kohteen paikka ja ohjauskomento.
   Lähteenä valmis näyte (pallot, viivarata, osat liukuhihnalla), oma kuva tai verkkokamera.
   Kaikki lasketaan selaimessa pikseli pikseliltä, jotta jokainen vaihe näkyy ja sen voi selittää. */
(() => {
  const W = 320, H = 240;
  const DEFAULTS = { source: "balls", mode: "color", thr: 110, blur: 1, invert: true, hue: 0, hueTol: 18, satMin: 90, roi: "full", animate: true };
  let el, st, raf = 0, srcCtx, outCtx, video = null, stream = null, img = null, t0 = 0, last = null;

  window.cvResult = () => last;

  /* ----- Näytekuvat: piirretään koodilla, joten ne toimivat ilman nettiä ----- */
  function drawSample(ctx, kind, t) {
    ctx.save();
    if (kind === "line") {
      ctx.fillStyle = "#d9d4c7"; ctx.fillRect(0, 0, W, H);
      // Lattian kuvio ja valon vaihtelu tekevät kynnystyksestä realistisemman
      const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, "rgba(255,255,255,.25)"); g.addColorStop(1, "rgba(0,0,0,.18)");
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = "#1b1b1f"; ctx.lineWidth = 16; ctx.lineCap = "round";
      const sway = Math.sin(t * 0.6) * 60;
      ctx.beginPath(); ctx.moveTo(W / 2 + sway * 0.2, H + 10); ctx.bezierCurveTo(W / 2 + sway, H * 0.6, W / 2 - sway, H * 0.3, W / 2 + sway * 0.6, -10); ctx.stroke();
    } else if (kind === "parts") {
      ctx.fillStyle = "#3a4048"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#59616c"; ctx.fillRect(0, 60, W, 120);
      for (let i = 0; i < 12; i++) { ctx.fillStyle = "rgba(0,0,0,.18)"; ctx.fillRect(((i * 40 + t * 30) % (W + 40)) - 40, 60, 3, 120); }
      const x0 = (t * 30) % (W + 200) - 100;
      ctx.fillStyle = "#e8b04a"; ctx.fillRect(x0, 90, 50, 50);
      ctx.fillStyle = "#4aa3e8"; ctx.beginPath(); ctx.arc(x0 + 120, 120, 26, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#e85a4a"; ctx.beginPath(); ctx.moveTo(x0 + 190, 145); ctx.lineTo(x0 + 220, 92); ctx.lineTo(x0 + 250, 145); ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = "#c7b89c"; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#a99877"; ctx.fillRect(0, 0, W, 70);
      const balls = [
        ["#d8342c", 160 + Math.cos(t * 0.7) * 90, 150 + Math.sin(t * 1.1) * 40, 24],
        ["#2f9a4a", 70, 110, 20],
        ["#2c5fd8", 250, 95, 18],
        ["#e6c31e", 230, 190, 16],
      ];
      for (const [c, x, y, r] of balls) {
        ctx.fillStyle = "rgba(0,0,0,.22)"; ctx.beginPath(); ctx.ellipse(x + 6, y + r * 0.8, r * 1.05, r * 0.35, 0, 0, Math.PI * 2); ctx.fill();
        const g = ctx.createRadialGradient(x - r * 0.4, y - r * 0.4, r * 0.1, x, y, r);
        g.addColorStop(0, "#fff"); g.addColorStop(0.25, c); g.addColorStop(1, shade(c, -0.45));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // Kameran kohina
    const id = ctx.getImageData(0, 0, W, H), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
    ctx.putImageData(id, 0, 0);
    ctx.restore();
  }
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.round(Math.max(0, Math.min(255, v * (1 + k))));
    return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
  }

  /* ----- Kuvankäsittely ----- */
  function rgb2hsv(r, g, b) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let h = 0;
    if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return [(h * 60 + 360) % 360, mx ? (d / mx) * 255 : 0, mx];
  }
  function boxBlur(src, n) {
    let a = src;
    for (let k = 0; k < n; k++) {
      const b = new Float32Array(W * H);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let s = 0, c = 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const xx = x + dx, yy = y + dy;
          if (xx >= 0 && yy >= 0 && xx < W && yy < H) { s += a[yy * W + xx]; c++; }
        }
        b[y * W + x] = s / c;
      }
      a = b;
    }
    return a;
  }

  function process() {
    const id = srcCtx.getImageData(0, 0, W, H), d = id.data;
    let gray = new Float32Array(W * H);
    for (let i = 0, p = 0; p < gray.length; i += 4, p++) gray[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    if (st.blur > 0) gray = boxBlur(gray, st.blur | 0);
    const out = outCtx.createImageData(W, H), o = out.data;
    const y0 = st.roi === "bottom" ? Math.floor(H * 2 / 3) : 0;
    let n = 0, sx = 0, sy = 0, minX = W, minY = H, maxX = -1, maxY = -1, edges = 0;
    const mark = (x, y) => { n++; sx += x; sy += y; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; };

    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const p = y * W + x, i = p * 4;
      let r = d[i], g = d[i + 1], b = d[i + 2];
      if (st.mode === "gray") { r = g = b = gray[p]; }
      else if (st.mode === "threshold") {
        const on = st.invert ? gray[p] < st.thr : gray[p] > st.thr;
        r = g = b = on ? 255 : 0;
        if (on && y >= y0) mark(x, y);
      } else if (st.mode === "edges") {
        let m = 0;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          const q = (dx, dy) => gray[(y + dy) * W + x + dx];
          const gx = -q(-1, -1) - 2 * q(-1, 0) - q(-1, 1) + q(1, -1) + 2 * q(1, 0) + q(1, 1);
          const gy = -q(-1, -1) - 2 * q(0, -1) - q(1, -1) + q(-1, 1) + 2 * q(0, 1) + q(1, 1);
          m = Math.min(255, Math.hypot(gx, gy) / 4);
        }
        if (m > st.thr * 0.5) edges++;
        r = g = b = m;
      } else if (st.mode === "color") {
        const [h, s, v] = rgb2hsv(r, g, b);
        const dh = Math.min(Math.abs(h - st.hue), 360 - Math.abs(h - st.hue));
        const on = dh <= st.hueTol && s >= st.satMin && v >= 40;
        if (on) { if (y >= y0) mark(x, y); }
        else { const gr = gray[p] * 0.35; r = g = b = gr; }
      }
      o[i] = r; o[i + 1] = g; o[i + 2] = b; o[i + 3] = 255;
    }
    outCtx.putImageData(out, 0, 0);

    const area = n / (W * (H - y0));
    const found = (st.mode === "color" || st.mode === "threshold") && n > 40;
    const cx = found ? sx / n : null, cy = found ? sy / n : null;
    const steer = found ? (cx - W / 2) / (W / 2) : null;
    last = { mode: st.mode, source: st.source, found, area, cx, cy, steer, edges, box: found ? [minX, minY, maxX, maxY] : null };

    // Päällekkäispiirrot: tutkittava alue, kohteen laatikko ja keskipiste, ohjauskomento
    outCtx.save();
    if (y0) { outCtx.strokeStyle = "rgba(76,141,255,.9)"; outCtx.setLineDash([6, 4]); outCtx.strokeRect(1, y0, W - 2, H - y0 - 1); outCtx.setLineDash([]); }
    if (found) {
      outCtx.strokeStyle = "#3ecf8e"; outCtx.lineWidth = 2;
      if (st.mode === "color") outCtx.strokeRect(minX, minY, maxX - minX, maxY - minY);
      outCtx.beginPath(); outCtx.moveTo(cx - 8, cy); outCtx.lineTo(cx + 8, cy); outCtx.moveTo(cx, cy - 8); outCtx.lineTo(cx, cy + 8); outCtx.stroke();
      outCtx.strokeStyle = "#f5b84a"; outCtx.lineWidth = 3;
      outCtx.beginPath(); outCtx.moveTo(W / 2, H - 8); outCtx.lineTo(W / 2 + steer * 60, H - 8 - 30); outCtx.stroke();
    }
    outCtx.restore();
  }

  /* ----- Lähde ----- */
  function stopCam() { stream?.getTracks().forEach((t) => t.stop()); stream = null; video = null; }
  async function startCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      video = document.createElement("video");
      video.srcObject = stream; video.muted = true; video.playsInline = true;
      await video.play();
    } catch (err) {
      stopCam();
      st.source = "balls"; save();
      toast(tr("Kameraa ei saatu käyttöön: ", "Could not use the camera: ") + (err?.message || err));
      render(el, TOOLS.find((t) => t.id === "cv"));
    }
  }
  function drawSource(t) {
    if (st.source === "camera") { if (video?.readyState >= 2) srcCtx.drawImage(video, 0, 0, W, H); }
    else if (st.source === "file") { if (img) srcCtx.drawImage(img, 0, 0, W, H); }
    else drawSample(srcCtx, st.source, t);
  }

  const save = () => saveToolState("cv", st);

  function loop(now) {
    raf = requestAnimationFrame(loop);
    const t = st.animate ? (now - t0) / 1000 : 0;
    // Liikkumaton näyte käsitellään vain kerran; kamera ja animaatio joka ruudulla (n. 30 krt/s)
    if (!st.animate && st.source !== "camera" && last && !loop.dirty) return;
    if (loop.skip ^= 1) return;
    loop.dirty = false;
    drawSource(t);
    process();
    showResults();
  }

  function showResults() {
    const r = last, box = el.querySelector("#cv-res");
    if (!box || !r) return;
    const tiles = [];
    if (r.mode === "color" || r.mode === "threshold") {
      tiles.push({ label: tr("Kohde löytyi", "Object found"), value: r.found ? tr("kyllä", "yes") : tr("ei", "no"), level: r.found ? "ok" : "warn" });
      tiles.push({ label: tr("Pinta-ala", "Area"), value: (r.area * 100).toFixed(1), unit: " %", sub: tr("kuvan pikseleistä", "of the image pixels") });
      tiles.push({ label: tr("Keskipiste", "Centroid"), value: r.found ? `${r.cx.toFixed(0)}, ${r.cy.toFixed(0)}` : "–", unit: " px" });
      tiles.push({ label: tr("Ohjaus", "Steering"), value: r.found ? r.steer.toFixed(2) : "–",
        sub: r.found ? (Math.abs(r.steer) < 0.1 ? tr("suoraan", "straight") : r.steer < 0 ? tr("käänny vasemmalle", "turn left") : tr("käänny oikealle", "turn right")) : tr("ei kohdetta: pysähdy tai etsi", "no object: stop or search") });
    } else if (r.mode === "edges") {
      tiles.push({ label: tr("Reunapikseleitä", "Edge pixels"), value: String(r.edges), sub: tr("kynnyksen yläpuolella", "above the threshold") });
    } else tiles.push({ label: tr("Tila", "Mode"), value: r.mode === "gray" ? tr("harmaasävy", "grayscale") : tr("alkuperäinen", "original") });
    box.innerHTML = resultTiles(tiles);
  }

  // Sama käsittely OpenCV:llä (Python), esim. Raspberry Pi -robottiin
  function codeSample() {
    const lines = ["import cv2", "import numpy as np", "", "cap = cv2.VideoCapture(0)", "while True:", "    ok, frame = cap.read()", "    if not ok: break", "    frame = cv2.resize(frame, (320, 240))"];
    if (st.blur > 0) lines.push(`    frame = cv2.blur(frame, (${st.blur * 2 + 1}, ${st.blur * 2 + 1}))`);
    if (st.mode === "color") {
      const h = Math.round(st.hue / 2), t = Math.round(st.hueTol / 2);
      lines.push("    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)  # OpenCV: H 0-179");
      if (h - t < 0 || h + t > 179) lines.push(`    mask = cv2.inRange(hsv, (0, ${st.satMin}, 40), (${(h + t) % 180}, 255, 255)) | cv2.inRange(hsv, (${(h - t + 180) % 180}, ${st.satMin}, 40), (179, 255, 255))`);
      else lines.push(`    mask = cv2.inRange(hsv, (${h - t}, ${st.satMin}, 40), (${h + t}, 255, 255))`);
    } else {
      lines.push("    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)");
      if (st.mode === "threshold") lines.push(`    _, mask = cv2.threshold(gray, ${st.thr}, 255, cv2.THRESH_BINARY${st.invert ? "_INV" : ""})`);
      if (st.mode === "edges") lines.push(`    edges = cv2.Canny(gray, ${Math.round(st.thr * 0.5)}, ${st.thr})`, "    cv2.imshow('edges', edges)");
    }
    if (st.mode === "color" || st.mode === "threshold") {
      if (st.roi === "bottom") lines.push("    mask[:160, :] = 0  # " + tr("vain kuvan alakolmannes", "only the bottom third of the image"));
      lines.push("    m = cv2.moments(mask)", "    if m['m00'] > 40 * 255:", "        cx = m['m10'] / m['m00']", "        steer = (cx - 160) / 160  # -1 = " + tr("vasen", "left") + ", 1 = " + tr("oikea", "right"),
        "        print('steer', round(steer, 2))", "    else:", "        print('" + tr("ei kohdetta", "no object") + "')", "    cv2.imshow('mask', mask)");
    }
    lines.push("    if cv2.waitKey(1) == 27: break");
    return lines.join("\n");
  }

  function render(root, tool) {
    el = root;
    st = { ...DEFAULTS, ...getToolState("cv", DEFAULTS) };
    const fields = [
      { key: "source", label: tr("Kuvalähde", "Image source"), type: "select", options: [["balls", tr("Näyte: värilliset pallot", "Sample: coloured balls")], ["line", tr("Näyte: viivaa seuraava robotti", "Sample: line-following robot")],
        ["parts", tr("Näyte: osat liukuhihnalla", "Sample: parts on a conveyor")], ["camera", tr("Verkkokamera", "Webcam")], ["file", tr("Oma kuva…", "Your own image…")]] },
      { key: "mode", label: tr("Käsittely", "Processing"), type: "select", options: [["original", tr("1. Alkuperäinen", "1. Original")], ["gray", tr("2. Harmaasävy", "2. Grayscale")],
        ["threshold", tr("3. Kynnystys (musta/valkoinen)", "3. Threshold (black/white)")], ["edges", tr("4. Reunat (Sobel)", "4. Edges (Sobel)")], ["color", tr("5. Väritunnistus", "5. Colour detection")]],
        info: tr("Konenäkö etenee vaiheittain: kuva muutetaan ensin yksinkertaisemmaksi (harmaasävy), sitten siitä erotetaan kiinnostava osa (kynnystys, reunat tai väri), ja lopuksi lasketaan kohteen paikka.", "Computer vision works in stages: the image is first simplified (grayscale), then the interesting part is separated (threshold, edges or colour), and finally the object's position is computed.") },
      { key: "thr", label: tr("Kynnys", "Threshold"), type: "slider", min: 0, max: 255, step: 1, when: (s) => s.mode === "threshold" || s.mode === "edges",
        info: tr("Harmaasävyn raja 0–255. Kynnystyksessä tätä tummemmat (tai vaaleammat) pikselit muuttuvat valkoisiksi. Reunoissa raja määrää, kuinka jyrkkä muutos lasketaan reunaksi.", "The gray level limit 0–255. In thresholding, pixels darker (or lighter) than this turn white. For edges it sets how sharp a change counts as an edge.") },
      { key: "invert", label: tr("Etsi tummaa (käännä)", "Find dark (invert)"), type: "toggle", when: (s) => s.mode === "threshold",
        info: tr("Viivanseuraajan musta viiva vaalealla lattialla: tumma = kohde.", "A line follower's black line on a light floor: dark = the object.") },
      { key: "hue", label: tr("Sävy (hue)", "Hue"), unit: "°", type: "slider", min: 0, max: 359, step: 1, when: (s) => s.mode === "color",
        info: tr("Etsittävä väri värikehällä: 0 = punainen, 60 = keltainen, 120 = vihreä, 240 = sininen. Voit myös klikata kuvasta väriä.", "The colour to look for on the colour wheel: 0 = red, 60 = yellow, 120 = green, 240 = blue. You can also click a colour in the image.") },
      { key: "hueTol", label: tr("Sävyn toleranssi", "Hue tolerance"), unit: "°", type: "slider", min: 2, max: 90, step: 1, when: (s) => s.mode === "color" },
      { key: "satMin", label: tr("Vähimmäiskylläisyys", "Minimum saturation"), type: "slider", min: 0, max: 255, step: 1, when: (s) => s.mode === "color",
        info: tr("Harmaat ja valkoiset pinnat (pieni kylläisyys) jätetään pois, vaikka niiden sävy osuisi kohdalleen.", "Gray and white surfaces (low saturation) are left out even if their hue matches.") },
      { key: "blur", label: tr("Pehmennys", "Blur"), type: "slider", min: 0, max: 3, step: 1,
        info: tr("Keskiarvoistaa naapuripikselit ja vähentää kameran kohinaa ennen käsittelyä. Liika pehmennys hävittää pienet kohteet.", "Averages neighbouring pixels to reduce camera noise before processing. Too much blur erases small objects.") },
      { key: "roi", label: tr("Tutkittava alue", "Region of interest"), type: "select", options: [["full", tr("Koko kuva", "Whole image")], ["bottom", tr("Alakolmannes (viivanseuraaja)", "Bottom third (line follower)")]], when: (s) => s.mode === "threshold" || s.mode === "color",
        info: tr("Viivanseuraaja katsoo vain aivan edessään olevaa lattiaa: kauempana olevat mutkat eivät saa vielä kääntää robottia.", "A line follower only looks at the floor right in front of it: bends further ahead must not turn the robot yet.") },
      { key: "animate", label: tr("Liikkuva näyte", "Moving sample"), type: "toggle", when: (s) => !["camera", "file"].includes(s.source) },
    ];

    el.innerHTML = `
      ${toolHead(tool)}
      <div class="tool viz-first">
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Asetukset", "Settings")}</h3>
            <div class="fields" id="cv-fields"></div>
            <input type="file" id="cv-file" accept="image/*" hidden>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Mitä tämä tekee?", "What does this do?")}</h3>
            <p class="note" style="line-height:1.6">${tr("Robotin kamera näkee vain lukuja: jokaisella pikselillä on punainen, vihreä ja sininen arvo 0–255. Konenäkö muuttaa luvut tiedoksi, esimerkiksi \"punainen pallo on vasemmalla\". Keskipisteestä saadaan suoraan ohjauskomento: −1 = käänny vasemmalle, 1 = oikealle.",
              "A robot's camera only sees numbers: every pixel has a red, green and blue value 0–255. Computer vision turns the numbers into information, such as \"the red ball is on the left\". The centroid gives a steering command directly: −1 = turn left, 1 = turn right.")}</p>
          </div>
          <div class="card">
            <h3 class="card-title">${tr("Sama koodina (OpenCV, Python)", "The same as code (OpenCV, Python)")}</h3>
            <pre class="code-box" id="cv-code"></pre>
            <p class="note" style="margin-top:8px">${tr("Toimii esim. Raspberry Pi -robotissa: pip install opencv-python. Koodi päivittyy asetusten mukaan.", "Works e.g. on a Raspberry Pi robot: pip install opencv-python. The code follows your settings.")}</p>
          </div>
        </div>
        <div class="col">
          <div class="card">
            <h3 class="card-title">${tr("Kamera ja käsitelty kuva", "Camera and processed image")}</h3>
            <div class="cv-views">
              <figure><canvas id="cv-src" width="${W}" height="${H}" title="${tr("Klikkaa väriä väritunnistukseen", "Click a colour for colour detection")}"></canvas><figcaption>${tr("Kamera", "Camera")}</figcaption></figure>
              <figure><canvas id="cv-out" width="${W}" height="${H}"></canvas><figcaption>${tr("Käsitelty", "Processed")}</figcaption></figure>
            </div>
          </div>
          <div id="cv-res"></div>
        </div>
      </div>`;

    srcCtx = el.querySelector("#cv-src").getContext("2d", { willReadFrequently: true });
    outCtx = el.querySelector("#cv-out").getContext("2d");
    const box = el.querySelector("#cv-fields");
    const redraw = () => { box.innerHTML = fieldsHtml(fields, st, true); el.querySelector("#cv-code").textContent = codeSample(); };
    redraw();
    bindFields(box, fields, st, (k) => {
      save();
      loop.dirty = true;
      if (k === "source") {
        stopCam();
        if (st.source === "camera") startCam();
        if (st.source === "file") el.querySelector("#cv-file").click();
      }
      if (["mode", "source"].includes(k)) redraw();
      else el.querySelector("#cv-code").textContent = codeSample();
    });
    el.querySelector("#cv-file").onchange = (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const im = new Image();
      im.onload = () => { img = im; loop.dirty = true; };
      im.src = URL.createObjectURL(f);
    };
    // Värin poiminta kuvasta
    el.querySelector("#cv-src").onclick = (e) => {
      const c = e.currentTarget, r = c.getBoundingClientRect();
      const x = Math.floor((e.clientX - r.left) / r.width * W), y = Math.floor((e.clientY - r.top) / r.height * H);
      const p = srcCtx.getImageData(x, y, 1, 1).data;
      const [h, s] = rgb2hsv(p[0], p[1], p[2]);
      if (s < 40) { toast(tr("Väri on lähes harmaa — valitse kirkkaampi kohta", "The colour is almost gray — pick a more vivid spot")); return; }
      st.hue = Math.round(h); st.mode = "color"; save(); redraw(); loop.dirty = true;
      toast(tr(`Etsitään sävyä ${st.hue}°`, `Looking for hue ${st.hue}°`));
    };
    if (st.source === "camera") startCam();
    if (st.source === "file" && !img) { st.source = "balls"; redraw(); }
    t0 = performance.now();
    loop.dirty = true;
    raf = requestAnimationFrame(loop);
  }

  function unmount() { cancelAnimationFrame(raf); stopCam(); }

  const ex = (name, desc, cfg) => ({ name, desc, apply: () => saveToolState("cv", { ...DEFAULTS, ...cfg }) });
  TOOL_IMPL.cv = {
    render, unmount,
    examples: [
      ex(tr("Seuraa punaista palloa", "Follow the red ball"), tr("Väritunnistus ja keskipiste: robotti kääntyy pallon suuntaan", "Colour detection and centroid: the robot turns toward the ball"), { source: "balls", mode: "color", hue: 2, hueTol: 15, satMin: 110 }),
      ex(tr("Viivanseuraaja", "Line follower"), tr("Kynnystys, tumma viiva ja alakolmannes", "Threshold, dark line and the bottom third"), { source: "line", mode: "threshold", thr: 90, invert: true, roi: "bottom" }),
      ex(tr("Reunat liukuhihnalla", "Edges on a conveyor"), tr("Sobel-reunat löytävät osien muodot", "Sobel edges find the shapes of the parts"), { source: "parts", mode: "edges", thr: 60 }),
      ex(tr("Sininen osa liukuhihnalla", "The blue part on the conveyor"), tr("Lajittelurobotti etsii sinisen kappaleen", "A sorting robot looks for the blue part"), { source: "parts", mode: "color", hue: 205, hueTol: 15, satMin: 90 }),
    ],
  };
})();
