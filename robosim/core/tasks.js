// Tehtävät eli palkkiofunktiot. Jokainen tehtävä on JavaScript-funktion runko,
// jota kutsutaan joka fysiikka-askeleella: function (s, m) { ...; return palkkio; }
// s = robotin tila (ks. RS.TASK_HELP), m = robotin oma muisti episodin ajan.
RS.TASKS = {
  forward: {
    name: tr('Liiku eteenpäin', 'Move forward'),
    code:
`// Palkitaan oikealle (+x) etenemisestä, rangaistaan kaatumisesta.
let r = (s.x - s.prevX) * 10;
r -= 0.002 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  backward: {
    name: tr('Liiku taaksepäin', 'Move backward'),
    code:
`// Palkitaan vasemmalle (-x) etenemisestä.
let r = (s.prevX - s.x) * 10;
r -= 0.002 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  walk: {
    name: tr('Kävele (askellus)', 'Walk (gait)'),
    code:
`// Kävely jaloilla: eteneminen palkitaan vain pystyssä, jalkojen vuorottelu palkitaan,
// ja ryömiminen sekä turha energia maksavat. Sopii Neuralle, kaksijalkaiselle ja madolle.
let r = (s.x - s.prevX) * 12 * Math.max(0, s.upright);
r += 0.015 * s.upright;
m.feet ??= s.footContacts;
if (s.footContacts !== m.feet) r += 0.01;   // askel: maakosketusten määrä vaihtui
m.feet = s.footContacts;
if (s.footContacts === 0) r -= 0.01;          // hyppiminen ei ole kävelyä
if (s.y < s.startY - 0.35) r -= 0.03;         // ryömiminen vatsallaan
r -= 0.003 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  target: {
    name: tr('Mene kohteeseen', 'Reach the target'),
    code:
`// Lähesty kohdetta. Kun kohde saavutetaan, tulee uusi kohde.
let r = (s.prevTargetDist - s.targetDist) * 10;
if (s.targetDist < 0.4) { r += 20; s.newTarget = true; }
r -= 0.002 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  balance: {
    name: tr('Pysy pystyssä paikallaan', 'Stay upright in place'),
    code:
`// Palkitaan pystyasennosta ja paikallaan pysymisestä.
let r = 0.05 * s.upright - 0.02 * Math.abs(s.vx) - 0.001 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  jump: {
    name: tr('Hyppää korkealle', 'Jump high'),
    code:
`// Lopussa palkitaan korkeimmasta saavutetusta korkeudesta.
m.maxY = Math.max(m.maxY ?? s.y, s.y);
if (s.fallen) s.done = true;
if (s.done || s.last) return (m.maxY - s.startY) * 20;
return 0;`
  },
  fast: {
    name: tr('Juokse mahdollisimman nopeasti', 'Run as fast as possible'),
    code:
`// Palkitaan nopeudesta eteenpäin, kaatuminen ei lopeta episodia.
let r = Math.max(0, s.vx) * 0.05;
if (s.fallen) r -= 0.05;
return r;`
  }
};

RS.TASK_HELP = LANG === 'en' ? `Available values (s):
  s.t, s.dt               time since episode start, step length (s)
  s.x, s.y                main body position (m)
  s.prevX, s.prevY        position on the previous step
  s.startX, s.startY      start position
  s.vx, s.vy              velocity (m/s)
  s.angle, s.angVel       angle (rad) and angular velocity
  s.upright               uprightness: 1 = upright, -1 = upside down
  s.energy                motor usage on this step
  s.actions               motor commands [-1..1]
  s.footContacts          how many "feet" touch the ground
  s.fallen                has the robot fallen (by the model's rules)
  s.target                current target {x, y}
  s.targetDist            distance to the target, s.prevTargetDist previous
  s.last                  true on the last step of the episode
You can set:
  s.done = true           ends this robot's episode
  s.newTarget = true      moves on to the next target
Memory m: a free object kept for the episode (e.g. m.maxY).
Return the reward as a number.` : `Käytettävissä olevat arvot (s):
  s.t, s.dt               aika episodin alusta, askeleen pituus (s)
  s.x, s.y                päärungon sijainti (m)
  s.prevX, s.prevY        sijainti edellisellä askeleella
  s.startX, s.startY      aloitussijainti
  s.vx, s.vy              nopeus (m/s)
  s.angle, s.angVel       kulma (rad) ja kulmanopeus
  s.upright               pystyasento: 1 = pysty, -1 = ylösalaisin
  s.energy                moottorien käyttö tällä askeleella
  s.actions               moottorikomennot [-1..1]
  s.footContacts          montako "jalkaa" koskee maahan
  s.fallen                onko robotti kaatunut (mallin sääntöjen mukaan)
  s.target                nykyinen kohde {x, y}
  s.targetDist            etäisyys kohteeseen, s.prevTargetDist edellinen
  s.last                  true episodin viimeisellä askeleella
Asetettavat:
  s.done = true           lopettaa tämän robotin episodin
  s.newTarget = true      siirtää seuraavaan kohteeseen
Muisti m: vapaa objekti, säilyy episodin ajan (esim. m.maxY).
Palauta palkkio numerona.`;

RS.compileTask = function (code) {
  // eslint-disable-next-line no-new-func
  return new Function('s', 'm', code);
};
