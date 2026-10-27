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
  // Onko projektin tallennettu tila muuttunut vaiheen alusta (polku: funktio, joka poimii vertailtavan osan)
  // def = työkalun oletustila: tallentamaton tila tulkitaan oletukseksi, jottei minkä tahansa muun kentän
  // tallennus (joka kirjoittaa myös oletusarvot) näytä tämän arvon muuttumiselta
  const changed = (ctx, key, pick = (x) => x, def = undefined) =>
    JSON.stringify(pick(tools()[key] ?? def) ?? null) !== JSON.stringify(pick(ctx.base.tools[key] ?? def) ?? null);
  const pid = () => window.pidResult?.();
  const rotEuler = () => {
    const q = tools().rot?.q || [0, 0, 0, 1];
    return Kin.matToEuler(Kin.quatToMat(q), "ZYX", "intrinsic");
  };
  const near = (a, b, tol) => Math.abs(a - b) < tol;
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
  // Odometriatehtävässä myös "luuli olevansa perillä" -pysähdys kelpaa: virhe on juuri se, mitä tutkitaan
  const newArrivalAny = (ctx) => {
    const st = window.sim2dStatus?.() || {}, off = st.offGoalArrivals || 0;
    if (ctx.base.off == null || off < ctx.base.off) ctx.base.off = off;
    return newArrival(ctx) || off > ctx.base.off;
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
            { id: "neg", text: tr("Vie työkalun kärki vasemmalle puolelle (X negatiivinen)", "Move the tool tip to the left side (negative X)"), check: () => tipOf(arm())[0] < -0.02 },
          ],
          hints: [tr("Liukusäätimet ovat vasemmalla Nivelet-kortissa. Työkalun sijainti näkyy Työkalun asento -kortissa.", "The sliders are in the Joints card on the left. The tool position is shown in the Tool pose card."),
            tr("X tulee negatiiviseksi, kun käsi osoittaa vasemmalle (taaksepäin): kokeile q1 = 150°.", "X becomes negative when the arm points left (backwards): try q1 = 150°.")],
          quiz: { q: tr("Miksi kyynärvarsi liikkuu, kun muutat q1:tä, vaikka q2 pysyy samana?", "Why does the forearm move when you change q1, even though q2 stays the same?"),
            options: [tr("Koska jokainen nivel liikuttaa kaikkea sen jälkeen tulevaa", "Because each joint moves everything that comes after it"), tr("Koska q2 muuttuu automaattisesti samalla", "Because q2 changes automatically too"), tr("Koska työkalu pysyy aina paikallaan", "Because the tool always stays in place")],
            correct: 0, explain: tr("Nivelet muodostavat ketjun. Olkanivelen kierto kääntää koko ketjun sen jälkeen — siksi suorassa kinematiikassa muunnokset kerrotaan peräkkäin.", "Joints form a chain. Turning the shoulder rotates the whole chain after it — which is why forward kinematics multiplies the transforms in sequence.") },
        },
        {
          id: "dh", tool: "dh", title: tr("Oma käsivarsi DH-taulukolla", "Your own arm with a DH table"),
          teach: tr("Teollisuudessa käsivarret kuvataan **DH-parametreilla** (Denavit–Hartenberg). Jokainen rivi kuvaa yhden nivelen neljällä luvulla:\n\n- **θ** — kierto z-akselin ympäri (kiertyvän nivelen kulma)\n- **d** — siirto z-akselia pitkin (esim. kannan korkeus)\n- **a** — linkin pituus x-akselia pitkin\n- **α** — linkin kiertymä x-akselin ympäri\n\nKun jonkin nivelen α ei ole 0, seuraavat nivelet kääntyvät eri tasossa — näin tasokädestä tulee kolmiulotteinen. Muutokset näkyvät heti myös muissa kinematiikkatyökaluissa.",
            "In industry, arms are described with **DH parameters** (Denavit–Hartenberg). Each row describes one joint with four numbers:\n\n- **θ** — rotation about z (a revolute joint's angle)\n- **d** — offset along z (e.g. base height)\n- **a** — link length along x\n- **α** — link twist about x\n\nWhen a joint's α is not 0, the following joints turn in another plane — that is how a planar arm becomes three-dimensional. Changes show up immediately in the other kinematics tools too."),
          tasks: [
            { id: "three", text: tr("Lisää kolmas nivel", "Add a third joint"), check: () => arm().chain.joints.length >= 3 },
            { id: "spatial", text: tr("Tee kädestä kolmiulotteinen asettamalla ensimmäisen rivin α = 90°", "Make the arm three-dimensional by setting α = 90° on the first row"), check: () => !Kin.isPlanar(arm().chain) },
            { id: "look", text: tr("Kokeile Varjostettu-näkymää ja käännä kuvaa vetämällä", "Try the Shaded view and rotate it by dragging"), check: (c) => did(c, "click", "[data-render='shaded']") && did(c, "pointerdown", "canvas") },
          ],
          hints: [tr("Paina taulukon alla '+ Kiertyvä nivel'.", "Press '+ Revolute joint' below the table."),
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
          hints: [tr("Nuolen raahaus liikuttaa kohdetta vain sen akselin suuntaan; keskipallo liikkuu vaakatasossa.", "Dragging an arrow moves the target along that axis only; the centre ball moves in the horizontal plane."),
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
            { id: "s", text: tr("Vaihda profiiliksi S-käyrä ja vertaa kiihtyvyyskuvaajaa trapetsiin", "Switch the profile to S-curve and compare the acceleration plot with the trapezoid"), check: () => tools().traj?.profile === "scurve" },
            { id: "play", text: tr("Paina ▶ Toista ja katso liike", "Press ▶ Play and watch the motion"), check: (c) => did(c, "click", "#tr-play") },
          ],
          hints: [tr("Alku- ja loppuasento täyttyvät valmiiksi käsivartesi nykyisestä asennosta. Loppuasentoa voi muuttaa kohdassa Nivelet: alku → loppu.", "The start and end poses are filled in from your arm's current pose. You can change the end pose under Joints: start → end.")],
          quiz: { q: tr("Miksi teollisuusrobotit käyttävät usein S-käyrää trapetsin sijaan?", "Why do industrial robots often use an S-curve instead of a trapezoid?"),
            options: [tr("Kiihtyvyys muuttuu pehmeästi, joten tärinää ja kulumista on vähemmän", "Acceleration changes smoothly, so there is less vibration and wear"), tr("S-käyrä on aina nopein", "The S-curve is always fastest"), tr("S-käyrä ei tarvitse nopeusrajaa", "The S-curve needs no velocity limit")], correct: 0,
            explain: tr("S-käyrä on hieman hitaampi kuin trapetsi, mutta äkilliset kiihtyvyyden muutokset herättävät mekaniikan värähtelemään. Pehmeä liike on tarkempi ja säästää laitetta.", "The S-curve is slightly slower than the trapezoid, but sudden acceleration changes make the mechanics vibrate. Smooth motion is more precise and spares the hardware.") },
        },
        {
          id: "motor", tool: "motor", title: tr("Riittääkö moottori?", "Is the motor strong enough?"),
          teach: tr("Pahin hetki nivelelle on, kun varsi on **vaakasuorassa**: painovoiman vipuvarsi on silloin pisin. Momentti = voima × vipuvarsi, eli kärjen kuorma rasittaa niveltä sitä enemmän, mitä pidempi varsi on.\n\nMoottorin **jumimomentti** on suurin momentti, jonka se antaa juuri ennen pysähtymistä — se ei kestä sitä jatkuvasti. Nyrkkisääntö: jatkuva kuorma enintään **~30 %** jumimomentista.\n\n**Välityssuhde** kasvattaa momenttia ja pienentää nopeutta samassa suhteessa.",
            "The worst moment for a joint is when the arm is **horizontal**: gravity's lever arm is then longest. Torque = force × lever arm, so a payload at the tip needs more torque the longer the arm is.\n\nA motor's **stall torque** is the largest torque it gives just before stopping — it cannot sustain it. Rule of thumb: keep the continuous load below **~30 %** of stall torque.\n\nA **gear ratio** multiplies torque and divides speed by the same factor."),
          tasks: [
            { id: "joint", text: tr("Valitse 'Mitä mitoitetaan': Robottikäsivarren nivel", "Choose 'What are you sizing': Robot arm joint"), check: () => tools().motor?.kind === "joint" },
            { id: "len", text: tr("Hae varren pituus omasta käsivarsimallistasi napilla", "Fetch the arm length from your own arm model with the button"), check: () => !!tools().motor?.jFromArm },
            { id: "ratio", text: tr("Säädä välityssuhdetta niin, että pitokuorma on alle 30 %", "Adjust the gear ratio so that the holding load is below 30 %"), check: () => { const r = window.motorJointResult?.(); return !!r && r.holdLoad <= 0.3 && r.canMove; } },
          ],
          hints: [tr("Oletusmoottori on pieni pyörämoottori, joka ei jaksa käsivartta. Valitse Esimerkit-valikosta 'Käsivarren olkanivel, MG996R-servo' ja hae sitten pituus uudelleen.", "The default motor is a small wheel motor that can't lift an arm. Choose 'Arm shoulder joint, MG996R servo' from the Examples menu and then fetch the length again."),
            tr("Välityssuhde-kenttä on moottorin tietojen alla. Punainen varoitus ehdottaa sopivaa arvoa.", "The gear ratio field is below the motor data. The red warning suggests a suitable value."),
            tr("Huomaa, että suurempi välitys hidastaa niveltä. Jos nopeus ei enää riitä, tarvitaan nopeampi moottori.", "Notice that a higher ratio slows the joint down. If the speed is no longer enough, you need a faster motor.")],
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
            { id: "zero", text: tr("Lisää Ki ja saa pysyvä virhe alle 2 %:iin", "Add Ki and get the steady-state error below 2 %"), check: () => { const r = pid(); return r && r.s.ki > 0 && !r.unstable && Math.abs(r.m.sse) < 0.02 * Math.abs(r.s.setpoint); } },
            { id: "big", text: tr("Kokeile hyvin suurta Ki:tä (vähintään 20) ja katso ylitystä", "Try a very large Ki (at least 20) and watch the overshoot"), check: () => { const r = pid(); return r && r.s.ki >= 20; } },
          ],
          hints: [tr("Kun Kp on noin 5–6, kokeile Ki = 5–8. Mitä suurempi Kp, sitä suurempi Ki tarvitaan, jotta virhe ehtii hävitä kuvaajan aikana.", "With Kp around 5–6, try Ki = 5–8. The bigger Kp is, the bigger Ki you need for the error to vanish within the plot."),
            tr("Katso, miten vaste nousee hitaasti asetusarvoon asti. Pysyvä virhe -luku näyttää, paljonko lopussa vielä puuttuu.", "Watch the response creep all the way to the setpoint. The Steady-state error number shows how much is still missing at the end.")],
          quiz: { q: tr("Mitä liian suuri Ki aiheuttaa?", "What does too large a Ki cause?"),
            options: [tr("Ylitystä ja heiluntaa", "Overshoot and oscillation"), tr("Pysyvän virheen", "A steady-state error"), tr("Nopeamman vasteen ilman haittoja", "A faster response with no downsides")], correct: 0,
            explain: tr("Integraali 'muistaa' menneen virheen. Kun vaste saavuttaa asetusarvon, kertynyt integraali työntää sitä vielä yli, ja syntyy heiluntaa.", "The integral 'remembers' past error. When the response reaches the setpoint, the accumulated integral still pushes it past, causing oscillation.") },
        },
        {
          id: "d", tool: "pid", title: tr("D-termi vaimentaa", "The D term adds damping"),
          teach: tr("Vaihdetaan järjestelmäksi **massa**: säädetään esimerkiksi kärryn asentoa. Massalla on hitautta: kun se kerran liikkuu, se jatkaa liikettään, ja pelkällä P-säädöllä se heiluu asetusarvon ympärillä.\n\n**D-termi** (derivaatta) reagoi muutosnopeuteen: se jarruttaa, kun vaste lähestyy nopeasti. Se toimii kuin iskunvaimennin.",
            "Let's switch the system to a **mass**: for example, controlling a cart's position. A mass has inertia: once moving, it keeps moving, and with P control alone it swings around the setpoint.\n\nThe **D term** (derivative) reacts to the rate of change: it brakes when the response approaches fast. It works like a shock absorber."),
          tasks: [
            { id: "mass", text: tr("Vaihda Ohjattava järjestelmä -valikosta massa (asento)", "Choose the mass (position) system in the System menu"), check: () => pid()?.s.plant === "mass" },
            { id: "pd", text: tr("Aseta Ki = 0 ja lisää Kd:tä, kunnes ylitys on alle 10 %", "Set Ki = 0 and add Kd until the overshoot is below 10 %"), check: () => { const r = pid(); return r && r.s.plant === "mass" && r.s.ki === 0 && r.s.kd > 0 && !r.unstable && r.m.overshoot < 10; } },
          ],
          hints: [tr("Aloita esimerkiksi Kp = 4 ja nosta Kd:tä askelin 0,5 → 1 → 2.", "Start with e.g. Kp = 4 and raise Kd in steps 0.5 → 1 → 2.")],
          quiz: { q: tr("Mihin D-termi reagoi?", "What does the D term react to?"),
            options: [tr("Virheen muutosnopeuteen", "The rate of change of the error"), tr("Virheen suuruuteen", "The size of the error"), tr("Kertyneeseen virheeseen", "The accumulated error")], correct: 0,
            explain: tr("P reagoi nykyiseen virheeseen, I menneeseen (kertynyt) ja D tulevaan (muutoksen suunta). D hillitsee liikettä ennen kuin vaste ehtii ohi.", "P reacts to the present error, I to the past (accumulated) and D to the future (direction of change). D restrains the motion before the response overshoots.") },
        },
        {
          id: "unstable", tool: "pid", title: tr("Epästabiilius", "Instability"),
          teach: tr("Väärin viritetty säädin voi tehdä järjestelmästä **epästabiilin**: värähtely kasvaa kasvamistaan, eikä vaste koskaan asetu. Oikeassa robotissa tämä tarkoittaa raivoisaa tärinää tai hallitsematonta liikettä.\n\nKokeile tehdä se tahallaan turvallisesti simulaatiossa.",
            "A badly tuned controller can make the system **unstable**: the oscillation keeps growing and the response never settles. On a real robot this means violent shaking or uncontrolled motion.\n\nTry causing it on purpose, safely in the simulation."),
          tasks: [
            { id: "break", text: tr("Tee säädöstä epästabiili (esim. massa, Kd = 0 ja suuri Ki)", "Make the loop unstable (e.g. mass, Kd = 0 and a large Ki)"), check: () => !!pid()?.unstable },
            { id: "fix", text: tr("Korjaa se: stabiili ja ylitys alle 25 %", "Fix it: stable with overshoot below 25 %"), after: "break", check: () => { const r = pid(); return r && !r.unstable && r.m.overshoot < 25; } },
          ],
          hints: [tr("Massalla PI-säätö ilman D:tä muuttuu helposti epästabiiliksi: kokeile Kp = 2, Ki = 4, Kd = 0.", "With a mass, PI control without D easily goes unstable: try Kp = 2, Ki = 4, Kd = 0."),
            tr("Korjaus: lisää Kd ja pienennä Ki selvästi. Esimerkiksi Kp = 4, Ki = 0,5 ja Kd = 3 antaa noin 10 % ylityksen.", "To fix it: add Kd and cut Ki clearly. For example Kp = 4, Ki = 0.5 and Kd = 3 gives about 10 % overshoot.")],
          quiz: { q: tr("Mistä tunnistat epästabiilin säädön?", "How do you recognise an unstable loop?"),
            options: [tr("Värähtely kasvaa ajan myötä eikä vaste asetu", "The oscillation grows over time and never settles"), tr("Vaste on hidas", "The response is slow"), tr("Pysyvä virhe ei ole nolla", "The steady-state error is not zero")], correct: 0,
            explain: tr("Hidas vaste ja pysyvä virhe ovat huonoa viritystä, mutta stabiileja. Epästabiilissa piirissä virhe kasvaa rajatta.", "A slow response and a steady-state error are poor tuning, but stable. In an unstable loop the error grows without bound.") },
        },
        {
          id: "dist", tool: "pid", title: tr("Häiriöt", "Disturbances"),
          teach: tr("Oikeassa maailmassa kuorma muuttuu: robotti nostaa esineen tai ajaa mäkeen. Tällainen **häiriö** vie vasteen pois asetusarvosta, ja säätimen tehtävä on palauttaa se.\n\nHäiriön asetukset ovat lisäsyötteissä.",
            "In the real world the load changes: the robot picks up an object or drives uphill. Such a **disturbance** pushes the response away from the setpoint, and the controller's job is to bring it back.\n\nThe disturbance settings are in the advanced inputs."),
          tasks: [
            { id: "add", text: tr("Lisää kuormahäiriö: alkuhetki esim. 1,5 s ja suuruus esim. −0,5", "Add a load disturbance: start time e.g. 1.5 s and size e.g. −0.5"), check: () => { const r = pid(); return r && r.s.distT > 0 && r.s.distMag !== 0; } },
            { id: "noi", text: tr("Aseta Ki = 0 ja katso, palaako vaste asetusarvoon häiriön jälkeen", "Set Ki = 0 and see whether the response returns to the setpoint after the disturbance"), after: "add", check: () => { const r = pid(); return r && r.s.distMag !== 0 && r.s.ki === 0; } },
          ],
          hints: [tr("Paina Säädin-kortin alareunasta 'Näytä lisäsyötteet'. Häiriön kentät ovat aivan lopussa.", "Press 'Show advanced inputs' at the bottom of the Controller card. The disturbance fields are at the very end.")],
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
            { id: "wall", text: tr("Piirrä hiirellä uusi seinä niin, että reitti joutuu kiertämään", "Draw a new wall with the mouse so that the path has to go around"), check: (c) => changed(c, "map", (m) => m?.occ, GridMap.defaultMap()) },
            { id: "goal", text: tr("Siirrä maali uuteen paikkaan Maali-työkalulla", "Move the goal to a new place with the Goal tool"), check: (c) => changed(c, "map", (m) => m?.goal, GridMap.defaultMap()) },
            { id: "anim", text: tr("Paina ▶ Toista haku ja katso, miten A* etenee", "Press ▶ Replay search and watch A* expand"), check: (c) => did(c, "click", "#pt-play") },
          ],
          hints: [tr("Kartta-kortin yläosassa valitaan, mitä hiiri piirtää: Seinä, Pyyhi, Lähtö tai Maali.", "At the top of the Map card you choose what the mouse paints: Wall, Erase, Start or Goal.")],
          quiz: { q: tr("Miksi A* tutkii yleensä vähemmän soluja kuin Dijkstra?", "Why does A* usually explore fewer cells than Dijkstra?"),
            options: [tr("Se käyttää arviota etäisyydestä maaliin ja suuntaa haun sinne", "It uses an estimate of the distance to the goal to steer the search"), tr("Se ei etsi lyhintä reittiä", "It doesn't look for the shortest path"), tr("Se ohittaa esteet", "It ignores obstacles")], correct: 0,
            explain: tr("Dijkstra laajenee tasaisesti joka suuntaan. A* lisää jokaisen solun kustannukseen arvion jäljellä olevasta matkasta, joten se laajenee ensisijaisesti maalia kohti — ja löytää silti saman lyhimmän reitin.", "Dijkstra expands evenly in every direction. A* adds an estimate of the remaining distance to each cell's cost, so it expands mainly towards the goal — and still finds the same shortest path.") },
        },
        {
          id: "compare", tool: "path", title: tr("Algoritmien vertailu", "Comparing algorithms"),
          teach: tr("Ruudukkohaut (A*, Dijkstra) ovat tarkkoja, mutta hidastuvat suurissa tiloissa. **RRT** kasvattaa satunnaista puuta jatkuvassa tilassa: se on nopea suurissa ja moniulotteisissa tiloissa (esim. robottikäsivarren nivelkulmat), mutta sen reitti ei ole lyhin.",
            "Grid searches (A*, Dijkstra) are exact but slow down in large spaces. **RRT** grows a random tree in continuous space: it is fast in large and high-dimensional spaces (e.g. a robot arm's joint angles), but its path is not the shortest."),
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
            { id: "goal", text: tr("Paina Aja maaliin ja odota, että robotti on perillä", "Press Drive to goal and wait until the robot arrives"), check: newArrival },
            { id: "la", text: tr("Kokeile katseluetäisyyksiä 0,1 m ja 0,6 m ja vertaa, miten robotti kääntyy mutkissa", "Try lookahead distances 0.1 m and 0.6 m and compare how the robot turns in corners"), check: (c) => { const v = tools().sim2d?.lookahead; if (v <= 0.15) c.mem.lo = true; if (v >= 0.5) c.mem.hi = true; return !!(c.mem.lo && c.mem.hi); } },
          ],
          hints: [tr("Jos robotti ei pääse perille, Reittisuunnittelussa piirtämäsi seinät voivat tehdä käytävistä liian kapeita. Oletuskartta-nappi palauttaa kartan.", "If the robot cannot get there, the walls you drew in Path planning may make corridors too narrow. The Default map button restores the map.")],
          quiz: { q: tr("Mitä tapahtuu, jos katseluetäisyys on hyvin pitkä?", "What happens if the lookahead distance is very long?"),
            options: [tr("Robotti oikaisee mutkat ja voi ajaa liian läheltä nurkkia", "The robot cuts corners and may pass too close to them"), tr("Robotti heiluu reitin ympärillä", "The robot weaves around the path"), tr("Robotti pysähtyy", "The robot stops")], correct: 0,
            explain: tr("Pitkä katseluetäisyys = pehmeä mutta oikaiseva ajo. Lyhyt = tarkka mutta heiluva. Oikea arvo on kompromissi.", "Long lookahead = smooth but corner-cutting. Short = precise but weaving. The right value is a compromise.") },
        },
        {
          id: "odom", tool: "sim2d", title: tr("Odometrian virhe", "Odometry error"),
          teach: tr("Oikea robotti ei tiedä tarkkaa sijaintiaan. **Odometria** arvioi sen pyörien kierroksista, mutta pyörät luistavat hieman, ja virhe kasvaa koko ajan.\n\nSimulaatiossa voit antaa ohjaimen luottaa pelkkään odometriaan ja lisätä luistoa — ja nähdä, mitä tapahtuu.",
            "A real robot doesn't know its exact position. **Odometry** estimates it from wheel rotations, but the wheels slip a little and the error keeps growing.\n\nIn the simulation you can make the controller trust odometry only and add wheel slip — and see what happens."),
          tasks: [
            { id: "on", text: tr("Laita päälle 'Ohjain käyttää odometriaa' ja nosta pyörien luisto vähintään 0,5:een", "Turn on 'Controller uses odometry' and raise wheel slip to at least 0.5"), check: () => { const s = tools().sim2d; return !!s?.useOdom && (s.noise ?? 0) >= 0.5; } },
            { id: "run", text: tr("Paina Nollaa, aja maaliin ja vertaa todellista (sininen) ja odometrian (oranssi) jälkeä", "Press Reset, drive to the goal and compare the true (blue) and odometry (orange) trails"), after: "on", check: newArrivalAny },
          ],
          hints: [tr("Asetukset ovat lisäasetuksissa: paina Ohjaus-kortin 'Näytä lisäasetukset'.", "The settings are in the advanced settings: press 'Show advanced settings' in the Control card.")],
          quiz: { q: tr("Miksi odometrian virhe kasvaa koko ajan?", "Why does odometry error keep growing?"),
            options: [tr("Jokainen pieni mittausvirhe lisätään edellisiin, eikä mikään korjaa niitä", "Each small measurement error adds to the previous ones and nothing corrects them"), tr("Koska akku tyhjenee", "Because the battery drains"), tr("Koska kartta on väärin", "Because the map is wrong")], correct: 0,
            explain: tr("Odometria integroi liikettä, joten virheet kertyvät. Siksi robotit yhdistävät siihen muita antureita (lidar, kamera, IMU) ja paikantavat itsensä kartalla.", "Odometry integrates motion, so errors accumulate. That's why robots combine it with other sensors (lidar, camera, IMU) and localise themselves on a map.") },
        },
        {
          id: "slam", tool: "map", title: tr("Kartoitus lidarilla", "Mapping with lidar"),
          teach: tr("Entä jos karttaa ei ole? Robotti voi tehdä sen itse. **Lidar** mittaa etäisyyksiä joka suuntaan: säteen läpäisemät solut ovat vapaita ja osumakohdat esteitä.\n\n**Varauskartta** tallentaa jokaiselle solulle todennäköisyyden (log-odds). Jokainen mittaus lisää varmuutta, joten kohinainenkin data tuottaa selkeän kartan.",
            "What if there is no map? The robot can make one. A **lidar** measures distances in every direction: cells a beam passes through are free, hit points are obstacles.\n\nAn **occupancy grid** stores a probability (log-odds) for each cell. Each scan adds confidence, so even noisy data produces a clear map."),
          tasks: [
            { id: "explore", text: tr("Käynnistä 'Tutki automaattisesti' ja anna robotin kartoittaa vähintään 90 %", "Start 'Explore automatically' and let the robot map at least 90 %"), check: () => (window.occCoverage?.() || 0) >= 0.9 },
            { id: "truth", text: tr("Laita 'Vertaa todellisiin seiniin' päälle ja etsi kohdat, joissa kartta on väärin", "Turn on 'Compare to true walls' and look for places where the map is wrong"), check: () => !!tools().occ?.showTruth },
          ],
          hints: [tr("Kartoitus kestää noin minuutin. Robotti hakeutuu aina lähimpään tutkimattomaan reunaan (frontier exploration).", "Mapping takes about a minute. The robot always heads to the nearest unexplored edge (frontier exploration).")],
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
            { id: "lock", text: tr("Aseta pitch (Y) = 90°", "Set pitch (Y) = 90°"), check: () => Kin.gimbalLocked(rotEuler(), "ZYX") },
            { id: "feel", text: tr("Muuta nyt yaw- ja roll-kulmaa: huomaa, että ne kiertävät samaa akselia", "Now change yaw and roll: notice that they turn about the same axis"), after: "lock", check: (c) => did(c, ["input", "change"], "[data-card='euler'][data-i='0']") && did(c, ["input", "change"], "[data-card='euler'][data-i='2']") },
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
            { id: "norm", text: tr("Syötä kvaternioksi x = 1, y = 0, z = 0, w = 1 ja katso, mitä luvuille tapahtuu", "Enter the quaternion x = 1, y = 0, z = 0, w = 1 and see what happens to the numbers"), check: () => { const q = tools().rot?.q; return !!q && near(q[0], Math.SQRT1_2, 1e-3) && near(q[1], 0, 1e-3) && near(q[2], 0, 1e-3) && near(q[3], Math.SQRT1_2, 1e-3); } },
            { id: "read", text: tr("Lue Euler-kulmista ja akseli–kulmasta, mikä kierto tämä on", "Read from the Euler angles and axis–angle which rotation this is") },
          ],
          hints: [tr("Työkalu normalisoi kvaternion automaattisesti: (1, 0, 0, 1) jaetaan pituudellaan √2.", "The tool normalises the quaternion automatically: (1, 0, 0, 1) is divided by its length √2.")],
          quiz: { q: tr("Mikä kierto on kvaternio (0,707; 0; 0; 0,707)?", "Which rotation is the quaternion (0.707, 0, 0, 0.707)?"),
            options: [tr("90° x-akselin ympäri", "90° about the x axis"), tr("45° x-akselin ympäri", "45° about the x axis"), tr("180° z-akselin ympäri", "180° about the z axis")], correct: 0,
            explain: tr("w = cos(kulma/2) = 0,707 → kulma/2 = 45° → kulma = 90°. Akseli on (x, y, z) normalisoituna eli x-akseli.", "w = cos(angle/2) = 0.707 → angle/2 = 45° → angle = 90°. The axis is (x, y, z) normalised, i.e. the x axis.") },
        },
        {
          id: "tf", tool: "sim3d", title: tr("TF-puu", "The TF tree"),
          teach: tr("Robotilla on monta koordinaatistoa: alusta (base_link), lidar, kamera, käsivarsi… Jokaisen kehyksen paikka ilmoitetaan suhteessa **vanhempaansa**, ja yhdessä ne muodostavat **TF-puun** (ROS:n tf2).\n\nKun tiedät puun, voit laskea minkä tahansa kahden kehyksen välisen muunnoksen — esimerkiksi missä kameran näkemä kohde on robotin alustaan nähden.",
            "A robot has many frames: the base (base_link), lidar, camera, arm… Each frame is given relative to its **parent**, and together they form a **TF tree** (ROS's tf2).\n\nKnowing the tree, you can compute the transform between any two frames — for example where an object seen by the camera is relative to the robot base."),
          tasks: [
            { id: "add", text: tr("Lisää uusi kehys (esim. gripper) ja anna sille vanhempi", "Add a new frame (e.g. gripper) and give it a parent"), check: (c) => (tools().sim3d?.frames?.length || 6) > (c.base.tools.sim3d?.frames?.length || 6) },
            { id: "arm", text: tr("Kiinnitä kinematiikkatyökalun käsivarsi johonkin kehykseen", "Attach the kinematics arm to a frame"), check: () => !!tools().sim3d?.armFrame },
            { id: "tf", text: tr("Laske muunnos base_link → uusi kehyksesi Muunnos kehysten välillä -kortissa", "Compute the transform base_link → your new frame in the Transform between frames card"), check: (c) => { const s = tools().sim3d; return did(c, "change", "#s3-from, #s3-to") && s?.from === "base_link" && !!s.to && s.to !== "base_link"; } },
          ],
          hints: [tr("'+ Lisää kehys' on taulukon alla. Vanhempi valitaan rivin toisesta sarakkeesta.", "'+ Add frame' is below the table. The parent is chosen in the row's second column.")],
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
            { id: "car", text: tr("Valitse robotiksi Pyöräauto ja tehtäväksi Liiku eteenpäin", "Choose the Wheeled car and the Move forward task"), check: () => (tools().nn2d?.modelKey ?? "car") === "car" && (tools().nn2d?.taskKey ?? "forward") === "forward" },
            { id: "train", text: tr("Kouluta vähintään 10 sukupolvea", "Train for at least 10 generations"), check: () => (tools().nn2d?.modelKey ?? "car") === "car" && (tools().nn2dStats?.generation || 0) >= 10 },
            { id: "best", text: tr("Pysäytä ja katso Näytä paras -napilla, miten paras robotti ajaa", "Pause and use Show best to watch how the best robot drives"), check: (c) => did(c, "click", "#nn-replay") },
          ],
          hints: [tr("Paina Kouluta ja odota noin puoli minuuttia. Oppimiskäyrä näyttää, miten paras ja keskiarvo paranevat.", "Press Train and wait about half a minute. The learning curve shows how the best and the mean improve.")],
          quiz: { q: tr("Mitä evoluutiostrategia tekee joka sukupolvella?", "What does the evolution strategy do each generation?"),
            options: [tr("Kokeilee pieniä muutoksia painoihin ja siirtyy parempien suuntaan", "Tries small changes to the weights and moves toward the better ones"), tr("Näyttää robotille oikean liikkeen", "Shows the robot the correct motion"), tr("Laskee painot suoraan kaavasta", "Computes the weights directly from a formula")], correct: 0,
            explain: tr("Evoluutio ei tarvitse oikeita vastauksia — vain mittarin (palkkion), joka kertoo, kuka pärjäsi paremmin. Siksi sillä voi opettaa asioita, joita on vaikea näyttää esimerkein.", "Evolution needs no correct answers — only a score (reward) saying who did better. That is why it can teach things that are hard to show by example.") },
        },
        {
          id: "reward", tool: "nn2d", title: tr("Palkkiofunktio määrää, mitä opitaan", "The reward decides what is learned"),
          teach: tr("**Palkkiofunktio** antaa robotille pisteitä joka hetki. Robotti oppii juuri sen, mistä palkitaan — ei välttämättä sitä, mitä tarkoitit! Esimerkiksi pelkästä nopeudesta palkittu kävelijä voi oppia heittäytymään eteenpäin.\n\nHyvä palkkio palkitsee haluttua käytöstä pienin askelin joka hetki, ei vain lopussa.",
            "The **reward function** gives the robot points every moment. The robot learns exactly what is rewarded — not necessarily what you meant! A walker rewarded only for speed may learn to throw itself forward.\n\nA good reward pays for the wanted behaviour in small steps every moment, not only at the end."),
          tasks: [
            { id: "edit", text: tr("Avaa Muokkaa palkkiofunktiota ja tee oma muutos (esim. palkitse taaksepäin ajamisesta: vaihda s.x - s.prevX → s.prevX - s.x)", "Open Edit reward function and make your own change (e.g. reward driving backwards: change s.x - s.prevX → s.prevX - s.x)"), check: () => tools().nn2d?.taskKey === "custom" },
            { id: "see", text: tr("Kouluta muutama sukupolvi ja katso, muuttuuko käytös", "Train a few generations and see whether the behaviour changes"), after: "edit", check: (c) => { const g = tools().nn2dStats?.generation || 0; c.mem.g0 = Math.min(c.mem.g0 ?? g, g); return tools().nn2d?.taskKey === "custom" && g >= c.mem.g0 + 3; } },
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
            { id: "import", text: tr("Avaa 2D-rakentaja ja paina Kouluta simulaatiossa", "Open the 2D builder and press Train in simulation"), check: () => tools().nn2d?.modelKey === "custom" },
            { id: "train", text: tr("Kouluta omaa robottiasi vähintään 10 sukupolvea", "Train your own robot for at least 10 generations"), after: "import", check: () => tools().nn2d?.modelKey === "custom" && (tools().nn2dStats?.generation || 0) >= 10 },
          ],
          hints: [tr("Rakentaja on tässä kurssin projektissa tyhjä: valitse Uusi / pohja -valikosta Omat robotit -osiosta oma robottisi (tai mikä tahansa pohja) ja muokkaa sitä.", "The builder is empty in this course project: pick your own robot from My robots in the New / template menu (or any template) and modify it."),
            tr("Rakentajan Kouluta simulaatiossa -nappi on sivun yläreunassa. Jos robotti ei liiku, tarkista että nivelet ovat moottoroituja ja pyörät koskevat maata.", "The builder's Train in simulation button is at the top of the page. If the robot does not move, check that the joints are motorised and the wheels touch the ground.")],
          quiz: { q: tr("Miksi robotin vaihtaminen nollaa opitut aivot?", "Why does changing the robot reset the learned brain?"),
            options: [tr("Verkon sisään- ja ulostulojen määrä riippuu robotin antureista ja moottoreista", "The number of network inputs and outputs depends on the robot's sensors and motors"), tr("Koska vanhat aivot ovat aina huonot", "Because the old brain is always bad"), tr("Koska fysiikka muuttuu", "Because the physics changes")], correct: 0,
            explain: tr("Jos uudella robotilla on eri määrä moottoreita, vanhassa verkossa on väärä määrä ulostuloja — painot eivät yksinkertaisesti sovi.", "If the new robot has a different number of motors, the old network has the wrong number of outputs — the weights simply don't fit.") },
        },
        {
          id: "three", tool: "nn3d", title: tr("3D: robotti-imuri etsii kohteita", "3D: a robot vacuum finds targets"),
          teach: tr("3D-simulaatiossa fysiikkaa on raskaampi laskea, mutta se on todellisempaa: robotti voi kääntyä, kaatua sivulle ja liikkua mihin suuntaan tahansa. Robotti-imuri kääntyy paikallaan pyörien nopeuseron avulla — aivan kuten oikea imuri.",
            "In 3D the physics is heavier to compute but more realistic: the robot can turn, tip over sideways and move in any direction. The robot vacuum turns in place using the wheel speed difference — just like a real one."),
          tasks: [
            { id: "rover", text: tr("Valitse Esimerkit → Dusty etsii kohteita", "Choose Examples → Dusty finds targets"), check: () => tools().nn3d?.modelKey === "dusty" && tools().nn3d?.taskKey === "target" },
            { id: "train", text: tr("Kouluta vähintään 10 sukupolvea ja katso, alkaako Dusty kääntyä kohdetta kohti", "Train for at least 10 generations and see whether Dusty starts turning toward the target"), check: () => tools().nn3d?.modelKey === "dusty" && (tools().nn3dStats?.generation || 0) >= 10 },
          ],
          hints: [tr("Keltainen tolppa on kohde. Kun imuri saavuttaa sen, tilalle tulee uusi.", "The yellow pole is the target. When the vacuum reaches it, a new one appears.")],
          quiz: { q: tr("Miksi simulaatiossa opittu ohjain ei aina toimi sellaisenaan oikeassa robotissa?", "Why doesn't a controller learned in simulation always work as-is on a real robot?"),
            options: [tr("Simulaation fysiikka, anturit ja moottorit eroavat aina hieman todellisista", "The simulation's physics, sensors and motors always differ a little from reality"), tr("Neuroverkot eivät toimi oikeissa tietokoneissa", "Neural networks don't run on real computers"), tr("Oikeissa roboteissa ei ole moottoreita", "Real robots have no motors")], correct: 0,
            explain: tr("Tätä kutsutaan *sim-to-real*-kuiluksi. Sitä pienennetään esimerkiksi lisäämällä simulaatioon kohinaa ja vaihtelua, jotta opittu ohjain kestää todellisen maailman epätarkkuudet.", "This is called the *sim-to-real* gap. It is reduced e.g. by adding noise and variation to the simulation so the learned controller copes with the real world's imperfections.") },
        },
        {
          id: "deploy", tool: "nn2d", title: tr("Aivot oikealle robotille", "The brain on a real robot"),
          teach: tr("Koulutettu neuroverkko on vain lista lukuja (painot). Sen voi ajaa millä tahansa laitteella: Arduinolla, ESP32:lla tai Raspberry Pi:llä.\n\n**Vie omalle robotille** tekee valmiin koodin. Taulukko kertoo, mistä anturista kukin sisääntulo luetaan ja mitä kukin ulostulo tarkoittaa moottorille. Koodin **itsetesti** varmistaa, että laite laskee verkon täsmälleen kuten simulaatio.",
            "A trained neural network is just a list of numbers (weights). Any device can run it: an Arduino, an ESP32 or a Raspberry Pi.\n\n**Put on a real robot** generates ready code. The table tells which sensor each input comes from and what each output means for a motor. The code's **self-test** checks that the device computes the network exactly like the simulation."),
          tasks: [
            { id: "open", text: tr("Paina Aivot-kortin nappia Vie omalle robotille", "Press Put on a real robot in the Brain card"), check: (c) => { const n = window.rsDeployOpened || 0; if (n < (c.base.deploys || 0)) c.base.deploys = n; return n > (c.base.deploys || 0); } }, // laskuri nollautuu sivun latauksessa
            { id: "read", text: tr("Katso sisääntulojen taulukosta, mitä antureita robotti tarvitsisi", "Check the inputs table to see which sensors the robot would need") },
          ],
          hints: [tr("Nappi on vasemman sarakkeen Aivot-kortissa. Kokeile eri vaihtoehtoja: Arduino, C/C++, MicroPython ja JSON.", "The button is in the Brain card in the left column. Try the different targets: Arduino, C/C++, MicroPython and JSON.")],
          quiz: { q: tr("Mitä robotilla pitää olla, jotta simulaatiossa koulutetut aivot toimivat sillä?", "What must a robot have for a brain trained in simulation to work on it?"),
            options: [tr("Samat moottorit samassa järjestyksessä ja anturit, joista sisääntulot saadaan", "The same motors in the same order and sensors that provide the inputs"), tr("Täsmälleen sama väri kuin simulaatiossa", "Exactly the same colour as in the simulation"), tr("Nettiyhteys simulaatioon", "An internet connection to the simulation")], correct: 0,
            explain: tr("Verkko odottaa jokaisessa sisääntulossa tiettyä mittausta samalla skaalauksella kuin simulaatiossa, ja jokainen ulostulo ohjaa tiettyä moottoria. Muuten luvut menevät väärille paikoille.", "The network expects a specific measurement at each input, scaled like in the simulation, and each output drives a specific motor. Otherwise the numbers end up in the wrong places.") },
        },
      ],
    },

    /* ----- Aloita tästä: robotin perusosat käytännössä ----- */
    {
      id: "start", icon: "book", minutes: 15, level: tr("Aloittelija", "Beginner"),
      title: tr("Aloita tästä: miten robotti toimii", "Start here: how a robot works"),
      desc: tr("Rakenna ensimmäinen robottisi, laske sen nopeus ja aja se maaliin. Opit robotin kolme perusosaa: aistit, aivot ja lihakset.", "Build your first robot, work out its speed and drive it to a goal. You'll learn a robot's three basics: senses, brain and muscles."),
      outcomes: [tr("Tiedät robotin perusosat: anturit, ohjain ja toimilaitteet", "Know a robot's basic parts: sensors, controller and actuators"), tr("Osaat rakentaa yksinkertaisen pyörärobotin", "Can build a simple wheeled robot"),
        tr("Ymmärrät, mistä robotin nopeus tulee", "Understand where a robot's speed comes from"), tr("Olet ajanut robotin maaliin simulaatiossa", "Have driven a robot to a goal in simulation")],
      steps: [
        {
          id: "parts", tool: "build2d", title: tr("Runko ja pyörät", "Body and wheels"),
          teach: tr("Jokaisessa robotissa on kolme osaa:\n\n- **Anturit** (aistit): mittaavat maailmaa — etäisyys, kulma, nopeus\n- **Ohjain** (aivot): päättää, mitä tehdään\n- **Toimilaitteet** (lihakset): moottorit ja servot, jotka liikuttavat robottia\n\nRakennetaan ensin keho: runko ja kaksi moottoroitua pyörää.",
            "Every robot has three parts:\n\n- **Sensors** (senses): measure the world — distance, angle, speed\n- **Controller** (brain): decides what to do\n- **Actuators** (muscles): motors and servos that move the robot\n\nLet's build the body first: a chassis and two motorised wheels."),
          tasks: [
            { id: "parts", text: tr("Lisää runko ja vähintään yksi pyörä", "Add a body and at least one wheel"), check: () => (tools().build2d?.model?.bodies?.length || 0) >= 2 },
            { id: "motor", text: tr("Varmista, että pyörässä on moottori", "Make sure the wheel has a motor"), check: () => (tools().build2d?.model?.joints || []).some((j) => j.motor !== false) },
            { id: "valid", text: tr("Saa Tarkistus-välilehdelle vihreä merkki", "Get a green mark on the Check tab"), check: () => !!tools().build2d?.export },
          ],
          hints: [tr("Valitse runko klikkaamalla ja paina sitten valmisosista Pyörä — se kiinnittyy valittuun osaan moottorilla. Toisen pyörän saat peilaamalla (M).", "Click the body to select it, then press Wheel in the ready-made parts — it attaches to the selected part with a motor. Mirror it (M) for the second wheel."),
            tr("Nopein tapa: valitse yläpalkin Uusi / pohja -valikosta Pyöräauto.", "Fastest way: pick Wheeled car from the New / template menu in the top bar.")],
          quiz: { q: tr("Mikä robotin osa on toimilaite?", "Which part of a robot is an actuator?"),
            options: [tr("Moottori, joka pyörittää pyörää", "The motor that turns a wheel"), tr("Etäisyysanturi", "The distance sensor"), tr("Mikrokontrolleri", "The microcontroller")], correct: 0,
            explain: tr("Toimilaite muuttaa käskyn liikkeeksi — se on robotin lihas. Anturi mittaa ja mikrokontrolleri päättää.", "An actuator turns a command into motion — it's the robot's muscle. The sensor measures and the microcontroller decides.") },
        },
        {
          id: "test", tool: "build2d", title: tr("Kokeile fysiikalla", "Try it with physics"),
          teach: tr("Simulaatio laskee painovoiman, kitkan ja moottorien voiman. Näin näet ennen rakentamista, toimiiko idea: kaatuuko robotti, koskevatko pyörät maata ja liikkuuko se oikeaan suuntaan.",
            "The simulation computes gravity, friction and the motors' force. That way you see before building whether the idea works: does the robot tip over, do the wheels touch the ground, does it move the right way?"),
          tasks: [
            { id: "run", text: tr("Paina Testaa fysiikka (T) ja aja robottia liukusäätimillä", "Press Test physics (T) and drive the robot with the sliders"), check: () => { const b = builder(); return !!b?.testing && b.actions.some((a) => Math.abs(a) > 0.2); } },
            { id: "turn", text: tr("Saa robotti kääntymään: anna pyörille eri nopeudet", "Make the robot turn: give the wheels different speeds"), check: () => { const b = builder(), v = b?.testing ? b.actions.filter((_, i) => b.kinds[i] === "speed") : []; return v.length >= 2 && Math.max(...v) - Math.min(...v) > 0.3; } },
            { id: "save", text: tr("Tallenna robotti ☆ Omiin robotteihin -napilla — tarvitset sitä myöhemmin Robotin tekoäly -kurssilla", "Save the robot with the ☆ To my robots button — you'll need it later on the Robot AI course"), check: () => Library.list("robot2d").length > 0 },
          ],
          hints: [tr("Liukusäätimet ilmestyvät Fysiikkatesti-paneeliin näkymän päälle. Esc tai Lopeta testi lopettaa.", "The sliders appear in the Physics test panel on top of the view. Esc or Stop test ends it.")],
          quiz: { q: tr("Miten kaksipyöräinen robotti kääntyy ilman ohjauspyörää?", "How does a two-wheeled robot turn without a steering wheel?"),
            options: [tr("Pyörät pyörivät eri nopeuksilla", "The wheels spin at different speeds"), tr("Se kallistuu sivulle", "It leans sideways"), tr("Se ei voi kääntyä", "It can't turn")], correct: 0,
            explain: tr("Tätä kutsutaan differentiaaliohjaukseksi. Kun toinen pyörä pyörii nopeammin, robotti kaartaa hitaamman puolelle. Pyörät vastakkaisiin suuntiin = kääntyminen paikallaan, kuten robotti-imurilla.", "This is called differential drive. When one wheel spins faster, the robot curves toward the slower side. Wheels in opposite directions = turning in place, like a robot vacuum.") },
        },
        {
          id: "speed", tool: "motor", title: tr("Kuinka nopea robottisi on?", "How fast is your robot?"),
          teach: tr("Robotin nopeus tulee moottorin **kierrosnopeudesta** (rpm) ja **pyörän koosta**: yksi kierros vie robottia pyörän ympärysmitan verran eteenpäin.\n\nnopeus (m/s) = rpm / 60 × π × halkaisija (m)\n\nIsompi pyörä = nopeampi, mutta vetovoima pienenee samassa suhteessa. Siksi raskas robotti tarvitsee pienet pyörät tai vahvemman moottorin.",
            "A robot's speed comes from the motor's **rotation speed** (rpm) and the **wheel size**: one revolution moves the robot one wheel circumference forward.\n\nspeed (m/s) = rpm / 60 × π × diameter (m)\n\nA bigger wheel = faster, but the pulling force drops by the same factor. That's why a heavy robot needs small wheels or a stronger motor."),
          tasks: [
            { id: "wheel", text: tr("Muuta pyörän halkaisijaa ja katso, mitä ajonopeudelle tapahtuu", "Change the wheel diameter and watch the driving speed"), check: (c) => changed(c, "motor", (s) => s?.wheelD, { wheelD: 65 }) },
            { id: "fast", text: tr("Saa ajonopeus yli 1 m/s niin, että robotti jaksaa yhä liikkua", "Get the driving speed above 1 m/s while the robot can still move"), check: () => { const m = window.motorWheelResult?.(); return !!m && m.r.moves && m.r.vOp > 1; } },
          ],
          hints: [tr("Nopeus kasvaa, kun kasvatat pyörän halkaisijaa tai kierrosnopeutta (rpm).", "The speed grows when you increase the wheel diameter or the rpm."),
            tr("Esimerkiksi 100 mm pyörä ja 250 rpm antavat kuormassa noin 1,1 m/s.", "For example a 100 mm wheel at 250 rpm gives about 1.1 m/s under load.")],
          quiz: { q: tr("Mitä tapahtuu vetovoimalle, kun pyörän halkaisija tuplataan?", "What happens to the pulling force when the wheel diameter is doubled?"),
            options: [tr("Se puolittuu", "It halves"), tr("Se tuplaantuu", "It doubles"), tr("Se pysyy samana", "It stays the same")], correct: 0,
            explain: tr("Voima = momentti / säde. Kun säde tuplaantuu, sama moottorin momentti antaa puolet pienemmän voiman — mutta nopeus tuplaantuu.", "Force = torque / radius. When the radius doubles, the same motor torque gives half the force — but twice the speed.") },
        },
        {
          id: "drive", tool: "sim2d", title: tr("Aja maaliin", "Drive to the goal"),
          teach: tr("Nyt kaikki kolme osaa toimivat yhdessä: robotti **aistii** sijaintinsa, **päättää** reitin ja **ohjaa** pyöriään. Tätä aisti–päätä–toimi-silmukkaa jokainen robotti toistaa kymmeniä kertoja sekunnissa.",
            "Now all three parts work together: the robot **senses** its position, **decides** on a path and **drives** its wheels. Every robot repeats this sense–think–act loop dozens of times per second."),
          tasks: [
            { id: "goal", text: tr("Paina Aja maaliin ja odota, että robotti on perillä", "Press Drive to goal and wait until the robot arrives"), check: newArrival },
            { id: "move", text: tr("Siirrä maalia klikkaamalla karttaa ja aja uudelleen", "Move the goal by clicking the map and drive again"), after: "goal", check: (c) => { const n = window.sim2dStatus?.()?.arrivals || 0; c.mem.n0 ??= n; return did(c, "pointerdown", "canvas") && n > c.mem.n0; } },
          ],
          hints: [tr("Aja maaliin -nappi on Ohjaus-kortissa. Robotti suunnittelee reitin itse esteiden ohi.", "The Drive to goal button is in the Control card. The robot plans its own route around obstacles.")],
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
            { id: "cap", text: tr("Muuta akun kapasiteettia ja katso, miten käyttöaika muuttuu", "Change the battery capacity and watch the runtime"), check: (c) => changed(c, "power", (s) => s?.mAh, { mAh: 2200 }) },
            { id: "three", text: tr("Saa käyttöaika vähintään 3 tuntiin", "Get the runtime to at least 3 hours"), check: () => (window.powerResult?.().r.runtimeH || 0) >= 3 },
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
            { id: "add", text: tr("Lisää kuormataulukkoon uusi osa (esim. servo tai kamera)", "Add a new part to the loads table (e.g. a servo or a camera)"), check: (c) => (tools().power?.loads?.length || 3) > (c.base.tools.power?.loads?.length || 3) },
            { id: "peak", text: tr("Vertaa Keskivirta- ja Huippuvirta-lukuja: kumpi ratkaisee akun valinnan?", "Compare the Average and Peak current: which one decides the battery choice?") },
          ],
          hints: [tr("Kuormataulukon alla on nappi uuden rivin lisäämiseen. Servon keskivirta on tyypillisesti 100–300 mA ja huippu 1–2,5 A (esim. MG996R).", "Below the loads table there is a button for adding a row. A servo typically averages 100–300 mA and peaks at 1–2.5 A (e.g. MG996R).")],
          quiz: { q: tr("Miksi moottoriohjaimen huippuvirta on tärkeä, vaikka moottori ottaa ajossa vain vähän?", "Why does the motor driver's peak current matter even if the motor draws little while driving?"),
            options: [tr("Koska käynnistyessä ja jumissa moottori ottaa moninkertaisen virran", "Because a starting or stalled motor draws many times more current"), tr("Koska huippuvirta kasvattaa nopeutta", "Because peak current increases speed"), tr("Sillä ei ole väliä", "It doesn't matter")], correct: 0,
            explain: tr("Jumivirta voi olla 5–10× ajovirta. Jos ohjain ei kestä sitä, se ylikuumenee tai rikkoutuu juuri silloin, kun robotti törmää seinään.", "Stall current can be 5–10× the running current. If the driver can't take it, it overheats or breaks exactly when the robot hits a wall.") },
        },
        {
          id: "reg", tool: "power", title: tr("Jännitesäädin ja lämpö", "Regulator and heat"),
          teach: tr("Akku on usein 7–12 V, mutta elektroniikka haluaa 5 V tai 3,3 V. **Lineaarinen säädin** (esim. 7805) polttaa ylimääräisen jännitteen lämmöksi: häviö = (Vsisään − Vulos) × virta. **Hakkuri** (buck) muuntaa jännitteen lähes häviöttä.",
            "The battery is often 7–12 V, but electronics want 5 V or 3.3 V. A **linear regulator** (e.g. 7805) burns the extra voltage as heat: loss = (Vin − Vout) × current. A **buck converter** converts the voltage with very little loss."),
          tasks: [
            { id: "linear", text: tr("Vaihda säätimeksi lineaarinen ja katso lämpöhäviötä", "Switch the regulator to linear and look at the heat loss"), check: () => tools().power?.regType === "linear" },
            { id: "buck", text: tr("Palaa hakkuriin ja korjaa kaikki punaiset varoitukset", "Go back to the buck converter and fix any red warnings"), after: "linear", check: () => { const p = window.powerResult?.(); return !!p && p.s.regType === "buck" && !p.r.warnings.some((w) => w.level === "err"); } },
          ],
          hints: [tr("Säätimen valinta on Jännitesäädin-kortissa. Lämpöhäviö näkyy tuloslaatoissa.", "The regulator choice is in the Voltage regulator card. The heat loss shows in the result tiles.")],
          quiz: { q: tr("12 V akku, 5 V lineaarinen säädin ja 1 A kuorma. Paljonko säädin lämpenee?", "12 V battery, 5 V linear regulator and a 1 A load. How much heat does the regulator make?"),
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
            { id: "data", text: tr("Yhdistä laitteeseen tai paina \"Kokeile demodatalla\" ja odota, että käyrät piirtyvät", "Connect a device or press \"Try with demo data\" and wait for the curves to draw"), check: () => (window.serialStatus?.().rows || 0) >= 20 },
            { id: "read", text: tr("Katso, montako eri sarjaa (anturia) dataan tuli", "Check how many different series (sensors) the data has") },
          ],
          hints: [tr("Ilman laitetta: demodata-nappi on yhteyskortissa. Oikealla laitteella valitse ensin sama baudinopeus kuin koodissa.", "Without a device: the demo data button is in the connection card. With a real device, first pick the same baud rate as in your code.")],
          quiz: { q: tr("Sarjamonitorissa näkyy pelkkää sotkua (esim. ⸮⸮⸮). Mikä on todennäköisin syy?", "The serial monitor shows only garbage (e.g. ⸮⸮⸮). What is the most likely cause?"),
            options: [tr("Baudinopeus on eri kuin laitteen koodissa", "The baud rate differs from the device's code"), tr("Anturi on rikki", "The sensor is broken"), tr("USB-kaapeli on liian pitkä", "The USB cable is too long")], correct: 0,
            explain: tr("Väärällä nopeudella bitit luetaan väärästä kohdasta, ja tavuista tulee satunnaisia merkkejä. Tarkista Serial.begin()-luku ja työkalun nopeus.", "At the wrong speed the bits are sampled at the wrong moments and the bytes become random characters. Check the Serial.begin() number and the tool's speed.") },
        },
        {
          id: "range", tool: "map", title: tr("Etäisyysanturit", "Distance sensors"),
          teach: tr("Robotti näkee esteet etäisyysantureilla:\n\n- **Ultraääni** (esim. HC-SR04): halpa, 2 cm – 4 m, leveä keila\n- **ToF-laser** (esim. VL53L0X): pieni ja tarkka, kantama noin 1–2 m (VL53L1X jopa 4 m), kapea keila\n- **Lidar**: pyörivä laser, satoja mittauksia kierroksessa, 6–12 m\n\nKantama ja säteiden määrä ratkaisevat, kuinka nopeasti robotti kartoittaa ympäristönsä.",
            "A robot sees obstacles with distance sensors:\n\n- **Ultrasonic** (e.g. HC-SR04): cheap, 2 cm – 4 m, wide beam\n- **ToF laser** (e.g. VL53L0X): small and precise, range about 1–2 m (VL53L1X up to 4 m), narrow beam\n- **Lidar**: a spinning laser, hundreds of readings per turn, 6–12 m\n\nRange and the number of beams decide how quickly the robot maps its surroundings."),
          tasks: [
            { id: "beams", text: tr("Muuta lidar-säteiden määrää", "Change the number of lidar beams"), check: (c) => changed(c, "occ", (s) => s?.beams, { beams: 90 }) },
            { id: "short", text: tr("Aseta kantamaksi alle 1 m (kuin halpa ToF-anturi) ja paina Tutki", "Set the range below 1 m (like a cheap ToF sensor) and press Explore"), check: () => (tools().occ?.range ?? 2.5) < 1 },
            { id: "watch", text: tr("Katso, miten lyhyt kantama hidastaa kartoitusta", "Watch how the short range slows the mapping down") },
          ],
          hints: [tr("Säädöt ovat Robotti ja lidar -kortissa. Esimerkit-valikossa on myös valmiit anturityypit.", "The controls are in the Robot and lidar card. The Examples menu also has ready sensor types.")],
          quiz: { q: tr("Miksi lyhyen kantaman anturilla kartoitus kestää kauemmin?", "Why does mapping take longer with a short-range sensor?"),
            options: [tr("Robotin on ajettava lähelle jokaista seinää nähdäkseen sen", "The robot has to drive close to every wall to see it"), tr("Anturi mittaa hitaammin", "The sensor measures more slowly"), tr("Kartta tallentuu hitaammin", "The map saves more slowly")], correct: 0,
            explain: tr("Kantaman ulkopuolelta ei tule tietoa lainkaan. Pitkän kantaman lidar näkee huoneen toiselle puolelle yhdellä kierroksella.", "Nothing at all is learned beyond the range. A long-range lidar sees across the room in one turn.") },
        },
        {
          id: "noise", tool: "map", title: tr("Kohina ja suodatus", "Noise and filtering"),
          teach: tr("Jokaisessa mittauksessa on **kohinaa**: sama etäisyys antaa hieman eri lukeman joka kerta. Yksittäiseen lukemaan ei voi luottaa, mutta monta lukemaa yhdessä kertoo totuuden.\n\nKartta yhdistää mittaukset **log-odds**-luvuilla: jokainen osuma lisää varmuutta esteestä vähän kerrallaan, joten satunnainen virhe ei heti piirrä seinää.",
            "Every measurement has **noise**: the same distance gives a slightly different reading each time. You can't trust a single reading, but many readings together tell the truth.\n\nThe map combines readings with **log-odds**: each hit adds a little confidence in an obstacle, so a random error doesn't draw a wall right away."),
          tasks: [
            { id: "noisy", text: tr("Avaa lisäasetukset ja nosta mittauskohina vähintään 0,5:een", "Open the advanced settings and raise the measurement noise to at least 0.5"), check: () => (tools().occ?.noise ?? 0) >= 0.5 },
            { id: "truth", text: tr("Laita Vertaa todellisiin seiniin päälle ja katso, kuinka hyvin kartta silti osuu", "Turn on Compare to true walls and see how well the map still matches"), check: () => !!tools().occ?.showTruth },
          ],
          hints: [tr("Lisäasetukset avautuvat kortin alareunan linkistä.", "The advanced settings open from the link at the bottom of the card.")],
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
          hints: [tr("Vientidialogin yläreunassa on välilehdet. Live-linkin luonnoksessa jokainen TODO-rivi on yksi anturi tai moottori.", "The export dialog has tabs at the top. In the live link sketch every TODO line is one sensor or motor.")],
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
            { id: "open", text: tr("Avaa työkalun URDF-osio ja lataa esimerkki tai oma URDF-tiedosto", "Open the tool's URDF section and load the example or your own URDF file"), check: () => tools().sim3d?.mode === "urdf" },
            { id: "joints", text: tr("Liikuta nivelten liukusäätimiä ja katso, miten linkit liikkuvat", "Move the joint sliders and watch how the links move"), check: (c) => did(c, ["input", "change"], "#s3-joints") },
          ],
          hints: [tr("URDF-osio on TF-puun alapuolella. Nivelten liukusäätimet ilmestyvät, kun malli on ladattu.", "The URDF section is below the TF tree. The joint sliders appear once a model is loaded.")],
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
          teach: tr("ROS:n navigointi (Nav2) käyttää **varauskarttaa**: PGM-kuva (valkoinen = vapaa, musta = este, harmaa = tuntematon) ja YAML-tiedosto, joka kertoo solun koon (`resolution`) ja kartan alkupisteen (`origin`). `map_server` julkaisee kartan `/map`-topiciin.\n\nKartta tehdään yleensä SLAMilla: robotti ajaa ympäriinsä ja piirtää kartan lidarilla — juuri kuten tässä työkalussa.",
            "ROS navigation (Nav2) uses an **occupancy grid** map: a PGM image (white = free, black = obstacle, gray = unknown) and a YAML file giving the cell size (`resolution`) and the map's origin (`origin`). `map_server` publishes the map on the `/map` topic.\n\nThe map is usually made with SLAM: the robot drives around and draws the map with its lidar — just like in this tool."),
          tasks: [
            { id: "explore", text: tr("Paina Tutki ja anna robotin kartoittaa", "Press Explore and let the robot map the area"), check: (c) => did(c, "click", "#oc-explore") },
            { id: "export", text: tr("Vie kartta PGM- ja YAML-tiedostoina", "Export the map as PGM and YAML files"), check: (c) => did(c, "click", "#oc-pgm") && did(c, "click", "#oc-yaml") },
          ],
          hints: [tr("Vienti-napit ovat vasemman sarakkeen Vienti-kortissa.", "The export buttons are in the Export card in the left column.")],
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
      desc: tr("Miten kamerakuvasta saadaan tietoa: pikselit, kynnystys, värit ja reunat. Lopuksi robotti seuraa viivaa ja palloa.", "How to get information from a camera image: pixels, thresholds, colours and edges. In the end the robot follows a line and a ball."),
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
          teach: tr("**Kynnystys** muuttaa harmaasävykuvan mustavalkoiseksi: rajaa tummemmat pikselit ovat kohdetta, muut taustaa. Viivanseuraaja etsii näin mustan viivan vaalealta lattialta.\n\nKohde näytetään valkoisena. Kun valkoisten pikselien **keskipiste** lasketaan, saadaan viivan paikka. Jos se on kuvan vasemmalla puolella, robotin pitää kääntyä vasemmalle: ohjaus = (x − keskikohta) / (puolet kuvan leveydestä); negatiivinen = käänny vasemmalle.",
            "**Thresholding** turns a grayscale image into black and white: pixels darker than the limit are the object, the rest is background. A line follower finds a black line on a light floor this way.\n\nThe object is shown in white. The **centroid** of the white pixels gives the line's position. If it's on the left side of the image, the robot has to turn left: steering = (x − centre) / half width; negative = turn left."),
          tasks: [
            { id: "ex", text: tr("Valitse Esimerkit → Viivanseuraaja", "Choose Examples → Line follower"), check: () => tools().cv?.source === "line" && tools().cv?.mode === "threshold" },
            { id: "thr", text: tr("Muuta kynnystä niin, että vain viiva jää valkoiseksi ja kohde löytyy", "Adjust the threshold so that only the line stays white and the object is found"), check: () => tools().cv?.source === "line" && tools().cv?.mode === "threshold" && (tools().cv?.thr ?? 90) !== 90 && !!window.cvResult?.()?.found }, // 90 = esimerkin arvo
          ],
          hints: [tr("Liian suuri kynnys tekee myös lattian varjoista kohdetta, liian pieni hävittää viivan. Kokeile väliltä 60–120.", "Too high a threshold makes floor shadows part of the object, too low makes the line disappear. Try between 60 and 120.")],
          quiz: { q: tr("Miksi viivanseuraaja katsoo vain kuvan alakolmannesta?", "Why does a line follower only look at the bottom third of the image?"),
            options: [tr("Se näkee viivan juuri edessään; kaukaiset mutkat eivät saa kääntää sitä liian aikaisin", "It sees the line right in front of it; distant bends must not turn it too early"), tr("Kuvan yläosa on aina musta", "The top of the image is always black"), tr("Se säästää akkua", "It saves battery")], correct: 0,
            explain: tr("Robotti ohjaa sen mukaan, missä viiva on nyt. Jos se reagoisi kaukana olevaan mutkaan, se oikaisisi ja putoaisi viivalta.", "The robot steers by where the line is now. If it reacted to a bend far ahead, it would cut the corner and lose the line.") },
        },
        {
          id: "color", tool: "cv", title: tr("Väritunnistus", "Colour detection"),
          teach: tr("Värin etsimiseen RGB on hankala, koska varjo muuttaa kaikkia kolmea lukua. **HSV**-esityksessä väri on yksi luku, **sävy** (hue, 0–360°), ja kirkkaus on erikseen. Varjossakin punainen pysyy punaisena.\n\nKohde on pikseli, jonka sävy on lähellä haettua ja joka on tarpeeksi **kylläinen** (ei harmaa).",
            "RGB is awkward for finding a colour because a shadow changes all three numbers. In **HSV**, colour is one number, the **hue** (0–360°), and brightness is separate. Even in shadow, red stays red.\n\nAn object pixel is one whose hue is close to the one you want and which is **saturated** enough (not gray)."),
          tasks: [
            { id: "blue", text: tr("Valitse kuvalähteeksi pallot ja klikkaa kamerakuvasta sinistä palloa", "Pick the balls as the source and click the blue ball in the camera image"), check: () => { const s = tools().cv; return !!s && s.mode === "color" && (s.source ?? "balls") === "balls" && s.hue >= 200 && s.hue <= 250; } },
            { id: "found", text: tr("Varmista, että sininen pallo löytyy ja ohjaus kertoo suunnan", "Make sure the blue ball is found and the steering shows a direction"), after: "blue", check: () => !!window.cvResult?.()?.found && tools().cv?.mode === "color" },
          ],
          hints: [tr("Klikkaa pallon kirkasta kohtaa. Jos pallo ei löydy, kasvata sävyn toleranssia tai pienennä vähimmäiskylläisyyttä.", "Click a bright spot on the ball. If the ball isn't found, raise the hue tolerance or lower the minimum saturation.")],
          quiz: { q: tr("Miksi väritunnistus tehdään HSV:llä eikä RGB:llä?", "Why is colour detection done in HSV rather than RGB?"),
            options: [tr("HSV:ssä sävy ei juuri muutu varjossa, joten sama raja toimii eri valaistuksessa", "In HSV the hue barely changes in shadow, so the same limit works in different lighting"), tr("HSV-kuva on pienempi", "An HSV image is smaller"), tr("Kamerat kuvaavat suoraan HSV:tä", "Cameras record HSV directly")], correct: 0,
            explain: tr("Varjo tummentaa pikseliä, jolloin RGB-arvot muuttuvat kaikki. HSV:ssä muuttuu lähinnä kirkkaus (V), ja sävy (H) pysyy.", "A shadow darkens the pixel, changing all RGB values. In HSV mostly the brightness (V) changes and the hue (H) stays.") },
        },
        {
          id: "edges", tool: "cv", title: tr("Reunat", "Edges"),
          teach: tr("**Reuna** on kohta, jossa kirkkaus muuttuu jyrkästi. **Sobel**-suodin vertaa jokaisen pikselin vasenta ja oikeaa sekä ylä- ja alanaapuria: mitä suurempi ero, sitä vahvempi reuna. Reunoista saadaan esineiden muodot, kunhan esine erottuu taustasta kirkkaudeltaan.",
            "An **edge** is where brightness changes sharply. The **Sobel** filter compares each pixel's left and right and upper and lower neighbours: the bigger the difference, the stronger the edge. Edges give objects' shapes as long as the object differs from the background in brightness."),
          tasks: [
            { id: "edges", text: tr("Valitse Esimerkit → Reunat liukuhihnalla", "Choose Examples → Edges on a conveyor"), check: () => tools().cv?.mode === "edges" },
            { id: "blur", text: tr("Kokeile pehmennystä 0 ja 3: miten kohina ja reunat muuttuvat?", "Try blur 0 and 3: how do the noise and the edges change?"), check: () => tools().cv?.mode === "edges" && (tools().cv?.blur ?? 1) !== 1 },
          ],
          hints: [tr("Pehmennys-liukusäädin on Asetukset-kortin alaosassa.", "The Blur slider is at the bottom of the Settings card.")],
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
  const ORDER = ["start", "sensors", "power", "nav", "pid", "vision", "frames", "arm", "ros", "ai"];
  const STAGES = [
    { from: "start", title: tr("Taso 1 · Perusteet", "Level 1 · Basics"), desc: tr("Mikä robotti on, moottorit, anturit ja sähkö. Ei vaadi esitietoja.", "What a robot is, motors, sensors and power. No prior knowledge needed.") },
    { from: "nav", title: tr("Taso 2 · Liike, ohjaus ja näkö", "Level 2 · Motion, control and vision"), desc: tr("Reitinhaku, esteet, PID-säätö ja konenäkö.", "Path planning, obstacles, PID control and computer vision.") },
    { from: "frames", title: tr("Taso 3 · Edistyneet", "Level 3 · Advanced"), desc: tr("Koordinaatistot, robottikäsivarsi, ROS ja tekoäly. Lukio- ja ammattitaso.", "Frames, robot arms, ROS and AI. Upper secondary and vocational level.") },
  ];
  COURSES.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  const NEEDS = { arm: "frames", ai: "start", ros: "frames", sensors: "start" };

  /* ===== Oppaat ja repliikit =====
     Jokaisella kurssilla on oma robottiopas. Vaiheen alussa opas kertoo asian lyhyesti; koko teoria on
     "Lue lisää" -kohdan takana, jotta yhdellä kertaa näkyy vain vähän. who = vierailijahahmo tässä vaiheessa. */
  const GUIDE = { start: "volt", arm: "grip", pid: "wobbly", nav: "dusty", power: "volt", frames: "zippy", ai: "neura", sensors: "wobbly", ros: "grip", vision: "zippy" };
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
    "start.test": L("Ennen kuin ruuvataan mitään oikeasti kiinni, kokeillaan fysiikalla. Pysyykö robotti pystyssä ja kääntyykö se?", "Before screwing anything together for real, let's try it with physics. Does the robot stay upright, and can it turn?"),
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
    "frames.gimbal": L("Varo! Kun nokkani osoittaa suoraan ylös, kaksi kulmaani menee solmuun.", "Careful! When my nose points straight up, two of my angles get tangled."),
    "frames.quat": L("Siksi lennonohjaimeni käyttää kvaternioita: neljä lukua, ei solmuja.", "That's why my flight controller uses quaternions: four numbers, no tangles."),
    "frames.tf": L("Minulla on monta osaa, ja jokaisella on oma koordinaatistonsa. TF-puu pitää ne järjestyksessä.", "I have lots of parts, each with its own frame. A TF tree keeps them all in order.", "volt"),
    "ai.drive": L("Olen Neura. Alussa en osannut mitään — opin kokeilemalla. Katso, miten auto oppii ajamaan!", "I'm Neura. At first I knew nothing — I learned by trying. Watch the car learn to drive!"),
    "ai.reward": L("Opin juuri sen, mistä minua palkitaan. Muutetaan palkkiota ja katsotaan, mitä tapahtuu.", "I learn exactly what I'm rewarded for. Let's change the reward and see what happens."),
    "ai.own": L("Nyt on sinun robottisi vuoro oppia!", "Now it's your robot's turn to learn!"),
    "ai.three": L("Hei, tuo olen minä 3D:nä! Opetetaan minut löytämään kohteet.", "Hey, that's me in 3D! Let's teach me to find targets.", "dusty"),
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
    clearInterval(timer);
    timer = setInterval(tick, 700);
  }
  function closePanel() {
    clearInterval(timer);
    if (panel) { panel.hidden = true; panel.innerHTML = ""; }
    document.body.classList.remove("lesson-open", "lesson-collapsed");
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
    return `<div class="lesson-quiz">
      <div class="quiz-head">⚡ ${tr("Pikakysymys", "Quick question")}</div>
      <p class="quiz-q">${esc(q.q)}</p>
      <div class="quiz-opts">${q.options.map((o, i) => `<button class="quiz-opt ${answered && i === s.quiz ? (ok ? "right" : "wrong") : ""}" data-l="quiz" data-i="${i}" ${ok ? "disabled" : ""}><span class="q-letter">${"ABCD"[i]}</span>${esc(o)}</button>`).join("")}</div>
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
        ${next ? `<p>${tr("Seuraavaksi suosittelemme:", "Up next we recommend:")}</p><button class="btn primary" data-l="startnext" data-c="${next.id}">${Robots.svg(GUIDE[next.id], "happy", { size: 28 })} ${esc(next.title)}</button>` : ""}
        <button class="btn" data-l="all">${tr("Kaikki kurssit", "All courses")}</button>
      </div>`;
  }

  // Tarkistetaan tehtävät taustalla; paneeli piirretään uudelleen vain, kun jotain muuttui
  function tick() {
    const course = byId(P.active);
    if (!course || !panel || panel.hidden) return;
    const c = cp(course.id);
    if (c.finished) return;
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
      if (c.step === course.steps.length - 1) { c.finished = true; persist(); drawPanel(); return; }
      goStep(c.step + 1); return;
    }
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
      <h2 class="path-title">${tr("Oppimispolku", "Learning path")}</h2>
      <p class="note path-note">${tr("Kurssit on järjestetty niin, että jokainen rakentaa edellisten päälle. Voit silti aloittaa mistä tahansa.", "The courses are ordered so each one builds on the previous ones. You can still start anywhere.")}</p>
      ${COURSES.map((c, i) => { const st = STAGES.find((x) => x.from === c.id); return (st ? `${i ? "</div>" : ""}<h3 class="stage-title">${st.title}</h3><p class="note stage-note">${st.desc}</p><div class="course-grid">` : "") + courseCard(c, i); }).join("")}</div>
      ${window.Plans && Plans.current().plan === "free" ? `<section class="card class-card"><h2>${tr("Onko sinulla opettajan luokkakoodi?", "Do you have a class code from your teacher?")}</h2>${Plans.classBoxHtml()}</section>` : ""}
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

  function courseCard(course, i) {
    const p = progressOf(course), c = P.c[course.id];
    const locked = window.Plans && !Plans.canCourse(course.id);
    const label = !c ? tr("Aloita kurssi", "Start course") : c.finished ? tr("Avaa uudelleen", "Open again") : tr("Jatka", "Continue");
    const next = !locked && COURSES.find((x) => !P.c[x.id]?.finished && (!window.Plans || Plans.canCourse(x.id))) === course;
    const need = NEEDS[course.id] && !P.c[NEEDS[course.id]]?.finished && !c ? byId(NEEDS[course.id]) : null;
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
      return { id: c.id, steps: c.steps.length, done, finished: !!p?.finished, hints: p ? Object.values(p.steps).reduce((a, s) => a + (s.hint || 0), 0) : 0, skipped };
    }),
    start, stop, context, _courses: COURSES,
  };
})();
window.Courses = Courses;
