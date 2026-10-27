"use strict";

/* Saavutukset ja haasteet.
   - Saavutus avautuu, kun käyttäjä kokeilee ominaisuutta ensimmäistä kertaa (unlock(id) työkaluista) tai kun
     kurssien ja haasteiden tilanne täyttää ehdon (check()).
   - Haasteet ovat neuroverkkosimulaatioiden mitattavia tavoitteita. Robotin opitut aivot ajetaan kiinteällä radalla
     (sama siemen kaikille), ja tulos mitataan RoboLabin omalla mittarilla, ei käyttäjän palkkiofunktiolla.
     Ajo tehdään tools/nn.js:ssä (Haasteet-kortti); täällä ovat määrittelyt ja tulokset.
   - Tiedot: localStorage robolab-achievements (robolab-*-avain kuuluu käyttäjälle). Luokkakoodilla liittyneen
     oppilaan haastetulokset lähtevät opettajalle kurssien etenemisen mukana (plans.js, "ch-<id>"). */
const Achievements = (() => {
  const KEY = "robolab-achievements";

  const LIST = [
    { id: "goal", icon: "🎯", name: tr("Oma tavoite", "Your own goal"), desc: tr("Tee robotille oma tavoite Oma tavoite -ikkunassa.", "Make your own goal for a robot in the Custom goal window.") },
    { id: "parallel", icon: "⚡", name: tr("Kaikki ytimet", "Every core"), desc: tr("Kouluta nopealla koulutuksella 20 sukupolvea.", "Train 20 generations with fast training.") },
    { id: "train100", icon: "🧠", name: tr("Sata sukupolvea", "A hundred generations"), desc: tr("Kouluta samoja aivoja 100 sukupolvea.", "Train the same brain for 100 generations.") },
    { id: "replay", icon: "🎞️", name: tr("Hidastus", "Slow motion"), desc: tr("Katso uusinta hidastettuna.", "Watch a replay in slow motion.") },
    { id: "race", icon: "🏁", name: tr("Voittaja", "Winner"), desc: tr("Voita kisa nykyisillä aivoilla.", "Win a race with the current brain.") },
    { id: "curriculum", icon: "⛰️", name: tr("Vuorikiipeilijä", "Mountaineer"), desc: tr("Anna maaston vaikeutua automaattisesti vaikeimpaan asti.", "Let the terrain get harder automatically all the way to the hardest.") },
    { id: "waypoints", icon: "📍", name: tr("Reitinsuunnittelija", "Route planner"), desc: tr("Aseta robotille omat reittipisteet.", "Set your own waypoints for a robot.") },
    { id: "share", icon: "🔗", name: tr("Jakaja", "Sharer"), desc: tr("Kopioi robotin jakolinkki.", "Copy a robot's share link.") },
    { id: "shareOpen", icon: "📬", name: tr("Vierailija", "Visitor"), desc: tr("Avaa jonkun toisen jakama robotti.", "Open a robot someone else shared.") },
    { id: "deploy", icon: "🔌", name: tr("Oikeaan maailmaan", "Into the real world"), desc: tr("Avaa Vie omalle robotille ja katso, mitä antureita robotti tarvitsee.", "Open Put on a real robot and see which sensors the robot needs.") },
    { id: "ownRobot", icon: "🔧", name: tr("Rakentaja", "Builder"), desc: tr("Tallenna oma robotti Omat robotit -listaan.", "Save your own robot to My robots.") },
    { id: "course1", icon: "🎓", name: tr("Ensimmäinen kurssi", "First course"), desc: tr("Suorita kurssi loppuun.", "Finish a course."), when: (s) => s.coursesDone >= 1 },
    { id: "course5", icon: "📚", name: tr("Ahkera oppija", "Keen learner"), desc: tr("Suorita viisi kurssia.", "Finish five courses."), when: (s) => s.coursesDone >= 5 },
    { id: "courseAll", icon: "🏆", name: tr("Robotiikan mestari", "Robotics master"), desc: tr("Suorita kaikki kurssit.", "Finish every course."), when: (s) => s.coursesAll },
    { id: "exam", icon: "💯", name: tr("Täydet pisteet", "Full marks"), desc: tr("Saa loppukokeesta täydet pisteet.", "Get full marks in a final quiz."), when: (s) => s.perfectExam },
    { id: "challenge1", icon: "🥇", name: tr("Haaste läpäisty", "Challenge passed"), desc: tr("Läpäise ensimmäinen haaste.", "Pass your first challenge."), when: (s) => s.challengesDone >= 1 },
    { id: "challengeAll", icon: "👑", name: tr("Haastemestari", "Challenge master"), desc: tr("Läpäise kaikki haasteet.", "Pass every challenge."), when: (s) => s.challengesAll },
  ];

  /* ----- Haasteet -----
     metric: dist = matka eteenpäin (2D, x), dist3 = matka lähtöpisteestä vaakatasossa (3D), targets = saavutetut kohteet,
     upright = sekunnit pystyssä. model: vaadittu valmis robotti (null = mikä tahansa). */
  const CHALLENGES = [
    { id: "sprint", dim: "2d", model: "car", terrain: "flat", duration: 12, seed: 7101, metric: "dist", goal: 40, unit: "m",
      name: tr("Pikajuoksu", "Sprint"), desc: tr("Pyöräauto ajaa tasaisella vähintään 40 m eteenpäin 12 sekunnissa.", "The wheeled car drives at least 40 m forward on flat ground in 12 seconds.") },
    { id: "balance", dim: "2d", model: "wobbly", terrain: "flat", duration: 20, seed: 7102, metric: "upright", goal: 20, unit: "s",
      name: tr("Tasapaino", "Balance"), desc: tr("Wobbly pysyy pystyssä koko 20 sekuntia.", "Wobbly stays upright for the whole 20 seconds.") },
    { id: "obstacles", dim: "2d", model: null, terrain: "blocks", duration: 20, seed: 7103, metric: "dist", goal: 40, unit: "m",
      name: tr("Esterata", "Obstacle course"), desc: tr("Mikä tahansa robotti kulkee esteiden yli vähintään 40 m eteenpäin 20 sekunnissa. Vinkki: kouluta Esteet-maastossa.", "Any robot gets at least 40 m forward over the obstacles in 20 seconds. Tip: train on the Obstacles terrain.") },
    { id: "reach", dim: "2d", model: "grip", terrain: "flat", duration: 15, seed: 7104, metric: "targets", goal: 6, unit: "",
      name: tr("Tarkka käsi", "Steady hand"), desc: tr("Grip-robottikäsi osuu kuuteen kohteeseen 15 sekunnissa.", "The Grip robot arm hits six targets in 15 seconds.") },
    { id: "vacuum", dim: "3d", model: "dusty", terrain: "flat", duration: 20, seed: 7105, metric: "targets", goal: 3, unit: "",
      name: tr("Imurointikierros", "Vacuum round"), desc: tr("Dusty käy kolmessa kohteessa 20 sekunnissa.", "Dusty visits three targets in 20 seconds.") },
    { id: "offroad", dim: "3d", model: null, terrain: "rough", duration: 15, seed: 7106, metric: "dist3", goal: 30, unit: "m",
      name: tr("Maastoajo", "Off-road"), desc: tr("Mikä tahansa robotti kulkee epätasaisessa maastossa vähintään 30 m lähtöpaikalta 15 sekunnissa. Vinkki: kouluta Epätasainen-maastossa.", "Any robot gets at least 30 m from the start on rough terrain in 15 seconds. Tip: train on the Rough terrain.") },
  ];

  // Mittarin palkkiofunktio: summa koko ajolta on tulos. Kaatuminen lopettaa ajon (paitsi mittari voi silti olla hyvä).
  function measureCode(c) {
    const r = c.dim === "3d" ? 0.8 : 0.4;
    switch (c.metric) {
      case "dist": return "if (s.fallen) s.done = true;\nreturn s.x - s.prevX;";
      case "dist3": return "if (s.fallen) s.done = true;\nreturn s.done || s.last ? Math.hypot(s.x - s.startX, s.z - s.startZ) : 0;";
      case "targets": return `if (s.fallen) s.done = true;\nif (s.targetDist < ${r}) { s.newTarget = true; return 1; }\nreturn 0;`;
      case "upright": return "if (s.fallen) { s.done = true; return 0; }\nreturn s.dt;";
      default: return "return 0;";
    }
  }

  /* ----- Tallennus ----- */
  function read() {
    try {
      const d = JSON.parse(localStorage.getItem(KEY));
      if (d && typeof d === "object") return { got: d.got && typeof d.got === "object" ? d.got : {}, ch: d.ch && typeof d.ch === "object" ? d.ch : {} };
    } catch {}
    return { got: {}, ch: {} };
  }
  function write(d) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch {} }

  const byId = (id) => LIST.find((a) => a.id === id);
  function unlock(id) {
    const a = byId(id);
    if (!a) return false;
    const d = read();
    if (d.got[id]) return false;
    d.got[id] = Date.now();
    write(d);
    toast(`${a.icon} ${tr("Saavutus", "Achievement")}: ${a.name}`);
    return true;
  }

  // Kurssien ja haasteiden tilanteesta johdetut saavutukset (kutsutaan, kun kurssin tila tallentuu)
  let checkTimer = 0;
  function check() {
    clearTimeout(checkTimer);
    checkTimer = setTimeout(() => {
      const sum = window.Courses?.summary?.() || [];
      const d = read();
      const passed = CHALLENGES.filter((c) => d.ch[c.id]?.passed).length;
      const s = {
        coursesDone: sum.filter((c) => c.finished).length, coursesAll: sum.length > 0 && sum.every((c) => c.finished),
        perfectExam: sum.some((c) => c.score != null && c.scoreMax && c.score === c.scoreMax),
        challengesDone: passed, challengesAll: passed === CHALLENGES.length,
      };
      for (const a of LIST) if (a.when && !d.got[a.id] && a.when(s)) unlock(a.id);
    }, 400);
  }

  // Haasteen tulos: paras tulos säilyy. Palauttaa { score, best, passed, first } (first = läpäisty ensimmäistä kertaa).
  function challengeResult(id, score) {
    const c = CHALLENGES.find((x) => x.id === id);
    if (!c || !Number.isFinite(score)) return null;
    const d = read();
    const prev = d.ch[id] || { best: null, passed: false };
    const passed = score >= c.goal - 1e-6; // sekuntien summa voi jäädä liukulukujen takia hiuksenhienosti alle
    const first = passed && !prev.passed;
    d.ch[id] = { best: prev.best == null ? score : Math.max(prev.best, score), passed: prev.passed || passed, at: Date.now() };
    write(d);
    if (first) toast(`🏅 ${tr("Haaste läpäisty", "Challenge passed")}: ${c.name}`);
    check();
    window.Plans?.queueSync?.(); // luokkahuone: tulos opettajalle
    return { score, best: d.ch[id].best, passed, first };
  }
  const challengeState = (id) => read().ch[id] || null;
  // Tulos luettavaksi: kohteet kokonaislukuna, muut yhdellä desimaalilla ja yksiköllä
  const fmtScore = (c, v) => (c.metric === "targets" ? String(Math.round(v)) : `${fmt(v, 1)} ${c.unit}`.trim());

  // Luokkakoodilla liittyneen oppilaan tulokset opettajalle samassa muodossa kuin kurssien eteneminen
  function challengeItems() {
    const d = read();
    return CHALLENGES.filter((c) => d.ch[c.id]).map((c) => ({
      course: "ch-" + c.id, steps: 1, done: d.ch[c.id].passed ? 1 : 0, finished: !!d.ch[c.id].passed, hints: 0,
      score: Math.max(0, Math.min(100, Math.round(d.ch[c.id].best || 0))), score_max: Math.min(100, c.goal),
    }));
  }

  /* ----- Näkymä: Kurssit-sivun saavutukset ----- */
  function cardHtml() {
    const d = read(), n = LIST.filter((a) => d.got[a.id]).length;
    return `<section class="card ach-card" aria-labelledby="ach-title">
      <h2 id="ach-title">🏅 ${tr("Saavutukset", "Achievements")} <small>${n} / ${LIST.length}</small></h2>
      <p class="note">${tr("Saavutukset avautuvat, kun kokeilet RoboLabin ominaisuuksia ja suoritat kursseja ja haasteita. Haasteet löytyvät neuroverkkosimulaatioiden Haasteet-kortista.", "Achievements unlock as you try RoboLab's features and finish courses and challenges. The challenges are in the Challenges card of the neural network simulations.")}</p>
      <ul class="ach-list">${LIST.map((a) => {
        const at = d.got[a.id];
        return `<li class="${at ? "got" : ""}" title="${esc(a.desc)}"><span class="ach-icon" aria-hidden="true">${at ? a.icon : "🔒"}</span>
          <span><b>${esc(a.name)}</b><small>${esc(a.desc)}${at ? ` · ${new Date(at).toLocaleDateString(tr("fi-FI", "en-GB"))}` : ""}</small></span></li>`;
      }).join("")}</ul>
    </section>`;
  }

  return { LIST, CHALLENGES, measureCode, unlock, check, challengeResult, challengeState, challengeItems, fmtScore, cardHtml, _read: read };
})();
window.Achievements = Achievements;
