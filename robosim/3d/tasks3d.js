// 3D-tehtävät eli palkkiofunktiot: function (s, m) { ...; return palkkio; }
export const TASKS3D = {
  forward: {
    name: tr('Liiku eteenpäin (+x)', 'Move forward (+x)'),
    code:
`// Palkitaan etenemisestä x-suuntaan, rangaistaan sivuttaisesta ajautumisesta.
// Pieni bonus jokaisesta askeleesta pystyssä, ettei eteenpäin syöksyminen kannata.
let r = (s.x - s.prevX) * 10 + 0.02;
r -= Math.abs(s.z - s.prevZ) * 3;
r -= 0.002 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  target: {
    name: tr('Mene kohteeseen', 'Reach the target'),
    code:
`// Lähesty kohdetta maan tasossa. Saavutettu kohde vaihtuu uuteen.
let r = (s.prevTargetDist - s.targetDist) * 10 + 0.02;
if (s.targetDist < 0.8) { r += 20; s.newTarget = true; }
r -= 0.002 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  walk: {
    name: tr('Kävele (askellus)', 'Walk (gait)'),
    code:
`// Kävely jaloilla: eteneminen palkitaan vain pystyssä, jalkojen vuorottelu palkitaan,
// ja ryömiminen, sivuttain ajautuminen ja turha energia maksavat. Sopii hämähäkille, kuusijalkaiselle ja Neuralle.
let r = (s.x - s.prevX) * 12 * Math.max(0, s.upright);
r -= Math.abs(s.z - s.prevZ) * 4;
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
  turn: {
    name: tr('Pyöri paikallaan', 'Spin in place'),
    code:
`// Palkitaan kääntymisestä vastapäivään pysyen paikallaan.
let r = s.yawRate * 0.05;
r -= Math.hypot(s.vx, s.vz) * 0.02;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  balance: {
    name: tr('Pysy pystyssä paikallaan', 'Stay upright in place'),
    code:
`let r = 0.05 * s.upright - 0.02 * Math.hypot(s.vx, s.vz) - 0.001 * s.energy;
if (s.fallen) { s.done = true; r -= 5; }
return r;`
  },
  fast: {
    name: tr('Juokse mahdollisimman nopeasti', 'Run as fast as possible'),
    code:
`// Nopeus mihin tahansa suuntaan maan tasossa.
let r = Math.hypot(s.vx, s.vz) * 0.05;
if (s.fallen) r -= 0.05;
return r;`
  }
};

export const TASK_HELP3D = LANG === 'en' ? `Available values (s):
  s.t, s.dt                   time since episode start, step length (s)
  s.x, s.y, s.z               main body position (m), y = up
  s.prevX, s.prevY, s.prevZ   position on the previous step
  s.startX, s.startY, s.startZ start position
  s.vx, s.vy, s.vz            velocity (m/s)
  s.yaw, s.yawRate            heading in the ground plane (rad) and turn rate
  s.upright                   uprightness: 1 = upright, -1 = upside down
  s.energy                    motor usage on this step
  s.actions                   motor commands [-1..1]
  s.footContacts              how many "feet" touch the ground
  s.fallen                    has the robot fallen (by the model's rules)
  s.target                    current target {x, y, z}
  s.targetDist                horizontal distance to the target, s.prevTargetDist previous
  s.last                      true on the last step of the episode
You can set:
  s.done = true               ends this robot's episode
  s.newTarget = true          moves on to the next target
Memory m: a free object kept for the episode.
Return the reward as a number.` : `Käytettävissä olevat arvot (s):
  s.t, s.dt                   aika episodin alusta, askeleen pituus (s)
  s.x, s.y, s.z               päärungon sijainti (m), y = ylös
  s.prevX, s.prevY, s.prevZ   sijainti edellisellä askeleella
  s.startX, s.startY, s.startZ aloitussijainti
  s.vx, s.vy, s.vz            nopeus (m/s)
  s.yaw, s.yawRate            suunta maan tasossa (rad) ja kääntymisnopeus
  s.upright                   pystyasento: 1 = pysty, -1 = ylösalaisin
  s.energy                    moottorien käyttö tällä askeleella
  s.actions                   moottorikomennot [-1..1]
  s.footContacts              montako "jalkaa" koskee maahan
  s.fallen                    onko robotti kaatunut (mallin sääntöjen mukaan)
  s.target                    nykyinen kohde {x, y, z}
  s.targetDist                vaakaetäisyys kohteeseen, s.prevTargetDist edellinen
  s.last                      true episodin viimeisellä askeleella
Asetettavat:
  s.done = true               lopettaa tämän robotin episodin
  s.newTarget = true          siirtää seuraavaan kohteeseen
Muisti m: vapaa objekti, säilyy episodin ajan.
Palauta palkkio numerona.`;
