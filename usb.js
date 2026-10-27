// USB-yhteys robottiin Web Serialilla (Chrome ja Edge):
// 1) MicroPython-koodin lataus laitteelle (ESP32, Raspberry Pi Pico) raw REPL -tilassa tiedostoksi main.py.
// 2) Live-linkki: robotti lähettää anturiarvot riveinä "S:a,b,c", sovellus laskee aivot ja vastaa "M:x,y".
//    Näin oikeaa robottia voi testata ilman, että aivoja ladataan laitteelle.

RS.USB = (() => {
  const supported = () => 'serial' in navigator;
  const enc = new TextEncoder(), dec = new TextDecoder();
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // Avoin portti ja sen lukija/kirjoittaja. Vastaanotettu teksti kertyy puskuriin, josta odotetaan merkkijonoja.
  async function open(baud) {
    const port = await navigator.serial.requestPort();
    await port.open({ baudRate: baud || 115200 });
    const reader = port.readable.getReader(), writer = port.writable.getWriter();
    const io = { port, reader, writer, buf: '', closed: false, onData: null };
    (async () => {
      try {
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          const s = dec.decode(value, { stream: true });
          io.buf += s;
          if (io.buf.length > 200000) io.buf = io.buf.slice(-100000);
          io.onData?.(s);
        }
      } catch {}
      io.closed = true;
    })();
    io.write = async (s) => {
      const bytes = typeof s === 'string' ? enc.encode(s) : s;
      // Pienissä paloissa: mikrokontrollerin vastaanottopuskuri on pieni
      for (let i = 0; i < bytes.length; i += 64) { await writer.write(bytes.slice(i, i + 64)); if (bytes.length > 64) await sleep(4); }
    };
    io.waitFor = async (text, ms = 3000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        const i = io.buf.indexOf(text);
        if (i >= 0) { const before = io.buf.slice(0, i); io.buf = io.buf.slice(i + text.length); return before; }
        if (io.closed) break;
        await sleep(15);
      }
      throw new Error(tr(`Laite ei vastannut (odotettiin "${text.replace(/[\x00-\x1f]/g, '')}").`, `The device did not answer (expected "${text.replace(/[\x00-\x1f]/g, '')}").`));
    };
    io.close = async () => {
      try { await reader.cancel(); } catch {}
      try { reader.releaseLock(); writer.releaseLock(); } catch {}
      try { await port.close(); } catch {}
    };
    return io;
  }

  // Raw REPL: Ctrl-A aloittaa, koodi + Ctrl-D suorittaa. Vastaus: "OK" <tulostus> \x04 <virhe> \x04 ">"
  async function rawExec(io, code, ms = 5000) {
    await io.write(code);
    await io.write('\x04');
    await io.waitFor('OK', ms);
    const out = await io.waitFor('\x04', ms);
    const err = await io.waitFor('\x04', ms);
    await io.waitFor('>', ms);
    if (err.trim()) throw new Error(err.trim().split('\n').pop());
    return out;
  }

  // Kirjoittaa koodin laitteen tiedostoon main.py ja käynnistää laitteen uudelleen, jolloin koodi alkaa ajaa
  async function flashMicroPython(code, onStep) {
    const step = (t, p) => onStep?.(t, p);
    step(tr('Valitse laitteen sarjaportti…', 'Pick the device serial port…'), 0);
    const io = await open(115200);
    try {
      step(tr('Pysäytetään laitteella ajossa oleva ohjelma…', 'Stopping the program running on the device…'), 0.05);
      await io.write('\r\x03\x03');
      await sleep(200);
      io.buf = '';
      await io.write('\x01');
      try { await io.waitFor('raw REPL; CTRL-B to exit', 3000); }
      catch { throw new Error(tr('Laitteelta ei löytynyt MicroPythonia. Asenna MicroPython-laiteohjelmisto ensin (esim. Thonnylla tai osoitteesta micropython.org).', 'MicroPython was not found on the device. Install the MicroPython firmware first (e.g. with Thonny or from micropython.org).')); }
      await io.waitFor('>', 2000);
      await rawExec(io, "f=open('main.py','w')\nf.close()");
      const CH = 384;
      for (let i = 0; i < code.length; i += CH) {
        await rawExec(io, `f=open('main.py','a')\nf.write(${JSON.stringify(code.slice(i, i + CH))})\nf.close()`);
        step(tr('Kirjoitetaan main.py…', 'Writing main.py…'), 0.1 + 0.85 * Math.min(1, (i + CH) / code.length));
      }
      const size = (await rawExec(io, "import os\nprint(os.stat('main.py')[6])")).trim();
      if (+size !== enc.encode(code).length) throw new Error(tr(`Tiedoston koko ei täsmää (${size} / ${enc.encode(code).length} tavua).`, `The file size does not match (${size} / ${enc.encode(code).length} bytes).`));
      // Pois raw-tilasta ja pehmeä uudelleenkäynnistys: main.py käynnistyy
      await io.write('\x02');
      await sleep(100);
      await io.write('\x04');
      step(tr('Valmis! Laite käynnistyi uudelleen ja ajaa aivoja.', 'Done! The device restarted and is running the brain.'), 1);
    } finally {
      await sleep(300);
      await io.close();
    }
  }

  /* Live-linkki: rivipohjainen protokolla
     robotti → sovellus: "S:0.12,-0.5,..."  (sisääntulot samassa järjestyksessä ja skaalauksessa kuin viedyssä koodissa)
     sovellus → robotti: "M:0.300,-1.000"   (moottorikomennot −1…1) */
  async function link({ inputs, step, onStatus, baud }) {
    const io = await open(baud || 115200);
    let line = '', n = 0, t0 = performance.now(), bad = 0, stopped = false;
    io.onData = (s) => {
      line += s;
      let k;
      while ((k = line.indexOf('\n')) >= 0) {
        const l = line.slice(0, k).trim();
        line = line.slice(k + 1);
        if (!l.startsWith('S:')) { if (l) onStatus?.({ log: l }); continue; }
        const v = l.slice(2).split(',').map(Number);
        if (v.length !== inputs || v.some((x) => !isFinite(x))) { bad++; onStatus?.({ bad, expected: inputs, got: v.length }); continue; }
        const out = step(v);
        io.write('M:' + Array.from(out, (x) => x.toFixed(3)).join(',') + '\n').catch(() => {});
        n++;
        const dt = (performance.now() - t0) / 1000;
        if (dt > 0.5) { onStatus?.({ hz: n / dt, input: v, output: Array.from(out) }); n = 0; t0 = performance.now(); }
      }
      io.buf = '';
    };
    return { stop: async () => { if (stopped) return; stopped = true; await io.close(); }, get closed() { return io.closed; } };
  }

  // Arduino-luonnos live-linkkiin: lukee anturit, lähettää ne ja asettaa moottorit vastauksen mukaan
  function linkSketch(info) {
    const ins = info.inputs.map((x, i) => `  in[${i}] = 0.0f; // TODO ${x.id}: ${x.name}`);
    const outs = info.outputs.map((x, i) => `  // TODO ${x.id} (${x.name}): ${x.mode === 'position' ? 'servo' : x.mode === 'thrust' ? 'ESC' : tr('moottori', 'motor')} <- out[${i}]`);
    return `// RoboLab Live Link: ${tr('robotti lähettää anturit, RoboLab laskee aivot ja vastaa moottorikomennoilla.', 'the robot sends its sensors, RoboLab runs the brain and replies with motor commands.')}
// ${tr('Täytä TODO-kohdat samoin kuin Arduino-viennissä (sama järjestys ja skaalaus). Pidä USB-kaapeli kiinni.', 'Fill the TODO lines like in the Arduino export (same order and scaling). Keep the USB cable connected.')}
const int N_IN = ${info.inputs.length}, N_OUT = ${info.outputs.length};
float in[N_IN], out[N_OUT];
String rx;

void setup() {
  Serial.begin(115200);
}

void readSensors() {
${ins.join('\n')}
}

void setMotors() {
${outs.join('\n')}
}

void loop() {
  static unsigned long last = 0;
  if (millis() - last >= ${Math.round(1000 / info.hz)}) {
    last = millis();
    readSensors();
    Serial.print("S:");
    for (int i = 0; i < N_IN; i++) { if (i) Serial.print(','); Serial.print(in[i], 4); }
    Serial.println();
  }
  while (Serial.available()) {
    char c = Serial.read();
    if (c != '\\n') { rx += c; continue; }
    if (rx.startsWith("M:")) {
      int k = 0, from = 2;
      for (int i = 2; i <= (int)rx.length() && k < N_OUT; i++) {
        if (i == (int)rx.length() || rx[i] == ',') { out[k++] = rx.substring(from, i).toFloat(); from = i + 1; }
      }
      if (k == N_OUT) setMotors();
    }
    rx = "";
  }
}
`;
  }

  return { supported, flashMicroPython, link, linkSketch };
})();
