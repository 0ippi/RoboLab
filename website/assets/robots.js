"use strict";

/* RoboLabin robottihahmot. Volt on sovelluksen oma robotti ja tekoälyavustaja; muut ovat kurssien oppaita.
   Hahmot piirretään SVG:nä, ja jokaisella on ilmeet: idle, happy, talk, think, wow, wink, oops.
   Värit ovat kiinteät (hahmon tunnistettavuus), ja ne toimivat sekä tummassa että vaaleassa teemassa. */
const Robots = (() => {
  const INK = "#1b2a44", SCREEN = "#14213d", GLOW = "#5ee7ff";

  // Kasvot näytöllä tai paneelissa. s = mittakaava, keskikohta (cx, cy).
  function face(cx, cy, s, mood, eye = GLOW, mouth = GLOW) {
    const dx = 12 * s, ew = 7 * s, eh = 10 * s;
    const pill = (x, y, h = eh) => `<rect class="rb-eye" x="${x - ew / 2}" y="${y - h / 2}" width="${ew}" height="${h}" rx="${ew / 2}" fill="${eye}"/>`;
    const arc = (x, y) => `<path d="M${x - ew * 0.75} ${y + 2 * s} Q${x} ${y - 5 * s} ${x + ew * 0.75} ${y + 2 * s}" stroke="${eye}" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>`;
    const my = cy + 10 * s;
    let eyes, m;
    switch (mood) {
      case "happy":
        eyes = arc(cx - dx, cy) + arc(cx + dx, cy);
        m = `<path d="M${cx - 8 * s} ${my - 1 * s} Q${cx} ${my + 7 * s} ${cx + 8 * s} ${my - 1 * s}" stroke="${mouth}" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>`;
        break;
      case "wow":
        eyes = `<circle cx="${cx - dx}" cy="${cy}" r="${6 * s}" fill="${eye}"/><circle cx="${cx + dx}" cy="${cy}" r="${6 * s}" fill="${eye}"/>`;
        m = `<circle cx="${cx}" cy="${my + 1 * s}" r="${3.6 * s}" fill="${mouth}"/>`;
        break;
      case "think":
        eyes = pill(cx - dx + 2 * s, cy - 3 * s, eh * 0.8) + pill(cx + dx + 2 * s, cy - 3 * s, eh * 0.8);
        m = `<path d="M${cx - 5 * s} ${my + 1 * s} L${cx + 7 * s} ${my - 1 * s}" stroke="${mouth}" stroke-width="${2.4 * s}" stroke-linecap="round"/>`;
        break;
      case "wink":
        eyes = pill(cx - dx, cy) + arc(cx + dx, cy);
        m = `<path d="M${cx - 8 * s} ${my - 1 * s} Q${cx} ${my + 7 * s} ${cx + 8 * s} ${my - 1 * s}" stroke="${mouth}" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>`;
        break;
      case "oops":
        eyes = pill(cx - dx, cy + 1 * s, eh * 0.75) + pill(cx + dx, cy + 1 * s, eh * 0.75);
        m = `<path d="M${cx - 7 * s} ${my + 4 * s} Q${cx} ${my - 2 * s} ${cx + 7 * s} ${my + 4 * s}" stroke="${mouth}" stroke-width="${2.6 * s}" fill="none" stroke-linecap="round"/>`;
        break;
      case "talk":
        eyes = pill(cx - dx, cy) + pill(cx + dx, cy);
        m = `<ellipse class="rb-mouth" cx="${cx}" cy="${my + 1 * s}" rx="${5 * s}" ry="${3.4 * s}" fill="${mouth}"/>`;
        break;
      default:
        eyes = pill(cx - dx, cy) + pill(cx + dx, cy);
        m = `<path d="M${cx - 6 * s} ${my} Q${cx} ${my + 5 * s} ${cx + 6 * s} ${my}" stroke="${mouth}" stroke-width="${2.4 * s}" fill="none" stroke-linecap="round"/>`;
    }
    return `<g class="rb-face">${eyes}${m}</g>`;
  }

  // Kasvottomien hahmojen tilavalot: väri kertoo mielialan
  const LED = { idle: GLOW, talk: GLOW, happy: "#3ddc97", wink: "#3ddc97", wow: "#ffd23f", think: "#ffb020", oops: "#ff5d5d" };

  // Wobblyn pehmeämmät kasvot suoraan rungolla: isot silmät heijastuksella, ripset, posket ja pieni suu
  function softFace(cx, cy, mood) {
    const D = "#2a1f4a", dx = 11;
    const lashes = (x, y, side) => `<path d="M${x + side * 4} ${y - 4.5} l${side * 3.2} -3 M${x + side * 1.2} ${y - 6.2} l${side * 1.6} -3.6" stroke="${D}" stroke-width="1.8" stroke-linecap="round"/>`;
    const open = (x, y, r = 1) => `<ellipse class="rb-eye" cx="${x}" cy="${y}" rx="${5 * r}" ry="${6.5 * r}" fill="${D}"/><circle cx="${x + 1.6}" cy="${y - 2.2}" r="${1.9 * r}" fill="#fff"/>`;
    const closed = (x, y) => `<path d="M${x - 5} ${y + 1} Q${x} ${y - 5} ${x + 5} ${y + 1}" stroke="${D}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    const L = cx - dx, R = cx + dx, my = cy + 10;
    let eyes, mouth, extra = "";
    switch (mood) {
      case "happy":
        eyes = closed(L, cy) + closed(R, cy);
        mouth = `<path d="M${cx - 5} ${my - 1} Q${cx} ${my + 5} ${cx + 5} ${my - 1} Z" fill="#ff7eb6" stroke="${D}" stroke-width="1.8" stroke-linejoin="round"/>`;
        break;
      case "wow":
        eyes = open(L, cy, 1.15) + open(R, cy, 1.15);
        mouth = `<ellipse cx="${cx}" cy="${my + 1}" rx="2.6" ry="3.2" fill="${D}"/>`;
        break;
      case "think":
        eyes = `<ellipse cx="${L + 1.5}" cy="${cy - 1}" rx="4.6" ry="6" fill="${D}"/><circle cx="${L + 3}" cy="${cy - 3.5}" r="1.7" fill="#fff"/>
          <ellipse cx="${R + 1.5}" cy="${cy - 1}" rx="4.6" ry="6" fill="${D}"/><circle cx="${R + 3}" cy="${cy - 3.5}" r="1.7" fill="#fff"/>`;
        mouth = `<path d="M${cx - 3} ${my + 1} Q${cx + 1} ${my - 1} ${cx + 4} ${my + 1}" stroke="${D}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
        extra = `<path d="M${R - 4} ${cy - 11} Q${R} ${cy - 13.5} ${R + 4} ${cy - 11}" stroke="${D}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`;
        break;
      case "oops":
        eyes = open(L, cy + 1, 0.9) + open(R, cy + 1, 0.9);
        mouth = `<path d="M${cx - 4} ${my + 2} Q${cx} ${my - 1.5} ${cx + 4} ${my + 2}" stroke="${D}" stroke-width="1.9" fill="none" stroke-linecap="round"/>`;
        extra = `<path d="M${L - 4} ${cy - 8} L${L + 3} ${cy - 10} M${R + 4} ${cy - 8} L${R - 3} ${cy - 10}" stroke="${D}" stroke-width="1.7" stroke-linecap="round"/>`;
        break;
      case "wink":
        eyes = open(L, cy) + closed(R, cy);
        mouth = `<path d="M${cx - 4} ${my - 1} Q${cx} ${my + 3.5} ${cx + 4} ${my - 1}" stroke="${D}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
        break;
      case "talk":
        eyes = open(L, cy) + open(R, cy);
        mouth = `<ellipse class="rb-mouth" cx="${cx}" cy="${my + 0.5}" rx="3.4" ry="2.6" fill="${D}"/>`;
        break;
      default:
        eyes = open(L, cy) + open(R, cy);
        mouth = `<path d="M${cx - 4} ${my - 1} Q${cx} ${my + 3.5} ${cx + 4} ${my - 1}" stroke="${D}" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    }
    const lash = mood === "happy" ? lashes(L, cy + 3, -1) + lashes(R, cy + 3, 1) : mood === "wink" ? lashes(L, cy, -1) + lashes(R, cy + 3, 1) : lashes(L, cy, -1) + lashes(R, cy, 1);
    return `<g class="rb-face">${eyes}${lash}${extra}${mouth}
      <ellipse cx="${cx - 18}" cy="${cy + 7}" rx="4.6" ry="2.8" fill="#ff7eb6" opacity=".6"/><ellipse cx="${cx + 18}" cy="${cy + 7}" rx="4.6" ry="2.8" fill="#ff7eb6" opacity=".6"/></g>`;
  }

  const DRAW = {
    // Volt: perusrobotti — näyttöpää, antenni, korvat ja pieni runko
    volt: (mood) => `
      <g class="rb-volt">
        <rect x="42" y="84" width="36" height="26" rx="10" fill="#4c8dff" stroke="${INK}" stroke-width="3"/>
        <circle cx="60" cy="96" r="5" fill="#ffd23f" stroke="${INK}" stroke-width="2"/>
        <path d="M42 92 Q30 96 32 106" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <path d="M78 92 Q90 96 88 106" stroke="${INK}" stroke-width="5" fill="none" stroke-linecap="round"/>
        <rect x="54" y="76" width="12" height="10" fill="#9aa8bd" stroke="${INK}" stroke-width="2.5"/>
        <path d="M60 24 V12" stroke="${INK}" stroke-width="3.5" stroke-linecap="round"/>
        <circle class="rb-bulb" cx="60" cy="10" r="6" fill="#ffd23f" stroke="${INK}" stroke-width="2.5"/>
        <rect x="9" y="40" width="12" height="22" rx="5" fill="#4c8dff" stroke="${INK}" stroke-width="3"/>
        <rect x="99" y="40" width="12" height="22" rx="5" fill="#4c8dff" stroke="${INK}" stroke-width="3"/>
        <rect x="17" y="22" width="86" height="58" rx="20" fill="#eef3fb" stroke="${INK}" stroke-width="3.5"/>
        <rect x="27" y="31" width="66" height="40" rx="13" fill="${SCREEN}"/>
        ${face(60, 49, 1, mood)}
      </g>`,
    // Grip: kasvoton teollisuusrobottikäsi. Mieliala näkyy tilavaloista ja siitä, kuinka auki tarttuja on.
    grip: (mood) => {
      const led = LED[mood] || LED.idle;
      const o = { wow: 7, happy: 5, talk: 4, wink: 4, idle: 3, think: 1.5, oops: 0 }[mood] ?? 3;
      const finger = (d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="${d}" fill="none" stroke="#c9d4df" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
      // Nivelet ovat sisäkkäisiä ryhmiä: olkapää kääntää koko varren, kyynärpää vain kyynärvartta
      return `<g>
        <rect x="22" y="100" width="58" height="12" rx="4" fill="#3b4252" stroke="${INK}" stroke-width="3"/>
        <rect x="32" y="90" width="40" height="12" rx="4" fill="#ff8c42" stroke="${INK}" stroke-width="3"/>
        <circle class="rb-led" cx="71" cy="106" r="3.2" fill="${led}"/>
        <g class="rb-shoulder">
          <path d="M52 92 L36 56" stroke="${INK}" stroke-width="18" stroke-linecap="round"/>
          <path d="M52 92 L36 56" stroke="#ff8c42" stroke-width="12" stroke-linecap="round"/>
          <path d="M42 66 L50 84" stroke="#ffb27a" stroke-width="3" stroke-linecap="round"/>
          <g class="rb-elbow">
            <path d="M36 56 L76 38" stroke="${INK}" stroke-width="15" stroke-linecap="round"/>
            <path d="M36 56 L76 38" stroke="#ff8c42" stroke-width="9" stroke-linecap="round"/>
            <g class="rb-wrist">
              ${finger(`M91 31 L103 ${29 - o} L108 ${33 - o}`)}
              ${finger(`M91 45 L103 ${47 + o} L108 ${43 + o}`)}
              <rect x="73" y="30" width="13" height="16" rx="3.5" fill="#9aa8bd" stroke="${INK}" stroke-width="2.6"/>
              <rect x="85" y="26" width="7" height="24" rx="2.5" fill="#3b4252" stroke="${INK}" stroke-width="2.6"/>
              <circle class="rb-led" cx="79.5" cy="38" r="2.4" fill="${led}"/>
            </g>
            <circle cx="36" cy="56" r="8" fill="#9aa8bd" stroke="${INK}" stroke-width="3"/><circle cx="36" cy="56" r="3" fill="${INK}"/>
          </g>
        </g>
        <circle cx="52" cy="92" r="9" fill="#9aa8bd" stroke="${INK}" stroke-width="3"/><circle cx="52" cy="92" r="3.4" fill="${INK}"/>
      </g>`;
    },
    // Wobbly: tasapainorobotti, pehmeät kasvot: isot silmät ripsillä, posket ja rusetti
    wobbly: (mood) => `
      <g class="rb-wobble">
        <circle cx="60" cy="102" r="14" fill="#2b2f3a" stroke="${INK}" stroke-width="3"/>
        <circle cx="60" cy="102" r="4.5" fill="#c9d4df"/>
        <path d="M37 60 Q26 62 24 72 M83 60 Q94 62 96 72" stroke="${INK}" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M37 60 Q26 62 24 72 M83 60 Q94 62 96 72" stroke="#c4a4ff" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <path d="M60 13 C84 13 87 40 86 62 C85 82 75 92 60 92 C45 92 35 82 34 62 C33 40 36 13 60 13 Z" fill="#c4a4ff" stroke="${INK}" stroke-width="3.2"/>
        <ellipse cx="60" cy="75" rx="15" ry="10" fill="#efe6ff" opacity=".75"/>
        <path d="M60 14 L47 6 L48 20 Z M60 14 L73 6 L72 20 Z" fill="#ff7eb6" stroke="${INK}" stroke-width="2.2" stroke-linejoin="round"/>
        <circle cx="60" cy="14" r="3.4" fill="#ff7eb6" stroke="${INK}" stroke-width="2.2"/>
        ${softFace(60, 42, mood)}
      </g>`,
    // Dusty: kasvoton robotti-imuri. Valorengas näyttää mielialan, sivuharjat pyörivät.
    dusty: (mood) => {
      const led = LED[mood] || LED.idle; // vaeltaa hitaasti ja vähän kömpelösti (rb-roam)
      const brush = (x, y) => `<g class="rb-brush">${[0, 60, 120].map((a) => `<path d="M${x} ${y} l${(9 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(4 * Math.sin(a * Math.PI / 180)).toFixed(1)} M${x} ${y} l${(-9 * Math.cos(a * Math.PI / 180)).toFixed(1)} ${(-4 * Math.sin(a * Math.PI / 180)).toFixed(1)}" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`).join("")}</g>`;
      return `<g class="rb-roam">
        <ellipse cx="60" cy="98" rx="46" ry="8" fill="#000" opacity=".18"/>
        ${brush(28, 92)}${brush(92, 92)}
        <path d="M12 70 V80 Q60 108 108 80 V70" fill="#2b3240" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
        <path d="M15 81 Q60 103 105 81" stroke="#2ec4b6" stroke-width="3.5" fill="none" stroke-linecap="round"/>
        <ellipse cx="60" cy="70" rx="48" ry="22" fill="#e6eef3" stroke="${INK}" stroke-width="3"/>
        <ellipse cx="60" cy="73" rx="33" ry="13" fill="#d5e0e8"/>
        <ellipse class="rb-led" cx="60" cy="73" rx="33" ry="13" fill="none" stroke="${led}" stroke-width="3"/>
        <circle cx="60" cy="75" r="5" fill="#fff" stroke="#b8c7d3" stroke-width="2"/>
        <rect x="50" y="47" width="20" height="9" fill="#2b3240" stroke="${INK}" stroke-width="2.5"/>
        <ellipse cx="60" cy="47" rx="10" ry="4" fill="#3b4252" stroke="${INK}" stroke-width="2.5"/>
        <rect class="rb-scan" x="55" y="50" width="10" height="3" rx="1.5" fill="#ff5d8f"/>
      </g>`;
    },
    // Zippy: drooni, jonka ainoa "silmä" on kamera. Iiris ja luomet kertovat tunteen.
    zippy: (mood) => {
      const cx = 60, cy = 64;
      let eye;
      if (mood === "happy" || mood === "wink") {
        // Hymyilevä silmä: iiris, jonka alaosan peittää ylöspäin kaartuva alaluomi
        eye = `<circle cx="${cx}" cy="${cy - 2}" r="6.5" fill="${GLOW}"/><circle cx="${cx}" cy="${cy - 2}" r="2.8" fill="${SCREEN}"/>
          <circle cx="${cx - 2.6}" cy="${cy - 5}" r="1.6" fill="#fff"/>
          <path d="M${cx - 11} ${cy + 4} Q${cx} ${cy - 1} ${cx + 11} ${cy + 4} L${cx + 11} ${cy + 11} L${cx - 11} ${cy + 11} Z" fill="#2b2f3a"/>`;
        if (mood === "wink") eye += `<path d="M${cx + 13} ${cy - 12} l3 -3 M${cx + 15} ${cy - 8} l4 -1" stroke="#ffd23f" stroke-width="2" stroke-linecap="round"/>`;
      } else {
        const r = { wow: 7, talk: 5.5, oops: 3.5, think: 4.5 }[mood] ?? 5;
        const [ix, iy] = mood === "think" ? [cx + 3, cy - 3] : mood === "oops" ? [cx, cy + 2] : [cx, cy];
        eye = `<circle class="rb-iris" cx="${ix}" cy="${iy}" r="${r}" fill="${GLOW}"/><circle cx="${ix}" cy="${iy}" r="${r * 0.45}" fill="${SCREEN}"/>
          <circle cx="${ix - r * 0.45}" cy="${iy - r * 0.5}" r="1.6" fill="#fff"/>
          ${mood === "oops" ? `<path d="M50 63 A10 10 0 0 1 70 63 Z" fill="#2b2f3a"/>` : ""}`;
      }
      return `<g class="rb-hover">
        <path d="M60 60 L24 36 M60 60 L96 36 M60 66 L24 90 M60 66 L96 90" stroke="${INK}" stroke-width="7" stroke-linecap="round"/>
        <path d="M60 60 L24 36 M60 60 L96 36 M60 66 L24 90 M60 66 L96 90" stroke="#9aa8bd" stroke-width="3" stroke-linecap="round"/>
        ${[[24, 36], [96, 36], [24, 90], [96, 90]].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="5" fill="#2b2f3a" stroke="${INK}" stroke-width="2"/>
          <ellipse class="rb-rotor" cx="${x}" cy="${y - 5}" rx="17" ry="4" fill="#cfd8e3" fill-opacity=".75" stroke="${INK}" stroke-width="1.5"/>`).join("")}
        <rect x="31" y="45" width="58" height="30" rx="15" fill="#ffd23f" stroke="${INK}" stroke-width="3.2"/>
        <circle cx="36" cy="60" r="2.4" fill="#ff5d5d"/><circle cx="84" cy="60" r="2.4" fill="#3ddc97"/>
        <circle cx="${cx}" cy="${cy}" r="14" fill="#2b2f3a" stroke="${INK}" stroke-width="3"/>
        <circle cx="${cx}" cy="${cy}" r="10" fill="${SCREEN}"/>
        ${eye}
      </g>`;
    },
    // Neura: kävelevä "aivokupoli". Koko keho on lasikupu, jonka sisällä neuroverkko hehkuu tunteen värillä;
    // edessä on anturipalkki, alla neljä tanakkaa jalkaa, jotka astelevat vuorotellen.
    neura: (mood) => {
      const c = mood === "idle" || mood === "talk" ? "#7cf5c2" : LED[mood];
      const leg = (x, cls, far) => `<g class="${cls}">
          <rect x="${x - 4.5}" y="80" width="9" height="17" rx="4.5" fill="${far ? "#8b98ad" : "#c9d4df"}" stroke="${INK}" stroke-width="2.6"/>
          <ellipse cx="${x + 1}" cy="99" rx="7" ry="3.6" fill="${far ? "#3b4252" : "#2b3240"}" stroke="${INK}" stroke-width="2.2"/></g>`;
      const L1 = [[45, 54], [45, 67]], L2 = [[60, 44], [60, 57], [60, 70]], L3 = [[75, 54], [75, 67]];
      const lines = [...L1.flatMap((a) => L2.map((b) => [a, b])), ...L2.flatMap((a) => L3.map((b) => [a, b]))]
        .map(([a, b]) => `M${a[0]} ${a[1]} L${b[0]} ${b[1]}`).join(" ");
      const visor = mood === "happy" || mood === "wink" ? `<path d="M91 78 q4 -3 8 0" stroke="${c}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`
        : `<rect class="rb-scan" x="${mood === "think" ? 89 : 91}" y="76.5" width="${mood === "wow" ? 10 : 7}" height="3" rx="1.5" fill="${c}"/>`;
      return `<g class="rb-bob">
        <ellipse cx="60" cy="102" rx="38" ry="5" fill="#000" opacity=".18"/>
        ${leg(46, "rb-legB", true)}${leg(80, "rb-legA", true)}${leg(38, "rb-legA", false)}${leg(72, "rb-legB", false)}
        <path d="M60 30 V20" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
        <circle class="rb-led" cx="60" cy="18" r="4" fill="${c}" stroke="${INK}" stroke-width="2"/>
        <path d="M24 78 A36 48 0 0 1 96 78 Z" fill="#3ddc97" fill-opacity=".16" stroke="${INK}" stroke-width="3"/>
        <path d="${lines}" stroke="${c}" stroke-width="1.4" opacity=".7"/>
        ${[...L1, ...L2, ...L3].map(([x, y], i) => `<circle class="rb-node" style="animation-delay:${(i * 0.23).toFixed(2)}s" cx="${x}" cy="${y}" r="3.2" fill="${c}"/>`).join("")}
        <path d="M34 58 A30 40 0 0 1 52 37" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round" opacity=".55"/>
        <rect x="20" y="74" width="80" height="12" rx="6" fill="#eef3f1" stroke="${INK}" stroke-width="3"/>
        <rect x="27" y="78.5" width="50" height="3.5" rx="1.75" fill="#3ddc97"/>
        <rect x="86" y="72" width="18" height="12" rx="5" fill="${SCREEN}" stroke="${INK}" stroke-width="2.6"/>
        ${visor}
      </g>`;
    },
  };
  const CAST = {
    volt: { name: "Volt", color: "#4c8dff",
      role: tr("RoboLabin oma robotti ja tekoälyavustajasi", "RoboLab's own robot and your AI assistant"),
      cheers: [tr("Mahtavaa, tehty!", "Awesome, done!"), tr("Juuri noin!", "That's it!"), tr("Piip piip — onnistui!", "Beep boop — success!")] },
    grip: { name: "Grip", color: "#ff8c42",
      role: tr("Robottikäsi, joka rakastaa tarkkuutta", "A robot arm who loves precision"),
      cheers: [tr("Napakka suoritus!", "Firm grip on that one!"), tr("Täsmälleen kohteessa!", "Right on target!"), tr("Nivelet kiittävät!", "My joints thank you!")] },
    wobbly: { name: "Wobbly", color: "#b388ff",
      role: tr("Tasapainorobotti, joka pysyy pystyssä säätimen ansiosta", "A balancing robot who stays upright thanks to control"),
      cheers: [tr("Vakaata menoa!", "Nice and steady!"), tr("En heilu enää yhtään!", "Not wobbling one bit!"), tr("Täydellisesti säädetty!", "Perfectly tuned!")] },
    dusty: { name: "Dusty", color: "#2ec4b6",
      role: tr("Robotti-imuri, joka tuntee jokaisen nurkan", "A robot vacuum who knows every corner"),
      cheers: [tr("Reitti selvä!", "Path clear!"), tr("Puhdasta jälkeä!", "Squeaky clean!"), tr("Löysin perille!", "Made it there!")] },
    zippy: { name: "Zippy", color: "#ffd23f",
      role: tr("Drooni, joka tietää aina asentonsa", "A drone who always knows which way is up"),
      cheers: [tr("Suoraan maaliin!", "Straight to the target!"), tr("Hyvä lento!", "Smooth flight!"), tr("Akselit kohdallaan!", "Axes all lined up!")] },
    neura: { name: "Neura", color: "#3ddc97",
      role: tr("Nelijalkainen robotti, joka oppii kokeilemalla", "A four-legged robot who learns by trying"),
      cheers: [tr("Opin juuri jotain uutta!", "I just learned something new!"), tr("Neuronit hehkuvat!", "My neurons are glowing!"), tr("Seuraava sukupolvi kiittää!", "The next generation thanks you!")] },
  };

  // Hahmon SVG. mood: idle | happy | talk | think | wow | wink | oops
  function svg(id, mood = "idle", { size = 64, cls = "" } = {}) {
    const d = DRAW[id] || DRAW.volt;
    return `<svg class="robot rb-${id} ${cls}" viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="${esc((CAST[id] || CAST.volt).name)}">${d(mood)}</svg>`;
  }

  const cheer = (id) => { const c = (CAST[id] || CAST.volt).cheers; return c[Math.floor(Math.random() * c.length)]; };

  return { CAST, svg, cheer };
})();
window.Robots = Robots;
