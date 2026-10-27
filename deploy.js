// Koulutettujen aivojen vienti omalle robotille: Arduino-luonnos, C/C++-otsake (ESP32, STM32, Pico…),
// MicroPython/Python ja JSON. Verkko lasketaan laitteella täsmälleen kuten simulaatiossa (RS.Brain.forward),
// ja jokaisen sisääntulon kohdalle kirjoitetaan, mitä anturia se vastaa ja miten arvo skaalataan.

RS.DEPLOY_HZ = 60; // simulaation ohjaustaajuus: aivot ajetaan kerran fysiikka-askelta kohden

// Nimet päätyvät generoidun koodin kommentteihin: rivinvaihto tai kommentin loppu toisi nimestä suoritettavaa koodia
RS.commentSafe = (s) => String(s ?? '').replace(/[\r\n\u2028\u2029]+/g, ' ').replace(/\*\//g, '* /');

// Sisääntulojen ja ulostulojen kuvaus normalisoidusta mallista. Järjestys on sama kuin robot.js / robot3d.js observe().
// Jokaisella sisääntulolla: id (koodin vakio), name, how (mittausohje) ja f (miten raaka-arvo M muunnetaan).
RS.deployInfo = function (dim, m) {
  const is3d = dim === '3d';
  const joints = m.joints.filter((j) => j.motor !== false);
  const feet = m.bodies.filter((b) => b.foot);
  const rad = (d) => (d * Math.PI) / 180;
  const jname = (j) => RS.commentSafe(j.name || `${j.a}–${j.b}`);
  const inputs = [];
  const add = (id, name, how, f) => inputs.push({ id, name, how, f });

  if (is3d) {
    const ax = ['X', 'Y', 'Z'], axn = [tr('eteen', 'forward'), tr('ylös', 'up'), tr('sivulle', 'sideways')];
    ax.forEach((a, i) => add('UP_' + a, tr(`Painovoiman suunta, ${axn[i]}`, `Gravity direction, ${axn[i]}`),
      tr('Kiihtyvyysanturin lukema robotin koordinaateissa, normalisoitu pituuteen 1 ja käännetty ylöspäin (paikallaan ollessa (0, 1, 0)).',
        'Accelerometer reading in robot coordinates, normalised to length 1 and pointing up ((0, 1, 0) at rest).'), { k: 'raw' }));
    ax.forEach((a, i) => add('FWD_' + a, tr(`Robotin eteen-suunta maailmassa, ${'xyz'[i]}`, `Robot forward direction in the world, ${'xyz'[i]}`),
      tr('Asentoarviosta (IMU + magnetometri tai AHRS-kirjasto): robotin x-akseli lähtösuunnan koordinaateissa. Ilman asentoarviota käytä (1, 0, 0).',
        'From an orientation estimate (IMU + magnetometer or an AHRS library): the robot x axis in start-direction coordinates. Without one use (1, 0, 0).'), { k: 'raw' }));
    ax.forEach((a) => add('GYRO_' + a, tr(`Kulmanopeus ${a.toLowerCase()}-akselin ympäri`, `Angular velocity about ${a.toLowerCase()}`),
      tr('Gyroskooppi, rad/s, robotin koordinaateissa.', 'Gyroscope, rad/s, in robot coordinates.'), { k: 'tanh', s: 0.25 }));
    ax.forEach((a, i) => add('VEL_' + a, tr(`Nopeus ${axn[i]}`, `Velocity ${axn[i]}`),
      tr('m/s robotin koordinaateissa (pyöräenkooderit tai optinen virtaus). Pysty- ja sivunopeus voi usein olla 0.', 'm/s in robot coordinates (wheel encoders or optical flow). Vertical and sideways speed can often be 0.'), { k: 'tanh', s: 0.3 }));
  } else {
    add('TILT_SIN', tr('Rungon kallistus, sin', 'Body tilt, sin'), tr('sin(θ), θ = rungon kulma vaakatasosta radiaaneina (IMU). Pystyssä 0.', 'sin(θ), θ = body angle from level in radians (IMU). 0 when level.'), { k: 'sin' });
    add('TILT_COS', tr('Rungon kallistus, cos', 'Body tilt, cos'), tr('cos(θ), sama kulma.', 'cos(θ), the same angle.'), { k: 'cos' });
    add('GYRO', tr('Kulmanopeus', 'Angular velocity'), tr('Gyroskooppi, rad/s (vastapäivään positiivinen, kun robotti kulkee oikealle).', 'Gyroscope, rad/s (counter-clockwise positive when the robot drives to the right).'), { k: 'tanh', s: 0.25 });
    add('VEL_X', tr('Nopeus eteen', 'Forward speed'), tr('m/s kulkusuuntaan (pyöräenkooderit).', 'm/s in the driving direction (wheel encoders).'), { k: 'tanh', s: 0.3 });
    add('VEL_Y', tr('Pystynopeus', 'Vertical speed'), tr('m/s ylöspäin. Tasaisella maalla 0.', 'm/s upwards. 0 on flat ground.'), { k: 'tanh', s: 0.3 });
  }
  add('HEIGHT', tr('Korkeuden muutos', 'Height change'), tr('Rungon korkeus miinus korkeus alussa, metreinä. Tasaisella maalla 0.', 'Body height minus the starting height, in metres. 0 on flat ground.'), { k: 'tanh', s: 1 });

  joints.forEach((j, i) => {
    const lo = j.lower, hi = j.upper, limited = lo != null && hi != null && hi > lo;
    add(`M${i}_ANGLE`, tr(`Nivelen ${jname(j)} kulma`, `Joint ${jname(j)} angle`),
      limited ? tr(`Kulma radiaaneina (potentiometri/servo/enkooderi). Muunnetaan välille −1…1: ${lo}° → −1, ${hi}° → 1.`, `Angle in radians (potentiometer/servo/encoder). Mapped to −1…1: ${lo}° → −1, ${hi}° → 1.`)
        : tr('Kulma radiaaneina (enkooderi), syötetään sin(kulma).', 'Angle in radians (encoder), fed as sin(angle).'),
      limited ? { k: 'norm', lo: rad(lo), hi: rad(hi) } : { k: 'sin' });
    add(`M${i}_SPEED`, tr(`Nivelen ${jname(j)} nopeus`, `Joint ${jname(j)} speed`),
      tr(`rad/s jaettuna maksiminopeudella ${j.speed ?? 6} rad/s, rajattu −1…1.`, `rad/s divided by the top speed ${j.speed ?? 6} rad/s, clamped to −1…1.`), { k: 'clamp', s: 1 / (j.speed ?? 6) });
  });
  feet.forEach((b, i) => add(`FOOT${i}`, tr(`Osa ${RS.commentSafe(b.id)} koskettaa maata`, `Part ${RS.commentSafe(b.id)} touches the ground`),
    tr('Kosketuskytkin tai voima-anturi: 1 = koskettaa maata, 0 = ilmassa.', 'Touch switch or force sensor: 1 = touching the ground, 0 = in the air.'), { k: 'raw' }));

  if (is3d) {
    const n = m.sensors.scan | 0;
    for (let i = 0; i < n; i++) add(`SCAN${i}`, tr(`Maasto ${(0.6 + i * 0.6).toFixed(1)} m edessä`, `Terrain ${(0.6 + i * 0.6).toFixed(1)} m ahead`),
      tr('Maan korkeus tässä kohdassa miinus korkeus robotin alla, metreinä (etäisyysanturi viistosti alas). Tasaisella 0.', 'Ground height at that point minus the height under the robot, in metres (a distance sensor angled down). 0 on flat ground.'), { k: 'tanh', s: 2 });
  } else {
    const n = m.sensors.lidar | 0;
    for (let i = 0; i < n; i++) {
      const ang = n === 1 ? -45 : -90 + (100 * i) / (n - 1);
      add(`LIDAR${i}`, tr(`Etäisyys ${Math.round(ang)}°`, `Distance ${Math.round(ang)}°`),
        tr(`Etäisyysanturi suuntaan ${Math.round(ang)}° vaakatasosta (−90° = suoraan alas, 0° = eteen): matka / 4 m, enintään 1.`, `Distance sensor at ${Math.round(ang)}° from level (−90° = straight down, 0° = forward): distance / 4 m, at most 1.`), { k: 'scale', s: 0.25 });
    }
  }
  add('PHASE_SIN', tr('Rytmi, sin', 'Rhythm, sin'), tr('sin(2π·t), t = sekunteja käynnistyksestä. Koodi laskee tämän itse.', 'sin(2π·t), t = seconds since start. The code computes this itself.'), { k: 'phase', fn: 'sin' });
  add('PHASE_COS', tr('Rytmi, cos', 'Rhythm, cos'), tr('cos(2π·t). Koodi laskee tämän itse.', 'cos(2π·t). The code computes this itself.'), { k: 'phase', fn: 'cos' });
  const tHow = is3d ? tr('Kohteen suunta robotin koordinaateissa, metreinä. 0, jos tehtävässä ei ole kohdetta.', 'Direction to the target in robot coordinates, in metres. 0 if the task has no target.')
    : tr('Kohteen etäisyys vaaka- ja pystysuunnassa maailman koordinaateissa (ei käänny rungon mukana), metreinä. 0, jos tehtävässä ei ole kohdetta.', 'Offset to the target horizontally and vertically in world coordinates (not rotated with the body), in metres. 0 if the task has no target.');
  if (is3d) {
    add('TARGET_X', tr('Kohde eteen', 'Target forward'), tHow, { k: 'tanh', s: 1 / 3 });
    if (m.target) add('TARGET_Y', tr('Kohde ylös', 'Target up'), tHow, { k: 'tanh', s: 1 / 3 });
    add('TARGET_Z', tr('Kohde sivulle', 'Target sideways'), tHow, { k: 'tanh', s: 1 / 3 });
  } else {
    add('TARGET_X', tr('Kohde vaakasuunnassa', 'Target horizontally'), tHow, { k: 'tanh', s: 1 / 3 });
    add('TARGET_Y', tr('Kohde pystysuunnassa', 'Target vertically'), tHow, { k: 'tanh', s: 1 / 3 });
  }

  const outputs = joints.map((j, i) => {
    const limited = j.lower != null && j.upper != null && j.upper > j.lower;
    const position = is3d && limited && (j.control || 'position') === 'position';
    const speed = j.speed ?? 6;
    return position
      ? { id: `M${i}`, name: jname(j), mode: 'position', lo: rad(j.lower), hi: rad(j.upper), speed,
        how: tr(`Servo: tavoitekulma ${j.lower}°…${j.upper}° (−1 → ${j.lower}°, 1 → ${j.upper}°). Simulaatiossa kulma muuttuu enintään ${speed} rad/s.`, `Servo: target angle ${j.lower}°…${j.upper}° (−1 → ${j.lower}°, 1 → ${j.upper}°). In the simulation the angle changes at most ${speed} rad/s.`) }
      : { id: `M${i}`, name: jname(j), mode: 'velocity', speed, torque: is3d ? j.strength ?? 10 : j.torque ?? 10,
        how: tr(`Moottori: nopeus −1…1 × ${speed} rad/s (≈ ${Math.round(speed * 60 / (2 * Math.PI))} rpm). Simulaation maksimivääntö ${is3d ? j.strength ?? 10 : j.torque ?? 10} N·m.`, `Motor: speed −1…1 × ${speed} rad/s (≈ ${Math.round(speed * 60 / (2 * Math.PI))} rpm). Simulation max torque ${is3d ? j.strength ?? 10 : j.torque ?? 10} N·m.`) };
  });
  // Roottorit (droonin potkurit): ulostulo −1…1 → työntövoima 0…100 %
  (m.thrusters || []).forEach((t, i) => outputs.push({
    id: `T${i}`, name: tr(`roottori ${i + 1} (${RS.commentSafe(t.body)})`, `rotor ${i + 1} (${RS.commentSafe(t.body)})`), mode: 'thrust',
    how: tr('Roottori: −1 → ei työntöä, 0 → puolet, 1 → täysi työntövoima. Simulaatiossa puolet kaikista roottoreista kannattelee robotin painon.', 'Rotor: −1 → no thrust, 0 → half, 1 → full thrust. In the simulation half of all rotors carries the robot\'s weight.'),
  }));
  return { dim, inputs, outputs, hz: RS.DEPLOY_HZ };
};

// Lyhin desimaaliesitys, joka palautuu täsmälleen samaksi float32-luvuksi
RS.f32str = function (v) {
  const f = Math.fround(v);
  if (f === 0) return '0';
  for (let p = 6; p <= 9; p++) { const s = f.toPrecision(p); if (Math.fround(+s) === f) return String(+s); }
  return String(f);
};

// C-kielen float-vakio, esim. 6 → 6.0f
// Python-liukuluku, esim. 6 → 6.0
RS.pyf = (v) => { const s = RS.f32str(v); return /[.e]/.test(s) ? s : s + '.0'; };
RS.cf = (v) => RS.pyf(v) + 'f';

// Itsetestin sisääntulo ja odotetut ulostulot (lasketaan samalla koodilla kuin simulaatio)
RS.deployTestInput = (n) => Array.from({ length: n }, (_, i) => 0.9 * Math.sin(1.7 * i + 0.3));
RS.deployExpected = function (layers, params) {
  const b = new RS.Brain(layers);
  return Array.from(b.forward(Float32Array.from(params), RS.deployTestInput(layers[0])));
};

// Generoi koodin. target: 'arduino' | 'c' | 'python' | 'json'. Palauttaa { filename, code, lang }.
// opts: { dim, model (normalisoitu), layers, params, name, gen, fitness, task }
RS.deployCode = function (target, o) {
  const info = RS.deployInfo(o.dim, o.model);
  if (info.inputs.length !== o.layers[0] || info.outputs.length !== o.layers.at(-1)) {
    throw new Error(tr('Aivot eivät sovi tähän robottiin (sisääntulojen tai moottorien määrä eri).', 'The brain does not fit this robot (different number of inputs or motors).'));
  }
  const params = Array.from(o.params, Math.fround);
  const expected = RS.deployExpected(o.layers, params);
  const base = String(o.name || 'robotti').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'robotti';
  const date = new Date().toISOString().slice(0, 10);
  const head = [
    `RoboLab: ${RS.commentSafe(o.name)} (${o.dim.toUpperCase()}), ${tr('tehtävä', 'task')}: ${RS.commentSafe(o.task || '–')}, ${tr('sukupolvi', 'generation')} ${o.gen ?? 0}${o.fitness != null ? `, ${tr('paras pistemäärä', 'best score')} ${(+o.fitness).toFixed(1)}` : ''}. ${date}`,
    `${tr('Verkko', 'Network')}: ${o.layers.join(' → ')}, tanh, ${params.length} ${tr('painoa', 'weights')}. ${tr('Aja aivot', 'Run the brain')} ${info.hz} ${tr('kertaa sekunnissa, kuten simulaatiossa.', 'times per second, as in the simulation.')}`,
    `${tr('Painot vievät', 'The weights take')} ${(params.length * 4 / 1024).toFixed(1)} kt ${tr('muistia (float32). Arduino Uno (32 kt flash, 2 kt RAM) riittää noin 7000 painoon, ESP32 ja Pico paljon suurempiin.', 'of memory (float32). An Arduino Uno (32 kB flash, 2 kB RAM) fits about 7000 weights; an ESP32 or Pico far more.')}`,
    tr('Koodin laskenta on tarkistettu itsetestillä simulaatiota vastaan. Oikealla laitteella sitä ei ole testattu: tarkista anturien suunnat, skaalaus ja moottorien napaisuus varovasti, robotti esim. pukilla.', 'The maths has been checked with a self-test against the simulation. It has not been tested on real hardware: check sensor directions, scaling and motor polarity carefully, e.g. with the robot on a stand.'),
  ];
  const inputDoc = info.inputs.map((x, i) => `[${i}] ${x.id}: ${x.name}. ${x.how}`);
  const outputDoc = info.outputs.map((x, i) => `[${i}] ${x.id} (${x.name}): ${x.how}`);
  const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

  if (target === 'json') {
    return {
      filename: `${base}_aivot.json`, lang: 'json',
      code: JSON.stringify({
        format: 'robolab-policy-v1', name: o.name, dim: o.dim, task: o.task, generation: o.gen ?? 0,
        activation: 'tanh', hz: info.hz, layers: o.layers,
        layout: 'for each layer l = 1..n-1, for each neuron: layers[l-1] weights, then the bias; out = tanh(sum)',
        inputs: info.inputs.map(({ id, name, how }, index) => ({ index, id, name, how })),
        outputs: info.outputs.map(({ f, ...x }, index) => ({ index, ...x })),
        selftest: { input: RS.deployTestInput(o.layers[0]), output: expected },
        params,
      }, null, 1),
    };
  }

  const ph = (lang) => (lang === 'c' ? '0.0f' : '0.0');
  // Sisääntulon laskukaava. Mittaus on paikkamerkki 0.0, jonka käyttäjä korvaa anturin lukemalla.
  function inputExpr(x, lang) {
    const C = lang === 'c', n = (v) => (C ? RS.cf(v) : RS.pyf(v));
    const tanh = C ? 'tanhf' : '_tanh', sin = C ? 'sinf' : 'math.sin', cos = C ? 'cosf' : 'math.cos';
    const M = ph(lang), f = x.f;
    switch (f.k) {
      case 'raw': return M;
      case 'sin': return `${sin}(${M})`;
      case 'cos': return `${cos}(${M})`;
      case 'tanh': return f.s === 1 ? `${tanh}(${M})` : `${tanh}(${n(f.s)} * ${M})`;
      case 'scale': return `${C ? 'fminf' : 'min'}(${n(f.s)} * ${M}, ${C ? '1.0f' : '1.0'})`;
      case 'clamp': return `${C ? 'rl_clamp' : '_clamp'}(${n(f.s)} * ${M})`;
      case 'norm': return `${n(2 / (f.hi - f.lo))} * (${M} - ${n(f.lo)}) - ${C ? '1.0f' : '1.0'}`;
      case 'phase': return `${f.fn === 'sin' ? sin : cos}(${C ? '6.2831853f' : '6.283185307'} * t)`;
    }
  }
  const todo = (x) => (x.f.k === 'phase' ? '' : ` TODO: ${x.how}`);

  if (target === 'c' || target === 'arduino') {
    const guard = 'ROBOLAB_BRAIN_H';
    const maxW = Math.max(...o.layers.slice(1, -1), 1);
    const flashKb = (params.length * 4 / 1024).toFixed(1);
    const net = [
      ...head.map((l) => `// ${l}`),
      '//',
      `// ${tr('Sisääntulot (in[i]) — täytä nämä anturien lukemista samoin kuin simulaatio:', 'Inputs (in[i]) — fill these from your sensors the same way as the simulation:')}`,
      ...inputDoc.map((l) => `//   ${l}`),
      `// ${tr('Ulostulot (out[i]), kaikki välillä −1…1:', 'Outputs (out[i]), all in −1…1:')}`,
      ...outputDoc.map((l) => `//   ${l}`),
      '',
      '#include <math.h>',
      '#include <stdint.h>',
      '',
      `#define RL_INPUTS ${o.layers[0]}`,
      `#define RL_OUTPUTS ${o.layers.at(-1)}`,
      `#define RL_HZ ${info.hz}`,
      `#define RL_PARAM_COUNT ${params.length}UL  // ${flashKb} kB flash (float32)`,
      ...info.inputs.map((x, i) => `#define RL_IN_${x.id} ${i}`),
      ...info.outputs.map((x, i) => `#define RL_OUT_${x.id} ${i}`),
      '',
      `// ${tr('AVR (Arduino Uno/Nano/Mega): painot flash-muistiin, koska RAM:ia on vain 2–8 kB.', 'AVR (Arduino Uno/Nano/Mega): weights go to flash, since there is only 2–8 kB of RAM.')}`,
      '#if defined(__AVR__)',
      '  #include <avr/pgmspace.h>',
      '  #define RL_STORE PROGMEM',
      '  #define RL_W(i) pgm_read_float(&rl_params[i])',
      '#else',
      '  #define RL_STORE',
      '  #define RL_W(i) rl_params[i]',
      '#endif',
      '',
      `static const uint16_t rl_layers[] = { ${o.layers.join(', ')} };`,
      `// ${tr('Painot kerroksittain: jokaiselle neuronille ensin painot, sitten bias.', 'Weights layer by layer: for each neuron first the weights, then the bias.')}`,
      'static const float rl_params[] RL_STORE = {',
      ...chunk(params.map((v) => RS.cf(v)), 10).map((c) => '  ' + c.join(', ') + ','),
      '};',
      '',
      'static inline float rl_clamp(float x) { return x < -1.0f ? -1.0f : (x > 1.0f ? 1.0f : x); }',
      '',
      `// ${tr('Laskee aivojen ulostulon: in[RL_INPUTS] → out[RL_OUTPUTS]. Sama laskenta kuin simulaatiossa.', 'Computes the brain output: in[RL_INPUTS] → out[RL_OUTPUTS]. The same computation as in the simulation.')}`,
      'static void robolab_brain(const float *in, float *out) {',
      `  static float buf_a[${maxW}], buf_b[${maxW}];`,
      '  const float *x = in;',
      '  float *y = buf_a;',
      '  uint32_t k = 0;',
      `  for (uint8_t l = 1; l < ${o.layers.length}; l++) {`,
      '    const uint16_t n_in = rl_layers[l - 1], n_out = rl_layers[l];',
      `    if (l == ${o.layers.length - 1}) y = out;`,
      '    for (uint16_t i = 0; i < n_out; i++) {',
      '      float s = 0.0f;',
      '      for (uint16_t j = 0; j < n_in; j++) s += RL_W(k++) * x[j];',
      '      s += RL_W(k++);',
      '      y[i] = tanhf(s);',
      '    }',
      '    x = y;',
      '    y = (y == buf_a) ? buf_b : buf_a;',
      '  }',
      '}',
      '',
      `// ${tr('Itsetesti: vertaa laitteen laskemaa simulaation tulokseen. Palauttaa suurimman eron; alle 0.001 = OK.', 'Self-test: compares the device result to the simulation. Returns the largest difference; below 0.001 = OK.')}`,
      'static float robolab_selftest(void) {',
      `  static const float expected[RL_OUTPUTS] = { ${expected.map((v) => RS.cf(v)).join(', ')} };`,
      '  float in[RL_INPUTS], out[RL_OUTPUTS], err = 0.0f;',
      '  for (uint16_t i = 0; i < RL_INPUTS; i++) in[i] = 0.9f * sinf(1.7f * i + 0.3f);',
      '  robolab_brain(in, out);',
      '  for (uint16_t i = 0; i < RL_OUTPUTS; i++) { float d = fabsf(out[i] - expected[i]); if (d > err) err = d; }',
      '  return err;',
      '}',
    ];
    if (target === 'c') {
      return { filename: 'robolab_brain.h', lang: 'c', code: [`#ifndef ${guard}`, `#define ${guard}`, '', ...net, '', `#endif // ${guard}`, ''].join('\n') };
    }
    const sketch = [
      ...net,
      '',
      `// ===== ${tr('Ohjaussilmukka', 'Control loop')} =====`,
      `// ${tr('Täytä readSensors() ja driveMotors() oman robottisi antureilla ja moottoreilla (kohdat TODO).', 'Fill readSensors() and driveMotors() with your own robot’s sensors and motors (the TODO lines).')}`,
      `// ${tr('Avaa sarjamonitori (115200): itsetesti kertoo, laskeeko laite verkon oikein.', 'Open the serial monitor (115200): the self-test tells whether the device computes the network correctly.')}`,
      '',
      'float rlIn[RL_INPUTS], rlOut[RL_OUTPUTS];',
      'unsigned long rlStart, rlNext;',
      'const unsigned long RL_PERIOD_US = 1000000UL / RL_HZ;',
      '',
      'void readSensors(float t) {',
      ...info.inputs.map((x) => `  rlIn[RL_IN_${x.id}] = ${inputExpr(x, 'c')};${todo(x) ? ' //' + todo(x) : ''}`),
      '}',
      '',
      'void driveMotors() {',
      ...info.outputs.flatMap((x, i) => x.mode === 'thrust'
        ? [`  // ${x.id} (${x.name}): ${x.how}`,
          `  float ${x.id.toLowerCase()}_thrust = (rl_clamp(rlOut[${i}]) + 1.0f) * 0.5f; // 0…1`,
          `  // ${tr('TODO: aseta moottorin nopeussäätimen (ESC) teho', 'TODO: set the motor speed controller (ESC) power to')} ${x.id.toLowerCase()}_thrust`,
          `  (void)${x.id.toLowerCase()}_thrust;`]
        : x.mode === 'position'
        ? [`  // ${x.id} (${x.name}): ${x.how}`,
          `  float ${x.id.toLowerCase()}_rad = ${RS.cf(x.lo)} + (rl_clamp(rlOut[${i}]) + 1.0f) * 0.5f * ${RS.cf(x.hi - x.lo)};`,
          `  // ${tr('TODO: käännä servo kulmaan', 'TODO: turn the servo to the angle')} ${x.id.toLowerCase()}_rad (${tr('radiaaneina; asteina', 'radians; in degrees')} ${x.id.toLowerCase()}_rad * 57.29578f)`,
          `  (void)${x.id.toLowerCase()}_rad;`]
        : [`  // ${x.id} (${x.name}): ${x.how}`,
          `  float ${x.id.toLowerCase()}_speed = rl_clamp(rlOut[${i}]) * ${RS.cf(x.speed)}; // rad/s`,
          `  // ${tr('TODO: aja moottoria nopeudella', 'TODO: drive the motor at')} ${x.id.toLowerCase()}_speed (${tr('esim. PWM = speed /', 'e.g. PWM = speed /')} ${RS.f32str(x.speed)} * 255)`,
          `  (void)${x.id.toLowerCase()}_speed;`]),
      '}',
      '',
      'void setup() {',
      '  Serial.begin(115200);',
      '  float err = robolab_selftest();',
      `  Serial.print(F("RoboLab ${tr('itsetesti, suurin ero', 'self-test, largest difference')}: "));`,
      '  Serial.println(err, 6);',
      `  Serial.println(err < 0.001f ? F("OK") : F("${tr('VIRHE: verkko ei vastaa simulaatiota', 'ERROR: the network does not match the simulation')}"));`,
      `  // ${tr('TODO: alusta anturit ja moottorit', 'TODO: set up the sensors and motors')}`,
      '  rlStart = micros();',
      '  rlNext = rlStart;',
      '}',
      '',
      'void loop() {',
      '  unsigned long now = micros();',
      `  if ((long)(now - rlNext) < 0) return; // ${tr('ajetaan tasan', 'run exactly')} RL_HZ ${tr('kertaa sekunnissa', 'times per second')}`,
      '  rlNext += RL_PERIOD_US;',
      `  if ((long)(now - rlNext) > (long)RL_PERIOD_US) rlNext = now + RL_PERIOD_US; // ${tr('laskenta ei ehdi RL_HZ-tahtiin: ei yritetä kiriä (silloin robotti toimii hitaammin kuin simulaatiossa)', 'the brain cannot keep up with RL_HZ: do not try to catch up (the robot then runs slower than in the simulation)')}`,
      '  float t = (now - rlStart) * 1e-6f;',
      '  readSensors(t);',
      '  robolab_brain(rlIn, rlOut);',
      '  driveMotors();',
      '}',
      '',
    ];
    return { filename: `${base}_aivot.ino`, lang: 'c', code: sketch.join('\n') };
  }

  // Python / MicroPython (ESP32, Raspberry Pi Pico, Raspberry Pi, PC)
  const py = [
    ...head.map((l) => `# ${l}`),
    `# ${tr('Toimii MicroPythonissa (ESP32, Raspberry Pi Pico) ja tavallisessa Pythonissa (Raspberry Pi, PC).', 'Works in MicroPython (ESP32, Raspberry Pi Pico) and regular Python (Raspberry Pi, PC).')}`,
    '#',
    `# ${tr('Sisääntulot:', 'Inputs:')}`,
    ...inputDoc.map((l) => `#   ${l}`),
    `# ${tr('Ulostulot (kaikki välillä −1…1):', 'Outputs (all in −1…1):')}`,
    ...outputDoc.map((l) => `#   ${l}`),
    '',
    'import math',
    'import time',
    'from array import array',
    '',
    `HZ = ${info.hz}`,
    `LAYERS = (${o.layers.join(', ')})`,
    ...info.inputs.map((x, i) => `IN_${x.id} = ${i}`),
    '',
    `# ${tr('Painot kerroksittain: jokaiselle neuronille ensin painot, sitten bias.', 'Weights layer by layer: for each neuron first the weights, then the bias.')}`,
    "PARAMS = array('f', [",
    ...chunk(params.map(RS.pyf), 10).map((c) => '    ' + c.join(', ') + ','),
    '])',
    '',
    '',
    'def _tanh(x):',
    '    if x > 20.0:',
    '        return 1.0',
    '    if x < -20.0:',
    '        return -1.0',
    '    e = math.exp(2.0 * x)',
    '    return (e - 1.0) / (e + 1.0)',
    '',
    '',
    'def _clamp(x):',
    '    return -1.0 if x < -1.0 else (1.0 if x > 1.0 else x)',
    '',
    '',
    'def brain(inputs):',
    `    """${tr('Laskee aivojen ulostulon (lista, pituus LAYERS[-1]). Sama laskenta kuin simulaatiossa.', 'Computes the brain output (a list of length LAYERS[-1]). The same computation as in the simulation.')}"""`,
    '    x = inputs',
    '    k = 0',
    '    p = PARAMS',
    '    for l in range(1, len(LAYERS)):',
    '        n_in = LAYERS[l - 1]',
    '        y = []',
    '        for _ in range(LAYERS[l]):',
    '            s = 0.0',
    '            for j in range(n_in):',
    '                s += p[k] * x[j]',
    '                k += 1',
    '            s += p[k]',
    '            k += 1',
    '            y.append(_tanh(s))',
    '        x = y',
    '    return x',
    '',
    '',
    'def selftest():',
    `    """${tr('Vertaa laitteen laskemaa simulaation tulokseen. Palauttaa suurimman eron; alle 0.001 = OK.', 'Compares the device result to the simulation. Returns the largest difference; below 0.001 = OK.')}"""`,
    `    expected = (${expected.map(RS.pyf).join(', ')}${expected.length === 1 ? ',' : ''})`,
    '    out = brain([0.9 * math.sin(1.7 * i + 0.3) for i in range(LAYERS[0])])',
    '    return max(abs(a - b) for a, b in zip(out, expected))',
    '',
    '',
    `# ===== ${tr('Ohjaussilmukka: täytä read_sensors() ja drive_motors() (kohdat TODO)', 'Control loop: fill read_sensors() and drive_motors() (the TODO lines)')} =====`,
    '',
    'def read_sensors(t):',
    '    x = [0.0] * LAYERS[0]',
    ...info.inputs.map((x) => `    x[IN_${x.id}] = ${inputExpr(x, 'py')}${todo(x) ? '  #' + todo(x) : ''}`),
    '    return x',
    '',
    '',
    'def drive_motors(out):',
    ...info.outputs.flatMap((x, i) => x.mode === 'thrust'
      ? [`    # ${x.id} (${x.name}): ${x.how}`,
        `    ${x.id.toLowerCase()}_thrust = (_clamp(out[${i}]) + 1.0) * 0.5  # 0…1`,
        `    # ${tr('TODO: aseta moottorin nopeussäätimen (ESC) teho', 'TODO: set the motor speed controller (ESC) power to')} ${x.id.toLowerCase()}_thrust`]
      : x.mode === 'position'
      ? [`    # ${x.id} (${x.name}): ${x.how}`,
        `    ${x.id.toLowerCase()}_rad = ${RS.pyf(x.lo)} + (_clamp(out[${i}]) + 1.0) * 0.5 * ${RS.pyf(x.hi - x.lo)}`,
        `    # ${tr('TODO: käännä servo kulmaan', 'TODO: turn the servo to the angle')} ${x.id.toLowerCase()}_rad (${tr('asteina', 'in degrees')} math.degrees(${x.id.toLowerCase()}_rad))`]
      : [`    # ${x.id} (${x.name}): ${x.how}`,
        `    ${x.id.toLowerCase()}_speed = _clamp(out[${i}]) * ${RS.pyf(x.speed)}  # rad/s`,
        `    # ${tr('TODO: aja moottoria nopeudella', 'TODO: drive the motor at')} ${x.id.toLowerCase()}_speed`]),
    '    pass',
    '',
    '',
    'def _now():',
    '    try:',
    '        return time.ticks_ms() / 1000.0  # MicroPython',
    '    except AttributeError:',
    '        return time.monotonic()  # Python',
    '',
    '',
    'def main():',
    `    print("RoboLab ${tr('itsetesti, suurin ero', 'self-test, largest difference')}:", selftest())`,
    '    start = _now()',
    '    next_t = start',
    '    while True:',
    '        now = _now()',
    '        if now < next_t:',
    '            time.sleep(next_t - now)',
    '            continue',
    '        next_t += 1.0 / HZ',
    `        if now - next_t > 1.0 / HZ:  # ${tr('laskenta ei ehdi HZ-tahtiin: ei kiritä', 'the brain cannot keep up with HZ: do not catch up')}`,
    '            next_t = now',
    '        drive_motors(brain(read_sensors(now - start)))',
    '',
    '',
    'if __name__ == "__main__":',
    '    main()',
    '',
  ];
  return { filename: `${base}_aivot.py`, lang: 'python', code: py.join('\n') };
};
