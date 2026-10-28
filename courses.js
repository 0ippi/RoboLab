"use strict";

/* Kurssit: vaiheittaiset oppitunnit, jotka kulkevat oikeissa työkaluissa. Jokaisessa vaiheessa on lyhyt
   teoria, tehtävät (tarkistetaan automaattisesti työkalun tilasta tai kuitataan itse), vihjeet ja
   ymmärrystä mittaava kysymys. Tekoälyavustaja toimii opettajana: se näkee, missä vaiheessa ollaan.
   Jokainen kurssi tehdään omaan projektiinsa, jotta käyttäjän muut työt pysyvät ennallaan. */
const Courses = (() => {
  const KEY = "robolab-courses-v1";
  const D = Math.PI / 180;

  /* ===== Apufunktiot tarkistuksiin ===== */
  const tools = () => activeProject().tools;
  const arm = () => window.loadArmModel();
  const tipOf = (a) => { const T = Kin.fk(a.chain, a.q).at(-1); return [T[0][3], T[1][3], T[2][3]]; };
  const revolute = (chain) => (chain?.joints || []).filter((j) => j.type === "R").length;
  // Onko projektin tallennettu tila muuttunut vaiheen alusta (polku: funktio, joka poimii vertailtavan osan)
  // def = työkalun oletustila: tallentamaton tila tulkitaan oletukseksi, jottei minkä tahansa muun kentän
  // tallennus (joka kirjoittaa myös oletusarvot) näytä tämän arvon muuttumiselta
  const changed = (ctx, key, pick = (x) => x, def = undefined) =>
    JSON.stringify(pick(tools()[key] ?? def) ?? null) !== JSON.stringify(pick(ctx.base.tools[key] ?? def) ?? null);
  const pid = () => window.pidResult?.();
  // Askelvasteen todellinen huippu suhteessa asetusarvoon (työkalun Ylitys-luku mittaa loppuarvosta, joka on
  // lyhyessä simulaatiossa usein vielä kesken). 0,1 = 10 % yli asetusarvon.
  const pidPeak = (r) => Math.max(...Calc.simulatePid(r.s).y) / r.s.setpoint - 1;
  // PID-vaiheiden kesto: massan asennon pitää ehtiä asettua, jotta ylitys ja pysyvä virhe näkyvät oikein
  const pidDuration = (T) => () => { const s = activeProject().tools.pid; if (!s || (s.T ?? 3) < T) saveToolState("pid", { ...(s || {}), T }, { undo: false }); };
  // Reittisuunnittelu: lyhimmän reitin pituus kartan aloitus- ja maalipisteen välillä (Infinity, jos reittiä ei ole)
  const pathLen = (m, occ) => {
    const r = Plan.gridSearch({ w: m.w, h: m.h, occ: Uint8Array.from(occ, (ch) => (ch === "1" ? 1 : 0)) }, m.start, m.goal);
    return r.found ? r.cost : Infinity;
  };
  const rotEuler = () => {
    const q = tools().rot?.q || [0, 0, 0, 1];
    return Kin.matToEuler(Kin.quatToMat(q), "ZYX", "intrinsic");
  };
  const near = (a, b, tol) => Math.abs(a - b) < tol;
  // Indeksit 0..n-1 satunnaisessa järjestyksessä (Fisher–Yates): kysymysten vaihtoehdot
  const shuffled = (n) => {
    const a = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // Uusi maaliin pääsy vaiheen alun jälkeen. Laskuri nollautuu sivun latauksessa, joten pohja-arvo seuraa sitä.
  const newArrival = (ctx) => {
    const n = window.sim2dStatus?.()?.arrivals || 0;
    if (n < ctx.base.arrivals) ctx.base.arrivals = n;
    return n > ctx.base.arrivals;
  };
  // Käyttäjän toiminnot työkalussa (napit, valinnat, liukusäätimet, vedot) kirjataan muistiin, jotta myös
  // tehtävät kuten "paina Toista" tai "käännä kuvaa vetämällä" huomataan ilman Tein sen -nappia.
  const acts = [];
  ["click", "input", "change", "pointerdown"].forEach((type) => document.addEventListener(type, (e) => {
    const el = e.target instanceof Element ? e.target : null;
    if (!el || !el.closest("#content")) return;
    acts.push({ type, el, t: Date.now() });
    if (acts.length > 500) acts.splice(0, 100);
  }, true));
  // Onko vaiheen alun jälkeen tehty toiminto, jonka kohde vastaa valitsinta (types: "click" tai lista)
  const did = (ctx, types, sel) => acts.some((a) => a.t >= ctx.t0 && [].concat(types).includes(a.type) && !!a.el.closest(sel));
  const builder = () => window.builderStatus?.();
  // 2D-rakentajan malli ja sen moottoroidut pyörät (pyörivä nivel ilman rajoja, lapsiosa pyöreä)
  const build2d = () => tools().build2d?.model;
  const wheelsOf = (m) => (m?.joints || []).filter((j) => j.motor !== false && (j.lower == null || j.upper == null))
    .map((j) => m.bodies.find((b) => b.id === j.b)).filter((b) => b?.shapes?.some((s) => s.type === "sphere" || s.type === "cylinder"));
  // Fysiikkatestin ajomatka metreinä testin alusta: far = kauimmainen kohta, back = paluu siitä takaisin päin.
  // Uusi testi (↺ Alusta) aloittaa mittauksen alusta.
  const driven = (c) => {
    const b = builder();
    if (!b?.testing || b.x == null) return null;
    if (c.mem.run !== b.run) { c.mem.run = b.run; c.mem.far = b.x0; }
    if (Math.abs(b.x - b.x0) > Math.abs(c.mem.far - b.x0)) c.mem.far = b.x;
    return { far: c.mem.far - b.x0, back: Math.abs(c.mem.far - b.x) };
  };
  // Neuroverkkosimulaation sukupolvet tehtävän alusta (aivojen nollaus pienentää laskuria: silloin uusi pohja)
  const gensSince = (c, key) => { const g = tools()[key + "Stats"]?.generation || 0; if (c.mem.g0 == null || g < c.mem.g0) c.mem.g0 = g; return g - c.mem.g0; };
  // Oma tavoite, jossa palkitaan vain vauhdista (suunta puuttuu)
  const speedOnly = () => { const s = tools().nn2d, g = s?.goal; return s?.taskKey === "custom" && !!g?.speed?.on && !["move", "target", "upright", "jump", "still"].some((k) => g[k]?.on); };
  const usesTarget2d = () => { const s = tools().nn2d; return s?.taskKey === "target" || (s?.taskKey === "custom" && !!s.goal?.target?.on); };
  // Mobiilirobotti 2D:n näppäinohjauksella käännytty kulma vaiheen alusta (key: "spin" paikallaan, "arc" kaarella).
  // Laskuri nollautuu sivun latauksessa, joten pohja-arvo seuraa sitä.
  const turnedSince = (c, key) => {
    const n = window.sim2dStatus?.()?.[key] || 0;
    if (c.mem[key] == null || n < c.mem[key]) c.mem[key] = n;
    return n - c.mem[key];
  };

  /* ===== Kurssit ===== */
  const COURSES = [
    {
      id: "arm", icon: "arm", minutes: 30, level: tr("Keskitaso", "Intermediate"),
      title: tr("Ensimmäinen robottikäsi", "Your first robot arm"),
      desc: tr("Suunnittele robottikäsivarsi alusta loppuun: nivelet, kinematiikka, liike ja moottorit.", "Design a robot arm from start to finish: joints, kinematics, motion and motors."),
      outcomes: [tr("Ymmärrät nivelet, linkit ja suoran kinematiikan", "Understand joints, links and forward kinematics"), tr("Osaat kuvata käsivarren DH-parametreilla", "Can describe an arm with DH parameters"),
        tr("Tiedät, miten käänteiskinematiikka ja singulariteetti toimivat", "Know how inverse kinematics and singularities work"), tr("Osaat mitoittaa nivelen moottorin", "Can size a joint motor")],
      steps: [
        {
          id: "fk", tool: "fk", title: tr("Nivelet ja suora kinematiikka", "Joints and forward kinematics"),
          teach: tr("Robottikäsivarsi koostuu **linkeistä** (jäykät osat) ja **nivelistä**, jotka liikuttavat niitä. Kiertyvä nivel kääntyy kulman verran, liukuva nivel liikkuu suoraan.\n\n**Suora kinematiikka** vastaa kysymykseen: *kun tiedän nivelkulmat, missä työkalu on?* Se lasketaan ketjuttamalla jokaisen nivelen siirto ja kierto peräkkäin.\n\nAloitetaan yksinkertaisella kaksinivelisellä tasokädellä.",
            "A robot arm is made of **links** (rigid parts) and **joints** that move them. A revolute joint turns by an angle, a prismatic joint slides in a straight line.\n\n**Forward kinematics** answers: *if I know the joint angles, where is the tool?* It is computed by chaining each joint's translation and rotation in turn.\n\nWe start with a simple two-joint planar arm."),
          tasks: [
            { id: "q1", text: tr("Liikuta q1-liukusäädintä ja katso, miten koko käsi kääntyy", "Move the q1 slider and watch the whole arm turn"), check: (c) => !near(arm().q[0], c.base.q[0], 1e-6) },
            { id: "q2", text: tr("Liikuta q2:ta — nyt kääntyy vain kyynärvarsi", "Move q2 — now only the forearm turns"), check: (c) => !near(arm().q[1], c.base.q[1], 1e-6) },
            { id: "neg", text: tr("Vie työkalun kärki taakse niin, että sen X-koordinaatti on negatiivinen (Työkalun asento -kortti)", "Move the tool tip backwards so that its X coordinate is negative (Tool pose card)"), check: () => tipOf(arm())[0] < -0.02 },
          ],
          hints: [tr("Liukusäätimet ovat Nivelet-kortissa (kapealla näytöllä 3D-näkymän alla). Työkalun sijainti näkyy Työkalun asento -kortissa.", "The sliders are in the Joints card (below the 3D view on a narrow screen). The tool position is shown in the Tool pose card."),
            tr("X tulee negatiiviseksi, kun käsi osoittaa taaksepäin (näkymässä vasemmalle): kokeile q1 = 150°.", "X becomes negative when the arm points backwards (to the left in the view): try q1 = 150°.")],
          quiz: { q: tr("Miksi kyynärvarsi liikkuu, kun muutat q1:tä, vaikka q2 pysyy samana?", "Why does the forearm move when you change q1, even though q2 stays the same?"),
            options: [tr("Koska jokainen nivel liikuttaa kaikkea sen jälkeen tulevaa", "Because each joint moves everything that comes after it"), tr("Koska q2 muuttuu automaattisesti samalla", "Because q2 changes automatically too"), tr("Koska työkalu pysyy aina paikallaan", "Because the tool always stays in place")],
            correct: 0, explain: tr("Nivelet muodostavat ketjun. Olkanivelen kierto kääntää koko ketjun sen jälkeen — siksi suorassa kinematiikassa muunnokset kerrotaan peräkkäin.", "Joints form a chain. Turning the shoulder rotates the whole chain after it — which is why forward kinematics multiplies the transforms in sequence.") },
        },
        {
          id: "dh", tool: "dh", title: tr("Oma käsivarsi DH-taulukolla", "Your own arm with a DH table"),
          teach: tr("Teollisuudessa käsivarret kuvataan **DH-parametreilla** (Denavit–Hartenberg). Jokainen rivi kuvaa yhden nivelen neljällä luvulla:\n\n- **θ** — kierto z-akselin ympäri (kiertyvän nivelen kulma)\n- **d** — siirto z-akselia pitkin (esim. kannan korkeus)\n- **a** — linkin pituus x-akselia pitkin\n- **α** — linkin kiertymä x-akselin ympäri\n\nKun jonkin nivelen α ei ole 0, seuraavat nivelet kääntyvät eri tasossa — näin tasokädestä tulee kolmiulotteinen. Muutokset näkyvät heti myös muissa kinematiikkatyökaluissa.",
            "In industry, arms are described with **DH parameters** (Denavit–Hartenberg). Each row describes one joint with four numbers:\n\n- **θ** — rotation about z (a revolute joint's angle)\n- **d** — offset along z (e.g. base height)\n- **a** — link length along x\n- **α** — link twist about x\n\nWhen a joint's α is not 0, the following joints turn in another plane — that is how a planar arm becomes three-dimensional. Changes show up immediately in the other kinematics tools too."),
          tasks: [
            { id: "three", text: tr("Lisää käteen uusi nivel taulukon alla olevalla + Kiertyvä nivel -napilla", "Add a new joint to the arm with the + Revolute joint button below the table"),
              check: (c) => revolute(arm().chain) > (c.base.tools.arm?.chain ? revolute(c.base.tools.arm.chain) : 2) },
            { id: "spatial", text: tr("Tee kädestä kolmiulotteinen: kirjoita ensimmäisen rivin α-sarakkeeseen 90", "Make the arm three-dimensional: type 90 in the α column of the first row"),
              check: (c) => did(c, ["input", "change"], "#dh-table [data-k='alpha']") && arm().chain.joints.some((j) => j.type === "R" && Math.abs(Math.sin(j.alpha || 0)) > 0.5) },
            { id: "look", text: tr("Kokeile näkymän otsikkorivin Rautalanka- ja Varjostettu-nappeja ja käännä kuvaa vetämällä", "Try the Wireframe and Shaded buttons in the view header and rotate the view by dragging"),
              check: (c) => did(c, "click", "[data-render]") && did(c, "pointerdown", "canvas") },
          ],
          hints: [tr("+ Kiertyvä nivel -nappi on DH-taulukon alla. (Liukuva nivel liikkuu suoraan eikä käänny, joten se ei sovi tähän.)", "The + Revolute joint button is below the DH table. (A prismatic joint slides instead of turning, so it doesn't fit here.)"),
            tr("α kääntää seuraavan nivelen akselia. Hyvä alku: rivi 1: d = 0,1, a = 0, α = 90. Silloin seuraavan nivelen akseli kääntyy vaakatasoon: ensimmäinen nivel toimii kuin oikean robotin kanta, ja seuraavat nivelet nostavat ja laskevat kättä.", "α tilts the next joint's axis. A good start: row 1: d = 0.1, a = 0, α = 90. Then the next joint's axis becomes horizontal: the first joint acts like a real robot's base and the following joints raise and lower the arm.")],
          quiz: { q: tr("Mikä DH-parametri kertoo linkin pituuden?", "Which DH parameter is the link length?"), options: ["θ", "d", "a", "α"], correct: 2,
            explain: tr("a on etäisyys x-akselia pitkin eli linkin pituus. d on siirto z-akselia pitkin — esimerkiksi kannan korkeus.", "a is the distance along x, i.e. the link length. d is the offset along z — for example the base height.") },
        },
        {
          id: "ik", tool: "ik", title: tr("Käänteiskinematiikka", "Inverse kinematics"),
          teach: tr("**Käänteiskinematiikka** kääntää kysymyksen: *haluan työkalun tähän pisteeseen — mitkä nivelkulmat tarvitaan?* Se on vaikeampaa, koska ratkaisuja voi olla monta tai ei yhtään.\n\nTyökalu ratkaisee kulmat numeerisesti (DLS-menetelmä eli vaimennettu pienimmän neliösumman menetelmä): se parantaa arvausta pienin askelin, kunnes kärki osuu kohteeseen.\n\n**Singulariteetissa** käsi on täysin suorana tai taitettuna. Silloin pieni liike kohteessa vaatii valtavia nivelliikkeitä.",
            "**Inverse kinematics** flips the question: *I want the tool at this point — which joint angles do I need?* It is harder because there may be many solutions or none.\n\nThe tool solves the angles numerically (DLS, damped least squares): it improves a guess in small steps until the tip reaches the target.\n\nAt a **singularity** the arm is fully stretched or folded. Then a small target motion needs huge joint motions."),
          tasks: [
            { id: "drag", text: tr("Raahaa kohdetta tai sen X-, Y- tai Z-nuolta", "Drag the target or its X, Y or Z arrow"), check: (c) => {
              // Oletuskohde on käsivarren kärki vaiheen alussa: pelkkä muun asetuksen tallennus ei saa kuitata tehtävää
              const t = tools().ik?.target;
              if (!t) return false;
              const b = c.base.tools.ik?.target;
              if (b) return JSON.stringify(t) !== JSON.stringify(b);
              const a = arm(), p = tipOf({ ...a, q: c.base.q?.length === a.q.length ? c.base.q : a.q });
              return Math.hypot(t[0] - p[0], t[1] - p[1], (t[2] || 0) - p[2]) > 1e-3;
            } },
            { id: "far", text: tr("Vie kohde niin kauas, ettei käsi yllä siihen", "Move the target so far that the arm cannot reach it"), check: () => { const t = tools().ik?.target, a = arm(); if (!t) return false; const p = tipOf(a); return Math.hypot(p[0] - t[0], p[1] - t[1], Kin.isPlanar(a.chain) ? 0 : p[2] - t[2]) > 0.005; } },
            { id: "back", text: tr("Tuo kohde takaisin ulottuville", "Bring the target back within reach"), after: "far", check: () => { const t = tools().ik?.target, a = arm(); if (!t) return false; const p = tipOf(a); return Math.hypot(p[0] - t[0], p[1] - t[1], Kin.isPlanar(a.chain) ? 0 : p[2] - t[2]) < 0.001; } },
          ],
          hints: [tr("Nuolen raahaus liikuttaa kohdetta vain sen akselin suuntaan (punainen = X, vihreä = Y, sininen = Z); keskipallo liikkuu vaakatasossa.", "Dragging an arrow moves the target along that axis only (red = X, green = Y, blue = Z); the centre ball moves in the horizontal plane."),
            tr("Kun kohde on liian kaukana, käsi ojentuu suoraksi kohti sitä ja keltainen varoitus kertoo, kuinka paljon matkaa jää.", "When the target is too far, the arm stretches straight towards it and a yellow warning shows the remaining distance.")],
          quiz: { q: tr("Mitä singulariteetti tarkoittaa?", "What is a singularity?"),
            options: [tr("Asentoa, jossa pieni liike kohteessa vaatii valtavia nivelliikkeitä", "A pose where a small target motion needs huge joint motions"), tr("Nivelen suurinta sallittua kulmaa", "A joint's largest allowed angle"), tr("Tilannetta, jossa kohde on lattian alla", "A situation where the target is below the floor")], correct: 0,
            explain: tr("Kun käsi on suorana, kärki ei voi liikkua käden suuntaan lainkaan — yksi vapausaste katoaa. Ratkaisija voi silloin heittää kulmia rajusti, joten oikeat robotit välttävät näitä asentoja.", "When the arm is straight, the tip cannot move along the arm at all — one degree of freedom is lost. The solver may then swing the angles wildly, so real robots avoid these poses.") },
        },
        {
          id: "traj", tool: "traj", title: tr("Sileä liike asennosta toiseen", "Smooth motion between poses"),
          teach: tr("Robotti ei voi hypätä asennosta toiseen: nopeuden ja kiihtyvyyden pitää pysyä rajoissa. **Liikeprofiili** kertoo, miten nopeus muuttuu liikkeen aikana.\n\n- **Trapetsi**: kiihdytys, vakionopeus, jarrutus — nopein annetuilla rajoilla, mutta kiihtyvyys muuttuu hyppäyksellisesti, jolloin *nykäys* (kiihtyvyyden muutosnopeus) on hetkellisesti valtava.\n- **S-käyrä**: rajoittaa myös nykäystä, joten liike on pehmeä ja tärinää on vähemmän.\n\nKäsivarren kaikki nivelet ajoitetaan niin, että ne lähtevät ja pysähtyvät yhtä aikaa.",
            "A robot cannot jump between poses: velocity and acceleration must stay within limits. A **motion profile** says how velocity changes during the move.\n\n- **Trapezoid**: accelerate, cruise, brake — fastest for given limits, but acceleration jumps, so the *jerk* (rate of change of acceleration) spikes.\n- **S-curve**: also limits jerk, so the motion is smooth with less vibration.\n\nAll joints of the arm are timed to start and stop together."),
          tasks: [
            { id: "arm", text: tr("Valitse 'Mitä liikutetaan': Robottikäsivarsi", "Choose 'What moves': Robot arm"), check: () => tools().traj?.mode === "arm" },
            { id: "long", text: tr("Tee liikkeestä pidempi: kirjoita Nivelet: alku → loppu -kohdassa q1:n loppukulmaksi vähintään 90° enemmän kuin alkukulma. Nyt trapetsissa näkyy vakionopeuden vaihe", "Make the move longer: under Joints: start → end, set q1's end angle at least 90° above its start angle. Now the trapezoid shows a constant-speed phase"), after: "arm",
              check: () => { const s = tools().traj; return s?.mode === "arm" && Math.abs((s.armEnd?.[0] ?? 0) - (s.armStart?.[0] ?? 0)) >= 85 * D; } },
            { id: "s", text: tr("Vaihda profiiliksi S-käyrä ja vertaa kiihtyvyyskuvaajaa trapetsiin", "Switch the profile to S-curve and compare the acceleration plot with the trapezoid"), after: "long", check: () => tools().traj?.profile === "scurve" },
            { id: "play", text: tr("Paina Käsivarsi-kortin ▶ Toista ja katso liike", "Press ▶ Play in the Arm card and watch the motion"), after: "s", check: (c) => did(c, "click", "#tr-play") },
          ],
          hints: [tr("Alkuasento tulee käsivartesi nykyisestä asennosta, ja loppu on aluksi vain noin 34° siitä. Niin lyhyessä liikkeessä nivel ei ehdi huippunopeuteen, joten trapetsi näyttää kolmiolta.", "The start pose comes from your arm's current pose and the end is at first only about 34° from it. In such a short move the joint never reaches top speed, so the trapezoid looks like a triangle."),
            tr("Esimerkiksi jos q1:n alku on 30°, kirjoita loppukulmaksi 120°.", "For example, if q1 starts at 30°, set its end to 120°.")],
          quiz: { q: tr("Miksi teollisuusrobotit käyttävät usein S-käyrää trapetsin sijaan?", "Why do industrial robots often use an S-curve instead of a trapezoid?"),
            options: [tr("Kiihtyvyys muuttuu pehmeästi, joten tärinää ja kulumista on vähemmän", "Acceleration changes smoothly, so there is less vibration and wear"), tr("S-käyrä on aina nopein", "The S-curve is always fastest"), tr("S-käyrä ei tarvitse nopeusrajaa", "The S-curve needs no velocity limit")], correct: 0,
            explain: tr("S-käyrä on hieman hitaampi kuin trapetsi, mutta äkilliset kiihtyvyyden muutokset herättävät mekaniikan värähtelemään. Pehmeä liike on tarkempi ja säästää laitetta.", "The S-curve is slightly slower than the trapezoid, but sudden acceleration changes make the mechanics vibrate. Smooth motion is more precise and spares the hardware.") },
        },
        {
          id: "motor", tool: "motor", title: tr("Riittääkö moottori?", "Is the motor strong enough?"),
          teach: tr("Pahin hetki nivelelle on, kun varsi on **vaakasuorassa**: painovoiman vipuvarsi on silloin pisin. Momentti = voima × vipuvarsi, eli kärjen kuorma rasittaa niveltä sitä enemmän, mitä pidempi varsi on.\n\nMoottorin **jumimomentti** on suurin momentti, jonka se antaa juuri ennen pysähtymistä — se ei kestä sitä jatkuvasti. Nyrkkisääntö: jatkuva kuorma enintään **~30 %** jumimomentista.\n\n**Välityssuhde** kasvattaa momenttia ja pienentää nopeutta samassa suhteessa.",
            "The worst moment for a joint is when the arm is **horizontal**: gravity's lever arm is then longest. Torque = force × lever arm, so a payload at the tip needs more torque the longer the arm is.\n\nA motor's **stall torque** is the largest torque it gives just before stopping — it cannot sustain it. Rule of thumb: keep the continuous load below **~30 %** of stall torque.\n\nA **gear ratio** multiplies torque and divides speed by the same factor."),
          tasks: [
            { id: "servo", text: tr("Valitse työkalun Esimerkit-valikosta Käsivarren olkanivel, MG996R-servo. Työkalu vaihtuu nivelen mitoitukseen", "Choose Arm shoulder joint, MG996R servo from the tool's Examples menu. The tool switches to sizing a joint"),
              check: () => tools().motor?.kind === "joint" && (tools().motor?.stallTorque ?? 0) >= 0.5 },
            { id: "len", text: tr("Paina Pituus käsivarsimallista -nappia: varren pituus haetaan omasta käsivarrestasi", "Press Length from arm model: the arm length is taken from your own arm"), after: "servo", check: () => !!tools().motor?.jFromArm },
            { id: "ratio", text: tr("Säädä Lisävälityssuhde-kenttää, kunnes Pitokuorma on alle 30 % ja työkalu sanoo: Moottori riittää tähän niveleen", "Adjust the Extra gear ratio field until the Holding load is below 30 % and the tool says: The motor is sufficient for this joint"), after: "len",
              check: () => { const r = window.motorJointResult?.(); return !!r && r.holdLoad <= 0.3 && r.canMove && r.speedOk; } },
          ],
          hints: [tr("Varoitus ehdottaa sopivaa välityssuhdetta (esim. ”Kokeile välityssuhdetta noin 1,9”). Kirjoita se Lisävälityssuhde-kenttään.", "The warning suggests a suitable gear ratio (e.g. “Try a gear ratio of about 1.9”). Type it into the Extra gear ratio field."),
            tr("Suurempi välitys antaa enemmän momenttia mutta hidastaa niveltä. Jos tulee varoitus, ettei nivel ehdi haluttuun nopeuteen, välitys on liian suuri.", "A higher ratio gives more torque but slows the joint down. If a warning says the joint can't reach the desired speed, the ratio is too high.")],
          quiz: { q: tr("Mitä välityssuhteen kasvattaminen 2:sta 4:ään tekee?", "What does raising the gear ratio from 2 to 4 do?"),
            options: [tr("Tuplaa momentin ja puolittaa nopeuden", "Doubles the torque and halves the speed"), tr("Tuplaa sekä nopeuden että momentin", "Doubles both speed and torque"), tr("Ei vaikuta momenttiin", "Has no effect on torque")], correct: 0,
            explain: tr("Teho (momentti × kulmanopeus) pysyy samana häviöitä lukuun ottamatta, joten momentin kasvu maksetaan nopeudella.", "Power (torque × angular speed) stays the same apart from losses, so the extra torque is paid for with speed.") },
        },
        {
          id: "wrap", tool: "ik", title: tr("Kertaus omin sanoin", "Recap in your own words"),
          teach: tr("Hienoa — olet suunnitellut käsivarren, ratkaissut sen liikkeet ja mitoittanut moottorin. Oppiminen vahvistuu, kun selität asian itse.", "Great — you have designed an arm, solved its motion and sized a motor. Learning sticks when you explain it yourself."),
          reflect: { q: tr("Selitä omin sanoin: mitä eroa on suoralla ja käänteisellä kinematiikalla, ja miksi käänteiskinematiikka on vaikeampi?", "In your own words: what is the difference between forward and inverse kinematics, and why is inverse kinematics harder?"),
            model: tr("Suora kinematiikka laskee nivelkulmista työkalun asennon: tulos on aina yksikäsitteinen ja laskenta suoraviivaista (matriisit kerrotaan peräkkäin). Käänteiskinematiikka etsii nivelkulmat halutulle asennolle. Se on vaikeampaa, koska ratkaisuja voi olla useita (kyynärpää ylös/alas), ei yhtään (kohde ulottumattomissa) tai äärettömästi, ja yhtälöt ovat epälineaarisia — siksi käytetään usein iteratiivisia menetelmiä. Singulariteetin lähellä ratkaisu muuttuu epävakaaksi.",
              "Forward kinematics computes the tool pose from the joint angles: the result is always unique and the computation is straightforward (matrices multiplied in sequence). Inverse kinematics finds joint angles for a desired pose. It is harder because there may be several solutions (elbow up/down), none (target out of reach) or infinitely many, and the equations are nonlinear — so iterative methods are often used. Near a singularity the solution becomes unstable.") },
          tasks: [],
        },
      ],
    },
    {
      id: "pid", icon: "pid", minutes: 25, level: tr("Aloittelija", "Beginner"),
      title: tr("Säätötekniikka: PID-säädin", "Control basics: the PID controller"),
      desc: tr("Opi, miksi robotit tarvitsevat säätöä ja miten P-, I- ja D-termit vaikuttavat — kokeilemalla.", "Learn why robots need feedback control and what the P, I and D terms do — by experimenting."),
      outcomes: [tr("Ymmärrät takaisinkytketyn säätöpiirin", "Understand the feedback control loop"), tr("Tiedät, mitä P, I ja D tekevät", "Know what P, I and D do"), tr("Tunnistat epästabiilin säädön", "Can recognise an unstable loop"), tr("Ymmärrät, miten säädin torjuu kuormahäiriöt", "Understand how a controller rejects load disturbances")],
      steps: [
        {
          id: "p", tool: "pid", title: tr("Säätöpiiri ja P-termi", "The loop and the P term"),
          teach: tr("Säädin vertaa jatkuvasti **asetusarvoa** (mitä halutaan) ja **mittausta** (mitä on). Erotus on **virhe**, ja säädin laskee siitä ohjauksen — esimerkiksi moottorin jännitteen.\n\n**P-termi** antaa ohjausta suoraan verrannollisesti virheeseen: Kp × virhe. Suurempi Kp = nopeampi vaste.\n\nJärjestelmänä on DC-moottorin nopeus.",
            "A controller constantly compares the **setpoint** (what you want) with the **measurement** (what you have). The difference is the **error**, and the controller computes an output from it — for example a motor voltage.\n\nThe **P term** gives output directly proportional to the error: Kp × error. Higher Kp = faster response.\n\nThe system here is a DC motor's speed."),
          tasks: [
            { id: "ponly", text: tr("Aseta Ki = 0 ja Kd = 0 (pelkkä P-säädin)", "Set Ki = 0 and Kd = 0 (P-only controller)"), check: () => { const r = pid(); return r && r.s.ki === 0 && r.s.kd === 0; } },
            { id: "kp", text: tr("Kasvata Kp vähintään 5:een ja katso, miten vaste nopeutuu", "Raise Kp to at least 5 and watch the response speed up"), check: () => { const r = pid(); return r && r.s.ki === 0 && r.s.kp >= 5; } },
            { id: "sse", text: tr("Katso Pysyvä virhe -lukua: vaste ei koskaan saavuta asetusarvoa", "Look at the Steady-state error: the response never reaches the setpoint") },
          ],
          hints: [tr("Kp, Ki ja Kd ovat liukusäätimiä Säädin-kortin yläosassa. Voit myös kirjoittaa arvon kenttään.", "Kp, Ki and Kd are sliders at the top of the Controller card. You can also type a value in the field.")],
          quiz: { q: tr("Miksi pelkkä P-säädin jättää pysyvän virheen?", "Why does a P-only controller leave a steady-state error?"),
            options: [tr("Koska ohjaus on verrannollinen virheeseen: jos virhe olisi nolla, ohjauskin olisi nolla eikä moottori pysyisi käynnissä", "Because output is proportional to error: with zero error the output would be zero and the motor would not keep running"), tr("Koska Kp on aina liian pieni", "Because Kp is always too small"), tr("Koska simulaatio on liian lyhyt", "Because the simulation is too short")], correct: 0,
            explain: tr("Moottori tarvitsee jatkuvasti jännitettä pyöriäkseen. P-säädin antaa jännitettä vain, kun virhettä on, joten tasapaino syntyy pienen virheen kohdalle. Suurempi Kp pienentää virhettä, mutta ei poista sitä.", "The motor needs a constant voltage to keep spinning. A P controller only gives voltage when there is an error, so the balance settles at a small error. Higher Kp shrinks it but never removes it.") },
        },
        {
          id: "i", tool: "pid", title: tr("I-termi poistaa virheen", "The I term removes the error"),
          teach: tr("**I-termi** (integraali) laskee virhettä yhteen ajan yli. Niin kauan kuin pientäkin virhettä on, ohjaus kasvaa — kunnes virhe on nolla. Siksi I-termi poistaa pysyvän virheen.\n\nLiian suuri Ki kuitenkin kerää ohjausta liian nopeasti, mikä aiheuttaa ylitystä ja heiluntaa.",
            "The **I term** (integral) sums the error over time. As long as there is any error, the output keeps growing — until the error is zero. That is why the I term removes the steady-state error.\n\nToo large a Ki accumulates output too fast, which causes overshoot and oscillation."),
          tasks: [
            // Ki:n pitää muuttua vaiheen aikana: työkalun oletus (Ki = 4) poistaa virheen jo valmiiksi
            { id: "zero", text: tr("Lisää Ki ja saa Pysyvä virhe alle 2 %:iin", "Add Ki and get the Steady-state error below 2 %"),
              check: (c) => { const r = pid(); return r && r.s.ki > 0 && r.s.kp <= 20 && !r.unstable && Math.abs(r.m.sse) < 0.02 * Math.abs(r.s.setpoint) && changed(c, "pid", (s) => s?.ki, { ki: 4 }); } },
            { id: "big", text: tr("Laske Kp 2:een ja kokeile hyvin suurta Ki:tä (vähintään 20): katso ylitystä ja heiluntaa", "Lower Kp to 2 and try a very large Ki (at least 20): watch the overshoot and the swinging"), after: "zero",
              check: () => { const r = pid(); return r && r.s.ki >= 20 && r.s.kp <= 3; } },
          ],
          hints: [tr("Kun Kp on noin 5–6, kokeile Ki = 5–8. Mitä suurempi Kp, sitä suurempi Ki tarvitaan, jotta virhe ehtii hävitä kuvaajan aikana.", "With Kp around 5–6, try Ki = 5–8. The bigger Kp is, the bigger Ki you need for the error to vanish within the plot."),
            tr("Katso, miten vaste nousee hitaasti asetusarvoon asti. Pysyvä virhe -luku näyttää, paljonko lopussa vielä puuttuu.", "Watch the response creep all the way to the setpoint. The Steady-state error number shows how much is still missing at the end.")],
          quiz: { q: tr("Mitä liian suuri Ki aiheuttaa?", "What does too large a Ki cause?"),
            options: [tr("Ylitystä ja heiluntaa", "Overshoot and oscillation"), tr("Pysyvän virheen", "A steady-state error"), tr("Nopeamman vasteen ilman haittoja", "A faster response with no downsides")], correct: 0,
            explain: tr("Integraali 'muistaa' menneen virheen. Kun vaste saavuttaa asetusarvon, kertynyt integraali työntää sitä vielä yli, ja syntyy heiluntaa.", "The integral 'remembers' past error. When the response reaches the setpoint, the accumulated integral still pushes it past, causing oscillation.") },
        },
        {
          id: "d", tool: "pid", title: tr("D-termi vaimentaa", "The D term adds damping"),
          enter: pidDuration(10),
          teach: tr("Vaihdetaan järjestelmäksi **massa**: säädetään esimerkiksi kärryn asentoa. Massalla on hitautta: kun se kerran liikkuu, se jatkaa liikettään, ja pelkällä P-säädöllä se heiluu asetusarvon ympärillä.\n\n**D-termi** (derivaatta) reagoi muutosnopeuteen: se jarruttaa, kun vaste lähestyy nopeasti. Se toimii kuin iskunvaimennin.",
            "Let's switch the system to a **mass**: for example, controlling a cart's position. A mass has inertia: once moving, it keeps moving, and with P control alone it swings around the setpoint.\n\nThe **D term** (derivative) reacts to the rate of change: it brakes when the response approaches fast. It works like a shock absorber."),
          tasks: [
            { id: "mass", text: tr("Valitse Ohjattava järjestelmä -valikosta Massan asento (2. kertaluku) ja aseta Ki = 0. Katso, miten vaste heiluu", "Choose Mass position (2nd order) in the Controlled system menu and set Ki = 0. Watch the response swing"),
              check: () => { const r = pid(); return r?.s.plant === "mass" && r.s.ki === 0; } },
            { id: "pd", text: tr("Lisää Kd:tä, kunnes vaste nousee korkeintaan 10 % asetusarvon yli ja asettuu", "Add Kd until the response rises no more than 10 % above the setpoint and settles"), after: "mass",
              check: () => { const r = pid(); return r && r.s.plant === "mass" && r.s.ki === 0 && r.s.kd > 0 && !r.unstable && pidPeak(r) < 0.1 && Math.abs(r.m.sse) < 0.05 * r.s.setpoint; } },
          ],
          hints: [tr("Aseta Kp = 4 ja nosta Kd:tä askelin 0,5 → 1 → 2. Suuremmalla Kp:llä tarvitaan Kd ≈ 2,5–3.", "Set Kp = 4 and raise Kd in steps 0.5 → 1 → 2. With a larger Kp you need Kd ≈ 2.5–3."),
            tr("Simulaation kesto on tässä vaiheessa 10 s, jotta massa ehtii asettua kuvaajan aikana.", "The simulation duration is 10 s in this step so that the mass has time to settle within the plot.")],
          quiz: { q: tr("Mihin D-termi reagoi?", "What does the D term react to?"),
            options: [tr("Virheen muutosnopeuteen", "The rate of change of the error"), tr("Virheen suuruuteen", "The size of the error"), tr("Kertyneeseen virheeseen", "The accumulated error")], correct: 0,
            explain: tr("P reagoi nykyiseen virheeseen, I menneeseen (kertynyt) ja D tulevaan (muutoksen suunta). D hillitsee liikettä ennen kuin vaste ehtii ohi.", "P reacts to the present error, I to the past (accumulated) and D to the future (direction of change). D restrains the motion before the response overshoots.") },
        },
        {
          id: "unstable", tool: "pid", title: tr("Epästabiilius", "Instability"),
          enter: pidDuration(20),
          teach: tr("Väärin viritetty säädin voi tehdä järjestelmästä **epästabiilin**: värähtely kasvaa kasvamistaan, eikä vaste koskaan asetu. Oikeassa robotissa tämä tarkoittaa raivoisaa tärinää tai hallitsematonta liikettä.\n\nKokeile tehdä se tahallaan turvallisesti simulaatiossa.",
            "A badly tuned controller can make the system **unstable**: the oscillation keeps growing and the response never settles. On a real robot this means violent shaking or uncontrolled motion.\n\nTry causing it on purpose, safely in the simulation."),
          tasks: [
            { id: "break", text: tr("Tee massan säädöstä epästabiili: Kd = 0 ja suuri Ki (työkalu varoittaa: Säätö on epästabiili)", "Make the mass loop unstable: Kd = 0 and a large Ki (the tool warns: the loop is unstable)"),
              check: () => { const r = pid(); return !!r?.unstable && r.s.plant === "mass"; } },
            { id: "fix", text: tr("Korjaa se: vaste on stabiili, nousee korkeintaan 25 % yli asetusarvon ja asettuu asetusarvoon", "Fix it: the response is stable, rises no more than 25 % above the setpoint and settles at the setpoint"), after: "break",
              check: () => { const r = pid(); return r && r.s.plant === "mass" && !r.unstable && pidPeak(r) < 0.25 && Math.abs(r.m.sse) < 0.05 * r.s.setpoint; } },
          ],
          hints: [tr("Massalla PI-säätö ilman D:tä muuttuu helposti epästabiiliksi: kokeile Kp = 2, Ki = 4, Kd = 0.", "With a mass, PI control without D easily goes unstable: try Kp = 2, Ki = 4, Kd = 0."),
            tr("Korjaus: lisää Kd ja pienennä Ki selvästi. Esimerkiksi Kp = 4, Ki = 0,5 ja Kd = 3 antaa noin 10 % ylityksen (simulaation kesto on tässä vaiheessa 20 s).", "To fix it: add Kd and cut Ki clearly. For example Kp = 4, Ki = 0.5 and Kd = 3 gives about 10 % overshoot (the simulation runs for 20 s in this step).")],
          quiz: { q: tr("Mistä tunnistat epästabiilin säädön?", "How do you recognise an unstable loop?"),
            options: [tr("Värähtely kasvaa ajan myötä eikä vaste asetu", "The oscillation grows over time and never settles"), tr("Vaste on hidas", "The response is slow"), tr("Pysyvä virhe ei ole nolla", "The steady-state error is not zero")], correct: 0,
            explain: tr("Hidas vaste ja pysyvä virhe ovat huonoa viritystä, mutta stabiileja. Epästabiilissa piirissä virhe kasvaa rajatta.", "A slow response and a steady-state error are poor tuning, but stable. In an unstable loop the error grows without bound.") },
        },
        {
          id: "dist", tool: "pid", title: tr("Häiriöt", "Disturbances"),
          enter: pidDuration(20),
          teach: tr("Oikeassa maailmassa kuorma muuttuu: robotti nostaa esineen tai ajaa mäkeen. Tällainen **häiriö** vie vasteen pois asetusarvosta, ja säätimen tehtävä on palauttaa se.\n\nHäiriön asetukset ovat lisäsyötteissä. Simulaatio kestää tässä vaiheessa 20 s, joten häiriö kannattaa laittaa alkamaan vasta, kun vaste on asettunut.",
            "In the real world the load changes: the robot picks up an object or drives uphill. Such a **disturbance** pushes the response away from the setpoint, and the controller's job is to bring it back.\n\nThe disturbance settings are in the advanced inputs. The simulation runs for 20 s in this step, so start the disturbance only once the response has settled."),
          tasks: [
            { id: "add", text: tr("Lisää kuormahäiriö: Häiriön alkuhetki 10 s ja Häiriön suuruus −0,5", "Add a load disturbance: Disturbance start time 10 s and Disturbance magnitude −0.5"),
              check: () => { const r = pid(); return r && r.s.distMag !== 0 && r.s.distT > 0 && r.s.distT < r.s.T; } },
            { id: "withI", text: tr("Aseta Kp = 4, Ki = 1 ja Kd = 3 ja katso, miten vaste palaa asetusarvoon häiriön jälkeen", "Set Kp = 4, Ki = 1 and Kd = 3 and watch the response return to the setpoint after the disturbance"), after: "add",
              check: () => { const r = pid(); return r && r.s.distMag !== 0 && r.s.ki > 0 && !r.unstable; } },
            { id: "noi", text: tr("Aseta nyt Ki = 0: palaako vaste enää asetusarvoon?", "Now set Ki = 0: does the response still return to the setpoint?"), after: "withI", check: () => { const r = pid(); return r && r.s.distMag !== 0 && r.s.ki === 0; } },
          ],
          hints: [tr("Paina Säädin-kortin alareunasta Näytä lisäsyötteet. Häiriön alkuhetki ja Häiriön suuruus ovat aivan lopussa.", "Press Show advanced inputs at the bottom of the Controller card. Disturbance start time and Disturbance magnitude are at the very end.")],
          quiz: { q: tr("Mikä termi palauttaa vasteen tarkasti asetusarvoon pysyvän kuormahäiriön jälkeen?", "Which term brings the response exactly back to the setpoint after a constant load disturbance?"),
            options: ["P", "I", "D"], correct: 1,
            explain: tr("Pysyvä häiriö vaatii pysyvän lisäohjauksen. Vain integraali kasvattaa ohjausta niin kauan, että virhe on taas nolla.", "A constant disturbance needs a constant extra output. Only the integral keeps growing the output until the error is zero again.") },
        },
      ],
    },
    {
      id: "nav", icon: "path", minutes: 30, level: tr("Aloittelija", "Beginner"),
      title: tr("Mobiilirobotin navigointi", "Mobile robot navigation"),
      desc: tr("Kartat, reitinhaku, reitin seuraaminen, odometria ja kartoitus lidarilla — kuten robotti-imurissa.", "Maps, path planning, path following, odometry and lidar mapping — like in a robot vacuum."),
      outcomes: [tr("Ymmärrät ruudukkokartan ja A*-haun", "Understand grid maps and A* search"), tr("Osaat verrata reitinhakualgoritmeja", "Can compare path planning algorithms"), tr("Ymmärrät reitinseurannan ja odometrian virheen", "Understand path following and odometry error"), tr("Tiedät, miten robotti kartoittaa ympäristön", "Know how a robot maps its surroundings")],
      steps: [
        {
          id: "grid", tool: "path", title: tr("Kartta ja reitinhaku", "Maps and path search"),
          teach: tr("Robotti näkee maailman usein **ruudukkona**: jokainen solu on vapaa tai este. Reitinhaku etsii vapaiden solujen ketjun lähdöstä maaliin.\n\n**A*** tutkii ensin soluja, joissa kuljettu matka + arvio (*heuristiikka*) jäljellä olevasta matkasta on pienin. Siksi se löytää lyhimmän reitin tutkimalla vähemmän soluja kuin sokea haku.",
            "Robots often see the world as a **grid**: each cell is free or an obstacle. Path search finds a chain of free cells from start to goal.\n\n**A*** first explores the cells where the distance travelled plus an estimate (*heuristic*) of the remaining distance is smallest. That is why it finds the shortest path while exploring fewer cells than a blind search."),
          tasks: [
            { id: "wall", text: tr("Valitse Kartta-kortista Seinä ja piirrä hiirellä seinä nykyisen reitin poikki, niin että reitti joutuu kiertämään", "Choose Wall in the Map card and draw a wall across the current path so that the path has to go around"),
              // Reitin pitää oikeasti pidentyä (pelkkä kartan muutos, esim. Pyyhi tai Sokkelo, ei riitä)
              check: (c) => { const m = tools().map, b = c.base.tools.map || GridMap.defaultMap(); if (!m || m.occ === b.occ) return false;
                const now = pathLen(m, m.occ); return Number.isFinite(now) && now > pathLen(m, b.occ) + 1e-6; } },
            { id: "goal", text: tr("Valitse Maali ja klikkaa karttaa: maali siirtyy, ja reitti lasketaan uudelleen", "Choose Goal and click the map: the goal moves and the path is planned again"),
              check: (c) => did(c, "click", "#pt-brush [data-b='goal']") && changed(c, "map", (m) => m?.goal, GridMap.defaultMap()) },
            { id: "anim", text: tr("Paina ▶ Toista haku ja katso, miten A* etenee", "Press ▶ Play search and watch A* expand"), check: (c) => did(c, "click", "#pt-play") },
          ],
          hints: [tr("Kartta-kortin yläosassa valitaan, mitä hiiri piirtää: Seinä, Pyyhi, Lähtö tai Maali.", "At the top of the Map card you choose what the mouse paints: Wall, Erase, Start or Goal.")],
          quiz: { q: tr("Miksi A* tutkii yleensä vähemmän soluja kuin Dijkstra?", "Why does A* usually explore fewer cells than Dijkstra?"),
            options: [tr("Se käyttää arviota etäisyydestä maaliin ja suuntaa haun sinne", "It uses an estimate of the distance to the goal to steer the search"), tr("Se ei etsi lyhintä reittiä", "It doesn't look for the shortest path"), tr("Se ohittaa esteet", "It ignores obstacles")], correct: 0,
            explain: tr("Dijkstra laajenee tasaisesti joka suuntaan. A* lisää jokaisen solun kustannukseen arvion jäljellä olevasta matkasta, joten se laajenee ensisijaisesti maalia kohti — ja löytää silti saman lyhimmän reitin.", "Dijkstra expands evenly in every direction. A* adds an estimate of the remaining distance to each cell's cost, so it expands mainly towards the goal — and still finds the same shortest path.") },
        },
        {
          id: "compare", tool: "path", title: tr("Algoritmien vertailu", "Comparing algorithms"),
          teach: tr("Ruudukkohaut (A*, Dijkstra) ovat tarkkoja, mutta hidastuvat suurissa tiloissa. **RRT** kasvattaa satunnaista puuta jatkuvassa tilassa: se on nopea suurissa ja moniulotteisissa tiloissa (esim. robottikäsivarren nivelkulmat), mutta sen reitti ei ole lyhin.\n\nA* löytää lyhimmän reitin ruudukkoa pitkin (8 suuntaa). **RRT*** parantaa puuta ajan kanssa ja voi kulkea vinosti mihin suuntaan tahansa, joten se voi löytää hieman lyhyemmän reitin — mutta laskee paljon kauemmin. Vertailutaulukon RRT-riveillä Tutkittu tarkoittaa puun solmuja, ei soluja.",
            "Grid searches (A*, Dijkstra) are exact but slow down in large spaces. **RRT** grows a random tree in continuous space: it is fast in large and high-dimensional spaces (e.g. a robot arm's joint angles), but its path is not the shortest.\n\nA* finds the shortest path along the grid (8 directions). **RRT*** improves its tree over time and can move at any angle, so it may find a slightly shorter path — but it computes for much longer. On the RRT rows of the comparison table, Explored means tree nodes, not cells."),
          tasks: [
            { id: "rrt", text: tr("Valitse algoritmiksi RRT ja katso, miltä reitti näyttää", "Choose RRT as the algorithm and look at its path"), check: () => tools().path?.algo === "rrt" },
            { id: "cmp", text: tr("Paina Vertaile kaikkia ja tutki taulukkoa", "Press Compare all and study the table"), check: (c) => did(c, "click", "#pt-compare") },
          ],
          hints: [tr("Vertailu-kortti on ruudukon alla. Katso sarakkeita Pituus ja Tutkittu.", "The Comparison card is below the grid. Look at the Length and Explored columns.")],
          quiz: { q: tr("Mikä on RRT:n suurin heikkous verrattuna A*:iin ruudukossa?", "What is RRT's main weakness compared to A* on a grid?"),
            options: [tr("Reitti on mutkikkaampi eikä lyhin", "The path is wigglier and not the shortest"), tr("Se ei löydä reittiä koskaan", "It never finds a path"), tr("Se toimii vain ilman esteitä", "It only works without obstacles")], correct: 0,
            explain: tr("RRT löytää reitin nopeasti, mutta satunnaisuuden vuoksi reitti on mutkikas. RRT* parantaa reittiä ajan kanssa, ja käytännössä reitti usein vielä silotellaan jälkikäteen.", "RRT finds a path fast, but randomness makes it wiggly. RRT* improves the path over time, and in practice the path is often smoothed afterwards.") },
        },
        {
          id: "drive", tool: "sim2d", title: tr("Robotti ajaa reitin", "The robot drives the path"),
          // Ensimmäisessä vaiheessa piirretyt seinät voivat tehdä käytävistä liian kapeita robotille
          enter: () => saveToolState("map", GridMap.defaultMap(), { undo: false }),
          teach: tr("Reitti on vasta suunnitelma: robotin pitää myös **seurata** sitä. **Pure Pursuit** -ohjain katsoo reitillä pisteen *katseluetäisyyden* päähän ja ohjaa sitä kohti — kuin ihminen, joka katsoo autolla ajaessaan vähän eteenpäin.\n\nReittiä suunnitellessa esteitä 'paisutetaan' robotin säteellä, jotta robotti mahtuu kulkemaan.",
            "A path is only a plan: the robot must also **follow** it. The **Pure Pursuit** controller looks at a point one *lookahead distance* ahead on the path and steers towards it — like a driver looking a little ahead.\n\nWhen planning, obstacles are 'inflated' by the robot's radius so that the robot fits through."),
          tasks: [
            { id: "goal", text: tr("Paina Ohjaus-kortin Aja maaliin ja odota, että robotti on perillä", "Press Drive to goal in the Control card and wait until the robot arrives"), check: newArrival },
            { id: "la", text: tr("Aja maaliin kahdesti eri Katseluetäisyys-arvoilla: ensin 0,1 m ja sitten 0,6 m (paina välissä yläreunan Nollaa). Vertaa, miten robotti kääntyy mutkissa", "Drive to the goal twice with different Lookahead distance values: first 0.1 m and then 0.6 m (press Reset at the top in between). Compare how the robot turns in corners"), after: "goal",
              // Arvo lasketaan vain, kun robotti on ajanut sillä maaliin
              check: (c) => { const n = window.sim2dStatus?.()?.arrivals || 0, v = tools().sim2d?.lookahead ?? 0.25;
                if (c.mem.n == null || n < c.mem.n) c.mem.n = n;
                if (n > c.mem.n) { c.mem.n = n; if (v <= 0.15) c.mem.lo = true; if (v >= 0.5) c.mem.hi = true; }
                return !!(c.mem.lo && c.mem.hi); } },
          ],
          hints: [tr("Katseluetäisyys-liukusäädin on Ohjaus-kortissa. Kartta palautettiin tämän vaiheen alussa oletukseksi, jotta robotti mahtuu kulkemaan.", "The Lookahead distance slider is in the Control card. The map was reset to the default at the start of this step so the robot fits through."),
            tr("Lyhyellä katseluetäisyydellä robotti seuraa reittiä tarkasti mutta mutkittelee, pitkällä se oikaisee mutkat.", "With a short lookahead the robot follows the path closely but weaves; with a long one it cuts the corners.")],
          quiz: { q: tr("Mitä tapahtuu, jos katseluetäisyys on hyvin pitkä?", "What happens if the lookahead distance is very long?"),
            options: [tr("Robotti oikaisee mutkat ja voi ajaa liian läheltä nurkkia", "The robot cuts corners and may pass too close to them"), tr("Robotti heiluu reitin ympärillä", "The robot weaves around the path"), tr("Robotti pysähtyy", "The robot stops")], correct: 0,
            explain: tr("Pitkä katseluetäisyys = pehmeä mutta oikaiseva ajo. Lyhyt = tarkka mutta heiluva. Oikea arvo on kompromissi.", "Long lookahead = smooth but corner-cutting. Short = precise but weaving. The right value is a compromise.") },
        },
        {
          id: "odom", tool: "sim2d", title: tr("Odometrian virhe", "Odometry error"),
          teach: tr("Oikea robotti ei tiedä tarkkaa sijaintiaan. **Odometria** arvioi sen pyörien kierroksista, mutta pyörät luistavat hieman, ja virhe kasvaa koko ajan.\n\nSimulaatiossa voit antaa ohjaimen luottaa pelkkään odometriaan ja lisätä luistoa — ja nähdä, mitä tapahtuu.",
            "A real robot doesn't know its exact position. **Odometry** estimates it from wheel rotations, but the wheels slip a little and the error keeps growing.\n\nIn the simulation you can make the controller trust odometry only and add wheel slip — and see what happens."),
          tasks: [
            { id: "on", text: tr("Laita päälle Ohjain käyttää odometriaa ja nosta Pyörien luisto (kohina) 1,0:aan", "Turn on Controller uses odometry and raise Wheel slip (noise) to 1.0"), check: () => { const s = tools().sim2d; return !!s?.useOdom && (s.noise ?? 0) >= 0.95; } },
            { id: "run", text: tr("Paina Nollaa ja Aja maaliin. Vertaa jälkiä (selite: todellinen ja odometria) ja Odometrian virhe -kuvaajaa", "Press Reset and Drive to goal. Compare the trails (legend: true and odometry) and the Odometry error plot"), after: "on",
              // Vain odometria-asetuksen jälkeen ajetut matkat lasketaan (myös "luuli olevansa perillä" -pysähdys)
              check: (c) => { const n = window.sim2dStatus?.()?.arrivals || 0; if (c.mem.r0 == null || n < c.mem.r0) c.mem.r0 = n; return n > c.mem.r0; } },
          ],
          hints: [tr("Asetukset ovat lisäasetuksissa: paina Robotti-kortin alta Näytä lisäasetukset (mitat, enkooderit, luisto). Asetukset ilmestyvät Ohjaus-korttiin.", "The settings are in the advanced settings: press Show advanced settings (dimensions, encoders, slip) below the Robot card. The settings appear in the Control card.")],
          quiz: { q: tr("Miksi odometrian virhe kasvaa koko ajan?", "Why does odometry error keep growing?"),
            options: [tr("Jokainen pieni mittausvirhe lisätään edellisiin, eikä mikään korjaa niitä", "Each small measurement error adds to the previous ones and nothing corrects them"), tr("Koska akku tyhjenee", "Because the battery drains"), tr("Koska kartta on väärin", "Because the map is wrong")], correct: 0,
            explain: tr("Odometria integroi liikettä, joten virheet kertyvät. Siksi robotit yhdistävät siihen muita antureita (lidar, kamera, IMU) ja paikantavat itsensä kartalla.", "Odometry integrates motion, so errors accumulate. That's why robots combine it with other sensors (lidar, camera, IMU) and localise themselves on a map.") },
        },
        {
          id: "slam", tool: "map", title: tr("Kartoitus lidarilla", "Mapping with lidar"),
          teach: tr("Entä jos karttaa ei ole? Robotti voi tehdä sen itse. **Lidar** mittaa etäisyyksiä joka suuntaan: säteen läpäisemät solut ovat vapaita ja osumakohdat esteitä.\n\n**Varauskartta** tallentaa jokaiselle solulle todennäköisyyden (log-odds). Jokainen mittaus lisää varmuutta, joten kohinainenkin data tuottaa selkeän kartan.",
            "What if there is no map? The robot can make one. A **lidar** measures distances in every direction: cells a beam passes through are free, hit points are obstacles.\n\nAn **occupancy grid** stores a probability (log-odds) for each cell. Each scan adds confidence, so even noisy data produces a clear map."),
          tasks: [
            { id: "explore", text: tr("Paina Ohjaus-kortin ▶ Tutki automaattisesti ja anna robotin kartoittaa, kunnes Kartoitettu-luku on 90 %", "Press ▶ Explore automatically in the Control card and let the robot map until the Mapped number is 90 %"),
              // Laatta pyöristää kokonaisiin prosentteihin: 89,6 % näkyy "90 %"
              check: (c) => did(c, "click", "#oc-explore") && (window.occCoverage?.() || 0) >= 0.895 },
            { id: "truth", text: tr("Laita Vertaa todellisiin seiniin päälle ja etsi kohdat, joissa kartta on väärin", "Turn on Compare to true walls and look for places where the map is wrong"), after: "explore", check: () => !!tools().occ?.showTruth },
          ],
          hints: [tr("Kartoitus kestää noin minuutin. Robotti hakeutuu aina lähimpään tutkimattomaan reunaan (frontier exploration).", "Mapping takes about a minute. The robot always heads to the nearest unexplored edge (frontier exploration)."),
            tr("Jos robotti ilmoittaa kartoituksen valmiiksi ennen 90 %:a, paina ▶ Tutki automaattisesti uudelleen.", "If the robot says mapping is finished before 90 %, press ▶ Explore automatically again.")],
          quiz: { q: tr("Miksi kohinainenkin lidar tuottaa selkeän kartan?", "Why does even a noisy lidar produce a clear map?"),
            options: [tr("Koska jokainen solu mitataan monta kertaa ja varmuus kasvaa mittausten myötä", "Because each cell is measured many times and confidence builds up"), tr("Koska kohina poistetaan ennen mittausta", "Because noise is removed before measuring"), tr("Koska kartta piirretään käsin", "Because the map is drawn by hand")], correct: 0,
            explain: tr("Yksittäinen mittaus voi olla väärin, mutta kun samaa solua havaitaan kymmeniä kertoja, satunnaiset virheet kumoutuvat ja todennäköisyys asettuu oikeaan arvoon.", "A single measurement can be wrong, but when the same cell is observed dozens of times, random errors cancel out and the probability settles to the right value.") },
        },
      ],
    },
    {
      id: "frames", icon: "rotate", minutes: 20, level: tr("Keskitaso", "Intermediate"),
      title: tr("Koordinaatistot ja rotaatiot", "Frames and rotations"),
      desc: tr("Euler-kulmat, kardaanilukko, kvaterniot ja ROS-tyylinen TF-puu — robotiikan 'kielioppi'.", "Euler angles, gimbal lock, quaternions and a ROS-style TF tree — the 'grammar' of robotics."),
      outcomes: [tr("Osaat tulkita yaw-, pitch- ja roll-kulmat", "Can interpret yaw, pitch and roll"), tr("Ymmärrät kardaanilukon", "Understand gimbal lock"), tr("Tiedät, miksi kvaterniot ovat käytössä", "Know why quaternions are used"), tr("Osaat rakentaa TF-puun", "Can build a TF tree")],
      steps: [
        {
          id: "euler", tool: "rot", title: tr("Kierrot ja Euler-kulmat", "Rotations and Euler angles"),
          teach: tr("Asento kolmiulotteisessa avaruudessa kuvataan usein kolmella kulmalla: **yaw** (kierto z:n ympäri, 'suunta'), **pitch** (y:n ympäri, 'nyökkäys') ja **roll** (x:n ympäri, 'kallistus').\n\nJärjestyksellä on väliä: ZYX tarkoittaa, että ensin käännetään z:n, sitten uuden y:n ja lopuksi uuden x:n ympäri.",
            "Orientation in 3D is often described by three angles: **yaw** (about z, 'heading'), **pitch** (about y, 'nod') and **roll** (about x, 'tilt').\n\nThe order matters: ZYX means first turn about z, then about the new y, and finally about the new x."),
          tasks: [
            { id: "yaw", text: tr("Aseta yaw (Z) = 90° ja muut kulmat nollaan", "Set yaw (Z) = 90° and the other angles to zero"), check: () => { const e = rotEuler(); return near(e[0], 90 * D, 1 * D) && near(e[1], 0, 1 * D) && near(e[2], 0, 1 * D); } },
            { id: "look", text: tr("Katso 3D-näkymästä, minne punainen x-akseli nyt osoittaa", "Look in the 3D view where the red x axis now points") },
          ],
          hints: [tr("Euler-kulmat-kortissa ensimmäinen kenttä on Z (yaw), kun järjestykseksi on valittu ZYX.", "In the Euler angles card the first field is Z (yaw) when the order is set to ZYX.")],
          quiz: { q: tr("Kun yaw = 90°, mihin suuntaan kehyksen x-akseli osoittaa maailmassa?", "With yaw = 90°, which way does the frame's x axis point in the world?"),
            options: ["+X", "+Y", "−Y", "+Z"], correct: 1,
            explain: tr("Kierto z:n ympäri vastapäivään 90° kääntää x-akselin y-akselin suuntaan (oikean käden sääntö).", "A 90° counter-clockwise turn about z swings the x axis onto the y axis (right-hand rule).") },
        },
        {
          id: "gimbal", tool: "rot", title: tr("Kardaanilukko", "Gimbal lock"),
          teach: tr("Euler-kulmilla on heikkous: kun keskimmäinen kulma (ZYX-järjestyksessä pitch) on ±90°, ensimmäinen ja kolmas kiertoakseli osuvat samaan suuntaan. Silloin yksi vapausaste katoaa — tätä kutsutaan **kardaanilukoksi**. Se aiheutti ongelmia jopa Apollo-avaruusaluksen navigoinnissa.",
            "Euler angles have a weakness: when the middle angle (pitch in ZYX order) is ±90°, the first and third rotation axes line up. One degree of freedom is lost — this is called **gimbal lock**. It even caused trouble in the Apollo spacecraft's navigation."),
          tasks: [
            { id: "lock", text: tr("Kirjoita Euler-kulmat-kortin toiseen kenttään, pitch (Y), arvo 90", "Type 90 in the second field of the Euler angles card, pitch (Y)"), check: () => Kin.gimbalLocked(rotEuler(), "ZYX") },
            { id: "feel", text: tr("Muuta nyt yaw- ja roll-kulmaa (1. ja 3. kenttä) ja katso 3D-näkymää: molemmat kiertävät samaa akselia", "Now change yaw and roll (the 1st and 3rd fields) and watch the 3D view: both turn about the same axis"), after: "lock",
              // Lasketaan vain lukituksen jälkeen tehdyt muutokset, ja asennon pitää olla yhä lukossa
              check: (c) => { c.mem.tl ??= Date.now(); const k = { ...c, t0: c.mem.tl };
                return Kin.gimbalLocked(rotEuler(), "ZYX") && did(k, ["input", "change"], "[data-card='euler'][data-i='0']") && did(k, ["input", "change"], "[data-card='euler'][data-i='2']"); } },
          ],
          hints: [tr("Toinen kenttä on Y (pitch). Esimerkit-valikossa on myös valmis kardaanilukkoesimerkki.", "The second field is Y (pitch). The Examples menu also has a ready gimbal lock example.")],
          quiz: { q: tr("Mitä kardaanilukossa tapahtuu?", "What happens in gimbal lock?"),
            options: [tr("Kaksi kiertoakselia osuu samaan suuntaan ja yksi vapausaste katoaa", "Two rotation axes line up and one degree of freedom is lost"), tr("Kierto lakkaa toimimasta kokonaan", "Rotation stops working entirely"), tr("Kvaternion pituus muuttuu", "The quaternion's length changes")], correct: 0,
            explain: tr("Asento itsessään on ihan tavallinen — ongelma on vain Euler-kulmien tavassa kuvata se. Siksi robotit käyttävät sisäisesti kvaternioita tai matriiseja.", "The pose itself is perfectly ordinary — the problem is only in how Euler angles describe it. That's why robots use quaternions or matrices internally.") },
        },
        {
          id: "quat", tool: "rot", title: tr("Kvaterniot", "Quaternions"),
          teach: tr("**Kvaternio** esittää asennon neljällä luvulla (x, y, z, w). Sillä ei ole kardaanilukkoa, ja kahden asennon välillä voi interpoloida tasaisesti. ROS käyttää kvaternioita kaikissa asennoissa.\n\nAsentoa kuvaa vain **yksikkökvaternio** (pituus 1). Akseli-kulmasta: (x, y, z) = akseli · sin(kulma/2), w = cos(kulma/2).",
            "A **quaternion** represents orientation with four numbers (x, y, z, w). It has no gimbal lock and you can interpolate smoothly between two orientations. ROS uses quaternions for every pose.\n\nOnly a **unit quaternion** (length 1) represents an orientation. From axis–angle: (x, y, z) = axis · sin(angle/2), w = cos(angle/2)."),
          tasks: [
            { id: "norm", text: tr("Kirjoita Kvaternio-korttiin x = 1, y = 0, z = 0, w = 1 ja klikkaa kortin ulkopuolelle: mitä luvuille tapahtuu?", "Type x = 1, y = 0, z = 0, w = 1 in the Quaternion card and click outside the card: what happens to the numbers?"),
              check: (c) => { const q = tools().rot?.q; return did(c, "input", "[data-card='quat']") && !!q && near(q[0], Math.SQRT1_2, 1e-3) && near(q[1], 0, 1e-3) && near(q[2], 0, 1e-3) && near(q[3], Math.SQRT1_2, 1e-3); } },
            { id: "read", text: tr("Paina Näytä akseli–kulma ja matriisi ja lue Euler-kulmista ja akseli–kulmasta, mikä kierto tämä on", "Press Show axis–angle and matrix and read from the Euler angles and axis–angle which rotation this is"), after: "norm",
              check: () => (tools().rot?._adv ?? settings.advanced) === true },
          ],
          hints: [tr("Työkalu normalisoi kvaternion: (1, 0, 0, 1) jaetaan pituudellaan √2 ≈ 1,414, jolloin x ja w ovat 0,7071. Kortin alle tulee huomautus.", "The tool normalises the quaternion: (1, 0, 0, 1) is divided by its length √2 ≈ 1.414, so x and w become 0.7071. A note appears under the card.")],
          quiz: { q: tr("Mikä kierto on kvaternio (0,707; 0; 0; 0,707)?", "Which rotation is the quaternion (0.707, 0, 0, 0.707)?"),
            options: [tr("90° x-akselin ympäri", "90° about the x axis"), tr("45° x-akselin ympäri", "45° about the x axis"), tr("180° z-akselin ympäri", "180° about the z axis")], correct: 0,
            explain: tr("w = cos(kulma/2) = 0,707 → kulma/2 = 45° → kulma = 90°. Akseli on (x, y, z) normalisoituna eli x-akseli.", "w = cos(angle/2) = 0.707 → angle/2 = 45° → angle = 90°. The axis is (x, y, z) normalised, i.e. the x axis.") },
        },
        {
          id: "tf", tool: "sim3d", title: tr("TF-puu", "The TF tree"),
          teach: tr("Robotilla on monta koordinaatistoa: alusta (base_link), lidar, kamera, käsivarsi… Jokaisen kehyksen paikka ilmoitetaan suhteessa **vanhempaansa**, ja yhdessä ne muodostavat **TF-puun** (ROS:n tf2).\n\nKun tiedät puun, voit laskea minkä tahansa kahden kehyksen välisen muunnoksen — esimerkiksi missä kameran näkemä kohde on robotin alustaan nähden.",
            "A robot has many frames: the base (base_link), lidar, camera, arm… Each frame is given relative to its **parent**, and together they form a **TF tree** (ROS's tf2).\n\nKnowing the tree, you can compute the transform between any two frames — for example where an object seen by the camera is relative to the robot base."),
          tasks: [
            { id: "add", text: tr("Paina Kehykset-taulukon alla + Lisää kehys, nimeä uusi kehys (esim. gripper) ja valitse sille Vanhempi-sarakkeesta vanhempi (esim. arm_base)", "Press + Add frame below the Frames table, name the new frame (e.g. gripper) and choose its parent in the Parent column (e.g. arm_base)"),
              check: (c) => (tools().sim3d?.frames?.length ?? 6) > (c.base.tools.sim3d?.frames?.length ?? 6) && did(c, ["input", "change"], "#s3-frames [data-k='parent']") },
            { id: "arm", text: tr("Kiinnitä kinematiikkatyökalun käsivarsi johonkin kehykseen Robottikäsivarsi-kortissa", "Attach the kinematics arm to a frame in the Robot arm card"), check: () => !!tools().sim3d?.armFrame },
            { id: "tf", text: tr("Valitse Muunnos kehysten välillä -kortissa base_link → uusi kehyksesi", "In the Transform between frames card, choose base_link → your new frame"), after: "add",
              check: (c) => { const s = tools().sim3d, def = ["world", "base_link", "lidar_link", "camera_link", "camera_optical", "arm_base"];
                return did(c, "change", "#s3-from, #s3-to") && s?.from === "base_link" && !!s.to && !def.includes(s.to); } },
          ],
          hints: [tr("+ Lisää kehys on taulukon alla. Uusi kehys saa aluksi valitun rivin vanhemmaksi, joten vaihda se Vanhempi-sarakkeesta.", "+ Add frame is below the table. A new frame first gets the selected row as its parent, so change it in the Parent column.")],
          quiz: { q: tr("Mitä komento tf2_echo base_link camera_optical näyttää?", "What does tf2_echo base_link camera_optical show?"),
            options: [tr("camera_optical-kehyksen asennon base_link-kehyksessä", "The pose of camera_optical expressed in base_link"), tr("base_link-kehyksen asennon kamerakuvassa", "The pose of base_link in the camera image"), tr("Kameran kuvan", "The camera image")], correct: 0,
            explain: tr("tf2_echo A B kertoo, missä kehys B on ja mihin se osoittaa kehyksessä A mitattuna.", "tf2_echo A B tells where frame B is and how it is oriented, measured in frame A.") },
        },
      ],
    },
    {
      id: "ai", icon: "brain", minutes: 30, level: tr("Keskitaso", "Intermediate"),
      title: tr("Robotin tekoäly: kouluta ja vie robotille", "Robot AI: train it and run it on a robot"),
      desc: tr("Anna neuroverkon oppia ajamaan evoluution avulla, kouluta oma robottisi ja vie opitut aivot oikealle laitteelle.", "Let a neural network learn to drive through evolution, train your own robot and put the learned brain on a real device."),
      outcomes: [tr("Ymmärrät, miten neuroverkko ohjaa robottia", "Understand how a neural network drives a robot"), tr("Tiedät, miten evoluutio ja palkkiofunktio opettavat", "Know how evolution and a reward function teach"),
        tr("Osaat kouluttaa oman robotin 2D:ssä ja 3D:ssä", "Can train your own robot in 2D and 3D"), tr("Tiedät, miten aivot siirretään oikealle robotille", "Know how to move the brain onto a real robot")],
      steps: [
        {
          id: "drive", tool: "nn2d", title: tr("Neuroverkko oppii ajamaan", "A neural network learns to drive"),
          teach: tr("Robotin aivot ovat pieni **neuroverkko**: sisään tulevat anturit (kulmat, nopeudet, maakosketus, lidar), ulos jokaisen moottorin komento.\n\nVerkkoa ei opeteta esimerkeillä vaan **evoluutiolla**: joukko robotteja (*populaatio*) kokeilee hieman erilaisia painoja, ja paremmin pärjänneiden suuntaan siirrytään. Yksi kierros on *sukupolvi*.",
            "The robot's brain is a small **neural network**: sensors go in (angles, speeds, ground contact, lidar), a command for each motor comes out.\n\nIt is not taught with examples but by **evolution**: a group of robots (*population*) tries slightly different weights, and the search moves toward those that did better. One round is a *generation*."),
          tasks: [
            { id: "car", auto: true, // valmiiksi tehty oletusvalinnoilla (tarkistetaan vain, ettei sitä ole muutettu)
              text: tr("Tarkista, että Robotti-kortissa on valittuna Pyöräauto ja Tehtävä ja maasto -kortissa Liiku eteenpäin (ne ovat valmiiksi valittuina)", "Check that the Robot card has Wheeled car and the Task and terrain card has Move forward selected (they are selected by default)"),
              check: () => (tools().nn2d?.modelKey ?? "car") === "car" && (tools().nn2d?.taskKey ?? "forward") === "forward" },
            { id: "train", text: tr("Paina Simulaatio-kortin ▶ Kouluta ja kouluta vähintään 10 sukupolvea", "Press ▶ Train in the Simulation card and train for at least 10 generations"), after: "car",
              check: () => (tools().nn2d?.modelKey ?? "car") === "car" && (tools().nn2d?.taskKey ?? "forward") === "forward" && (tools().nn2dStats?.generation || 0) >= 10 },
            { id: "best", text: tr("Paina Näytä paras (koulutus pysähtyy) ja vedä Nopeus-liukusäädin 1×:ään, niin näet parhaan robotin ajavan oikeassa tahdissa", "Press Show best (training pauses) and drag the Speed slider to 1× to watch the best robot drive in real time"), after: "train",
              check: (c) => did({ ...c, t0: (c.mem.tb ??= Date.now()) }, "click", "#nn-replay") },
          ],
          hints: [tr("Kouluta-nappi on Simulaatio-kortin otsikossa. 10 sukupolvea kestää yleensä alle puoli minuuttia. Oppimiskäyrä näyttää, miten paras ja keskiarvo paranevat.", "The Train button is in the Simulation card's header. 10 generations usually take under half a minute. The learning curve shows how the best and the mean improve.")],
          quiz: { q: tr("Mitä evoluutiostrategia tekee joka sukupolvella?", "What does the evolution strategy do each generation?"),
            options: [tr("Kokeilee pieniä muutoksia painoihin ja siirtyy parempien suuntaan", "Tries small changes to the weights and moves toward the better ones"), tr("Näyttää robotille oikean liikkeen", "Shows the robot the correct motion"), tr("Laskee painot suoraan kaavasta", "Computes the weights directly from a formula")], correct: 0,
            explain: tr("Evoluutio ei tarvitse oikeita vastauksia — vain mittarin (palkkion), joka kertoo, kuka pärjäsi paremmin. Siksi sillä voi opettaa asioita, joita on vaikea näyttää esimerkein.", "Evolution needs no correct answers — only a score (reward) saying who did better. That is why it can teach things that are hard to show by example.") },
        },
        {
          id: "reward", tool: "nn2d", title: tr("Palkkiofunktio määrää, mitä opitaan", "The reward decides what is learned"),
          teach: tr("**Palkkiofunktio** antaa robotille pisteitä joka hetki. Robotti oppii juuri sen, mistä palkitaan — ei välttämättä sitä, mitä tarkoitit! Esimerkiksi pelkästä nopeudesta palkittu kävelijä voi oppia heittäytymään eteenpäin.\n\nHyvä palkkio palkitsee haluttua käytöstä pienin askelin joka hetki, ei vain lopussa.",
            "The **reward function** gives the robot points every moment. The robot learns exactly what is rewarded — not necessarily what you meant! A walker rewarded only for speed may learn to throw itself forward.\n\nA good reward pays for the wanted behaviour in small steps every moment, not only at the end."),
          tasks: [
            { id: "edit", text: tr("Paina Tehtävä ja maasto -kortin Muokkaa palkkiofunktiota, tee oma muutos ja paina Käytä (esim. palkitse taaksepäin ajamisesta: vaihda s.x - s.prevX → s.prevX - s.x)", "Press Edit reward function in the Task and terrain card, make your own change and press Apply (e.g. reward driving backwards: change s.x - s.prevX → s.prevX - s.x)"),
              // Koodin pitää oikeasti muuttua (pelkkä Käytä samalla koodilla ei riitä); kommentit ja välilyönnit eivät ole muutoksia
              check: (c) => { const s = tools().nn2d, b = c.base.tools.nn2d;
                if (s?.taskKey !== "custom" || s.taskCodeUntrusted) return false;
                const norm = (x) => String(x ?? "").replace(/\/\/.*$/gm, "").replace(/\s+/g, "");
                const before = b?.taskKey === "custom" ? b.taskCode : RS.TASKS?.[b?.taskKey ?? "forward"]?.code;
                return norm(s.taskCode) !== norm(before); } },
            { id: "see", text: tr("Paina Aivot-kortin Nollaa aivot ja kouluta 5 sukupolvea: mihin suuntaan auto nyt ajaa?", "Press Reset brain in the Brain card and train 5 generations: which way does the car drive now?"), after: "edit",
              check: (c) => { const g = tools().nn2dStats?.generation || 0; if (c.mem.g0 == null || g < c.mem.g0) c.mem.g0 = g;
                return tools().nn2d?.taskKey === "custom" && ((c.mem.g0 === 0 && g >= 5) || g >= c.mem.g0 + 30); } },
          ],
          hints: [tr("Palkkiofunktion ohjeessa on lista kaikista arvoista (s.x, s.vx, s.fallen…), joita voit käyttää.", "The reward function help lists all the values (s.x, s.vx, s.fallen…) you can use.")],
          quiz: { q: tr("Kävelijä oppi heittäytymään eteenpäin ja kaatumaan. Mikä korjaa tämän parhaiten?", "A walker learned to throw itself forward and fall. What fixes this best?"),
            options: [tr("Pieni palkkio jokaisesta hetkestä pystyssä ja rangaistus kaatumisesta", "A small reward for every moment upright and a penalty for falling"), tr("Isompi populaatio", "A bigger population"), tr("Lyhyempi episodi", "A shorter episode")], correct: 0,
            explain: tr("Ongelma on palkkiossa, ei algoritmissa: kaatuminen kannatti. Kun pystyssä pysyminen palkitaan ja kaatuminen maksaa, kannattavin tapa edetä on oikea kävely.", "The problem is the reward, not the algorithm: falling paid off. When staying upright pays and falling costs, the most rewarding way forward is real walking.") },
        },
        {
          id: "own", tool: "nn2d", title: tr("Kouluta oma robottisi", "Train your own robot"),
          teach: tr("Nyt yhdistetään: tuo rakentamasi robotti simulaatioon ja anna sen oppia. Neuroverkon koko riippuu robotin antureista ja moottoreista, joten uusi robotti aloittaa aina tyhjästä.\n\nKurssilla on oma projektinsa, joten rakentaja on aluksi tyhjä. Aiemmin tallentamasi robotit löytyvät rakentajan **Uusi / pohja** -valikon **Omat robotit** -osiosta.",
            "Now put it together: bring the robot you built into the simulation and let it learn. The network size depends on the robot's sensors and motors, so a new robot always starts from scratch.\n\nThe course has its own project, so the builder starts empty. Robots you saved earlier are in the builder's **New / template** menu under **My robots**."),
          tasks: [
            { id: "import", text: tr("Paina Robotti-kortin Avaa rakentajassa, valitse rakentajan Uusi / pohja… -valikosta oma robottisi ja paina yläreunan Kouluta simulaatiossa →", "Press Open in builder in the Robot card, pick your own robot from the builder's New / template… menu and press Train in simulation → at the top"),
              check: () => tools().nn2d?.modelKey === "custom" },
            { id: "task", text: tr("Valitse Tehtävä ja maasto -kortista tehtäväksi Liiku eteenpäin (edellisen vaiheen oma palkkio opettaisi peruuttamaan)", "Choose Move forward as the task in the Task and terrain card (the custom reward from the previous step would teach reversing)"), after: "import",
              check: () => tools().nn2d?.modelKey === "custom" && tools().nn2d?.taskKey === "forward" },
            { id: "train", text: tr("Kouluta omaa robottiasi vähintään 10 sukupolvea", "Train your own robot for at least 10 generations"), after: "task",
              check: () => tools().nn2d?.modelKey === "custom" && tools().nn2d?.taskKey === "forward" && (tools().nn2dStats?.generation || 0) >= 10 },
          ],
          hints: [tr("Kun palaat simulaatioon, sovellus kysyy, nollataanko opitut aivot: paina Nollaa ja jatka. Uusi robotti tarvitsee aina uudet aivot.", "When you come back to the simulation, the app asks whether to reset the learned brain: press Reset and continue. A new robot always needs a new brain."),
            tr("Oikotie: Robotti-kortin Robotti-valinnan Omat robotit -osiosta saat tallentamasi robotin suoraan simulaatioon. Jos sinulla ei ole omaa robottia, valitse rakentajasta mikä tahansa pohja.", "Shortcut: the My robots section of the Robot picker in the Robot card puts a saved robot straight into the simulation. If you have no robot of your own, pick any template in the builder."),
            tr("Jos robotti ei liiku, tarkista rakentajassa, että nivelet ovat moottoroituja ja pyörät koskevat maata.", "If the robot doesn't move, check in the builder that the joints are motorised and the wheels touch the ground.")],
          quiz: { q: tr("Miksi robotin vaihtaminen nollaa opitut aivot?", "Why does changing the robot reset the learned brain?"),
            options: [tr("Verkon sisään- ja ulostulojen määrä riippuu robotin antureista ja moottoreista", "The number of network inputs and outputs depends on the robot's sensors and motors"), tr("Koska vanhat aivot ovat aina huonot", "Because the old brain is always bad"), tr("Koska aivot tallennetaan robotin nimellä", "Because the brain is saved under the robot's name")], correct: 0,
            explain: tr("Jos uudella robotilla on eri määrä moottoreita, vanhassa verkossa on väärä määrä ulostuloja — painot eivät yksinkertaisesti sovi.", "If the new robot has a different number of motors, the old network has the wrong number of outputs — the weights simply don't fit.") },
        },
        {
          id: "three", tool: "nn3d", title: tr("3D: robotti-imuri etsii kohteita", "3D: a robot vacuum finds targets"),
          teach: tr("3D-simulaatiossa fysiikkaa on raskaampi laskea, mutta se on todellisempaa: robotti voi kääntyä, kaatua sivulle ja liikkua mihin suuntaan tahansa. Robotti-imuri kääntyy paikallaan pyörien nopeuseron avulla — aivan kuten oikea imuri.",
            "In 3D the physics is heavier to compute but more realistic: the robot can turn, tip over sideways and move in any direction. The robot vacuum turns in place using the wheel speed difference — just like a real one."),
          tasks: [
            { id: "rover", text: tr("Valitse työkalun Esimerkit-valikosta Dusty etsii kohteita", "Choose Dusty finds targets from the tool's Examples menu"), check: () => tools().nn3d?.modelKey === "dusty" && tools().nn3d?.taskKey === "target" },
            { id: "train", text: tr("Kouluta noin 50 sukupolvea (noin minuutti) ja katso, alkaako Dusty kääntyä kohdetta kohti", "Train about 50 generations (about a minute) and see whether Dusty starts turning toward the target"), after: "rover",
              check: () => { const n = tools().nn3d, s = tools().nn3dStats; return n?.modelKey === "dusty" && /^Dusty/.test(s?.model || "") && (s?.generation || 0) >= 50; } },
          ],
          hints: [tr("Keltainen tai oranssi tolppa on kohde. Kun imuri saavuttaa sen, tilalle tulee uusi.", "The yellow or orange pole is the target. When the vacuum reaches it, a new one appears."),
            tr("Ensimmäisinä sukupolvina Dusty vain pyörii: kääntyminen kohdetta kohti alkaa näkyä noin 30–50 sukupolven jälkeen.", "For the first generations Dusty just spins: turning toward the target starts to show after about 30–50 generations.")],
          quiz: { q: tr("Miksi simulaatiossa opittu ohjain ei aina toimi sellaisenaan oikeassa robotissa?", "Why doesn't a controller learned in simulation always work as-is on a real robot?"),
            options: [tr("Simulaation fysiikka, anturit ja moottorit eroavat aina hieman todellisista", "The simulation's physics, sensors and motors always differ a little from reality"), tr("Neuroverkot eivät toimi oikeissa tietokoneissa", "Neural networks don't run on real computers"), tr("Oikeissa roboteissa ei ole moottoreita", "Real robots have no motors")], correct: 0,
            explain: tr("Tätä kutsutaan *sim-to-real*-kuiluksi. Sitä pienennetään esimerkiksi lisäämällä simulaatioon kohinaa ja vaihtelua, jotta opittu ohjain kestää todellisen maailman epätarkkuudet.", "This is called the *sim-to-real* gap. It is reduced e.g. by adding noise and variation to the simulation so the learned controller copes with the real world's imperfections.") },
        },
        {
          id: "deploy", tool: "nn2d", title: tr("Aivot oikealle robotille", "The brain on a real robot"),
          teach: tr("Koulutettu neuroverkko on vain lista lukuja (painot). Sen voi ajaa millä tahansa laitteella: Arduinolla, ESP32:lla tai Raspberry Pi:llä.\n\n**Vie omalle robotille** tekee valmiin koodin. Taulukko kertoo, mistä anturista kukin sisääntulo luetaan ja mitä kukin ulostulo tarkoittaa moottorille. Koodin **itsetesti** tulostaa, laskeeko laite verkon samoin kuin simulaatio.",
            "A trained neural network is just a list of numbers (weights). Any device can run it: an Arduino, an ESP32 or a Raspberry Pi.\n\n**Put on a real robot** generates ready code. The table tells which sensor each input comes from and what each output means for a motor. The code's **self-test** prints whether the device computes the network like the simulation."),
          tasks: [
            { id: "open", text: tr("Paina Aivot-kortin nappia Vie omalle robotille", "Press Put on a real robot in the Brain card"), check: (c) => { const n = window.rsDeployOpened || 0; if (n < (c.base.deploys || 0)) c.base.deploys = n; return n > (c.base.deploys || 0); } }, // laskuri nollautuu sivun latauksessa
            { id: "read", text: tr("Katso sisääntulojen taulukosta, mitä antureita robotti tarvitsisi", "Check the inputs table to see which sensors the robot would need") },
          ],
          hints: [tr("Nappi on Aivot-kortissa (Koulutus-kortin alla). Kokeile eri vaihtoehtoja: Arduino, C/C++, MicroPython ja JSON.", "The button is in the Brain card (below the Training card). Try the different targets: Arduino, C/C++, MicroPython and JSON.")],
          quiz: { q: tr("Mitä robotilla pitää olla, jotta simulaatiossa koulutetut aivot toimivat sillä?", "What must a robot have for a brain trained in simulation to work on it?"),
            options: [tr("Samat moottorit samassa järjestyksessä ja anturit, joista sisääntulot saadaan", "The same motors in the same order and sensors that provide the inputs"), tr("Täsmälleen sama väri kuin simulaatiossa", "Exactly the same colour as in the simulation"), tr("Nettiyhteys simulaatioon", "An internet connection to the simulation")], correct: 0,
            explain: tr("Verkko odottaa jokaisessa sisääntulossa tiettyä mittausta samalla skaalauksella kuin simulaatiossa, ja jokainen ulostulo ohjaa tiettyä moottoria. Muuten luvut menevät väärille paikoille.", "The network expects a specific measurement at each input, scaled like in the simulation, and each output drives a specific motor. Otherwise the numbers end up in the wrong places.") },
        },
      ],
    },

    /* ----- Palkkiot ja tavoitteet: mitä robotti oppii, kun palkkiota muutetaan ----- */
    {
      id: "reward", icon: "target", minutes: 35, level: tr("Keskitaso", "Intermediate"),
      title: tr("Palkkiot ja tavoitteet: opeta robotti oikein", "Rewards and goals: teach a robot the right thing"),
      desc: tr("Kokoa robotille oma tavoite, huomaa miten väärin valittu palkkio harhauttaa oppimista, rakenna oma rata reittipisteillä ja kouluta helposta vaikeaan. Lopuksi vertaile ja kisauta aivoja.", "Build your own goal for a robot, see how a badly chosen reward misleads learning, make your own route with waypoints and train from easy to hard. Finally compare and race brains."),
      outcomes: [tr("Osaat koota palkkion tavoitteista ja painoista", "Can build a reward from goals and weights"), tr("Tunnistat, milloin robotti oppii väärän asian (palkkion huijaus)", "Recognise when a robot learns the wrong thing (reward hacking)"),
        tr("Osaat käyttää reittipisteitä ja opetussuunnitelmaa", "Can use waypoints and a curriculum"), tr("Osaat vertailla koulutuksia ja mitata tuloksen haasteella", "Can compare trainings and measure the result with a challenge")],
      steps: [
        {
          id: "goal", tool: "nn2d", title: tr("Oma tavoite: mitä palkitaan?", "Your own goal: what is rewarded?"),
          teach: tr("Tähän asti robotti on oppinut valmiista tehtävistä. **Oma tavoite** -ikkunassa kokoat palkkion itse: rastit kertovat, mistä palkitaan, ja liukusäädin, kuinka tärkeää se on muihin verrattuna.\n\nKokeillaan ensin pelkkää vauhtia: robotti saa pisteitä nopeudesta mihin tahansa suuntaan. Mitä luulet sen oppivan?",
            "So far the robot has learned from ready-made tasks. In the **Custom goal** window you build the reward yourself: the ticks say what is rewarded, and the slider how important it is compared to the others.\n\nLet's first try speed alone: the robot gets points for speed in any direction. What do you think it will learn?"),
          tasks: [
            { id: "speed", text: tr("Paina Tehtävä ja maasto -kortin Oma tavoite, jätä rasti vain kohtaan Ole nopea ja paina Käytä tavoitetta", "Press Custom goal in the Task and terrain card, leave only Be fast ticked and press Use this goal"),
              check: () => speedOnly() },
            { id: "train", text: tr("Kouluta vähintään 15 sukupolvea", "Train for at least 15 generations"), after: "speed",
              check: (c) => speedOnly() && gensSince(c, "nn2d") >= 15 },
            { id: "watch", text: tr("Paina Näytä paras ja katso, mihin suuntaan auto ajaa", "Press Show best and see which way the car drives"), after: "train",
              check: (c) => did({ ...c, t0: (c.mem.tw ??= Date.now()) }, "click", "#nn-replay") },
          ],
          hints: [tr("Oma tavoite -nappi on Tehtävä ja maasto -kortissa. Poista rastit muista kohdista: palkkiokoodi näkyy ikkunan alareunassa.", "The Custom goal button is in the Task and terrain card. Untick the other rows: the reward code shows at the bottom of the window."),
            tr("Jos auto ajaa taaksepäin, se ei ole virhe: palkkio ei kertonut suuntaa.", "If the car drives backwards, that is not a bug: the reward didn't say which way.")],
          quiz: { q: tr("Auto palkittiin vain vauhdista. Miksi se voi oppia ajamaan yhtä hyvin taaksepäin?", "The car was rewarded for speed alone. Why can it learn to drive backwards just as well?"),
            options: [tr("Palkkio ei kerro suuntaa: vauhti taaksepäin antaa yhtä paljon pisteitä", "The reward doesn't say which way: speed backwards scores just as much"), tr("Koska auto on rakennettu väärin päin", "Because the car is built the wrong way round"), tr("Koska evoluutio valitsee suunnan aina satunnaisesti", "Because evolution always picks the direction at random")], correct: 0,
            explain: tr("Robotti oppii juuri sen, mistä palkitaan. Jos tärkeä asia (tässä suunta) puuttuu palkkiosta, robotti ei voi tietää siitä. Tätä kutsutaan palkkion huijaukseksi (reward hacking).", "A robot learns exactly what is rewarded. If something important (here the direction) is missing from the reward, the robot can't know about it. This is called reward hacking.") },
        },
        {
          id: "weights", tool: "nn2d", title: tr("Painot: mikä on tärkeintä?", "Weights: what matters most?"),
          teach: tr("Kun tavoitteita on useita, **painot** ratkaisevat. Liiku suuntaan × 2 ja Säästä energiaa × 1 tarkoittaa, että eteneminen on kaksi kertaa niin tärkeää kuin energian säästäminen.\n\nJos säästö painaa liikaa, robotti voi oppia olemaan liikkumatta: sekin on palkkion kannalta hyvä ratkaisu! Hidastettu uusinta näyttää, mitä pyörät oikeasti tekevät.",
            "With several goals, the **weights** decide. Move in a direction × 2 and Save energy × 1 means moving on is twice as important as saving energy.\n\nIf saving weighs too much, the robot may learn to stand still: that too is a good solution as far as the reward is concerned! A slowed-down replay shows what the wheels really do."),
          tasks: [
            { id: "mix", text: tr("Avaa Oma tavoite: valitse Liiku suuntaan eteenpäin painolla vähintään 2 sekä Säästä energiaa, ja paina Käytä tavoitetta", "Open Custom goal: pick Move in a direction forward with a weight of at least 2 plus Save energy, and press Use this goal"),
              check: () => { const g = tools().nn2d?.goal; return tools().nn2d?.taskKey === "custom" && g?.move?.on && (g.move.dir ?? "+x") === "+x" && (g.move.w ?? 1) >= 2 && g?.energy?.on; } },
            { id: "train", text: tr("Kouluta vähintään 15 sukupolvea", "Train for at least 15 generations"), after: "mix",
              check: (c) => tools().nn2d?.goal?.move?.on && gensSince(c, "nn2d") >= 15 },
            { id: "slow", text: tr("Paina Näytä paras ja hidasta uusinta nopeuteen 0,25× tai 0,1× simulaation alla olevista napeista", "Press Show best and slow the replay to 0.25× or 0.1× with the buttons under the simulation"), after: "train",
              check: (c) => did(c, "click", '#nn-rp-rate [data-r="0.25"], #nn-rp-rate [data-r="0.1"]') },
          ],
          hints: [tr("Rastin vieressä oleva liukusäädin on paino. Kun liikutat sitä, tavoite rastittuu itsestään.", "The slider next to a tick is the weight. Moving it ticks the goal automatically."),
            tr("Uusinnan nopeusnapit (0,1× … 2×) ja aikajana tulevat näkyviin, kun Näytä paras on päällä.", "The replay speed buttons (0.1× … 2×) and the timeline appear while Show best is on.")],
          quiz: { q: tr("Robotti seisoo paikallaan, vaikka sen pitäisi ajaa eteenpäin. Mikä on todennäköisin syy?", "The robot stands still even though it should drive forward. What is the most likely cause?"),
            options: [tr("Energian säästön paino on liian suuri suhteessa etenemiseen", "The weight of saving energy is too big compared to moving on"), tr("Populaatio on liian iso", "The population is too big"), tr("Maasto on liian tasainen", "The terrain is too flat")], correct: 0,
            explain: tr("Jos paikallaan seisominen tuottaa enemmän pisteitä (ei energiankulutusta) kuin eteneminen, evoluutio löytää sen. Kasvata etenemisen painoa tai pienennä säästön painoa.", "If standing still scores more (no energy used) than moving on, evolution finds it. Raise the weight of moving or lower the weight of saving.") },
        },
        {
          id: "route", tool: "nn2d", title: tr("Reittipisteet: oma rata", "Waypoints: your own route"),
          teach: tr("**Mene kohteisiin** palkitsee jokaisesta askeleesta kohti kohdetta, ei vain perille pääsystä. Kohteet voivat olla arvottuja tai omia **reittipisteitä**: klikkaa näkymää, niin robotti oppii kulkemaan pisteet järjestyksessä ja aloittaa sitten alusta.",
            "**Reach targets** rewards every step toward the target, not only getting there. The targets can be random or your own **waypoints**: click the view and the robot learns to visit the points in order and then start over."),
          tasks: [
            { id: "target", text: tr("Valitse Tehtävä-valikosta Mene kohteeseen", "Pick Reach the target from the Task menu"),
              check: () => usesTarget2d() },
            { id: "points", text: tr("Paina Aseta reittipisteet, klikkaa näkymään vähintään kaksi pistettä (esim. auton eteen ja taakse) ja paina Valmis", "Press Set waypoints, click at least two points in the view (e.g. in front of and behind the car) and press Done"), after: "target",
              check: () => (tools().nn2d?.waypoints?.length || 0) >= 2 },
            { id: "train", text: tr("Kouluta vähintään 20 sukupolvea ja katso Näytä paras -uusinnasta, kääntyykö auto pisteeltä toiselle", "Train for at least 20 generations and see in the Show best replay whether the car turns from one point to the next"), after: "points",
              check: (c) => usesTarget2d() && (tools().nn2d?.waypoints?.length || 0) >= 2 && gensSince(c, "nn2d") >= 20 },
          ],
          hints: [tr("Näkymää voi siirtää vetämällä ja zoomata rullalla ennen klikkausta. Pelkkä veto ei lisää pistettä.", "You can move the view by dragging and zoom with the wheel before clicking. A drag doesn't add a point."),
            tr("Pyöräauto ei voi kääntyä paikallaan 2D:ssä, joten se oppii peruuttamaan pisteeltä toiselle.", "The wheeled car can't turn in place in 2D, so it learns to reverse from one point to the next.")],
          quiz: { q: tr("Miksi kohteen lähestymisestä palkitaan joka hetki eikä vain perille pääsystä?", "Why is approaching the target rewarded every moment and not only arriving?"),
            options: [tr("Pienet edistysaskeleet ohjaavat oppimista; pelkkä maali olisi liian harvinainen palkkio", "Small steps forward guide learning; the goal alone would be too rare a reward"), tr("Muuten robotti ei näe kohdetta", "Otherwise the robot can't see the target"), tr("Se nopeuttaa tietokonetta", "It speeds up the computer")], correct: 0,
            explain: tr("Jos palkkio tulee vain maalissa, satunnaiset alkuaivot eivät juuri koskaan pääse sinne, eikä evoluutio näe eroa yritysten välillä. Askeleittainen palkkio kertoo, kuka pääsi lähemmäs.", "If the reward only comes at the goal, random early brains hardly ever get there and evolution sees no difference between attempts. A step-by-step reward tells who got closer.") },
        },
        {
          id: "curriculum", tool: "nn2d", title: tr("Opetussuunnitelma: helposta vaikeaan", "A curriculum: from easy to hard"),
          teach: tr("Ihmisetkin oppivat helposta vaikeaan. **Vaikeuta maastoa automaattisesti** aloittaa tasaisesta ja vaihtaa vaikeampaan, kun oppiminen tasaantuu. Vaihdot näkyvät oppimiskäyrässä pystyviivoina.\n\nVertaa: robotti, joka heitetään heti esteiden keskelle, ei usein opi mitään.",
            "People learn from easy to hard too. **Make the terrain harder automatically** starts on flat ground and changes to a harder terrain when learning levels off. The changes show in the learning curve as vertical lines.\n\nCompare: a robot thrown straight among obstacles often learns nothing."),
          tasks: [
            { id: "on", text: tr("Valitse tehtäväksi Liiku eteenpäin, maastoksi Tasainen ja kytke päälle Vaikeuta maastoa automaattisesti", "Pick Move forward as the task, Flat as the terrain and switch on Make the terrain harder automatically"),
              check: () => tools().nn2d?.taskKey === "forward" && tools().nn2d?.autoTerrain === true },
            { id: "level", text: tr("Kouluta, kunnes maasto vaihtuu ainakin kerran (oppimiskäyrään tulee pystyviiva)", "Train until the terrain changes at least once (a vertical line appears in the learning curve)"), after: "on",
              check: (c) => { const t = tools().nn2dStats?.terrain; if (!t) return false; c.mem.t0 ??= tools().nn2d?.terrain === t ? t : "flat"; return tools().nn2d?.autoTerrain === true && t !== c.mem.t0; } },
          ],
          hints: [tr("Vaihto vaatii vähintään 20 sukupolvea samassa maastossa, ja paras tulos ei saa enää parantua. Nopealla koulutuksella se kestää yleensä alle minuutin.", "A change needs at least 20 generations on the same terrain with the best result no longer improving. With fast training it usually takes under a minute.")],
          quiz: { q: tr("Miksi robotti kannattaa kouluttaa ensin tasaisella?", "Why is it worth training the robot on flat ground first?"),
            options: [tr("Perustaidot opitaan helpommin ilman esteitä, ja ne siirtyvät vaikeampaan maastoon", "The basics are easier to learn without obstacles, and they carry over to harder terrain"), tr("Tasainen maasto on ainoa, jossa robotti voi kaatua", "Flat ground is the only terrain where the robot can fall"), tr("Vaikeassa maastossa ei voi kouluttaa ollenkaan", "You can't train on hard terrain at all")], correct: 0,
            explain: tr("Kun liikkuminen ylipäätään onnistuu, pienet esteet ovat vain uusi lisähaaste. Alusta asti vaikeassa maastossa melkein kaikki yritykset epäonnistuvat samalla tavalla, eikä evoluutio löydä suuntaa.", "Once moving works at all, small obstacles are just a new extra challenge. On hard terrain from the start almost every attempt fails the same way, and evolution finds no direction.") },
        },
        {
          id: "compare", tool: "nn2d", title: tr("Vertaa, kisaa ja mittaa", "Compare, race and measure"),
          teach: tr("Kumpi aivoista on parempi? **Koulutusajot**-kortti tallentaa aivot ja oppimiskäyrän. Rastitetut ajot näkyvät kaaviossa ja pääsevät **kisaan** samalle radalle.\n\n**Haasteet** mittaavat tuloksen RoboLabin omalla mittarilla samalla radalla kaikille: oma palkkiofunktio ei vaikuta mittaukseen.",
            "Which brain is better? The **Training runs** card saves the brain and the learning curve. Ticked runs show in the chart and take part in the **race** on the same track.\n\n**Challenges** measure the result with RoboLab's own meter on the same track for everyone: your own reward function doesn't affect the measurement."),
          tasks: [
            { id: "save", text: tr("Paina Koulutusajot-kortin Tallenna nykyinen koulutus", "Press Save the current training in the Training runs card"),
              check: (c) => (tools().nn2dRuns?.list?.length || 0) > (c.base.tools.nn2dRuns?.list?.length || 0) },
            { id: "race", text: tr("Rastita tallennettu ajo ja paina 🏁 Kisa. Katso tulostaulu, kun kisa päättyy", "Tick the saved run and press 🏁 Race. Look at the results board when the race ends"), after: "save",
              // Päättyneiden kisojen laskuri (tools/nn.js); nollautuu sivun latauksessa, joten pohja seuraa sitä
              check: (c) => { const n = window.rsRaces || 0; if (c.mem.races == null || n < c.mem.races) c.mem.races = n; return n > c.mem.races; } },
            { id: "challenge", text: tr("Kokeile Haasteet-kortista jotain haastetta, johon nykyinen robottisi sopii", "Try a challenge in the Challenges card that fits your current robot"), after: "race",
              // Haasteyritysten laskuri (tools/nn.js): lista piirretään uudelleen, joten painettu nappi ei säily sivulla
              check: (c) => { const n = window.rsChallenges || 0; if (c.mem.ch == null || n < c.mem.ch) c.mem.ch = n; return n > c.mem.ch; } },
          ],
          hints: [tr("Kisa kestää episodin pituuden verran (nopeus enintään 4×). Tulostaulu näkyy simulaation oikeassa yläkulmassa.", "The race lasts one episode (speed at most 4×). The results board shows in the top right corner of the simulation."),
            tr("Pikajuoksu sopii pyöräautolle. Haasteet, joiden nappi on harmaa, vaativat toisen robotin.", "Sprint fits the wheeled car. Challenges with a grey button need another robot.")],
          quiz: { q: tr("Miksi kisassa ja haasteissa kaikki aivot ajavat samalla radalla?", "Why do all brains drive on the same track in races and challenges?"),
            options: [tr("Vain samoilla ehdoilla tulokset ovat vertailukelpoisia", "Results are only comparable under the same conditions"), tr("Koska rata on aina tasainen", "Because the track is always flat"), tr("Jotta kisa olisi nopeampi", "So the race is quicker")], correct: 0,
            explain: tr("Eri radalla toinen robotti voi saada helpomman maaston tai kohteet. Vertailu on reilu vain, kun ainoa ero on aivoissa.", "On a different track one robot could get easier terrain or targets. A comparison is only fair when the only difference is the brain.") },
        },
      ],
    },

    /* ----- Aloita tästä: robotin perusosat käytännössä ----- */
    {
      id: "start", icon: "book", minutes: 20, level: tr("Aloittelija", "Beginner"),
      title: tr("Aloita tästä: miten robotti toimii", "Start here: how a robot works"),
      desc: tr("Rakenna ensimmäinen robottisi, kokeile sitä fysiikalla, laske sen nopeus ja ohjaa se maaliin. Opit robotin kolme perusosaa: aistit, aivot ja lihakset.", "Build your first robot, try it with physics, work out its speed and drive it to a goal. You'll learn a robot's three basics: senses, brain and muscles."),
      outcomes: [tr("Tiedät robotin perusosat: anturit, ohjain ja toimilaitteet", "Know a robot's basic parts: sensors, controller and actuators"), tr("Osaat rakentaa pyörärobotin ja kokeilla sitä fysiikalla", "Can build a wheeled robot and try it with physics"),
        tr("Ymmärrät, mistä robotin nopeus tulee ja miten se kääntyy", "Understand where a robot's speed comes from and how it turns"), tr("Olet ohjannut robotin maaliin simulaatiossa", "Have driven a robot to a goal in simulation")],
      steps: [
        {
          id: "parts", tool: "build2d", title: tr("Runko ja pyörät", "Body and wheels"),
          teach: tr("Jokaisessa robotissa on kolme osaa:\n\n- **Anturit** (aistit): mittaavat maailmaa — etäisyys, kulma, nopeus\n- **Ohjain** (aivot): päättää, mitä tehdään\n- **Toimilaitteet** (lihakset): moottorit ja servot, jotka liikuttavat robottia\n\nRakennetaan ensin keho: runko ja kaksi moottoroitua pyörää. 2D-rakentaja näyttää robotin **sivulta**, joten pyörät tulevat rungon alle eteen ja taakse.",
            "Every robot has three parts:\n\n- **Sensors** (senses): measure the world — distance, angle, speed\n- **Controller** (brain): decides what to do\n- **Actuators** (muscles): motors and servos that move the robot\n\nLet's build the body first: a chassis and two motorised wheels. The 2D builder shows the robot **from the side**, so the wheels go under the body at the front and the back."),
          tasks: [
            { id: "body", text: tr("Lisää runko: paina Lisää osa -kohdasta Laatikko", "Add a body: press Box under Add a part"), check: () => (build2d()?.bodies || []).some((b) => b.shapes?.some((s) => s.type === "box")) },
            { id: "wheels", text: tr("Pidä laatikko valittuna ja paina Valmisosat-kohdasta ⚙⚙ Pyöräpari: rungon alle tulee kaksi moottoroitua pyörää, eteen ja taakse", "Keep the box selected and press ⚙⚙ Wheel pair under Ready-made: two motorised wheels appear under the body, at the front and the back"), check: () => {
              const w = wheelsOf(build2d()).map((b) => b.pos[0]);
              return w.length >= 2 && Math.max(...w) - Math.min(...w) >= 0.15; // eri kohdissa, ei päällekkäin
            } },
            { id: "check", text: tr("Avaa Tarkistus-välilehti (Ominaisuudet-välilehden vieressä). Kun sen nimen vieressä on ✓, robotti on valmis kokeiltavaksi", "Open the Check tab (next to the Properties tab). When it shows ✓ next to its name, the robot is ready to try"), after: "wheels",
              check: (c) => did(c, "click", "[data-tab='check']") && builder()?.check === "ok" },
          ],
          hints: [tr("Valmisosien napit toimivat vain, kun täsmälleen yksi osa on valittuna. Klikkaa laatikkoa, niin se valitaan.", "The ready-made buttons only work when exactly one part is selected. Click the box to select it."),
            tr("Jos Tarkistus-välilehdellä on ⚠ tai ⛔, lue viesti. Klikkaamalla viestiä näet, mitä osaa se koskee.", "If the Check tab shows ⚠ or ⛔, read the message. Clicking it shows which part it is about."),
            tr("Oikotie: yläpalkin Uusi / pohja… -valikon Pyöräauto on valmis robotti, jossa on runko ja kaksi pyörää.", "Shortcut: Wheeled car in the New / template… menu in the top bar is a ready robot with a body and two wheels.")],
          quiz: { q: tr("Mikä robotin osa on toimilaite?", "Which part of a robot is an actuator?"),
            options: [tr("Moottori, joka pyörittää pyörää", "The motor that turns a wheel"), tr("Etäisyysanturi", "The distance sensor"), tr("Mikrokontrolleri", "The microcontroller")], correct: 0,
            explain: tr("Toimilaite muuttaa käskyn liikkeeksi — se on robotin lihas. Anturi mittaa ja mikrokontrolleri päättää.", "An actuator turns a command into motion — it's the robot's muscle. The sensor measures and the microcontroller decides.") },
        },
        {
          id: "test", tool: "build2d", title: tr("Kokeile fysiikalla", "Try it with physics"),
          teach: tr("Simulaatio laskee painovoiman, kitkan ja moottorien voiman. Näet ennen rakentamista, toimiiko idea: pysyykö robotti pystyssä, koskevatko pyörät maata ja jaksavatko moottorit liikuttaa sitä.\n\nFysiikkatestissä jokaisella moottorilla on oma liukusäätimensä. Säädin keskellä = moottori seis, sivulle vedettynä pyörä pyörii.\n\nKoska katsot robottia sivulta, se voi ajaa vain eteen ja taakse. Kääntymistä kokeillaan myöhemmin, kun robottia katsotaan ylhäältä.",
            "The simulation computes gravity, friction and the motors' force. You see before building whether the idea works: does the robot stay upright, do the wheels touch the ground and can the motors move it?\n\nIn the physics test each motor has its own slider. Slider in the middle = motor stopped, pulled to a side = the wheel spins.\n\nSince you see the robot from the side, it can only drive forward and back. Turning comes later, when we look at the robot from above."),
          tasks: [
            { id: "run", text: tr("Paina yläpalkista ▶ Testaa fysiikka. Robotti putoaa maahan, ja näkymän päälle tulee Fysiikkatesti-paneeli", "Press ▶ Test physics in the top bar. The robot drops to the ground and the Physics test panel appears over the view"), check: () => !!builder()?.testing },
            { id: "drive", text: tr("Vedä molempien pyörien liukusäätimet samaan suuntaan ja aja robottia vähintään 1 metri", "Pull both wheels' sliders the same way and drive the robot at least 1 metre"), after: "run", check: (c) => Math.abs(driven(c)?.far || 0) >= 1 },
            { id: "back", text: tr("Vedä säätimet toiseen suuntaan, jolloin robotti peruuttaa. Aja takaisin vähintään puoli metriä", "Pull the sliders the other way so the robot reverses. Drive back at least half a metre"), after: "drive", check: (c) => (driven(c)?.back || 0) >= 0.5 },
            { id: "save", text: tr("Tallenna robotti yläpalkin ☆ Omiin robotteihin -napilla. Tarvitset sitä myöhemmin Robotin tekoäly -kurssilla", "Save the robot with ☆ To my robots in the top bar. You'll need it later on the Robot AI course"), after: "back",
              check: (c) => did(c, "click", "[data-a='saveOwn']") && Library.list("robot2d").length > 0 },
          ],
          hints: [tr("Liukusäätimiä on yksi jokaiselle moottorille, esimerkiksi laatikko1 – pyora1. Jos robotti ei liiku, tarkista, ettei säädin ole keskellä.", "There is one slider per motor, for example box1 – wheel1. If the robot doesn't move, check that the slider isn't in the middle."),
            tr("Jos säätimet ovat eri suuntiin, pyörät vastustavat toisiaan eikä robotti pääse eteenpäin. Vedä molemmat samaan suuntaan.", "If the sliders point different ways, the wheels fight each other and the robot doesn't get anywhere. Pull both the same way."),
            tr("↺ Alusta aloittaa testin alusta. Lopeta testi (tai Esc) palaa rakentamaan.", "↺ Restart starts the test over. Stop test (or Esc) goes back to building.")],
          quiz: { q: tr("Miksi robotti kannattaa kokeilla simulaatiossa ennen kuin se rakennetaan?", "Why is it worth trying a robot in simulation before building it?"),
            options: [tr("Virheet, kuten kaatuminen tai liian heikot moottorit, huomataan ennen kuin osia on ostettu", "Mistakes such as tipping over or too weak motors show up before any parts are bought"), tr("Simulaatio tekee oikeasta robotista nopeamman", "The simulation makes the real robot faster"), tr("Silloin oikea robotti ei tarvitse antureita", "Then the real robot needs no sensors")], correct: 0,
            explain: tr("Simulaatio on halpa ja nopea paikka kokeilla. Kun idea toimii siellä, oikean robotin rakentaminen onnistuu todennäköisemmin ensimmäisellä kerralla.", "A simulation is a cheap and quick place to experiment. Once the idea works there, building the real robot is more likely to succeed the first time.") },
        },
        {
          id: "speed", tool: "motor", title: tr("Kuinka nopea robottisi on?", "How fast is your robot?"),
          teach: tr("Robotin nopeus tulee moottorin **kierrosnopeudesta** (rpm) ja **pyörän koosta**: yksi kierros vie robottia pyörän ympärysmitan verran eteenpäin.\n\nnopeus (m/s) = rpm / 60 × π × halkaisija (m)\n\nIsompi pyörä = nopeampi, mutta vetovoima pienenee samassa suhteessa. Siksi raskas robotti tarvitsee pienet pyörät tai vahvemman moottorin.",
            "A robot's speed comes from the motor's **rotation speed** (rpm) and the **wheel size**: one revolution moves the robot one wheel circumference forward.\n\nspeed (m/s) = rpm / 60 × π × diameter (m)\n\nA bigger wheel = faster, but the pulling force drops by the same factor. That's why a heavy robot needs small wheels or a stronger motor."),
          tasks: [
            { id: "wheel", text: tr("Muuta Pyörän halkaisija -kenttää ja katso, miten Arvio ajossa -kortin Ajonopeus muuttuu", "Change the Wheel diameter field and watch how the Driving speed in the Estimate while driving card changes"), check: (c) => changed(c, "motor", (s) => s?.wheelD, { wheelD: 65 }) },
            { id: "fast", text: tr("Saa Ajonopeus yli 1 m/s niin, että robotti jaksaa yhä liikkua", "Get the Driving speed above 1 m/s while the robot can still move"), check: () => { const m = window.motorWheelResult?.(); return !!m && m.r.moves && m.r.vOp > 1; } },
          ],
          hints: [tr("Nopeus kasvaa, kun kasvatat pyörän halkaisijaa tai kierrosnopeutta (rpm).", "The speed grows when you increase the wheel diameter or the rpm."),
            tr("Esimerkiksi 100 mm pyörä ja 250 rpm antavat kuormassa noin 1,1 m/s.", "For example a 100 mm wheel at 250 rpm gives about 1.1 m/s under load.")],
          quiz: { q: tr("Mitä tapahtuu vetovoimalle, kun pyörän halkaisija tuplataan?", "What happens to the pulling force when the wheel diameter is doubled?"),
            options: [tr("Se puolittuu", "It halves"), tr("Se tuplaantuu", "It doubles"), tr("Se pysyy samana", "It stays the same")], correct: 0,
            explain: tr("Voima = momentti / säde. Kun säde tuplaantuu, sama moottorin momentti antaa puolet pienemmän voiman — mutta nopeus tuplaantuu.", "Force = torque / radius. When the radius doubles, the same motor torque gives half the force — but twice the speed.") },
        },
        {
          id: "turn", tool: "sim2d", title: tr("Kääntyminen ilman ohjauspyörää", "Turning without a steering wheel"),
          teach: tr("Rakentajassa katsoit robottia sivulta, joten se pystyi ajamaan vain eteen ja taakse. **Mobiilirobotti 2D** näyttää robotin ylhäältä.\n\nRobotti-imurin kaltaisella robotilla on vasen ja oikea vetävä pyörä eikä ohjauspyörää. Se kääntyy **differentiaaliohjauksella**:\n\n- molemmat pyörät yhtä nopeasti eteen → suoraan eteenpäin\n- toinen pyörä nopeammin → kaartaa hitaamman pyörän puolelle\n- pyörät yhtä nopeasti eri suuntiin → kääntyy paikallaan\n\nVasen pyörä- ja Oikea pyörä -luvut näyttävät koko ajan, miten pyörät pyörivät.",
            "In the builder you saw the robot from the side, so it could only drive forward and back. **Mobile robot 2D** shows the robot from above.\n\nA robot like a robot vacuum has a left and a right driven wheel and no steering wheel. It turns with **differential drive**:\n\n- both wheels forward equally fast → straight ahead\n- one wheel faster → curves toward the slower wheel's side\n- wheels equally fast in opposite directions → turns on the spot\n\nThe Left wheel and Right wheel numbers show all the time how the wheels are spinning."),
          tasks: [
            { id: "keys", text: tr("Valitse Ohjaus-kortista Näppäimistö", "Choose Keyboard in the Control card"), check: () => tools().sim2d?.control === "keys" },
            { id: "spin", text: tr("Käännä robottia paikallaan: pidä ←-nuolinäppäintä pohjassa (tai kuvan alla olevaa ←-nappia), kunnes robotti on kääntynyt puoli kierrosta", "Turn the robot on the spot: hold the ← arrow key (or the ← button under the view) until the robot has turned half a circle"), after: "keys",
              check: (c) => turnedSince(c, "spin") >= Math.PI },
            { id: "arc", text: tr("Aja kaarta: pidä ↑ ja → yhtä aikaa pohjassa. Katso pyörien nopeuksia: kumpi pyörä pyörii nopeammin?", "Drive a curve: hold ↑ and → together. Look at the wheel speeds: which wheel spins faster?"), after: "spin",
              check: (c) => turnedSince(c, "arc") >= Math.PI / 2 },
          ],
          hints: [tr("Nuolinäppäimet eivät toimi, jos kohdistin on tekstikentässä tai valikossa. Klikkaa ensin simulaatiokuvaa, tai paina kuvan alla olevia nuolinappeja.", "The arrow keys don't work while the cursor is in a text field or a menu. Click the simulation view first, or press the arrow buttons under it."),
            tr("Paikallaan kääntyessä Vasen pyörä näyttää taakse ja Oikea pyörä eteen yhtä suurella nopeudella.", "When turning on the spot, Left wheel shows backward and Right wheel forward at the same speed."),
            tr("Jos robotti jää kiinni seinään, paina yläreunan Nollaa-nappia.", "If the robot gets stuck on a wall, press Reset at the top.")],
          quiz: { q: tr("Miten kaksipyöräinen robotti kääntyy ilman ohjauspyörää?", "How does a two-wheeled robot turn without a steering wheel?"),
            options: [tr("Pyörät pyörivät eri nopeuksilla", "The wheels spin at different speeds"), tr("Se kallistuu sivulle", "It leans sideways"), tr("Se ei voi kääntyä", "It can't turn")], correct: 0,
            explain: tr("Tätä kutsutaan differentiaaliohjaukseksi. Kun toinen pyörä pyörii nopeammin, robotti kaartaa hitaamman puolelle. Pyörät eri suuntiin = kääntyminen paikallaan, kuten robotti-imurilla.", "This is called differential drive. When one wheel spins faster, the robot curves toward the slower side. Wheels in opposite directions = turning on the spot, like a robot vacuum.") },
        },
        {
          id: "drive", tool: "sim2d", title: tr("Aja maaliin", "Drive to the goal"),
          // Edellisessä vaiheessa valittiin näppäinohjaus; Aja maaliin -nappi näkyy vain reitinseurannassa
          enter: () => { const s = activeProject().tools.sim2d; if (s?.control === "keys") saveToolState("sim2d", { ...s, control: "follow" }, { undo: false }); },
          teach: tr("Nyt kaikki kolme osaa toimivat yhdessä: robotti **aistii** sijaintinsa, **päättää** reitin ja **ohjaa** pyöriään. Tätä aisti–päätä–toimi-silmukkaa jokainen robotti toistaa kymmeniä kertoja sekunnissa.",
            "Now all three parts work together: the robot **senses** its position, **decides** on a path and **drives** its wheels. Every robot repeats this sense–think–act loop dozens of times per second."),
          tasks: [
            { id: "goal", text: tr("Paina Ohjaus-kortin Aja maaliin -nappia ja odota, että robotti on perillä", "Press Drive to goal in the Control card and wait until the robot arrives"), check: newArrival },
            { id: "move", text: tr("Klikkaa karttaa jossain muualla: robotti suunnittelee uuden reitin ja ajaa sinne. Odota, että se on perillä", "Click somewhere else on the map: the robot plans a new route and drives there. Wait until it arrives"), after: "goal", check: (c) => { const n = window.sim2dStatus?.()?.arrivals || 0; c.mem.n0 ??= n; return did(c, "pointerdown", "canvas") && n > c.mem.n0; } },
          ],
          hints: [tr("Robotti suunnittelee reitin esteiden ohi itse. Jos se jää jumiin, se peruuttaa ja etsii uuden reitin.", "The robot plans its own route around obstacles. If it gets stuck, it backs up and finds a new route."),
            tr("Klikkaa vapaata (vaaleaa) kohtaa, ei seinää. Seinän viereen klikattu maali siirretään lähimpään kohtaan, johon robotti mahtuu.", "Click a free (light) spot, not a wall. A goal next to a wall is moved to the nearest spot where the robot fits.")],
          quiz: { q: tr("Missä järjestyksessä robotin perussilmukka etenee?", "In which order does a robot's basic loop run?"),
            options: [tr("Aisti → päätä → toimi", "Sense → think → act"), tr("Toimi → aisti → päätä", "Act → sense → think"), tr("Päätä → toimi, ilman aistimista", "Think → act, without sensing")], correct: 0,
            explain: tr("Ensin mitataan, sitten lasketaan, sitten liikutaan — ja heti perään mitataan uudelleen, jotta virheet korjautuvat. Tätä kutsutaan takaisinkytkennäksi.", "First measure, then compute, then move — and immediately measure again so errors get corrected. This is called feedback.") },
        },
      ],
    },

    /* ----- Virta ja akut ----- */
    {
      id: "power", icon: "battery", minutes: 15, level: tr("Aloittelija", "Beginner"),
      title: tr("Virta ja akut", "Power and batteries"),
      desc: tr("Kuinka kauan akku kestää, mikä vie eniten virtaa ja miksi väärä jännitesäädin kuumenee. Jokaisen oikean robotin ensimmäinen ongelma.", "How long the battery lasts, what draws the most current and why the wrong regulator gets hot. Every real robot's first problem."),
      outcomes: [tr("Osaat arvioida akun käyttöajan", "Can estimate battery runtime"), tr("Tiedät, mitkä osat kuluttavat eniten", "Know which parts draw the most"),
        tr("Ymmärrät hakkurin ja lineaarisäätimen eron", "Understand the difference between buck and linear regulators"), tr("Tunnistat virtarajojen ylitykset", "Can spot exceeded current limits")],
      steps: [
        {
          id: "runtime", tool: "power", title: tr("Kuinka kauan akku kestää?", "How long does the battery last?"),
          teach: tr("Akun **kapasiteetti** kerrotaan milliampeeritunteina (mAh): 2000 mAh antaa 2 A tunnin ajan tai 1 A kaksi tuntia.\n\nkäyttöaika ≈ kapasiteetti / keskivirta\n\nLiPo-akkua ei kannata purkaa tyhjäksi, joten käytössä on noin 80 % kapasiteetista.",
            "A battery's **capacity** is given in milliamp-hours (mAh): 2000 mAh supplies 2 A for an hour or 1 A for two hours.\n\nruntime ≈ capacity / average current\n\nYou shouldn't drain a LiPo completely, so about 80 % of the capacity is usable."),
          tasks: [
            { id: "cap", text: tr("Muuta Kapasiteetti-kenttää ja katso, miten Käyttöaika muuttuu", "Change the Capacity field and watch how the Runtime changes"), check: (c) => changed(c, "power", (s) => s?.mAh, { mAh: 2200 }) },
            // Laatta näyttää yhden desimaalin: 2,96 h näkyy "3,0 h", joten verrataan pyöristettyä arvoa
            { id: "three", text: tr("Saa Käyttöaika vähintään 3 tuntiin", "Get the Runtime to at least 3 hours"), check: () => Math.round((window.powerResult?.().r.runtimeH || 0) * 10) >= 30 },
          ],
          hints: [tr("Isompi akku tai pienempi kulutus pidentää käyttöaikaa. Kokeile esim. 5000 mAh.", "A bigger battery or lower consumption extends the runtime. Try e.g. 5000 mAh.")],
          quiz: { q: tr("Robotti ottaa keskimäärin 0,5 A. Kuinka kauan 2000 mAh akku riittää, jos siitä käytetään 80 %?", "A robot draws 0.5 A on average. How long does a 2000 mAh battery last if 80 % of it is used?"),
            options: [tr("Noin 3,2 tuntia", "About 3.2 hours"), tr("Noin 4 tuntia", "About 4 hours"), tr("Noin 40 minuuttia", "About 40 minutes")], correct: 0,
            explain: tr("2000 mAh × 0,8 = 1600 mAh. 1600 mAh / 500 mA = 3,2 h.", "2000 mAh × 0.8 = 1600 mAh. 1600 mAh / 500 mA = 3.2 h.") },
        },
        {
          id: "loads", tool: "power", title: tr("Mikä vie virran?", "What draws the current?"),
          teach: tr("Elektroniikka kuluttaa yllättävän vähän: mikrokontrolleri ehkä 50–250 mA (Raspberry Pi jopa 0,5–1 A). **Moottorit** vievät lähes kaiken — ja käynnistyessään tai jumittuessaan moninkertaisesti (**jumivirta**). Akun ja moottoriohjaimen pitää kestää nämä piikit.",
            "Electronics draw surprisingly little: a microcontroller maybe 50–250 mA (a Raspberry Pi up to 0.5–1 A). **Motors** take almost everything — and many times more when starting or stalled (**stall current**). The battery and the motor driver must survive these spikes."),
          tasks: [
            { id: "add", text: tr("Lisää kuormataulukkoon uusi osa + Lisää kuorma -napilla (esim. servo: keskivirta 200 mA, huippu 1500 mA)", "Add a new part to the loads table with + Add load (e.g. a servo: average 200 mA, peak 1500 mA)"),
              check: (c) => (tools().power?.loads?.length ?? 3) > (c.base.tools.power?.loads?.length ?? 3) },
            { id: "peak", text: tr("Vertaa laattoja Keskivirta akusta, Huippuvirta akusta ja Akun jatkuva raja: keskivirta määrää käyttöajan, ja huippuvirran pitää mahtua akun purkukykyyn", "Compare the Average battery current, Peak battery current and Battery continuous limit tiles: the average sets the runtime, and the peak must fit the battery's discharge rating") },
          ],
          hints: [tr("+ Lisää kuorma -nappi on kuormataulukon alla. Kirjoita uudelle riville nimi ja virrat. Servon keskivirta on tyypillisesti 100–300 mA ja huippu 1–2,5 A (esim. MG996R).", "The + Add load button is below the loads table. Type a name and the currents on the new row. A servo typically averages 100–300 mA and peaks at 1–2.5 A (e.g. MG996R).")],
          quiz: { q: tr("Miksi moottoriohjaimen huippuvirta on tärkeä, vaikka moottori ottaa ajossa vain vähän?", "Why does the motor driver's peak current matter even if the motor draws little while driving?"),
            options: [tr("Koska käynnistyessä ja jumissa moottori ottaa moninkertaisen virran", "Because a starting or stalled motor draws many times more current"), tr("Koska huippuvirta kasvattaa nopeutta", "Because peak current increases speed"), tr("Sillä ei ole väliä", "It doesn't matter")], correct: 0,
            explain: tr("Jumivirta voi olla 5–10× ajovirta. Jos ohjain ei kestä sitä, se ylikuumenee tai rikkoutuu juuri silloin, kun robotti törmää seinään.", "Stall current can be 5–10× the running current. If the driver can't take it, it overheats or breaks exactly when the robot hits a wall.") },
        },
        {
          id: "reg", tool: "power", title: tr("Jännitesäädin ja lämpö", "Regulator and heat"),
          teach: tr("Akku on usein 7–12 V, mutta elektroniikka haluaa 5 V tai 3,3 V. **Lineaarinen säädin** (esim. 7805) polttaa ylimääräisen jännitteen lämmöksi: häviö = (Vsisään − Vulos) × virta. **Hakkuri** (buck) muuntaa jännitteen pienellä häviöllä (hyötysuhde tyypillisesti 80–92 %).",
            "The battery is often 7–12 V, but electronics want 5 V or 3.3 V. A **linear regulator** (e.g. 7805) burns the extra voltage as heat: loss = (Vin − Vout) × current. A **buck converter** converts the voltage with a small loss (typically 80–92 % efficient)."),
          tasks: [
            { id: "linear", text: tr("Valitse työkalun Esimerkit-valikosta Raspberry Pi -rover ja vaihda Jännitesäädin-kortissa säätimeksi Lineaarinen. Katso Säätimen lämpöhäviö -laattaa", "Choose Raspberry Pi rover from the tool's Examples menu and set the regulator to Linear in the Voltage regulator card. Look at the Regulator heat loss tile"),
              check: () => { const p = window.powerResult?.(); return !!p && p.s.regType === "linear" && p.r.regLossAvg > 1; } },
            { id: "buck", text: tr("Vaihda takaisin hakkuriin: paljonko lämpöhäviö pieneni?", "Switch back to the buck converter: how much did the heat loss drop?"), after: "linear",
              check: () => { const p = window.powerResult?.(); return !!p && p.s.regType === "buck" && p.r.regLossAvg < 1; } },
            { id: "limits", text: tr("Valitse Esimerkit-valikosta Alimitoitettu kokoonpano ja lue punaiset varoitukset: mitkä osat ovat liian heikkoja?", "Choose Undersized setup from the Examples menu and read the red warnings: which parts are too weak?"), after: "buck",
              check: () => { const p = window.powerResult?.(); return !!p && p.r.warnings.filter((w) => w.level === "err").length >= 2; } },
          ],
          hints: [tr("Esimerkit-valikko on työkalun otsikon vieressä. Säätimen valinta on Jännitesäädin-kortissa, ja lämpöhäviö näkyy tuloslaatoissa.", "The Examples menu is next to the tool's title. The regulator choice is in the Voltage regulator card, and the heat loss shows in the result tiles."),
            tr("Raspberry Pi ottaa paljon virtaa 5 V:sta, joten lineaarinen säädin muuttaa useita watteja lämmöksi.", "A Raspberry Pi draws a lot of current from 5 V, so a linear regulator turns several watts into heat.")],
          quiz: { q: tr("12 V akku, 5 V lineaarinen säädin ja 1 A kuorma. Kuinka paljon tehoa säädin muuttaa lämmöksi?", "12 V battery, 5 V linear regulator and a 1 A load. How much power does the regulator turn into heat?"),
            options: ["7 W", "5 W", "12 W"], correct: 0,
            explain: tr("(12 − 5) V × 1 A = 7 W — kuin pieni juotoskolvi! Ilman isoa jäähdytyslevyä säädin ylikuumenee. Hakkurilla häviö olisi noin 1 W.", "(12 − 5) V × 1 A = 7 W — like a small soldering iron! Without a big heatsink the regulator overheats. A buck converter would lose about 1 W.") },
        },
      ],
    },

    /* ----- Anturit ja elektroniikka ----- */
    {
      id: "sensors", icon: "plug", minutes: 20, level: tr("Aloittelija", "Beginner"),
      title: tr("Anturit ja elektroniikka", "Sensors and electronics"),
      desc: tr("Miten robotti mittaa maailmaa: sarjaportin data, etäisyysanturit, kohina ja oikean robotin kytkeminen USB:llä.", "How a robot measures the world: serial data, distance sensors, noise and connecting a real robot over USB."),
      outcomes: [tr("Osaat lukea anturidataa sarjaportista", "Can read sensor data from a serial port"), tr("Tunnet etäisyysanturien erot", "Know the differences between distance sensors"),
        tr("Ymmärrät mittauskohinan ja sen suodattamisen", "Understand measurement noise and filtering"), tr("Tiedät, miten simulaatio kytketään oikeaan robottiin", "Know how a simulation connects to a real robot")],
      steps: [
        {
          id: "serial", tool: "serial", title: tr("Anturidata sarjaportista", "Sensor data from the serial port"),
          teach: tr("Anturi antaa mikrokontrollerille luvun: jännitteen, pulssin pituuden tai digitaalisen viestin. Mikrokontrolleri voi lähettää lukemat tietokoneelle **sarjaportin** kautta USB-kaapelia pitkin.\n\nKun jokainen rivi on muotoa `nimi:arvo, nimi2:arvo2`, Sarjaportti-työkalu piirtää jokaisen nimen omaksi käyräkseen. Molempien päiden pitää käyttää samaa **baudinopeutta** (esim. 115200).",
            "A sensor gives the microcontroller a number: a voltage, a pulse length or a digital message. The microcontroller can send the readings to a computer over the **serial port** through the USB cable.\n\nWhen every line looks like `name:value, name2:value2`, the Serial port tool plots each name as its own curve. Both ends must use the same **baud rate** (e.g. 115200)."),
          tasks: [
            { id: "data", text: tr("Yhdistä laitteeseen tai paina Yhteys-kortin linkkiä ”Ei laitetta? Kokeile demodatalla” ja odota, että käyrät piirtyvät", "Connect a device or press the “No device? Try with demo data” link in the Connection card and wait for the curves to draw"), check: () => (window.serialStatus?.().rows || 0) >= 20 },
            { id: "read", text: tr("Katso käyrien selitteestä, montako eri sarjaa (anturia) dataan tuli", "Check from the plot legend how many different series (sensors) the data has") },
          ],
          hints: [tr("Ilman laitetta: demodatan linkki on Yhteys-kortissa. Oikealla laitteella valitse ensin sama baudinopeus kuin koodissa.", "Without a device: the demo data link is in the Connection card. With a real device, first pick the same baud rate as in your code.")],
          quiz: { q: tr("Sarjamonitorissa näkyy pelkkää sotkua (esim. ⸮⸮⸮). Mikä on todennäköisin syy?", "The serial monitor shows only garbage (e.g. ⸮⸮⸮). What is the most likely cause?"),
            options: [tr("Baudinopeus on eri kuin laitteen koodissa", "The baud rate differs from the device's code"), tr("Anturi on rikki", "The sensor is broken"), tr("USB-kaapeli on liian pitkä", "The USB cable is too long")], correct: 0,
            explain: tr("Väärällä nopeudella bitit luetaan väärästä kohdasta, ja tavuista tulee satunnaisia merkkejä. Tarkista Serial.begin()-luku ja työkalun nopeus.", "At the wrong speed the bits are sampled at the wrong moments and the bytes become random characters. Check the Serial.begin() number and the tool's speed.") },
        },
        {
          id: "range", tool: "map", title: tr("Etäisyysanturit", "Distance sensors"),
          teach: tr("Robotti näkee esteet etäisyysantureilla:\n\n- **Ultraääni** (esim. HC-SR04): halpa, 2 cm – 4 m, leveä keila\n- **ToF-laser** (esim. VL53L0X): pieni ja tarkka, kantama noin 1–2 m (VL53L1X jopa 4 m), kapea keila\n- **Lidar**: pyörivä laser, satoja mittauksia kierroksessa, 6–12 m\n\nUltraäänianturi mittaa, kuinka kauan kaiun paluu kestää: etäisyys = äänen nopeus × aika / 2 (ääni kulkee esteelle ja takaisin).\n\nKantama ja säteiden määrä ratkaisevat, kuinka nopeasti robotti kartoittaa ympäristönsä.",
            "A robot sees obstacles with distance sensors:\n\n- **Ultrasonic** (e.g. HC-SR04): cheap, 2 cm – 4 m, wide beam\n- **ToF laser** (e.g. VL53L0X): small and precise, range about 1–2 m (VL53L1X up to 4 m), narrow beam\n- **Lidar**: a spinning laser, hundreds of readings per turn, 6–12 m\n\nAn ultrasonic sensor measures how long the echo takes to come back: distance = speed of sound × time / 2 (the sound travels to the obstacle and back).\n\nRange and the number of beams decide how quickly the robot maps its surroundings."),
          tasks: [
            { id: "beams", text: tr("Muuta Robotti ja lidar -kortin Lidar-säteitä-kenttää", "Change the Lidar beams field in the Robot and lidar card"), check: (c) => changed(c, "occ", (s) => s?.beams, { beams: 90 }) },
            { id: "short", text: tr("Aseta Lidarin kantama enintään 1 m:iin (kuin lyhyen kantaman ToF-anturi). Paina sitten Ohjaus-kortin Nollaa kartoitus ja ▶ Tutki automaattisesti", "Set the Lidar range to 1 m or less (like a short-range ToF sensor). Then press Reset mapping and ▶ Explore automatically in the Control card"),
              check: (c) => (tools().occ?.range ?? 2.5) <= 1 && did(c, "click", "#oc-explore") },
            { id: "watch", text: tr("Seuraa Kartoitettu- ja Ajettu matka -laattoja: lyhyellä kantamalla robotin on ajettava paljon enemmän", "Watch the Mapped and Distance driven tiles: with a short range the robot has to drive much further"), look: 15 },
          ],
          hints: [tr("Säädöt ovat Robotti ja lidar -kortissa. Kirjoita kantamaksi esimerkiksi 0,8.", "The controls are in the Robot and lidar card. Type a range of e.g. 0.8."),
            tr("Nollaa kartoitus pyyhkii vanhan kartan, jotta näet, kuinka hitaasti lyhyen kantaman anturi kartoittaa alusta asti.", "Reset mapping wipes the old map so you can see how slowly a short-range sensor maps from scratch.")],
          quiz: { q: tr("Miksi lyhyen kantaman anturilla kartoitus kestää kauemmin?", "Why does mapping take longer with a short-range sensor?"),
            options: [tr("Robotin on ajettava lähelle jokaista seinää nähdäkseen sen", "The robot has to drive close to every wall to see it"), tr("Anturi mittaa hitaammin", "The sensor measures more slowly"), tr("Kartta tallentuu hitaammin", "The map saves more slowly")], correct: 0,
            explain: tr("Kantaman ulkopuolelta ei tule tietoa lainkaan. Pitkän kantaman lidar näkee huoneen toiselle puolelle yhdellä kierroksella.", "Nothing at all is learned beyond the range. A long-range lidar sees across the room in one turn.") },
        },
        {
          id: "noise", tool: "map", title: tr("Kohina ja suodatus", "Noise and filtering"),
          // Edellisen vaiheen lyhyt kantama palautetaan, jotta kohinan vaikutus näkyy eikä kartoitus kestä turhan kauan
          enter: () => { const s = activeProject().tools.occ; if (s && (s.range ?? 2.5) < 2.5) saveToolState("occ", { ...s, range: 2.5 }, { undo: false }); },
          teach: tr("Jokaisessa mittauksessa on **kohinaa**: sama etäisyys antaa hieman eri lukeman joka kerta. Yksittäiseen lukemaan ei voi luottaa, mutta monta lukemaa yhdessä kertoo totuuden.\n\nKartta yhdistää mittaukset **log-odds**-luvuilla: jokainen osuma lisää varmuutta esteestä vähän kerrallaan, joten satunnainen virhe ei heti piirrä seinää.\n\nYksittäisen villin lukeman poistaa parhaiten **mediaanisuodatin**: otetaan muutaman viimeisen lukeman keskimmäinen. Keskiarvoon virhelukema vaikuttaa aina.",
            "Every measurement has **noise**: the same distance gives a slightly different reading each time. You can't trust a single reading, but many readings together tell the truth.\n\nThe map combines readings with **log-odds**: each hit adds a little confidence in an obstacle, so a random error doesn't draw a wall right away.\n\nA single wild reading is best removed with a **median filter**: take the middle one of the last few readings. A bad reading always pulls the average."),
          tasks: [
            { id: "noisy", text: tr("Paina Robotti ja lidar -kortin alareunasta Näytä lisäasetukset, nosta Mittauskohina vähintään 0,5:een ja paina sitten Nollaa kartoitus ja ▶ Tutki automaattisesti", "Press Show advanced settings at the bottom of the Robot and lidar card, raise Measurement noise to at least 0.5, then press Reset mapping and ▶ Explore automatically"),
              check: (c) => (tools().occ?.noise ?? 0) >= 0.5 && did(c, "click", "#oc-explore") },
            { id: "truth", text: tr("Laita Vertaa todellisiin seiniin päälle ja katso Tarkkuus-laattaa: kuinka hyvin kartta silti osuu?", "Turn on Compare to true walls and look at the Accuracy tile: how well does the map still match?"), after: "noisy", check: () => !!tools().occ?.showTruth },
          ],
          hints: [tr("Linkki on Robotti ja lidar -kortin alareunassa: Näytä lisäasetukset (kohina, log-odds).", "The link is at the bottom of the Robot and lidar card: Show advanced settings (noise, log-odds)."),
            tr("Anna robotin tutkia hetki: kohinainen anturi tekee aluksi virheitä, mutta toistuvat mittaukset korjaavat kartan.", "Let the robot explore for a while: a noisy sensor makes mistakes at first, but repeated measurements fix the map.")],
          quiz: { q: tr("Miten kohinaisesta anturista saadaan luotettavampi?", "How do you get more reliable data from a noisy sensor?"),
            options: [tr("Yhdistämällä monta mittausta (keskiarvo tai suodatin)", "By combining many measurements (an average or a filter)"), tr("Käyttämällä vain ensimmäistä mittausta", "By using only the first measurement"), tr("Nostamalla baudinopeutta", "By raising the baud rate")], correct: 0,
            explain: tr("Satunnaiset virheet kumoavat toisiaan, kun mittauksia yhdistetään. Siksi robotit käyttävät suodattimia, kuten liukuvaa keskiarvoa tai Kalman-suodatinta.", "Random errors cancel out when measurements are combined. That's why robots use filters such as a moving average or a Kalman filter.") },
        },
        {
          id: "usb", tool: "nn2d", title: tr("Simulaatio oikeaan robottiin", "From simulation to a real robot"),
          teach: tr("Simulaatiossa koulutetut aivot tarvitsevat oikealta robotilta samat anturiarvot. **Live-linkissä** robotti lähettää anturit USB:llä riveinä `S:…`, RoboLab laskee aivot ja vastaa moottorikomennoilla `M:…`. Näin näet heti, toimiiko robotti, ennen kuin lataat aivot laitteelle.\n\nMicroPython-laitteelle (ESP32, Pico) aivot voi myös ladata suoraan USB:llä.",
            "A brain trained in simulation needs the same sensor values from the real robot. In the **live link** the robot sends its sensors over USB as `S:…` lines, RoboLab runs the brain and replies with motor commands `M:…`. You see right away whether the robot works before uploading the brain to the device.\n\nFor a MicroPython board (ESP32, Pico) the brain can also be uploaded straight over USB."),
          tasks: [
            { id: "open", text: tr("Paina Aivot-kortin nappia Vie omalle robotille", "Press Put on a real robot in the Brain card"), check: (c) => { const n = window.rsDeployOpened || 0; if (n < (c.base.deploys || 0)) c.base.deploys = n; return n > (c.base.deploys || 0); } },
            { id: "link", text: tr("Valitse välilehti Live-linkki (USB) ja lue, mitä luonnokseen pitää täyttää", "Pick the Live link (USB) tab and read what the sketch needs filled in"), check: () => tools().nn2d?.deployTarget === "link" },
          ],
          hints: [tr("Aivot-kortti on Neuroverkkosimulaatio 2D:n asetuskorttien joukossa (kapealla näytöllä simulaation alla). Varoitus kouluttamattomista aivoista on tässä normaali: nyt katsotaan vain, miten robotti kytketään.", "The Brain card is among the Neural network sim 2D settings cards (below the simulation on a narrow screen). The 'not trained yet' warning is expected here: this time we only look at how the robot is connected."),
            tr("Vientidialogin yläreunassa on välilehdet. Live-linkin luonnoksessa jokainen TODO-rivi on yksi anturi tai moottori.", "The export dialog has tabs at the top. In the live link sketch every TODO line is one sensor or motor.")],
          quiz: { q: tr("Mitä robotti lähettää live-linkissä RoboLabiin?", "What does the robot send to RoboLab in the live link?"),
            options: [tr("Anturiarvot, joista aivot laskevat moottorikomennot", "Sensor values, from which the brain computes motor commands"), tr("Neuroverkon painot", "The neural network weights"), tr("Kamerakuvan", "A camera image")], correct: 0,
            explain: tr("Aivot ajetaan tietokoneella, joten robotin tarvitsee vain mitata ja liikkua. Kun kaikki toimii, samat aivot voi viedä laitteelle, jolloin kaapelia ei enää tarvita.", "The brain runs on the computer, so the robot only has to measure and move. Once it all works, the same brain can go onto the device and the cable is no longer needed.") },
        },
      ],
    },

    /* ----- ROS-perusteet ----- */
    {
      id: "ros", icon: "cube", minutes: 20, level: tr("Keskitaso", "Intermediate"),
      title: tr("ROS-perusteet", "ROS basics"),
      desc: tr("ROS on robotiikan yleisin ohjelmistokehys. Opi sen tärkeimmät ideat: solmut ja topicit, TF-puu, URDF, kvaterniot ja kartat.", "ROS is the most common robotics software framework. Learn its key ideas: nodes and topics, the TF tree, URDF, quaternions and maps."),
      outcomes: [tr("Tiedät, mitä solmut, topicit ja viestit ovat", "Know what nodes, topics and messages are"), tr("Osaat lukea TF-puuta", "Can read a TF tree"),
        tr("Ymmärrät URDF-mallin linkit ja nivelet", "Understand a URDF model's links and joints"), tr("Tunnet ROS:n koordinaattisopimukset", "Know ROS coordinate conventions")],
      steps: [
        {
          id: "tf", tool: "sim3d", title: tr("Solmut, topicit ja TF", "Nodes, topics and TF"),
          teach: tr("ROS-järjestelmä koostuu **solmuista** (nodes), jotka ovat pieniä ohjelmia: yksi lukee lidaria, toinen suunnittelee reittiä, kolmas ohjaa moottoreita. Ne viestivät **topicien** kautta: lidar-solmu julkaisee `/scan`-topiciin ja muut tilaavat sen.\n\n**TF**-järjestelmä kertoo jokaiselle solmulle, missä robotin osat ovat toisiinsa nähden. Lidarin mittaus on lidarin kehyksessä, mutta reittisuunnittelija tarvitsee sen kartan kehyksessä — TF tekee muunnoksen.",
            "A ROS system is made of **nodes**, small programs: one reads the lidar, another plans the path, a third drives the motors. They talk through **topics**: the lidar node publishes to `/scan` and others subscribe to it.\n\nThe **TF** system tells every node where the robot's parts are relative to each other. A lidar reading is in the lidar's frame, but the path planner needs it in the map frame — TF does the transform."),
          tasks: [
            { id: "add", text: tr("Lisää TF-puuhun IMU-anturin kehys imu_link, jonka vanhempi on base_link", "Add an IMU sensor frame imu_link to the TF tree with base_link as its parent"), check: () => (tools().sim3d?.frames || []).some((f) => /imu/i.test(f.name || "") && f.parent === "base_link") },
            { id: "tf", text: tr("Laske muunnos base_link → imu_link Muunnos kehysten välillä -kortissa", "Compute the transform base_link → imu_link in the Transform between frames card"), check: (c) => { const s = tools().sim3d; return did(c, "change", "#s3-from, #s3-to") && s?.from === "base_link" && /imu/i.test(s?.to || ""); } },
          ],
          hints: [tr("'+ Lisää kehys' on taulukon alla. Kirjoita nimeksi imu_link ja valitse vanhemmaksi base_link.", "'+ Add frame' is below the table. Name it imu_link and pick base_link as the parent.")],
          quiz: { q: tr("Lidar-solmu julkaisee mittaukset ja reittisuunnittelija lukee ne. Mitä kautta?", "The lidar node publishes readings and the path planner reads them. Through what?"),
            options: [tr("Topicin, esim. /scan", "A topic, e.g. /scan"), tr("TF-puun", "The TF tree"), tr("URDF-tiedoston", "The URDF file")], correct: 0,
            explain: tr("Topic on nimetty viestikanava: julkaisija ei tiedä, kuka kuuntelee. Siksi solmuja voi vaihtaa ja lisätä muuttamatta muita.", "A topic is a named message channel: the publisher doesn't know who listens. That's why nodes can be swapped and added without changing the others.") },
        },
        {
          id: "urdf", tool: "sim3d", title: tr("URDF: robotin kuvaus", "URDF: describing the robot"),
          teach: tr("**URDF** on XML-tiedosto, joka kuvaa robotin **linkkeinä** (jäykät osat: muoto, massa) ja **nivelinä** (joint: tyyppi, akseli, rajat). Nivelen tyyppi voi olla esim. `revolute` (kääntyy rajojen välillä), `continuous` (pyörä), `prismatic` (liukuu) tai `fixed` (kiinteä, esim. anturi).\n\nROS laskee URDF:stä ja nivelkulmista TF-puun automaattisesti (robot_state_publisher).",
            "**URDF** is an XML file that describes a robot as **links** (rigid parts: shape, mass) and **joints** (type, axis, limits). A joint type can be e.g. `revolute` (turns between limits), `continuous` (a wheel), `prismatic` (slides) or `fixed` (rigid, e.g. a sensor).\n\nROS computes the TF tree from the URDF and the joint angles automatically (robot_state_publisher)."),
          tasks: [
            { id: "open", text: tr("Vaihda työkalu tilaan URDF-malli (valinta TF-puu | URDF-malli). Esimerkkirobotti latautuu valmiiksi", "Switch the tool to URDF model (the TF tree | URDF model switch). The example robot loads automatically"), check: () => tools().sim3d?.mode === "urdf" },
            { id: "joints", text: tr("Liikuta Nivelet-kortin liukusäätimiä ja katso, miten linkit liikkuvat", "Move the sliders in the Joints card and watch how the links move"), after: "open", check: (c) => did(c, ["input", "change"], "#s3-joints") },
          ],
          hints: [tr("TF-puu | URDF-malli -valinta on omassa kortissaan (kapealla näytöllä 3D-näkymän alla). Nivelten liukusäätimet ovat Nivelet-kortissa.", "The TF tree | URDF model switch is in its own card (below the 3D view on a narrow screen). The joint sliders are in the Joints card.")],
          quiz: { q: tr("Minkä tyyppinen nivel sopii robotin pyörälle URDF:ssä?", "Which joint type suits a robot wheel in URDF?"),
            options: ["continuous", "fixed", "prismatic"], correct: 0,
            explain: tr("continuous kääntyy rajattomasti ympäri, kuten pyörä. revolute on samanlainen, mutta sillä on ala- ja yläraja.", "continuous turns around without limits, like a wheel. revolute is similar but has a lower and an upper limit.") },
        },
        {
          id: "quat", tool: "rot", title: tr("ROS:n koordinaatit ja kvaterniot", "ROS coordinates and quaternions"),
          teach: tr("ROS:n sopimus **REP-103**: x eteen, y vasemmalle, z ylös, oikeakätinen koordinaatisto, kulmat radiaaneina. Asennot tallennetaan **kvaternioina** järjestyksessä **x, y, z, w** (geometry_msgs/Quaternion).\n\nKun robotti kääntyy paikallaan, muuttuu vain yaw eli kierto z:n ympäri.",
            "The ROS convention **REP-103**: x forward, y left, z up, right-handed, angles in radians. Orientations are stored as **quaternions** in the order **x, y, z, w** (geometry_msgs/Quaternion).\n\nWhen a robot turns in place, only the yaw changes, i.e. the rotation about z."),
          tasks: [
            { id: "yaw", text: tr("Käännä robottia 90° vasemmalle: yaw (Z) = 90°, muut 0", "Turn the robot 90° left: yaw (Z) = 90°, the others 0"), check: () => { const e = rotEuler(); return near(e[0], 90 * D, 1 * D) && near(e[1], 0, 1 * D) && near(e[2], 0, 1 * D); } },
            { id: "read", text: tr("Lue kvaternio-kortista arvot x, y, z ja w", "Read the x, y, z and w values from the quaternion card") },
          ],
          hints: [tr("Euler-kulmat-kortin ensimmäinen kenttä on Z (yaw), kun järjestys on ZYX.", "The first field in the Euler angles card is Z (yaw) when the order is ZYX.")],
          quiz: { q: tr("Robotti on kääntynyt 90° vasemmalle. Mikä on sen asento ROS-kvaterniona (x, y, z, w)?", "The robot has turned 90° left. What is its orientation as a ROS quaternion (x, y, z, w)?"),
            options: ["(0, 0, 0.707, 0.707)", "(0.707, 0, 0, 0.707)", "(0, 0, 1, 0)"], correct: 0,
            explain: tr("Kierto z:n ympäri: z = sin(45°) = 0,707 ja w = cos(45°) = 0,707. (0, 0, 1, 0) olisi 180° käännös.", "A rotation about z: z = sin(45°) = 0.707 and w = cos(45°) = 0.707. (0, 0, 1, 0) would be a 180° turn.") },
        },
        {
          id: "map", tool: "map", title: tr("Kartat ROS:ssa", "Maps in ROS"),
          teach: tr("ROS:n navigointi (Nav2) käyttää **varauskarttaa**: PGM-kuva (valkoinen = vapaa, musta = este, harmaa = tuntematon) ja YAML-tiedosto, joka kertoo solun koon (`resolution`) ja kartan alkupisteen (`origin`). `map_server` julkaisee kartan `/map`-topiciin.\n\nKartta tehdään yleensä SLAMilla: robotti ajaa ympäriinsä, piirtää kartan lidarilla ja samalla paikantaa itsensä siihen. Tässä työkalussa robotin paikka tiedetään tarkasti, joten näet SLAMin kartoitusosan.",
            "ROS navigation (Nav2) uses an **occupancy grid** map: a PGM image (white = free, black = obstacle, gray = unknown) and a YAML file giving the cell size (`resolution`) and the map's origin (`origin`). `map_server` publishes the map on the `/map` topic.\n\nThe map is usually made with SLAM: the robot drives around, draws the map with its lidar and at the same time locates itself on it. In this tool the robot's pose is known exactly, so you see the mapping half of SLAM."),
          tasks: [
            { id: "explore", text: tr("Paina ▶ Tutki automaattisesti ja odota, kunnes Kartoitettu-luku on yli 30 %", "Press ▶ Explore automatically and wait until the Mapped number is over 30 %"), check: (c) => did(c, "click", "#oc-explore") && (window.occCoverage?.() || 0) > 0.3 },
            { id: "export", text: tr("Vie kartta Vienti-kortin napeilla Vie PGM (ROS) ja Vie YAML", "Export the map with the Export PGM (ROS) and Export YAML buttons in the Export card"), after: "explore", check: (c) => did(c, "click", "#oc-pgm") && did(c, "click", "#oc-yaml") },
          ],
          hints: [tr("Vienti-kortti on samassa sarakkeessa kuin Robotti ja lidar -kortti (kapealla näytöllä kartan alla).", "The Export card is in the same column as the Robot and lidar card (below the map on a narrow screen).")],
          quiz: { q: tr("Mitä YAML-tiedoston resolution: 0.05 tarkoittaa?", "What does resolution: 0.05 in the YAML file mean?"),
            options: [tr("Yksi kartan pikseli on 5 cm × 5 cm", "One map pixel is 5 cm × 5 cm"), tr("Kartta on 5 % todellisesta koosta", "The map is 5 % of real size"), tr("Kohinaa on 5 %", "There is 5 % noise")], correct: 0,
            explain: tr("resolution on metreinä per pikseli. 0,05 m = 5 cm, joten 200 × 200 pikselin kartta kattaa 10 × 10 m alueen.", "resolution is metres per pixel. 0.05 m = 5 cm, so a 200 × 200 pixel map covers a 10 × 10 m area.") },
        },
      ],
    },

    /* ----- Konenäkö ----- */
    {
      id: "vision", icon: "eye", minutes: 20, level: tr("Aloittelija", "Beginner"),
      title: tr("Konenäkö: robotti näkee", "Computer vision: a robot that sees"),
      desc: tr("Miten kamerakuvasta saadaan tietoa: pikselit, kynnystys, värit ja reunat. Lopuksi lasket viivan tai pallon paikasta, mihin suuntaan robotin pitää kääntyä.", "How to get information from a camera image: pixels, thresholds, colours and edges. In the end you work out from a line or a ball which way the robot should turn."),
      outcomes: [tr("Tiedät, miten kamera esittää kuvan lukuina", "Know how a camera represents an image as numbers"), tr("Osaat erottaa kohteen kynnystyksellä ja värillä", "Can separate an object with a threshold and colour"),
        tr("Ymmärrät reunantunnistuksen", "Understand edge detection"), tr("Osaat muuttaa kohteen paikan ohjauskomennoksi", "Can turn an object's position into a steering command")],
      steps: [
        {
          id: "pixels", tool: "cv", title: tr("Kuva on lukuja", "An image is numbers"),
          teach: tr("Kamerakuva on ruudukko **pikseleitä**. Jokaisella on kolme lukua 0–255: punainen, vihreä ja sininen (RGB). 320 × 240 kuvassa on 76 800 pikseliä — jokaisessa kuvassa!\n\nUsein ensimmäinen askel on **harmaasävy**: kolme lukua yhdistetään yhdeksi kirkkaudeksi. Käsiteltävää on silloin kolme kertaa vähemmän.",
            "A camera image is a grid of **pixels**. Each has three numbers 0–255: red, green and blue (RGB). A 320 × 240 image has 76,800 pixels — every frame!\n\nOften the first step is **grayscale**: the three numbers are combined into one brightness. That leaves three times less to process."),
          tasks: [
            { id: "gray", text: tr("Vaihda käsittelyksi 2. Harmaasävy", "Switch the processing to 2. Grayscale"), check: () => tools().cv?.mode === "gray" },
            { id: "look", text: tr("Vertaa: mitkä pallot näyttävät harmaasävynä lähes samalta?", "Compare: which balls look almost the same in grayscale?") },
          ],
          hints: [tr("Käsittely-valikko on Asetukset-kortissa.", "The Processing menu is in the Settings card.")],
          quiz: { q: tr("Miksi pelkkä harmaasävy ei riitä punaisen pallon löytämiseen?", "Why isn't grayscale alone enough to find the red ball?"),
            options: [tr("Eri värit voivat olla yhtä kirkkaita, joten väri-ero katoaa", "Different colours can be equally bright, so the colour difference is lost"), tr("Harmaasävy on liian iso", "Grayscale is too big"), tr("Kamera ei näe punaista", "The camera can't see red")], correct: 0,
            explain: tr("Punainen ja vihreä pallo voivat olla lähes yhtä kirkkaita. Harmaasävy sopii muotojen ja kirkkauserojen etsimiseen, väri tarvitaan värien erotteluun.", "A red and a green ball can be almost equally bright. Grayscale suits shapes and brightness differences; colour is needed to tell colours apart.") },
        },
        {
          id: "line", tool: "cv", title: tr("Kynnystys ja viivanseuraaja", "Thresholds and a line follower"),
          teach: tr("**Kynnystys** muuttaa harmaasävykuvan mustavalkoiseksi: rajaa tummemmat pikselit ovat kohdetta, muut taustaa. Viivanseuraaja etsii näin mustan viivan vaalealta lattialta.\n\nKohde näytetään valkoisena. Kun valkoisten pikselien **keskipiste** lasketaan, saadaan viivan paikka. Jos se on kuvan vasemmalla puolella, robotin pitää kääntyä vasemmalle: ohjaus = (x − keskikohta) / (puolet kuvan leveydestä); negatiivinen = käänny vasemmalle.\n\nViivanseuraaja tutkii vain kuvan **alakolmannesta** (katkoviivalaatikko): se ohjaa sen mukaan, missä viiva on juuri sen edessä.",
            "**Thresholding** turns a grayscale image into black and white: pixels darker than the limit are the object, the rest is background. A line follower finds a black line on a light floor this way.\n\nThe object is shown in white. The **centroid** of the white pixels gives the line's position. If it's on the left side of the image, the robot has to turn left: steering = (x − centre) / half width; negative = turn left.\n\nA line follower only looks at the **bottom third** of the image (the dashed box): it steers by where the line is right in front of it."),
          tasks: [
            { id: "ex", text: tr("Valitse työkalun Esimerkit-valikosta Viivanseuraaja", "Choose Line follower from the tool's Examples menu"), check: () => tools().cv?.source === "line" && tools().cv?.mode === "threshold" },
            { id: "high", text: tr("Vedä Kynnys-liukusäädin liian suureksi (vähintään 190): mitä lattialle tapahtuu?", "Drag the Threshold slider too high (at least 190): what happens to the floor?"), after: "ex",
              check: () => { const s = tools().cv || {}; return s.source === "line" && s.mode === "threshold" && s.thr >= 190; } },
            { id: "thr", text: tr("Laske kynnys takaisin niin, että vain viiva on valkoinen ja Kohde löytyi -laatta sanoo kyllä", "Lower the threshold again so that only the line is white and the Object found tile says yes"), after: "high",
              check: () => { const s = tools().cv || {}, r = window.cvResult?.(); return s.source === "line" && s.mode === "threshold" && s.thr < 190 && !!r?.found && r.area < 0.15; } },
          ],
          hints: [tr("Liian suuri kynnys tekee myös lattian tummemmista kohdista kohdetta, liian pieni hävittää viivan. Hyvä kynnys on noin 60–120.", "Too high a threshold makes the darker parts of the floor part of the object, too low makes the line disappear. A good threshold is about 60–120.")],
          quiz: { q: tr("Miksi viivanseuraaja katsoo vain kuvan alakolmannesta?", "Why does a line follower only look at the bottom third of the image?"),
            options: [tr("Se näkee viivan juuri edessään; kaukaiset mutkat eivät saa kääntää sitä liian aikaisin", "It sees the line right in front of it; distant bends must not turn it too early"), tr("Kuvan yläosa on aina musta", "The top of the image is always black"), tr("Se säästää akkua", "It saves battery")], correct: 0,
            explain: tr("Robotti ohjaa sen mukaan, missä viiva on nyt. Jos se reagoisi kaukana olevaan mutkaan, se oikaisisi ja putoaisi viivalta.", "The robot steers by where the line is now. If it reacted to a bend far ahead, it would cut the corner and lose the line.") },
        },
        {
          id: "color", tool: "cv", title: tr("Väritunnistus", "Colour detection"),
          // Viivanseuraajan esimerkki rajasi tutkittavan alueen alakolmannekseen, jossa palloja ei ole
          enter: () => { const s = activeProject().tools.cv; if (s?.roi === "bottom") saveToolState("cv", { ...s, roi: "full" }, { undo: false }); },
          teach: tr("Värin etsimiseen RGB on hankala, koska varjo muuttaa kaikkia kolmea lukua. **HSV**-esityksessä väri on yksi luku, **sävy** (hue, 0–360°), ja kirkkaus on erikseen. Varjossakin punainen pysyy punaisena.\n\nKohde on pikseli, jonka sävy on lähellä haettua ja joka on tarpeeksi **kylläinen** (ei harmaa).",
            "RGB is awkward for finding a colour because a shadow changes all three numbers. In **HSV**, colour is one number, the **hue** (0–360°), and brightness is separate. Even in shadow, red stays red.\n\nAn object pixel is one whose hue is close to the one you want and which is **saturated** enough (not gray)."),
          tasks: [
            { id: "blue", text: tr("Valitse Kuvalähde-valikosta Näyte: värilliset pallot ja klikkaa kamerakuvasta sinistä palloa", "Choose Sample: coloured balls in the Image source menu and click the blue ball in the camera image"), check: () => { const s = tools().cv; return !!s && s.mode === "color" && (s.source ?? "balls") === "balls" && s.hue >= 200 && s.hue <= 250; } },
            { id: "found", text: tr("Varmista, että Kohde löytyi -laatta sanoo kyllä ja Ohjaus-laatta kertoo suunnan", "Make sure the Object found tile says yes and the Steering tile shows a direction"), after: "blue",
              check: () => { const s = tools().cv || {}; return !!window.cvResult?.()?.found && s.mode === "color" && s.hue >= 200 && s.hue <= 250; } },
          ],
          hints: [tr("Klikkaa pallon voimakkaan sinistä kohtaa, ei valkoista heijastusta.", "Click a strongly blue part of the ball, not the white highlight."),
            tr("Jos pallo ei löydy, tarkista, että Tutkittava alue on Koko kuva. Voit myös kasvattaa Sävyn toleranssia.", "If the ball isn't found, check that Region of interest is Whole image. You can also raise the Hue tolerance.")],
          quiz: { q: tr("Miksi väritunnistus tehdään HSV:llä eikä RGB:llä?", "Why is colour detection done in HSV rather than RGB?"),
            options: [tr("HSV:ssä sävy ei juuri muutu varjossa, joten sama raja toimii eri valaistuksessa", "In HSV the hue barely changes in shadow, so the same limit works in different lighting"), tr("HSV-kuva on pienempi", "An HSV image is smaller"), tr("Kamerat kuvaavat suoraan HSV:tä", "Cameras record HSV directly")], correct: 0,
            explain: tr("Varjo tummentaa pikseliä, jolloin RGB-arvot muuttuvat kaikki. HSV:ssä muuttuu lähinnä kirkkaus (V), ja sävy (H) pysyy.", "A shadow darkens the pixel, changing all RGB values. In HSV mostly the brightness (V) changes and the hue (H) stays.") },
        },
        {
          id: "edges", tool: "cv", title: tr("Reunat", "Edges"),
          teach: tr("**Reuna** on kohta, jossa kirkkaus muuttuu jyrkästi. **Sobel**-suodin vertaa jokaisen pikselin vasenta ja oikeaa sekä ylä- ja alanaapuria: mitä suurempi ero, sitä vahvempi reuna. Reunoista saadaan esineiden muodot, kunhan esine erottuu taustasta kirkkaudeltaan.",
            "An **edge** is where brightness changes sharply. The **Sobel** filter compares each pixel's left and right and upper and lower neighbours: the bigger the difference, the stronger the edge. Edges give objects' shapes as long as the object differs from the background in brightness."),
          tasks: [
            { id: "edges", text: tr("Valitse työkalun Esimerkit-valikosta Reunat liukuhihnalla", "Choose Edges on a conveyor from the tool's Examples menu"), check: () => tools().cv?.mode === "edges" },
            { id: "blur", text: tr("Laske Kynnys noin 10:een ja kokeile Pehmennys-arvoja 0 ja 3: miten Reunapikseleitä-luku ja kuva muuttuvat?", "Lower the Threshold to about 10 and try Blur values 0 and 3: how do the Edge pixels number and the image change?"), after: "edges",
              check: (c) => { const s = tools().cv || {}; if (s.mode !== "edges") return false; if (s.blur === 0) c.mem.b0 = true; if (s.blur === 3) c.mem.b3 = true; return !!(c.mem.b0 && c.mem.b3); } },
          ],
          hints: [tr("Kynnys- ja Pehmennys-liukusäätimet ovat Asetukset-kortissa.", "The Threshold and Blur sliders are in the Settings card."),
            tr("Pienellä kynnyksellä ilman pehmennystä kamerakohina näkyy reunoina kaikkialla. Pehmennys 3 poistaa kohinan mutta jättää esineiden reunat.", "With a small threshold and no blur, camera noise shows up as edges everywhere. Blur 3 removes the noise but keeps the objects' edges.")],
          quiz: { q: tr("Miksi kuva usein pehmennetään ennen reunantunnistusta?", "Why is an image often blurred before edge detection?"),
            options: [tr("Kohina näyttää muuten pieniltä reunoilta kaikkialla", "Otherwise noise looks like tiny edges everywhere"), tr("Reunat näkyvät vain sumeassa kuvassa", "Edges only show in a blurry image"), tr("Se tekee kuvasta värikkäämmän", "It makes the image more colourful")], correct: 0,
            explain: tr("Sobel reagoi jokaiseen naapuripikselien eroon, myös kohinaan. Kevyt pehmennys poistaa pienet satunnaiserot mutta jättää isot muodot.", "Sobel reacts to every difference between neighbours, noise included. A light blur removes small random differences but keeps the big shapes.") },
        },
        {
          id: "wrap", tool: "cv", title: tr("Kertaus: robotti seuraa palloa", "Recap: a robot follows a ball"),
          teach: tr("Nyt tiedät koko ketjun: kamera → pikselit → kohteen erottelu → keskipiste → ohjauskomento. Juuri näin pallorobotit, viivanseuraajat ja lajittelurobotit toimivat. Oikeassa robotissa sama koodi ajetaan esim. Raspberry Pi:llä OpenCV:llä — työkalu näyttää sen valmiina.",
            "Now you know the whole chain: camera → pixels → separating the object → centroid → steering command. This is exactly how ball-chasing robots, line followers and sorting robots work. On a real robot the same code runs e.g. on a Raspberry Pi with OpenCV — the tool shows it ready-made."),
          reflect: { q: tr("Selitä omin sanoin, miten robotti voisi seurata punaista palloa kameran avulla. Mitä robotin pitäisi tehdä, jos pallo katoaa kuvasta?", "In your own words: how could a robot follow a red ball with a camera? What should happen if the ball leaves the image?"),
            model: tr("Kamera ottaa kuvan, joka muutetaan HSV:ksi. Pikselit, joiden sävy on punainen ja kylläisyys riittävä, merkitään kohteeksi. Niiden keskipisteen x-koordinaatista lasketaan ohjaus: keskipiste vasemmalla → käänny vasemmalle, oikealla → oikealle, ja pinta-alasta voi päätellä etäisyyden (iso = lähellä → hidasta). Jos pallo katoaa, robotin pitää pysähtyä tai alkaa etsiä kääntymällä hitaasti paikallaan, eikä jatkaa sokkona.",
              "The camera takes an image that is converted to HSV. Pixels with a red hue and enough saturation are marked as the object. The x coordinate of their centroid gives the steering: centroid on the left → turn left, on the right → turn right, and the area tells the distance (large = close → slow down). If the ball disappears, the robot should stop or start searching by slowly turning in place, not keep driving blind.") },
          tasks: [],
        },
      ],
    },
  ];

  // Oppimispolku: suositeltu järjestys. needs = kurssi, joka kannattaa tehdä ensin.
  // Aloittelijan polku: robotti ja elektroniikka → liike ja ohjaus → koordinaatit, käsivarsi, ROS ja tekoäly
  const ORDER = ["start", "sensors", "power", "nav", "pid", "vision", "frames", "arm", "ros", "ai", "reward"];
  const STAGES = [
    { from: "start", title: tr("Taso 1 · Perusteet", "Level 1 · Basics"), desc: tr("Mikä robotti on, moottorit, anturit ja sähkö. Ei vaadi esitietoja.", "What a robot is, motors, sensors and power. No prior knowledge needed.") },
    { from: "nav", title: tr("Taso 2 · Liike, ohjaus ja näkö", "Level 2 · Motion, control and vision"), desc: tr("Reitinhaku, esteet, PID-säätö ja konenäkö.", "Path planning, obstacles, PID control and computer vision.") },
    { from: "frames", title: tr("Taso 3 · Edistyneet", "Level 3 · Advanced"), desc: tr("Koordinaatistot, robottikäsivarsi, ROS ja tekoäly. Lukio- ja ammattitaso.", "Frames, robot arms, ROS and AI. Upper secondary and vocational level.") },
  ];
  COURSES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const NEEDS = { arm: "frames", ai: "start", ros: "frames", sensors: "start", reward: "ai" };

  /* ===== Oppaat ja repliikit =====
     Jokaisella kurssilla on oma robottiopas. Vaiheen alussa opas kertoo asian lyhyesti; koko teoria on
     "Lue lisää" -kohdan takana, jotta yhdellä kertaa näkyy vain vähän. who = vierailijahahmo tässä vaiheessa. */
  const GUIDE = { start: "volt", arm: "grip", pid: "wobbly", nav: "dusty", power: "volt", frames: "zippy", ai: "neura", sensors: "wobbly", ros: "grip", vision: "zippy", reward: "neura" };
  const L = (fi, en, who) => ({ text: tr(fi, en), who });
  const SAY = {
    "sensors.serial": L("Minä pysyn pystyssä vain antureideni ansiosta! Katsotaan, miltä anturien data näyttää.", "I only stay upright thanks to my sensors! Let's see what sensor data looks like."),
    "sensors.range": L("Minä näen esteet lidarilla. Kokeile, mitä tapahtuu, kun näköni lyhenee.", "I see obstacles with my lidar. Try what happens when my sight gets shorter.", "dusty"),
    "sensors.noise": L("Mikään anturi ei ole täydellinen — minunkin kallistusanturini värisee hieman. Monesta mittauksesta saadaan silti totuus.", "No sensor is perfect — even my tilt sensor jitters a bit. Many readings still add up to the truth."),
    "sensors.usb": L("Koulutetut aivot ja oikea robotti samaan piiriin! Katsotaan, miten ne kytketään USB:llä.", "A trained brain and a real robot in the same loop! Let's see how they connect over USB.", "neura"),
    "ros.tf": L("Oikeat robottikädet puhuvat usein ROS:ia. Aloitetaan siitä, miten ROS:n ohjelmat juttelevat keskenään.", "Real robot arms often speak ROS. Let's start with how ROS programs talk to each other."),
    "ros.urdf": L("URDF on minun henkilökorttini: siinä lukee jokainen linkkini ja niveleni.", "URDF is my ID card: it lists every link and joint I have."),
    "ros.quat": L("ROS tallentaa asentoni kvaterniona. Käännytään 90° vasemmalle ja katsotaan luvut!", "ROS stores my orientation as a quaternion. Let's turn 90° left and look at the numbers!", "zippy"),
    "ros.map": L("Minun karttani ROS:ssa on kuva ja pieni tekstitiedosto. Tehdään sellainen!", "My map in ROS is an image plus a small text file. Let's make one!", "dusty"),
    "vision.pixels": L("Minulla on kamera nokassa! Mutta kamera näkee vain lukuja. Katsotaan, millaisia.", "I've got a camera on my nose! But a camera only sees numbers. Let's see what kind."),
    "vision.line": L("Minä seuraan lattialla teippiviivaa kotiin latauslaitteelle. Näin se tehdään!", "I follow a tape line on the floor back to my charger. This is how!", "dusty"),
    "vision.color": L("Etsitään sininen pallo! Värit kannattaa etsiä sävynä, ei RGB-lukuina.", "Let's find the blue ball! Colours are best searched by hue, not by RGB numbers."),
    "vision.edges": L("Lajittelen osia liukuhihnalta. Reunoista näen, mikä on neliö ja mikä ympyrä.", "I sort parts off a conveyor. The edges tell me which is a square and which a circle.", "grip"),
    "vision.wrap": L("Nyt osaat saman kuin minä: nähdä kohteen ja kääntyä sitä kohti. Kerro omin sanoin, miten se toimii!", "Now you can do what I do: see a target and turn toward it. Tell me in your own words how it works!"),
    "start.parts": L("Hei, olen Volt! Jokaisella robotilla on aistit, aivot ja lihakset. Rakennetaan ensin keho: runko ja kaksi pyörää.", "Hi, I'm Volt! Every robot has senses, a brain and muscles. Let's build the body first: a chassis and two wheels."),
    "start.test": L("Ennen kuin mitään ruuvataan oikeasti kiinni, kokeillaan fysiikalla. Pysyykö robotti pystyssä ja jaksavatko moottorit liikuttaa sitä?", "Before screwing anything together for real, let's try it with physics. Does the robot stay upright, and can the motors move it?"),
    "start.turn": L("Nyt katsotaan robottia ylhäältä! Minulla ei ole ohjauspyörää, mutta käännyn silti mihin suuntaan tahansa. Kokeile, miten.", "Now we look at the robot from above! I have no steering wheel, but I can still turn any way I like. Try it.", "dusty"),
    "start.speed": L("Kuinka kovaa robottisi menee? Se riippuu moottorista ja pyörän koosta. Lasketaan!", "How fast does your robot go? It depends on the motor and the wheel size. Let's work it out!"),
    "start.drive": L("Nyt kaikki toimii yhdessä: aisti, päätä, toimi. Lähetä robotti maaliin!", "Now it all works together: sense, think, act. Send the robot to the goal!"),
    "power.runtime": L("Minun akkuni loppuu aina kesken olohuoneen… Lasketaan, kauanko akku oikeasti kestää.", "My battery always runs out halfway through the living room… Let's work out how long a battery really lasts.", "dusty"),
    "power.loads": L("Nimeni on Volt, joten sähkö on minun juttuni! Katsotaan, mikä robotissa vie eniten virtaa.", "My name is Volt, so electricity is my thing! Let's see what draws the most current in a robot."),
    "power.reg": L("Elektroniikka haluaa 5 volttia, akku antaa enemmän. Väärä säädin muuttaa eron lämmöksi — katsotaan kuinka paljon.", "The electronics want 5 volts and the battery gives more. The wrong regulator turns the difference into heat — let's see how much."),
    "ai.deploy": L("Koulutetut aivot eivät jää simulaatioon! Katsotaan, miten ne siirretään oikealle robotille.", "A trained brain doesn't have to stay in the simulation! Let's see how to move it onto a real robot."),
    "arm.fk": L("Hei, olen Grip! Minulla on niveliä ihan kuin sinun kädelläsi. Liikuta liukusäätimiä ja katso, minne kärkeni menee.", "Hi, I'm Grip! I have joints just like your arm. Move the sliders and watch where my tip goes."),
    "arm.dh": L("Insinöörit kuvaavat minut neljällä luvulla per nivel. Lisätään yksi nivel ja tehdään minusta kolmiulotteinen!", "Engineers describe me with four numbers per joint. Let's add a joint and make me 3D!"),
    "arm.ik": L("Nyt toisin päin: näytä minulle kohde, niin keksin nivelkulmat itse.", "Now the other way round: show me a target and I'll work out the joint angles myself."),
    "arm.traj": L("En voi hypätä paikasta toiseen — tarvitsen pehmeän liikkeen. Katsotaan, miten se ajoitetaan.", "I can't teleport — I need smooth motion. Let's see how it's timed."),
    "arm.motor": L("Jaksanko nostaa? Tarkistetaan, onko moottorini tarpeeksi vahva.", "Can I lift it? Let's check whether my motor is strong enough."),
    "arm.wrap": L("Hienoa työtä! Kerro vielä omin sanoin, mitä opit — niin se jää varmasti mieleen.", "Great work! Now tell me in your own words what you learned — that's how it sticks."),
    "pid.p": L("Olen Wobbly. Pysyn pystyssä vain, koska säädin korjaa minua koko ajan. Aloitetaan P-termistä!", "I'm Wobbly. I only stay upright because a controller keeps correcting me. Let's start with the P term!"),
    "pid.i": L("P jättää usein pienen virheen. I-termi korjaa sen laskemalla virhettä yhteen.", "P often leaves a small error. The I term fixes it by adding the error up over time."),
    "pid.d": L("Hups, heilun! D-termi toimii minulle kuin iskunvaimennin.", "Whoa, I'm swinging! The D term works like a shock absorber for me."),
    "pid.unstable": L("Tehdään minusta tahallaan epästabiili — simulaatiossa se on turvallista!", "Let's make me unstable on purpose — it's safe in the simulation!"),
    "pid.dist": L("Joku ripusti minuun lisäpainon! Katsotaan, mikä termi palauttaa minut paikalleni.", "Someone hung an extra weight on me! Let's see which term brings me back."),
    "nav.grid": L("Moi, olen Dusty! Näen kotisi ruudukkona. Piirrä seinä ja katso, miten löydän kiertotien.", "Hi, I'm Dusty! I see your home as a grid. Draw a wall and watch me find a way around."),
    "nav.compare": L("Reitin voi etsiä monella tavalla. Kokeillaan, mikä tapa on paras.", "There are many ways to find a path. Let's see which one is best."),
    "nav.drive": L("Reitti on vasta suunnitelma — nyt ajetaan se oikeasti! Palautin kartan väljäksi, jotta mahdun kulkemaan.", "A path is just a plan — now let's actually drive it! I put the roomy map back so I fit through."),
    "nav.odom": L("Lasken sijaintini pyörien kierroksista… mutta pyörät luistavat. Katso, mitä tapahtuu.", "I track my position by counting wheel turns… but my wheels slip. Watch what happens."),
    "nav.slam": L("Ei karttaa? Ei hätää. Piirrän sen itse lidarillani.", "No map? No problem. I'll draw one myself with my lidar."),
    "frames.euler": L("Olen Zippy-drooni! Asentoni kerrotaan kolmella kulmalla: yaw, pitch ja roll.", "I'm Zippy the drone! My orientation is three angles: yaw, pitch and roll."),
    "frames.gimbal": L("Varo! Kun nokkani osoittaa suoraan alas tai ylös (pitch ±90°), kaksi kulmaani menee solmuun.", "Careful! When my nose points straight down or up (pitch ±90°), two of my angles get tangled."),
    "frames.quat": L("Siksi lennonohjaimeni käyttää kvaternioita: neljä lukua, ei solmuja.", "That's why my flight controller uses quaternions: four numbers, no tangles."),
    "frames.tf": L("Minulla on monta osaa, ja jokaisella on oma koordinaatistonsa. TF-puu pitää ne järjestyksessä.", "I have lots of parts, each with its own frame. A TF tree keeps them all in order.", "volt"),
    "ai.drive": L("Olen Neura. Alussa en osannut mitään — opin kokeilemalla. Katso, miten auto oppii ajamaan!", "I'm Neura. At first I knew nothing — I learned by trying. Watch the car learn to drive!"),
    "ai.reward": L("Opin juuri sen, mistä minua palkitaan. Muutetaan palkkiota ja katsotaan, mitä tapahtuu.", "I learn exactly what I'm rewarded for. Let's change the reward and see what happens."),
    "ai.own": L("Nyt on sinun robottisi vuoro oppia!", "Now it's your robot's turn to learn!"),
    "ai.three": L("Hei, tuo olen minä 3D:nä! Opetetaan minut löytämään kohteet.", "Hey, that's me in 3D! Let's teach me to find targets.", "dusty"),
  };
  /* ===== Loppukokeet ===== */
  // Kurssin lopussa kolme soveltavaa kysymystä. Pisteet lasketaan ensimmäisistä vastauksista ja ne näkyvät
  // opettajalle luokkahuoneessa. Väärästä vastauksesta saa selityksen ja voi yrittää uudelleen oppiakseen.
  const Q = (q, options, correct, explain) => ({ q, options, correct, explain });
  const EXAMS = {
    start: [
      Q(tr("Robotti-imuri huomaa portaan reunan ja pysähtyy. Mikä robotin osa huomasi reunan?", "A robot vacuum notices the edge of a stair and stops. Which part of the robot noticed the edge?"),
        [tr("Anturi (putoamisanturi)", "A sensor (cliff sensor)"), tr("Moottori", "The motor"), tr("Mikrokontrolleri", "The microcontroller")], 0,
        tr("Anturi aistii reunan, ohjain (mikrokontrolleri) päättää pysähtyä ja moottorit pysähtyvät: aisti → päätä → toimi.", "The sensor senses the edge, the controller (microcontroller) decides to stop and the motors stop: sense → think → act.")),
      Q(tr("Pyörän halkaisija on 10 cm ja moottori pyörii 60 kierrosta minuutissa. Kuinka pitkän matkan robotti kulkee minuutissa?", "The wheel diameter is 10 cm and the motor turns at 60 rpm. How far does the robot travel in a minute?"),
        [tr("noin 6 m", "about 6 m"), tr("noin 19 m", "about 19 m"), tr("noin 60 m", "about 60 m")], 1,
        tr("Yksi kierros = π × 0,1 m ≈ 0,31 m. 60 kierrosta × 0,31 m ≈ 19 m.", "One turn = π × 0.1 m ≈ 0.31 m. 60 turns × 0.31 m ≈ 19 m.")),
      Q(tr("Vasen pyörä pyörii eteenpäin ja oikea yhtä nopeasti taaksepäin. Mitä robotti tekee?", "The left wheel spins forward and the right one equally fast backward. What does the robot do?"),
        [tr("Kääntyy paikallaan oikealle", "Turns on the spot to the right"), tr("Ajaa suoraan eteenpäin", "Drives straight ahead"), tr("Kaartaa loivasti vasemmalle", "Curves gently to the left")], 0,
        tr("Pyörät vastakkaisiin suuntiin = kääntyminen paikallaan. Vasen puoli menee eteen, joten keula kääntyy oikealle.", "Wheels in opposite directions = turning on the spot. The left side goes forward, so the nose turns right.")),
    ],
    power: [
      Q(tr("Moottorit ottavat 1,2 A ja elektroniikka 0,3 A. Akku on 3000 mAh, ja siitä käytetään 80 %. Kuinka kauan robotti toimii?", "The motors draw 1.2 A and the electronics 0.3 A. The battery is 3000 mAh and 80 % of it is used. How long does the robot run?"),
        [tr("noin 1 h 36 min", "about 1 h 36 min"), tr("noin 2 h", "about 2 h"), tr("noin 2,5 h", "about 2.5 h")], 0,
        tr("Virta yhteensä 1,5 A. Käytettävissä 0,8 × 3 Ah = 2,4 Ah. 2,4 Ah / 1,5 A = 1,6 h ≈ 1 h 36 min.", "Total current 1.5 A. Usable 0.8 × 3 Ah = 2.4 Ah. 2.4 Ah / 1.5 A = 1.6 h ≈ 1 h 36 min.")),
      Q(tr("Miksi LiPo-akkua ei saa purkaa aivan tyhjäksi?", "Why must a LiPo battery not be drained completely?"),
        [tr("Liian matala kennojännite vahingoittaa kennoa pysyvästi", "Too low a cell voltage damages the cell permanently"), tr("Akku latautuu silloin hitaammin", "It then charges more slowly"), tr("Moottorit pyörivät silloin väärään suuntaan", "The motors then spin the wrong way")], 0,
        tr("LiPo-kenno vaurioituu, jos sen jännite laskee alle noin 3,0 V. Siksi ohjaimissa on alijännitesuoja.", "A LiPo cell is damaged if its voltage drops below about 3.0 V. That's why controllers have low-voltage protection.")),
      Q(tr("Moottori ottaa käynnistyessä hetkellisesti 5 A ja ajossa 0,8 A. Mikä luku ratkaisee moottoriohjaimen valinnan?", "A motor briefly draws 5 A when starting and 0.8 A when driving. Which number decides the choice of motor driver?"),
        [tr("Huippuvirta 5 A", "The peak current 5 A"), tr("Ajovirta 0,8 A", "The running current 0.8 A"), tr("Keskiarvo 2,9 A", "The average 2.9 A")], 0,
        tr("Ohjaimen pitää kestää suurin virta, joka siitä kulkee. Muuten se ylikuumenee tai suojaus katkaisee virran juuri käynnistyksessä. (Lisäksi ajovirran pitää alittaa ohjaimen jatkuva raja.)", "The driver must withstand the largest current through it. Otherwise it overheats or its protection cuts power right at start-up. (The running current must also stay below the driver's continuous rating.)")),
    ],
    sensors: [
      Q(tr("Ultraäänianturin kaiku palaa 5,8 ms kuluttua. Äänen nopeus on 343 m/s. Kuinka kaukana este on?", "An ultrasonic sensor's echo returns after 5.8 ms. The speed of sound is 343 m/s. How far away is the obstacle?"),
        [tr("noin 1 m", "about 1 m"), tr("noin 2 m", "about 2 m"), tr("noin 0,5 m", "about 0.5 m")], 0,
        tr("Ääni kulkee esteelle ja takaisin: etäisyys = 343 m/s × 0,0058 s / 2 ≈ 1,0 m.", "The sound travels to the obstacle and back: distance = 343 m/s × 0.0058 s / 2 ≈ 1.0 m.")),
      Q(tr("Miksi kahden anturin arvot tulostetaan samalle riville pilkulla erotettuina (esim. dist:120, gyro:85)?", "Why are two sensors' values printed on the same line separated by a comma (e.g. dist:120, gyro:85)?"),
        [tr("Piirturi näyttää ne kahtena eri sarjana", "The plotter shows them as two separate series"), tr("Sarjaportti on silloin nopeampi", "The serial port is faster then"), tr("Muuten ohjelma ei käänny", "Otherwise the program won't compile")], 0,
        tr("Rivi = yksi mittaushetki, pilkulla erotetut luvut = eri anturit. Näin piirturi osaa piirtää jokaisen anturin omana käyränään.", "A line = one moment, comma-separated numbers = different sensors. That way the plotter draws each sensor as its own curve.")),
      Q(tr("Etäisyysanturi antaa lukemat 102, 98, 250, 101 ja 99 cm. Mikä poistaa yksittäisen virhelukeman 250 parhaiten?", "A distance sensor gives 102, 98, 250, 101 and 99 cm. What best removes the single bad reading 250?"),
        [tr("Mediaanisuodatin (keskimmäinen arvo)", "A median filter (the middle value)"), tr("Kaikkien lukemien keskiarvo", "The average of all readings"), tr("Suurimman lukeman käyttö", "Using the largest reading")], 0,
        tr("Mediaani on 101 cm, eikä yksittäinen virhe vaikuta siihen. Keskiarvo olisi 130 cm, koska virhelukema vetää sitä ylöspäin.", "The median is 101 cm and a single error doesn't affect it. The average would be 130 cm because the bad reading pulls it up.")),
    ],
    nav: [
      Q(tr("Ruudukkokartan solu on 5 cm ja kartta on 4 m × 3 m. Montako solua kartassa on?", "A grid map's cell is 5 cm and the map is 4 m × 3 m. How many cells does it have?"),
        ["4 800", "1 200", "12 000"], 0,
        tr("4 m / 0,05 m = 80 ja 3 m / 0,05 m = 60 solua. 80 × 60 = 4 800.", "4 m / 0.05 m = 80 and 3 m / 0.05 m = 60 cells. 80 × 60 = 4,800.")),
      Q(tr("Robotti seuraa reittiä, mutta oikaisee mutkissa ja osuu kulmiin. Mitä kannattaa kokeilla ensin?", "A robot follows a path but cuts corners and hits them. What should you try first?"),
        [tr("Lyhentää katseluetäisyyttä", "Shorten the lookahead distance"), tr("Kasvattaa suurinta nopeutta", "Increase the top speed"), tr("Vaihtaa A*:n RRT:hen", "Switch A* to RRT")], 0,
        tr("Pitkä katseluetäisyys tähtää kauas reitillä, jolloin robotti oikaisee. Lyhyempi seuraa reittiä tarkemmin.", "A long lookahead aims far along the path, so the robot cuts corners. A shorter one follows the path more closely.")),
      Q(tr("Miksi reittisuunnittelussa esteitä \"paisutetaan\" robotin säteen verran?", "Why are obstacles \"inflated\" by the robot's radius in path planning?"),
        [tr("Jotta koko runko mahtuu reitille, ei vain keskipiste", "So the whole body fits along the path, not just the centre"), tr("Jotta reitti olisi lyhyempi", "So the path is shorter"), tr("Jotta kartta piirtyy nopeammin", "So the map draws faster")], 0,
        tr("Reitinhaku käsittelee robottia pisteenä. Paisutus lisää esteisiin robotin säteen, jolloin pisteen reitti on turvallinen myös rungolle.", "Path search treats the robot as a point. Inflating adds the robot's radius to obstacles, so a path for the point is safe for the body too.")),
    ],
    pid: [
      Q(tr("Termostaatti pitää huoneen 21 °C:ssa. Mitkä ovat asetusarvo, mittaus ja ohjaus?", "A thermostat keeps a room at 21 °C. What are the setpoint, the measurement and the control?"),
        [tr("21 °C, lämpömittarin lukema, lämmittimen teho", "21 °C, the thermometer reading, the heater power"), tr("Lämmittimen teho, 21 °C, termostaatti", "The heater power, 21 °C, the thermostat"), tr("Kaikki kolme ovat lämpötiloja", "All three are temperatures")], 0,
        tr("Asetusarvo on tavoite, mittaus kertoo nykytilan ja ohjaus on se, mitä säädin muuttaa (lämmitin).", "The setpoint is the goal, the measurement tells the current state and the control is what the controller changes (the heater).")),
      Q(tr("Robottikäsi heiluu tavoitekulman ympärillä ennen kuin asettuu. Mitä kerrointa kannattaa kasvattaa?", "A robot arm swings around its target angle before settling. Which gain should you increase?"),
        ["Kd", "Ki", "Kp"], 0,
        tr("D-termi jarruttaa liikettä, kun virhe pienenee nopeasti, ja vaimentaa heilumista. Kp:n tai Ki:n kasvattaminen yleensä lisää heilumista.", "The D term brakes the motion when the error shrinks fast and damps swinging. Raising Kp or Ki usually adds swinging.")),
      Q(tr("Viivanseuraaja kulkee aina 2 cm viivan vieressä, koska toinen pyörä on hieman hitaampi. Mikä termi korjaa tämän?", "A line follower always runs 2 cm beside the line because one wheel is slightly slower. Which term fixes this?"),
        [tr("I-termi", "The I term"), tr("D-termi", "The D term"), tr("Ei mikään, virhe on pakko hyväksyä", "None, the error must be accepted")], 0,
        tr("Pysyvä virhe kasvattaa integraalia, kunnes ohjaus korjaa sen. Juuri tämä on I-termin tehtävä.", "A persistent error grows the integral until the control corrects it. That is exactly the I term's job.")),
    ],
    vision: [
      Q(tr("Kynnysarvolla 128 pikselistä tulee musta, jos sen harmaasävy on alle 128. Mitä tapahtuu pikselille, jonka arvo on 200?", "With threshold 128 a pixel becomes black if its gray value is below 128. What happens to a pixel with value 200?"),
        [tr("Siitä tulee valkoinen", "It becomes white"), tr("Siitä tulee musta", "It becomes black"), tr("Se poistetaan kuvasta", "It is removed from the image")], 0,
        tr("200 on suurempi kuin 128, joten pikseli on kynnyksen kirkkaalla puolella ja muuttuu valkoiseksi.", "200 is above 128, so the pixel is on the bright side of the threshold and becomes white.")),
      Q(tr("Viivanseuraajan kamera näkee viivan kuvan oikeassa reunassa. Mihin robotin pitää kääntyä?", "A line follower's camera sees the line at the right edge of the image. Which way should the robot turn?"),
        [tr("Oikealle", "Right"), tr("Vasemmalle", "Left"), tr("Ei minnekään, se ajaa suoraan", "Nowhere, it drives straight")], 0,
        tr("Viiva on robotin oikealla puolella, joten kääntymällä oikealle robotti palaa viivan päälle.", "The line is on the robot's right, so turning right brings the robot back over the line.")),
      Q(tr("Värikuva on 320 × 240 pikseliä ja jokaisessa pikselissä on R, G ja B. Montako lukua kuvassa on?", "A colour image is 320 × 240 pixels and each pixel has R, G and B. How many numbers does the image hold?"),
        ["230 400", "76 800", "960"], 0,
        tr("320 × 240 = 76 800 pikseliä, ja jokaisessa on kolme lukua: 76 800 × 3 = 230 400.", "320 × 240 = 76,800 pixels with three numbers each: 76,800 × 3 = 230,400.")),
    ],
    frames: [
      Q(tr("Lidar on 0,2 m robotin keskipisteen edessä ja näkee esteen 1 m suoraan edessään. Kuinka kaukana este on robotin keskipisteestä?", "The lidar is 0.2 m in front of the robot's centre and sees an obstacle 1 m straight ahead. How far is the obstacle from the robot's centre?"),
        ["1,2 m", "0,8 m", "1,0 m"].map((v) => tr(v, v.replace(",", "."))), 0,
        tr("Mittaus on lidarin kehyksessä. Siirretään se robotin kehykseen lisäämällä lidarin paikka: 0,2 m + 1 m = 1,2 m.", "The reading is in the lidar's frame. Moving it to the robot frame adds the lidar's position: 0.2 m + 1 m = 1.2 m.")),
      Q(tr("Robotin asento kartassa on yaw = 180°. Mihin robotin eteenpäin-suunta (x-akseli) osoittaa kartassa?", "The robot's pose in the map has yaw = 180°. Where does the robot's forward direction (x axis) point in the map?"),
        [tr("Kartan −X-suuntaan", "Towards the map's −X"), tr("Kartan +X-suuntaan", "Towards the map's +X"), tr("Kartan +Y-suuntaan", "Towards the map's +Y")], 0,
        tr("Kierto 180° z-akselin ympäri kääntää x-akselin täsmälleen vastakkaiseen suuntaan.", "A 180° turn about the z axis points the x axis exactly the opposite way.")),
      Q(tr("Miksi robotit tallentavat asennon usein kvaterniona eikä Euler-kulmina?", "Why do robots often store orientation as a quaternion rather than Euler angles?"),
        [tr("Kvaternioilla ei ole kardaanilukkoa, ja niiden välillä voi interpoloida tasaisesti", "Quaternions have no gimbal lock and can be interpolated smoothly"), tr("Kvaterniot vievät vähemmän muistia", "Quaternions take less memory"), tr("Euler-kulmat toimivat vain 2D:ssä", "Euler angles only work in 2D")], 0,
        tr("Kvaternio (4 lukua) vie jopa enemmän tilaa kuin kolme Euler-kulmaa, mutta se kuvaa jokaisen asennon ilman kardaanilukkoa.", "A quaternion (4 numbers) even takes more space than three Euler angles, but it describes every orientation without gimbal lock.")),
    ],
    arm: [
      Q(tr("Kaksinivelisen käden linkit ovat 0,3 m ja 0,2 m. Kuinka kauas tukipisteestä kärki ylettyy enimmillään?", "A two-joint arm has links of 0.3 m and 0.2 m. How far from the base can the tip reach at most?"),
        ["0,5 m", "0,3 m", "0,1 m"].map((v) => tr(v, v.replace(",", "."))), 0,
        tr("Kun käsi on suorana, linkkien pituudet summautuvat: 0,3 + 0,2 = 0,5 m. Lähimmillään kärki on 0,3 − 0,2 = 0,1 m päässä.", "With the arm straight the link lengths add up: 0.3 + 0.2 = 0.5 m. The closest the tip gets is 0.3 − 0.2 = 0.1 m.")),
      Q(tr("Montako nivelkulmien ratkaisua kaksinivelisellä tasokädellä yleensä on samaan kohteeseen ulottuvuusalueen sisällä?", "How many joint-angle solutions does a two-joint planar arm usually have for one target inside its reach?"),
        [tr("Kaksi: kyynärpää ylhäällä tai alhaalla", "Two: elbow up or elbow down"), tr("Aina yksi", "Always one"), tr("Äärettömän monta", "Infinitely many")], 0,
        tr("Sama kärjen paikka saavutetaan taivuttamalla kyynärpää kumpaan suuntaan tahansa. Reunalla ratkaisuja on yksi.", "The same tip position is reached by bending the elbow either way. At the edge of the reach there is one.")),
      Q(tr("Nivelen pitää pitää 1 kg kuormaa 0,4 m päässä nivelestä. Kuinka suuri vääntömomentti tarvitaan (g ≈ 9,8 m/s²)?", "A joint must hold a 1 kg load 0.4 m away. How much torque is needed (g ≈ 9.8 m/s²)?"),
        ["3,9 Nm", "0,4 Nm", "9,8 Nm"].map((v) => tr(v, v.replace(",", "."))), 0,
        tr("Momentti = voima × varsi = 1 kg × 9,8 m/s² × 0,4 m ≈ 3,9 Nm. Lisäksi tarvitaan varaa käden omalle painolle ja kiihdytykselle.", "Torque = force × arm = 1 kg × 9.8 m/s² × 0.4 m ≈ 3.9 Nm. You also need margin for the arm's own weight and acceleration.")),
    ],
    ai: [
      Q(tr("Neuroverkko koulutetaan robotille, jolla on 2 moottoria ja 6 anturilukemaa. Montako ulostuloa verkossa on?", "A neural network is trained for a robot with 2 motors and 6 sensor readings. How many outputs does the network have?"),
        ["2", "6", "8"], 0,
        tr("Ulostulot ovat moottorien käskyjä (yksi kullekin moottorille). Anturit ovat sisääntuloja.", "The outputs are motor commands (one per motor). The sensors are the inputs.")),
      Q(tr("Robotti saa palkkion vain, kun se pääsee maaliin, eikä paras tulos parane 200 sukupolven jälkeenkään. Mikä on järkevin seuraava kokeilu?", "The robot only gets a reward when it reaches the goal, and the best score doesn't improve even after 200 generations. What is the most sensible next try?"),
        [tr("Muuttaa palkkiota niin, että pienetkin edistysaskeleet palkitaan", "Change the reward so even small steps forward are rewarded"), tr("Kouluttaa vain pidempään", "Just train for longer"), tr("Poistaa robotilta anturit", "Remove the robot's sensors")], 0,
        tr("Jos palkkio tulee vain harvoin (esim. vasta maalissa), evoluutio ei näe, mikä yritys oli lähempänä. Askelittainen palkkio ohjaa oppimista.", "If the reward comes rarely (e.g. only at the goal), evolution can't see which attempt was closer. A step-by-step reward guides learning.")),
      Q(tr("Miksi robotin aivojen pitää saada anturitietoa eikä pelkkää aikaa?", "Why must the robot's brain get sensor data and not just the time?"),
        [tr("Ilman antureita robotti ei voi reagoida ympäristöön, vaan toistaa samaa liikettä", "Without sensors the robot can't react to its surroundings and just repeats the same motion"), tr("Anturit nopeuttavat tietokonetta", "Sensors speed up the computer"), tr("Ilman antureita verkkoa ei voi tallentaa", "Without sensors the network can't be saved")], 0,
        tr("Pelkän ajan perusteella robotti oppii vain ulkoa opitun liikesarjan. Anturien avulla se voi esimerkiksi väistää esteen, joka on joka kerta eri paikassa.", "From time alone the robot only learns a memorised motion. With sensors it can for example avoid an obstacle that is in a different place each time.")),
    ],
    reward: [
      Q(tr("Kävelijä palkitaan vain siitä, kuinka pitkälle sen pää päätyy. Se oppii heittäytymään eteenpäin ja kaatumaan. Mikä tämä on?", "A walker is rewarded only for how far its head ends up. It learns to throw itself forward and fall. What is this?"),
        [tr("Palkkion huijaus: robotti löysi helpomman tavan saada pisteitä kuin tarkoitettiin", "Reward hacking: the robot found an easier way to score than intended"), tr("Liian pieni populaatio", "Too small a population"), tr("Fysiikkamoottorin virhe", "A bug in the physics engine")], 0,
        tr("Robotti optimoi tarkalleen palkkiota. Jos kaatuminen tuottaa pisteitä, se on robotille hyvä ratkaisu. Korjaus: palkitse pystyssä pysymisestä ja rankaise kaatumisesta.", "The robot optimises exactly the reward. If falling scores, it is a good solution for the robot. Fix: reward staying upright and penalise falling.")),
      Q(tr("Tavoitteina ovat Liiku suuntaan (paino 1) ja Säästä energiaa (paino 3). Robotti ei liiku. Mitä muutat ensin?", "The goals are Move in a direction (weight 1) and Save energy (weight 3). The robot doesn't move. What do you change first?"),
        [tr("Kasvatan etenemisen painoa tai pienennän säästön painoa", "Raise the weight of moving or lower the weight of saving"), tr("Lisään populaatiota", "Increase the population"), tr("Vaihdan maaston vaikeammaksi", "Switch to a harder terrain")], 0,
        tr("Painot kertovat, mikä on tärkeintä. Kun säästäminen painaa kolme kertaa enemmän, paikallaan oleminen voi olla palkkion kannalta paras ratkaisu.", "The weights say what matters most. When saving weighs three times more, standing still may be the best solution for the reward.")),
      Q(tr("Miksi haasteen tulos mitataan RoboLabin omalla mittarilla eikä käyttäjän palkkiofunktiolla?", "Why is a challenge result measured with RoboLab's own meter and not the user's reward function?"),
        [tr("Jotta kaikkien tulokset ovat vertailukelpoisia: oma palkkio voisi antaa pisteitä mistä tahansa", "So everyone's results are comparable: a custom reward could give points for anything"), tr("Koska palkkiofunktio on liian hidas", "Because the reward function is too slow"), tr("Koska palkkiofunktiota ei voi ajaa uudelleen", "Because the reward function can't be run again")], 0,
        tr("Palkkio ohjaa oppimista, mutta tulos pitää mitata samalla tavalla kaikille. Muuten voisi \"voittaa\" kirjoittamalla palkkion, joka antaa paljon pisteitä.", "The reward steers learning, but the result has to be measured the same way for everyone. Otherwise you could \"win\" by writing a reward that gives lots of points.")),
    ],
    ros: [
      Q(tr("Kamera julkaisee kuvia topiciin /camera/image, ja kaksi eri solmua tarvitsee kuvat. Miten ne saavat ne?", "A camera publishes images to /camera/image and two different nodes need them. How do they get them?"),
        [tr("Molemmat tilaavat saman topicin", "Both subscribe to the same topic"), tr("Kameran pitää julkaista kuva kahdesti eri nimillä", "The camera must publish twice under different names"), tr("Solmut lukevat kuvat URDF-tiedostosta", "The nodes read the images from the URDF file")], 0,
        tr("Topiciin voi olla kytkeytynyt monta tilaajaa. Julkaisijan ei tarvitse tietää, kuka kuuntelee.", "A topic can have many subscribers. The publisher doesn't need to know who listens.")),
      Q(tr("Mikä on base_link?", "What is base_link?"),
        [tr("Robotin rungon pääkoordinaatisto, johon muut osat kiinnitetään", "The robot body's main frame that other parts attach to"), tr("Kartan origo", "The map's origin"), tr("Kameran kuvakoordinaatisto", "The camera's image frame")], 0,
        tr("base_link liikkuu robotin mukana. Anturien kehykset (esim. laser, camera_link) ilmoitetaan suhteessa siihen.", "base_link moves with the robot. Sensor frames (e.g. laser, camera_link) are given relative to it.")),
      Q(tr("Kartan resolution on 0,05 ja koko 400 × 300 solua. Kuinka suuren alueen kartta kattaa?", "A map's resolution is 0.05 and its size 400 × 300 cells. How large an area does it cover?"),
        [tr("20 m × 15 m", "20 m × 15 m"), tr("400 m × 300 m", "400 m × 300 m"), tr("4 m × 3 m", "4 m × 3 m")], 0,
        tr("Resolution on solun koko metreinä: 400 × 0,05 m = 20 m ja 300 × 0,05 m = 15 m.", "Resolution is the cell size in metres: 400 × 0.05 m = 20 m and 300 × 0.05 m = 15 m.")),
    ],
  };

  const guideOf = (course, step) => SAY[course.id + "." + step.id]?.who || GUIDE[course.id] || "volt";
  // Ensimmäinen kappale teoriasta käy repliikiksi, jos vaiheelle ei ole kirjoitettu omaa
  const sayOf = (course, step) => SAY[course.id + "." + step.id]?.text || step.teach.split("\n\n")[0].replace(/\*\*/g, "");

  /* ===== Edistyminen (selaimen muistissa, ei projektissa) ===== */
  let P = load();
  function load() {
    try { const p = JSON.parse(localStorage.getItem(KEY)); if (p && p.c) return p; } catch {}
    return { active: null, c: {} };
  }
  let persistWarned = false;
  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(P)); }
    catch { if (!persistWarned) { persistWarned = true; toast(tr("Kurssin edistymistä ei voitu tallentaa: selaimen tallennustila on täynnä.", "Course progress could not be saved: browser storage is full.")); } }
    window.Plans?.queueSync?.(); // luokkahuone: eteneminen opettajalle (plans.js)
    window.Achievements?.check(); // kursseista johdetut saavutukset (achievements.js)
  };
  const byId = (id) => COURSES.find((c) => c.id === id);
  const cp = (id) => (P.c[id] ||= { step: 0, steps: {}, project: null, finished: false });
  const sp = (cid, sid) => (cp(cid).steps[sid] ||= { tasks: {}, quiz: null, hint: 0, refl: "", base: null, done: false });

  function snapshotBase() {
    let q = [];
    try { q = [...arm().q]; } catch {}
    const st = window.sim2dStatus?.() || {};
    return { tools: JSON.parse(JSON.stringify(activeProject().tools)), q, arrivals: st.arrivals || 0, off: st.offGoalArrivals || 0, deploys: window.rsDeployOpened || 0 };
  }

  // Tehtävän tila: kerran täytetty tehtävä pysyy tehtynä (esim. "tee epästabiiliksi" ja sitten "korjaa")
  // Tarkistukset luetaan kurssin projektista; jos käyttäjä on vaihtanut projektia, niitä ei ajeta
  const onCourseProject = (course) => { const c = cp(course.id); return !c.project || !projects.projects[c.project] || projects.active === c.project; };

  const stepLive = {};
  const LOOK_S = 8; // katso/lue-tehtävän oletusaika sekunteina
  function evalStep(course, step) {
    const s = sp(course.id, step.id);
    if (!onCourseProject(course)) return { s, done: s.done };
    if (!s.base) { s.base = snapshotBase(); persist(); }
    // t0 = vaiheen aloitus tällä sivulatauksella (toimintoloki on vain muistissa), mem = tarkistusten välimuisti
    const key = course.id + "/" + step.id;
    const live = (stepLive[key] ||= { t0: Date.now(), mem: {}, look: {} });
    const ctx = { base: s.base, t0: live.t0, mem: live.mem };
    let dirty = false;
    const onTool = currentRoute() === step.tool;
    for (const [i, t] of step.tasks.entries()) {
      if (s.tasks[t.id]) continue;
      if (t.after && !s.tasks[t.after]) continue;
      let ok = false;
      if (t.check) { try { ok = !!t.check(ctx); } catch {} }
      else if (onTool && step.tasks.slice(0, i).every((x) => s.tasks[x.id])) {
        // Katso/lue-tehtävä: kuitataan, kun työkalu on ollut auki hetken tämän tehtävän ollessa vuorossa
        live.look[t.id] ||= Date.now();
        ok = Date.now() - live.look[t.id] >= (t.look || LOOK_S) * 1000;
      }
      if (ok) { s.tasks[t.id] = true; dirty = true; }
    }
    const tasksOk = step.tasks.every((t) => s.tasks[t.id]);
    const quizOk = !step.quiz || s.quiz === step.quiz.correct;
    const reflOk = !step.reflect || s.refl.trim().length >= 40;
    const done = tasksOk && quizOk && reflOk;
    if (done && !s.done) { s.done = true; dirty = true; justDone = true; }
    if (dirty) persist();
    return { s, done };
  }

  /* ===== Kurssin aloitus: oma projekti ===== */
  // Palauttaa true, jos aktiivinen projekti vaihtui (työkalu pitää silloin piirtää uudelleen)
  function ensureProject(course) {
    const c = cp(course.id);
    if (c.project && projects.projects[c.project]) {
      if (projects.active === c.project) return false;
      projects.active = c.project; saveProjects();
      return true;
    }
    const p = newProject(tr("Kurssi: ", "Course: ") + course.title);
    projects.projects[p.id] = p;
    projects.active = p.id;
    c.project = p.id;
    saveProjects();
    toast(tr(`Kurssille luotiin oma projekti "${p.name}" — muut työsi pysyvät ennallaan.`, `Created a project "${p.name}" for the course — your other work stays untouched.`));
    return true;
  }

  function start(id, { restart = false } = {}) {
    const course = byId(id);
    if (!course) return;
    // Tilaustaso (plans.js): lukittu kurssi ohjaa Tasot-sivulle
    if (window.Plans && !Plans.canCourse(id)) {
      toast(tr(`Kurssi "${course.title}" kuuluu ${Plans.NAMES[Plans.tierForCourse(id)]}-tasoon.`, `The course "${course.title}" is part of the ${Plans.NAMES[Plans.tierForCourse(id)]} plan.`));
      location.hash = "#/plans";
      return;
    }
    if (restart) {
      const old = P.c[id];
      if (old?.project && projects.projects[old.project] && Object.keys(projects.projects).length > 1) {
        delete projects.projects[old.project];
        if (projects.active === old.project) projects.active = Object.keys(projects.projects)[0];
        saveProjects();
      }
      delete P.c[id];
    }
    const switched = ensureProject(course);
    P.active = id; P.last = id;
    persist();
    openPanel();
    goStep(cp(id).step, switched);
  }

  function stop() {
    P.active = null;
    persist();
    closePanel();
  }

  function goStep(i, refresh = false) {
    const course = byId(P.active);
    if (!course) return;
    const c = cp(course.id);
    c.step = Math.max(0, Math.min(course.steps.length - 1, i));
    persist();
    const step = course.steps[c.step];
    // Vaiheen alkuvalmistelu kerran (esim. kartan palautus, jotta edellisen vaiheen piirrokset eivät estä tehtävää)
    const s0 = sp(course.id, step.id);
    if (step.enter && !s0.entered) { s0.entered = true; persist(); step.enter(); refresh = true; }
    if (currentRoute() !== step.tool) location.hash = "#/" + step.tool;
    else if (refresh) router();
    sp(course.id, step.id);
    evalStep(course, step); // pohjatila talteen heti vaiheen alussa
    drawPanel();
  }

  /* ===== Oppituntipaneeli ===== */
  let panel, timer = 0, justDone = false, collapsed = false;
  const md = (s) => (window.Assistant?._md ? Assistant._md(s) : esc(s));

  function openPanel() {
    panel = $("#lesson");
    panel.hidden = false;
    document.body.classList.add("lesson-open");
    window.setLessonLayout?.(true);
    clearInterval(timer);
    timer = setInterval(tick, 700);
  }
  function closePanel() {
    clearInterval(timer);
    if (panel) { panel.hidden = true; panel.innerHTML = ""; }
    document.body.classList.remove("lesson-open", "lesson-collapsed");
    window.setLessonLayout?.(false);
  }

  // Tekstikoko: kolme porrasta, muistetaan tässä selaimessa
  const SIZE_KEY = "robolab-lesson-size";
  let textSize = (() => { try { return Math.min(2, Math.max(0, +(localStorage.getItem(SIZE_KEY) ?? 1))); } catch { return 1; } })();

  // Puhekupla: robotti + nimi + teksti (html valmiiksi turvallinen)
  function bubble(who, mood, html, { big = false, extra = "" } = {}) {
    const c = Robots.CAST[who] || Robots.CAST.volt;
    return `<div class="say ${big ? "big" : ""}" style="--bot:${c.color}">
      <div class="say-bot">${Robots.svg(who, mood, { size: big ? 76 : 48 })}</div>
      <div class="say-bubble"><b class="say-name">${esc(c.name)}</b>${html}${extra}</div>
    </div>`;
  }

  function drawPanel() {
    const course = byId(P.active);
    if (!course || !panel) return;
    const c = cp(course.id), step = course.steps[c.step];
    const { s, done } = evalStep(course, step);
    const n = course.steps.length;
    const tool = TOOLS.find((t) => t.id === step.tool);
    const onTool = currentRoute() === step.tool;
    const who = guideOf(course, step);
    const scroll = panel.querySelector(".lesson-body")?.scrollTop || 0;
    panel.classList.toggle("collapsed", collapsed);
    panel.dataset.size = textSize;
    document.body.dataset.lessonSize = textSize;
    document.body.classList.toggle("lesson-collapsed", collapsed);
    if (c.examOpen && c.exam && !c.exam.done) { drawExam(course); return; }
    if (c.finished) { drawFinished(course); return; }

    const tasksOk = step.tasks.every((t) => s.tasks[t.id]);
    const quizWrong = step.quiz && s.quiz != null && s.quiz !== step.quiz.correct;
    const mood = done ? "happy" : quizWrong ? "oops" : tasksOk && step.tasks.length ? "wow" : "talk";
    panel.dataset.sig = signature(step, s, done);
    panel.innerHTML = `
      <div class="lesson-head">
        ${collapsed ? `<button class="lesson-mini" data-l="collapse" title="${tr("Näytä oppitunti", "Show lesson")}">${Robots.svg(who, done ? "happy" : "idle", { size: 36 })}</button>` : ""}
        <div class="lesson-title"><small>${esc(course.title)}</small><b>${tr("Vaihe", "Step")} ${c.step + 1}/${n} · ${esc(step.title)}</b></div>
        <button class="icon-btn txt-size" data-l="size" title="${tr("Tekstin koko", "Text size")}" aria-label="${tr("Tekstin koko", "Text size")}"><span style="font-size:${0.7 + textSize * 0.15}rem">A</span><span style="font-size:${0.95 + textSize * 0.15}rem">A</span></button>
        <button class="icon-btn" data-l="collapse" title="${collapsed ? tr("Näytä oppitunti", "Show lesson") : tr("Pienennä", "Minimise")}" aria-label="${collapsed ? tr("Näytä oppitunti", "Show lesson") : tr("Pienennä", "Minimise")}">${collapsed ? "‹" : "›"}</button>
        <button class="icon-btn" data-l="close" title="${tr("Keskeytä kurssi (edistyminen säilyy)", "Pause course (progress is kept)")}" aria-label="${tr("Keskeytä kurssi", "Pause course")}"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
      </div>
      <div class="lesson-dots" role="list">${course.steps.map((st, i) => `<button role="listitem" class="dot ${i === c.step ? "cur" : ""} ${sp(course.id, st.id).done ? "done" : ""}" data-l="go" data-i="${i}" title="${esc(st.title)}" aria-label="${tr("Vaihe", "Step")} ${i + 1}: ${esc(st.title)}"></button>`).join("")}</div>
      <div class="lesson-body">
        ${onCourseProject(course) ? "" : `<div class="alert warn"><b>!</b><span>${tr("Avoinna on toinen projekti, joten tehtäviä ei tarkisteta.", "Another project is open, so tasks are not being checked.")} <button class="link-btn" data-l="proj">${tr("Palaa kurssin projektiin", "Back to the course project")}</button></span></div>`}
        ${bubble(who, mood, `<p>${esc(done ? Robots.cheer(who) + " " + (c.step === n - 1 ? tr("Paina Valmis.", "Press Finish.") : tr("Jatketaan seuraavaan vaiheeseen.", "On to the next step.")) : sayOf(course, step))}</p>`,
          { big: true, extra: `<button class="link-btn more-btn" data-l="more" aria-expanded="${!!s.more}">${s.more ? tr("▴ Piilota teoria", "▴ Hide the theory") : tr("📖 Lue koko teoria", "📖 Read the full theory")}</button>` })}
        ${s.more ? `<div class="lesson-teach">${md(step.teach)}</div>` : ""}
        ${onTool ? "" : `<button class="btn primary lesson-go" data-l="tool">${icon(tool.icon)} ${tr("Avaa", "Open")} ${esc(tool.name)}</button>`}
        ${step.tasks.length ? missionHtml(step, s) : ""}
        ${step.reflect ? reflectHtml(step, s) : ""}
        ${hintsHtml(step, s, who, tasksOk)}
        ${step.quiz && tasksOk ? quizHtml(step, s, who) : ""}
        ${step.quiz && !tasksOk ? `<p class="quiz-later">🔒 ${tr("Pikakysymys avautuu, kun tehtävät on tehty.", "A quick question unlocks when the tasks are done.")}</p>` : ""}
        <div class="lesson-ai">
          ${Robots.svg("volt", "idle", { size: 34 })}
          <div><b>${tr("Kysy Voltilta", "Ask Volt")}</b>
            <div class="ai-chips">
              <button class="chip" data-l="ai" data-k="explain">${tr("Selitä toisin", "Explain differently")}</button>
              <button class="chip" data-l="ai" data-k="hint">${tr("Olen jumissa", "I'm stuck")}</button>
              <button class="chip" data-l="ai" data-k="check">${tr("Tarkista työni", "Check my work")}</button>
              <button class="chip" data-l="ai" data-k="deeper">${tr("Kerro lisää", "Tell me more")}</button>
              <button class="chip" data-l="chat">💬 ${tr("Oma kysymys", "My own question")}</button>
            </div></div>
        </div>
      </div>
      <div class="lesson-foot">
        <button class="btn" data-l="prev" ${c.step === 0 ? "disabled" : ""}>←</button>
        ${done ? "" : `<button class="link-btn" data-l="skip">${tr("Ohita vaihe", "Skip step")}</button>`}
        <button class="btn ${done ? "primary pulse" : ""}" data-l="next" id="lesson-next" ${done ? "" : `title="${tr("Tee tehtävät ja vastaa kysymykseen", "Do the tasks and answer the question")}"`}>${c.step === n - 1 ? tr("Valmis", "Finish") : tr("Seuraava", "Next")} →</button>
      </div>`;
    const body = panel.querySelector(".lesson-body");
    if (body && scroll) body.scrollTop = scroll;
  }

  // Muutosten tunniste: paneeli piirretään uudelleen vain, kun jokin näkyvä tila muuttuu
  const signature = (step, s, done) => JSON.stringify([step.tasks.map((t) => !!s.tasks[t.id]), done, currentRoute() === step.tool]);

  // Tehtävät yksi kerrallaan: tehdyt pieninä, nykyinen isona, tulevista vain määrä
  function missionHtml(step, s) {
    const total = step.tasks.length, doneN = step.tasks.filter((t) => s.tasks[t.id]).length;
    const cur = step.tasks.find((t) => !s.tasks[t.id]);
    const later = cur ? step.tasks.slice(step.tasks.indexOf(cur) + 1).filter((t) => !s.tasks[t.id]).length : 0;
    return `<div class="mission">
      <div class="mission-head"><b>${tr("Tehtävä", "Mission")}</b><span>${doneN}/${total}</span>
        <div class="mission-bar"><span style="width:${(doneN / total) * 100}%"></span></div></div>
      ${step.tasks.filter((t) => s.tasks[t.id]).map((t) => `<div class="m-done">✓ ${esc(t.text)}</div>`).join("")}
      ${cur ? `<div class="m-now">
          <span class="m-num">${doneN + 1}</span>
          <div><p>${esc(cur.text)}</p>
            <small>${cur.check ? tr("Huomaan automaattisesti, kun se on tehty.", "I'll notice automatically when it's done.")
              : tr("Katso rauhassa: merkitsen tämän tehdyksi, kun työkalu on ollut hetken auki.", "Take a look: I'll mark this done once the tool has been open for a moment.")}</small>
          </div></div>
        ${later ? `<div class="m-later">+ ${later} ${later === 1 ? tr("tehtävä vielä tämän jälkeen", "more task after this") : tr("tehtävää vielä tämän jälkeen", "more tasks after this")}</div>` : ""}`
        : `<div class="m-all">🎉 ${tr("Kaikki tehtävät tehty!", "All tasks done!")}</div>`}
    </div>`;
  }

  // Vihjeet tulevat oppaan suusta yksi kerrallaan
  function hintsHtml(step, s, who, tasksOk) {
    if (!step.hints?.length) return "";
    const shown = step.hints.slice(0, s.hint).map((h) => bubble(who, "wink", `<p>${esc(h)}</p>`)).join("");
    const more = s.hint < step.hints.length && !tasksOk
      ? `<button class="hint-btn" data-l="hint">💡 ${s.hint ? tr("Vielä yksi vihje", "One more hint") : tr("Pyydä vihje", `Hint from ${(Robots.CAST[who] || Robots.CAST.volt).name}`)}</button>` : "";
    return shown || more ? `<div class="lesson-hints">${shown}${more}</div>` : "";
  }

  function quizHtml(step, s, who) {
    const q = step.quiz, answered = s.quiz !== null && s.quiz !== undefined, ok = s.quiz === q.correct;
    // Vaihtoehtojen järjestys arvotaan joka kerta, kun kysymys avataan (lähteessä oikea on usein ensimmäinen).
    // Järjestys on ei-lueteltava ominaisuus: se pysyy samana uudelleenpiirroissa, mutta ei tallennu.
    delete s.qorder; // 2.8.x tallensi järjestyksen
    if (!Array.isArray(s._qo) || s._qo.length !== q.options.length) Object.defineProperty(s, "_qo", { value: shuffled(q.options.length), configurable: true });
    const order = s._qo;
    return `<div class="lesson-quiz">
      <div class="quiz-head">⚡ ${tr("Pikakysymys", "Quick question")}</div>
      <p class="quiz-q">${esc(q.q)}</p>
      <div class="quiz-opts">${order.map((i, k) => `<button class="quiz-opt ${answered && i === s.quiz ? (ok ? "right" : "wrong") : ""}" data-l="quiz" data-i="${i}" ${ok ? "disabled" : ""}><span class="q-letter">${"ABCD"[k]}</span>${esc(q.options[i])}</button>`).join("")}</div>
      ${answered ? (ok ? bubble(who, "happy", `<p>✓ ${esc(q.explain)}</p>`)
        : bubble(who, "oops", `<p>${tr("Ei ihan. Mieti uudelleen — vihje löytyy teoriasta.", "Not quite. Think again — the theory has a clue.")}</p><button class="link-btn" data-l="ai" data-k="quiz">${tr("Kysy Voltilta, miksi", "Ask Volt why")}</button>`)) : ""}
    </div>`;
  }

  function reflectHtml(step, s) {
    return `<div class="lesson-reflect">
      <p class="quiz-q">${esc(step.reflect.q)}</p>
      <textarea id="lesson-refl" rows="5" placeholder="${tr("Kirjoita vastauksesi tähän…", "Write your answer here…")}">${esc(s.refl)}</textarea>
      <div class="row-actions">
        <button class="btn primary" data-l="ai" data-k="reflect">${tr("Pyydä Voltilta palautetta", "Get feedback from Volt")}</button>
        <button class="btn" data-l="model">${tr("Näytä mallivastaus", "Show model answer")}</button>
      </div>
      <div id="lesson-model"></div>
    </div>`;
  }

  // Loppukoe: vaihtoehtojen järjestys arvotaan kerran oppilasta kohden (oikea vastaus ei ole aina samassa kohdassa)
  function openExam(course) {
    const c = cp(course.id), ex = EXAMS[course.id];
    if (!ex) return;
    if (!c.exam || c.exam.done && !c.finished) c.exam = { first: [], cur: [], done: false, order: ex.map((q) => shuffled(q.options.length)) };
    c.examOpen = true;
    persist(); drawPanel();
  }

  function drawExam(course) {
    const c = cp(course.id), ex = EXAMS[course.id], e = c.exam;
    const who = GUIDE[course.id] || "volt";
    const answered = e.first.filter((x) => x != null).length;
    panel.innerHTML = `
      <div class="lesson-head"><div class="lesson-title"><small>${esc(course.title)}</small><b>${tr("Loppukoe", "Final quiz")} · ${answered}/${ex.length}</b></div>
        <button class="icon-btn" data-l="close" aria-label="${tr("Keskeytä", "Pause")}"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="lesson-body">
        ${bubble(who, "talk", `<p>${tr("Viimeinen tehtävä! Vastaa kolmeen kysymykseen. Pisteet lasketaan ensimmäisestä vastauksestasi, ja jos olet luokassa, opettaja näkee ne. Väärästä vastauksesta saat selityksen.",
          "Last task! Answer three questions. Your score counts your first answers, and if you're in a class your teacher sees it. A wrong answer shows an explanation.")}</p>`, { big: true })}
        ${ex.map((q, qi) => {
          const order = e.order?.[qi] || q.options.map((_, i) => i), cur = e.cur[qi], ok = cur === q.correct;
          return `<div class="lesson-quiz exam-q">
            <div class="quiz-head">${qi + 1}. ${tr("kysymys", "question")}</div>
            <p class="quiz-q">${esc(q.q)}</p>
            <div class="quiz-opts">${order.map((oi, k) => `<button class="quiz-opt ${cur === oi ? (ok ? "right" : "wrong") : ""}" data-l="exam" data-q="${qi}" data-i="${oi}" ${ok ? "disabled" : ""}><span class="q-letter">${"ABCD"[k]}</span>${esc(q.options[oi])}</button>`).join("")}</div>
            ${cur != null ? (ok ? `<p class="exam-ok">✓ ${esc(q.explain)}</p>` : `<p class="exam-wrong">${tr("Ei aivan. Mieti uudelleen.", "Not quite. Think again.")} ${esc(q.explain)}</p>`) : ""}
          </div>`;
        }).join("")}
      </div>
      <div class="lesson-foot">
        <span class="note">${answered}/${ex.length} ${tr("vastattu", "answered")}</span>
        <button class="btn ${answered === ex.length ? "primary pulse" : ""}" data-l="examdone">${tr("Valmis", "Finish")} →</button>
      </div>`;
  }

  function drawFinished(course) {
    const next = COURSES.find((c) => c.id !== course.id && !P.c[c.id]?.finished && (!window.Plans || Plans.canCourse(c.id)));
    const who = GUIDE[course.id] || "volt";
    panel.innerHTML = `
      <div class="lesson-head"><div class="lesson-title"><small>${tr("Kurssi", "Course")}</small><b>${esc(course.title)}</b></div>
        <button class="icon-btn" data-l="close" aria-label="${tr("Sulje", "Close")}"><svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
      <div class="lesson-body lesson-done">
        <div class="done-bots">${Robots.svg(who, "happy", { size: 96, cls: "jump" })}${Robots.svg("volt", "wink", { size: 72, cls: "jump late" })}</div>
        <h3>${tr("Kurssi suoritettu!", "Course complete!")}</h3>
        ${bubble(who, "happy", `<p>${tr("Olit huippu! Tällä kurssilla opit:", "You were awesome! On this course you learned:")}</p><ul>${course.outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>`)}
        ${EXAMS[course.id] ? (P.c[course.id]?.exam?.done
          ? `<p class="exam-score">${tr("Loppukoe", "Final quiz")}: <b>${P.c[course.id].exam.score} / ${EXAMS[course.id].length}</b></p>`
          : `<button class="btn" data-l="exam-open">${tr("Tee kurssin loppukoe", "Take the course's final quiz")}</button>`) : ""}
        ${next ? `<p>${tr("Seuraavaksi suosittelemme:", "Up next we recommend:")}</p><button class="btn primary" data-l="startnext" data-c="${next.id}">${Robots.svg(GUIDE[next.id], "happy", { size: 28 })} ${esc(next.title)}</button>` : ""}
        <button class="btn" data-l="all">${tr("Kaikki kurssit", "All courses")}</button>
      </div>`;
  }

  // Tarkistetaan tehtävät taustalla; paneeli piirretään uudelleen vain, kun jotain muuttui
  function tick() {
    const course = byId(P.active);
    if (!course || !panel || panel.hidden) return;
    const c = cp(course.id);
    if (c.finished || c.examOpen) return;
    const onProj = String(onCourseProject(course));
    if (panel.dataset.proj !== onProj) { panel.dataset.proj = onProj; drawPanel(); return; } // projekti vaihtui
    const step = course.steps[c.step];
    const { s, done } = evalStep(course, step);
    if (panel.dataset.sig !== signature(step, s, done)) drawPanel();
    if (justDone) { justDone = false; panel.querySelector(".say.big")?.classList.add("celebrate"); }
  }

  function onPanelClick(e) {
    const b = e.target.closest("[data-l]");
    if (!b) return;
    const course = byId(P.active);
    const act = b.dataset.l;
    if (act === "close") { stop(); return; }
    if (act === "all") { stop(); location.hash = "#/learn"; return; }
    if (act === "startnext") { start(b.dataset.c); return; }
    if (!course) return;
    const c = cp(course.id), step = course.steps[c.step], s = sp(course.id, step.id);
    if (act === "collapse") { collapsed = !collapsed; drawPanel(); return; }
    if (act === "chat") { Assistant.open(); return; }
    if (act === "size") { textSize = (textSize + 1) % 3; try { localStorage.setItem(SIZE_KEY, textSize); } catch {} drawPanel(); return; }
    if (act === "more") { s.more = !s.more; persist(); drawPanel(); return; }
    if (act === "proj") { ensureProject(course); router(); drawPanel(); return; }
    if (act === "go") { goStep(+b.dataset.i); return; }
    if (act === "tool") { location.hash = "#/" + step.tool; setTimeout(drawPanel, 50); return; }
    if (act === "prev") { goStep(c.step - 1); return; }
    if (act === "skip" || act === "next") {
      if (act === "next" && !evalStep(course, step).done) { toast(tr("Tee ensin tehtävät ja vastaa kysymykseen — tai ohita vaihe.", "Do the tasks and answer the question first — or skip the step.")); return; }
      if (c.step === course.steps.length - 1) {
        // Viimeisen vaiheen jälkeen loppukoe; kurssi on suoritettu, kun koe on tehty
        if (EXAMS[course.id] && !c.exam?.done) { openExam(course); return; }
        c.finished = true; persist(); drawPanel(); return;
      }
      goStep(c.step + 1); return;
    }
    if (act === "exam" && c.exam && !c.exam.done) {
      const qi = +b.dataset.q, oi = +b.dataset.i;
      if (c.exam.first[qi] == null) c.exam.first[qi] = oi; // pisteet ensimmäisestä vastauksesta
      c.exam.cur[qi] = oi;
      persist(); drawPanel(); return;
    }
    if (act === "examdone" && c.exam && !c.exam.done) {
      const ex = EXAMS[course.id];
      if (c.exam.first.filter((x) => x != null).length < ex.length) { toast(tr("Vastaa ensin kaikkiin kysymyksiin.", "Answer all the questions first.")); return; }
      c.exam.done = true;
      c.exam.score = ex.filter((q, i) => c.exam.first[i] === q.correct).length;
      c.examOpen = false;
      c.finished = true;
      persist(); drawPanel(); return;
    }
    if (act === "exam-open") { openExam(course); return; }
    if (act === "hint") { s.hint++; persist(); drawPanel(); return; }
    if (act === "quiz") { s.quiz = +b.dataset.i; persist(); drawPanel(); return; }
    if (act === "model") { panel.querySelector("#lesson-model").innerHTML = `<div class="model-answer">${md(step.reflect.model)}</div>`; return; }
    if (act === "ai") { askTutor(b.dataset.k, course, step, s); return; }
  }

  function onPanelInput(e) {
    const course = byId(P.active);
    if (!course) return;
    const step = course.steps[cp(course.id).step], s = sp(course.id, step.id);
    if (e.target.id === "lesson-refl") { s.refl = e.target.value; persist(); setTimeout(tick, 0); }
  }

  /* ===== Tekoälyopettaja ===== */
  function askTutor(kind, course, step, s) {
    const prompts = {
      explain: tr(`Selitä tämän vaiheen ("${step.title}") ydinasia toisella tavalla, arkisen esimerkin avulla.`, `Explain the key idea of this step ("${step.title}") in a different way, with an everyday example.`),
      hint: tr("Olen jumissa tämän vaiheen tehtävissä. Anna pieni vihje seuraavaan tekemättömään tehtävään — älä tee sitä puolestani.", "I'm stuck on this step's tasks. Give me a small hint for the next unfinished task — don't do it for me."),
      check: tr("Tarkista työkalun nykyiset arvot: olenko tehnyt tehtävät oikein, ja mitä kannattaisi huomata tuloksista?", "Check the tool's current values: have I done the tasks right, and what should I notice in the results?"),
      deeper: tr("Kerro tästä aiheesta vähän syvemmin: miten tämä näkyy oikeissa roboteissa?", "Tell me a bit more about this topic: how does it show up in real robots?"),
      quiz: tr(`Vastasin kysymykseen "${step.quiz?.q}" vaihtoehdolla "${step.quiz?.options[s.quiz]}". Miksi se ei ole oikein? Auta minua päättelemään oikea vastaus itse.`, `I answered "${step.quiz?.options[s.quiz]}" to the question "${step.quiz?.q}". Why is it wrong? Help me reason out the right answer myself.`),
      reflect: tr(`Tässä on vastaukseni kysymykseen "${step.reflect?.q}":\n\n${s.refl || "(tyhjä)"}\n\nAnna palautetta: mikä on oikein ja mitä puuttuu?`, `Here is my answer to "${step.reflect?.q}":\n\n${s.refl || "(empty)"}\n\nGive me feedback: what is right and what is missing?`),
    };
    if (kind === "reflect" && s.refl.trim().length < 10) { toast(tr("Kirjoita ensin vastauksesi.", "Write your answer first.")); return; }
    Assistant.ask(prompts[kind] || prompts.explain, { offline: offlineTutor(kind, step, s) });
  }

  // Ilman API-avainta: vastataan kurssin omalla materiaalilla
  function offlineTutor(kind, step, s) {
    if (kind === "hint") {
      const next = step.hints?.[Math.min(s.hint, (step.hints?.length || 1) - 1)];
      if (step.hints?.length && s.hint < step.hints.length) { s.hint++; persist(); setTimeout(drawPanel, 0); }
      return next || tr("Lue vaiheen teksti uudelleen ja katso tehtävälistan järjestys.", "Re-read the step text and follow the task list in order.");
    }
    if (kind === "quiz") return tr("Vihje: lue vaiheen teoriateksti uudelleen ja etsi kohta, joka liittyy kysymyksen avainsanaan.", "Hint: re-read the step's theory and find the part related to the question's key word.");
    if (kind === "reflect") return tr("Vertaa vastaustasi mallivastaukseen (Näytä mallivastaus). Tarkempaan palautteeseen tarvitaan Claude API -avain.", "Compare your answer with the model answer (Show model answer). Detailed feedback needs a Claude API key.");
    return step.teach;
  }

  // Tekoälylle annettava konteksti: kurssi, vaihe, tehtävien tila, kysymys ja mallivastaus
  function context() {
    const course = byId(P.active);
    if (!course || cp(course.id).finished) return "";
    const c = cp(course.id), step = course.steps[c.step], s = sp(course.id, step.id);
    const lines = [
      `course: ${course.title}`,
      `step ${c.step + 1}/${course.steps.length}: ${step.title} (tool: ${step.tool})`,
      `lesson text shown to the learner:\n${step.teach}`,
    ];
    if (step.tasks.length) lines.push("tasks:\n" + step.tasks.map((t) => `- [${s.tasks[t.id] ? "x" : " "}] ${t.text}`).join("\n"));
    if (step.hints?.length) lines.push("hints the course offers:\n" + step.hints.map((h) => `- ${h}`).join("\n"));
    if (step.quiz) {
      const st = s.quiz === null || s.quiz === undefined ? "not answered yet" : s.quiz === step.quiz.correct ? "answered correctly" : `answered "${step.quiz.options[s.quiz]}" (wrong)`;
      lines.push(`quiz: ${step.quiz.q}\noptions: ${step.quiz.options.map((o, i) => `${i + 1}) ${o}`).join(" | ")}\ncorrect option (do not reveal unless the learner has already tried twice or answered correctly): ${step.quiz.correct + 1}\nexplanation: ${step.quiz.explain}\nlearner status: ${st}`);
    }
    if (step.reflect) lines.push(`reflection question: ${step.reflect.q}\nmodel answer (for grading feedback, don't paste it wholesale): ${step.reflect.model}`);
    return `<course_context>\n${lines.join("\n\n")}\n</course_context>\n\n`;
  }

  /* ===== Kurssisivu ===== */
  function progressOf(course) {
    const c = P.c[course.id];
    if (!c) return 0;
    if (c.finished) return 1;
    return course.steps.filter((st) => c.steps[st.id]?.done).length / course.steps.length;
  }

  function render(root, tool) {
    root.innerHTML = `
      <div class="page-head"><div><h1>${tool.name}</h1><p>${tool.desc}</p></div></div>
      <div class="card learn-intro">
        ${bubble("volt", "happy", `<p>${tr("Hei, olen Volt! Kursseilla opit robotiikkaa tekemällä. Robottikaverini opastavat sinut vaihe kerrallaan, ja minä autan aina, kun jäät jumiin.",
          "Hi, I'm Volt! On the courses you learn robotics by doing. My robot friends guide you one step at a time, and I'm here whenever you get stuck.")}</p>
          <p class="note">${tr("Jokainen kurssi tehdään omaan projektiinsa, joten muut työsi pysyvät ennallaan.", "Each course runs in its own project, so your other work stays untouched.")}</p>`, { big: true })}
        <div class="cast-row">${Object.entries(Robots.CAST).map(([id, r]) => `<div class="cast" title="${esc(r.role)}">${Robots.svg(id, "idle", { size: 54 })}<b>${esc(r.name)}</b><small>${esc(r.role)}</small></div>`).join("")}</div>
      </div>
      ${classCoursesHtml() || classJoinHtml()}
      <h2 class="path-title">${tr("Oppimispolku", "Learning path")}</h2>
      <p class="note path-note">${tr("Kurssit on järjestetty niin, että jokainen rakentaa edellisten päälle. Voit silti aloittaa mistä tahansa.", "The courses are ordered so each one builds on the previous ones. You can still start anywhere.")}</p>
      ${COURSES.map((c, i) => { const st = STAGES.find((x) => x.from === c.id); return (st ? `${i ? "</div>" : ""}<h3 class="stage-title">${st.title}</h3><p class="note stage-note">${st.desc}</p><div class="course-grid">` : "") + courseCard(c, i); }).join("")}</div>
      ${window.Achievements ? Achievements.cardHtml() : ""}
      ${window.Education ? Education.studentCardHtml() : ""}`;
    window.Education?.bindStudentCard(root);
    window.Plans?.bindClassForm(root);
    root.onclick = (e) => {
      const b = e.target.closest("[data-course]");
      if (!b) return;
      const id = b.dataset.course;
      if (b.dataset.act === "restart") {
        if (!confirm(tr("Aloitetaanko kurssi alusta? Kurssin edistyminen ja sen projekti poistetaan.", "Restart the course? Its progress and its project will be deleted."))) return;
        start(id, { restart: true });
      } else start(id);
    };
  }

  // Luokkaan liittyminen näkyy kaikilla tasoilla (myös Education/Pro), jotta opettaja näkee oppilaan etenemisen.
  // Opettajalle se on suljettuna, koska hän tuskin liittyy itse oppilaaksi.
  function classJoinHtml() {
    if (!window.Plans) return "";
    return `<details class="card class-card"${Plans.canTeach() ? "" : " open"}>
      <summary><h2>🏫 ${tr("Onko sinulla opettajan luokkakoodi?", "Do you have a class code from your teacher?")}</h2></summary>
      ${Plans.classBoxHtml()}</details>`;
  }

  // Opettajan luokalle antamat kurssit (luokkakoodilla liittynyt oppilas): järjestys, määräpäivä ja tilanne
  function classCoursesHtml() {
    const cls = window.Plans?.classInfo?.();
    if (!cls) return "";
    const list = (cls.courses || []).map((a) => ({ ...a, course: byId(a.id) })).filter((a) => a.course);
    const today = new Date().toISOString().slice(0, 10);
    const fmtDate = (d) => new Date(d + "T12:00").toLocaleDateString(tr("fi-FI", "en-GB"), { day: "numeric", month: "numeric" });
    return `<section class="card class-courses" aria-labelledby="cc-title">
      <h2 id="cc-title">🏫 ${tr("Luokan kurssit", "Class courses")}${cls.name ? ` · ${esc(cls.name)}` : ""}</h2>
      <p class="note">${list.length ? tr(`Opettaja on antanut nämä kurssit tehtäväksi. Edistymisesi näkyy opettajalle nimimerkillä ${esc(cls.alias || "")}.`, `Your teacher has assigned these courses. Your progress shows to your teacher under the alias ${esc(cls.alias || "")}.`)
        : tr("Opettaja ei ole vielä valinnut luokalle kursseja. Voit tehdä mitä tahansa kursseja; edistymisesi näkyy opettajalle.", "Your teacher hasn't picked courses for the class yet. You can do any course; your progress shows to your teacher.")}</p>
      ${list.length ? `<ol class="cc-list">${list.map((a) => {
        const c = P.c[a.id], p = progressOf(a.course), late = a.due && a.due < today && !c?.finished;
        const status = c?.finished ? `<span class="badge ok">✓ ${tr("Suoritettu", "Completed")}${c.exam?.done ? ` · ${c.exam.score}/${EXAMS[a.id]?.length}` : ""}</span>`
          : c ? `<span class="badge">${Math.round(p * 100)} %</span>` : `<span class="badge">${tr("Aloittamatta", "Not started")}</span>`;
        return `<li class="${late ? "late" : ""}"><div><b>${esc(a.course.title)}</b>
            <small>~${a.course.minutes} min${a.due ? ` · ${late ? "⚠ " : ""}${tr("palautus", "due")} ${fmtDate(a.due)}` : ""}</small>
            <div class="course-progress"><span style="width:${p * 100}%"></span></div></div>
          ${status}
          ${c?.finished ? "" : `<button class="btn ${c ? "" : "primary"} small" data-course="${a.id}">${c ? tr("Jatka", "Continue") : tr("Aloita", "Start")} →</button>`}</li>`;
      }).join("")}</ol>` : ""}
      ${classChallengesHtml(cls, today, fmtDate)}
      <p class="cc-leave"><button class="link-btn" data-plans="leave-class">${tr("Poistu luokasta", "Leave the class")}</button></p>
    </section>`;
  }

  // Opettajan antamat haasteet (achievements.js): tulos, tavoite ja linkki simulaatioon
  function classChallengesHtml(cls, today, fmtDate) {
    const A = window.Achievements;
    const chs = (cls.courses || []).map((a) => ({ ...a, ch: A?.CHALLENGES.find((c) => "ch-" + c.id === a.id) })).filter((a) => a.ch);
    if (!chs.length) return "";
    return `<h3 class="cc-sub">🎯 ${tr("Luokan haasteet", "Class challenges")}</h3>
      <ol class="cc-list">${chs.map((a) => {
        const r = A.challengeState(a.ch.id), late = a.due && a.due < today && !r?.passed;
        const status = r?.passed ? `<span class="badge ok">✓ ${tr("Läpäisty", "Passed")} · ${A.fmtScore(a.ch, r.best)}</span>`
          : r ? `<span class="badge">${tr("Paras", "Best")} ${A.fmtScore(a.ch, r.best)} / ${A.fmtScore(a.ch, a.ch.goal)}</span>` : `<span class="badge">${tr("Ei yritetty", "Not tried")}</span>`;
        return `<li class="${late ? "late" : ""}"><div><b>${esc(a.ch.name)}</b>
            <small>${esc(a.ch.desc)}${a.due ? ` · ${late ? "⚠ " : ""}${tr("palautus", "due")} ${fmtDate(a.due)}` : ""}</small></div>
          ${status}
          ${r?.passed ? "" : `<a class="btn small ${r ? "" : "primary"}" href="#/nn${a.ch.dim}">${tr("Avaa simulaatio", "Open the simulation")} →</a>`}</li>`;
      }).join("")}</ol>`;
  }

  function courseCard(course, i) {
    const p = progressOf(course), c = P.c[course.id];
    const locked = window.Plans && !Plans.canCourse(course.id);
    const label = !c ? tr("Aloita kurssi", "Start course") : c.finished ? tr("Avaa uudelleen", "Open again") : tr("Jatka", "Continue");
    const next = !locked && COURSES.find((x) => !P.c[x.id]?.finished && (!window.Plans || Plans.canCourse(x.id))) === course;
    // Esikurssia suositellaan vain, jos käyttäjä voi avata sen (Education: Palkkiot ilman Pro-tason Tekoäly-kurssia)
    const needId = NEEDS[course.id];
    const need = needId && !P.c[needId]?.finished && !c && (!window.Plans || Plans.canCourse(needId)) ? byId(needId) : null;
    return `<article class="card course ${next ? "next" : ""}">
      <div class="course-step"><span>${i + 1}</span>${next ? `<b>${tr("Suositeltu seuraavaksi", "Recommended next")}</b>` : ""}</div>
      <div class="course-top"><div class="course-bot">${Robots.svg(GUIDE[course.id], c?.finished ? "happy" : "idle", { size: 64 })}</div>
        <div><h3>${esc(course.title)}</h3><small>${esc(course.level)} · ${course.steps.length} ${tr("vaihetta", "steps")} · ~${course.minutes} min · ${tr("opas", "guide")} ${esc(Robots.CAST[GUIDE[course.id]].name)}</small></div>
        ${c?.finished ? `<span class="badge ok">✓ ${tr("Suoritettu", "Completed")}</span>` : locked ? Plans.badge(Plans.tierForCourse(course.id)) : ""}</div>
      <p>${esc(course.desc)}</p>
      <ul class="course-outcomes">${course.outcomes.map((o) => `<li>${esc(o)}</li>`).join("")}</ul>
      ${need ? `<p class="course-need">💡 ${tr(`Helpompi, jos teet ensin kurssin ”${esc(need.title)}”.`, `Easier if you first do “${esc(need.title)}”.`)}</p>` : ""}
      <div class="course-progress" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(p * 100)}"><span style="width:${p * 100}%"></span></div>
      <div class="row-actions">
        ${locked ? `<a class="btn" href="#/plans">🔒 ${tr(`Avaa ${Plans.NAMES[Plans.tierForCourse(course.id)]}-tasolla`, `Unlock with ${Plans.NAMES[Plans.tierForCourse(course.id)]}`)}</a>` : `<button class="btn primary" data-course="${course.id}">${label} →</button>`}
        ${c ? `<button class="link-btn" data-course="${course.id}" data-act="restart">${tr("Aloita alusta", "Restart")}</button>` : ""}
      </div>
    </article>`;
  }

  // Sovelluksen käynnistyessä jatketaan kesken jäänyttä kurssia
  function init() {
    $("#lesson").addEventListener("click", onPanelClick);
    $("#lesson").addEventListener("input", onPanelInput);
    window.addEventListener("hashchange", () => setTimeout(() => { if (P.active) drawPanel(); }, 30));
    if (P.active && byId(P.active)) { openPanel(); drawPanel(); }
  }

  TOOL_IMPL.learn = { render };
  document.addEventListener("DOMContentLoaded", init);

  return {
    list: () => COURSES.map((c) => ({ id: c.id, title: c.title, progress: progressOf(c) })),
    active: () => (P.active ? { id: P.active, title: byId(P.active).title, step: cp(P.active).step + 1, steps: byId(P.active).steps.length } : null),
    // Keskeytetty kurssi jatkettavaksi kojelaudalta: aktiivinen tai viimeksi aloitettu keskeneräinen
    resumable: () => {
      const id = P.active || P.last;
      const c = id && byId(id), p = c && P.c[id];
      return c && p && !p.finished ? { id, title: c.title, step: p.step + 1, steps: c.steps.length } : null;
    },
    // Opettajalle vietävä yhteenveto: vain eteneminen, ei vastauksia eikä projekteja
    summary: () => COURSES.map((c) => {
      const p = P.c[c.id];
      const done = p ? c.steps.filter((st) => p.steps[st.id]?.done).length : 0;
      const skipped = p ? c.steps.slice(0, p.finished ? c.steps.length : p.step).filter((st) => !p.steps[st.id]?.done).length : 0;
      return { id: c.id, steps: c.steps.length, done, finished: !!p?.finished, hints: p ? Object.values(p.steps).reduce((a, s) => a + (s.hint || 0), 0) : 0, skipped,
        score: p?.exam?.done ? p.exam.score : null, scoreMax: EXAMS[c.id]?.length ?? null };
    }),
    exams: EXAMS,
    start, stop, context, _courses: COURSES,
  };
})();
window.Courses = Courses;
