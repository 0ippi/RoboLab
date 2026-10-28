"use strict";

const VERSION = ROBOLAB_RELEASES[0].version; // version.js
const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ===== Ikonit ===== */
const ICONS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  arm: '<path d="M4 21h8M8 21v-4"/><circle cx="8" cy="15" r="2"/><path d="m9.5 13.5 5-6"/><circle cx="16" cy="6" r="2"/><path d="M18 6h3M19.5 4v4"/>',
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="1"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M3 15h18M9 4v16"/>',
  pid: '<path d="M3 17c3 0 3-10 6-10s3 6 6 6 3-3 6-3"/><path d="M3 21h18" opacity=".5"/>',
  traj: '<circle cx="5" cy="18" r="2"/><circle cx="19" cy="6" r="2"/><path d="M7 18c6 0 4-12 10-12"/>',
  path: '<path d="M4 20h4v-6h6V8h6"/><circle cx="4" cy="20" r="1.5"/><circle cx="20" cy="8" r="1.5"/>',
  map: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z"/><path d="M9 3v15M15 6v15"/>',
  sim: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4z"/>',
  cube: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',
  ruler: '<path d="m3 17 14-14 4 4L7 21z"/><path d="m7 13 2 2M10 10l2 2M13 7l2 2"/>',
  motor: '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.4 1.4M17.6 17.6 19 19M5 19l1.4-1.4M17.6 6.4 19 5"/>',
  moon: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.2 2.2M17.6 17.6l2.2 2.2M2 12h3M19 12h3M4.2 19.8l2.2-2.2M17.6 6.4l2.2-2.2"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/>',
  battery: '<rect x="2" y="7" width="17" height="10" rx="2"/><path d="M22 11v2M10 9l-2 3h4l-2 3"/>',
  plug: '<path d="M9 2v6M15 2v6M6 8h12v4a6 6 0 0 1-12 0zM12 18v4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  wheel: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="2"/><path d="M12 3v7M12 14v7M3 12h7M14 12h7"/>',
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
  redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/>',
  brain: '<path d="M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 2 5 3 3 0 0 0 3 3h1V4z"/><path d="M15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-2 5 3 3 0 0 1-3 3h-1V4z"/><path d="M6 12h4M14 12h4M8 8h2M14 16h2"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L13 18l-3 3-4-4 3-3 6.7-6.7a4 4 0 0 0-1-1z"/><path d="M14.7 6.3 17 4"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 21a2 2 0 0 1 2-2h13v2H6M9 7h6"/>',
  keyboard: '<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M7 14h10"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3l-5.5 2.9 1-6.2L3 9.6l6.2-.9z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 10h6v4H9zM9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24">${ICONS[name] || ""}</svg>`;

/* ===== Työkalut ===== */
// Ryhmät järjestyksessä: aloitus → suunnittelu → käsivarret → liikkuvat robotit → ohjaus ja tekoäly → laitteet → apuvälineet
const G = {
  general: tr("Aloitus", "Start"), design: tr("Robotin suunnittelu", "Robot design"), arm: tr("Robottikädet", "Robot arms"),
  mobile: tr("Liikkuvat robotit", "Mobile robots"), ctrl: tr("Ohjaus ja tekoäly", "Control & AI"), hw: tr("Laitteet ja anturit", "Hardware & sensors"),
  frames: tr("Koordinaatistot ja laskimet", "Frames & calculators"),
};
const TOOLS = [
  { id: "dashboard", group: G.general, name: tr("Etusivu", "Home"), icon: "dashboard", desc: tr("Kurssit, omat työkalut ja kaikki työkalut yhdellä sivulla.", "Courses, your tools and every tool on one page.") },
  { id: "learn", group: G.general, name: tr("Kurssit", "Courses"), icon: "book", status: "ready",
    desc: tr("Opi robotiikkaa vaihe vaiheelta oikeilla työkaluilla — tekoälyopettaja auttaa.", "Learn robotics step by step with the real tools — an AI tutor helps.") },
  { id: "teach", group: G.general, name: tr("Opettajille", "For teachers"), icon: "cap", status: "ready",
    desc: tr("Valmiit oppitunnit, tulostettavat monisteet ja ratkaisut sekä luokan edistyminen ilman oppilastilejä.", "Ready-made lessons, printable worksheets and solutions, and class progress without student accounts.") },
  // Tasot ja hinnat avataan Päivitä-napista (plans.js), ei näy työkalulistoissa
  { id: "plans", group: G.general, name: tr("Tasot ja hinnat", "Plans & pricing"), icon: "star", status: "ready", nav: false,
    desc: tr("Free, Education, Teacher ja Pro: mitä kukin sisältää ja mitä se maksaa. Luokkakoodin aktivointi.", "Free, Education, Teacher and Pro: what each includes and costs. Class code activation.") },
  { id: "projects", group: G.general, name: tr("Projektit", "Projects"), icon: "folder", status: "ready",
    desc: tr("Jokainen projekti tallentaa työkalujen syötteet erikseen. Vie ja tuo JSON-tiedostona.", "Each project stores tool inputs separately. Export and import as JSON.") },
  // Profiili avataan sivupalkin alaosan käyttäjästä, ei näy työkalulistoissa (account-ui.js)
  { id: "profile", group: G.general, name: tr("Profiili", "Profile"), icon: "user", status: "ready", nav: false,
    desc: tr("Käyttäjätili, hahmo, tilastot ja varmuuskopio toiselle koneelle.", "Your account, character, stats and a backup for another computer.") },

  { id: "build2d", group: G.design, name: tr("Robottirakentaja 2D", "Robot builder 2D"), icon: "wrench", status: "ready",
    desc: tr("Rakenna oma 2D-robotti hiirellä, testaa fysiikka ja lähetä se koulutukseen.", "Build your own 2D robot with the mouse, test its physics and send it to training.") },
  { id: "build3d", group: G.design, name: tr("Robottirakentaja 3D", "Robot builder 3D"), icon: "wrench", status: "ready",
    desc: tr("Rakenna oma 3D-robotti osista ja nivelistä, testaa fysiikka ja kouluta se.", "Build your own 3D robot from parts and joints, test its physics and train it.") },
  { id: "motor", group: G.design, name: tr("Moottori ja voimansiirto", "Motor & drivetrain"), icon: "wheel", status: "ready",
    desc: tr("Nopeus, vetovoima, mäennousu ja virrankulutus moottorin tiedoista.", "Speed, traction, hill climbing and current draw from motor data.") },
  { id: "power", group: G.design, name: tr("Sähköjärjestelmä", "Power system"), icon: "battery", status: "ready",
    desc: tr("Akun käyttöaika, virrat, säädin, johdot ja moottoriohjaimen rajat.", "Battery runtime, currents, regulator, wiring and motor driver limits.") },

  { id: "fk", group: G.arm, name: tr("Suora kinematiikka", "Forward kinematics"), icon: "arm", status: "ready",
    desc: tr("Liikuta niveliä ja näe, mihin robottikäsivarren työkalu päätyy.", "Move the joints and see where the arm's tool ends up.") },
  { id: "ik", group: G.arm, name: tr("Käänteiskinematiikka", "Inverse kinematics"), icon: "target", status: "ready",
    desc: tr("Raahaa kohdetta — nivelkulmat ratkaistaan automaattisesti.", "Drag the target — joint angles are solved automatically.") },
  { id: "dh", group: G.arm, name: tr("DH-parametrit", "DH parameters"), icon: "table", status: "ready",
    desc: tr("Rakenna oma robottikäsivarsi Denavit–Hartenberg-taulukolla.", "Build your own robot arm with a Denavit–Hartenberg table.") },
  { id: "traj", group: G.arm, name: tr("Trajektorigeneraattori", "Trajectory generator"), icon: "traj", status: "ready",
    desc: tr("Sileät liikkeet: polynomit, trapetsi- ja S-käyräprofiilit — myös robottikäsivarrelle.", "Smooth motion: polynomials, trapezoidal and S-curve profiles — also for the robot arm.") },

  { id: "path", group: G.mobile, name: tr("Reittisuunnittelu", "Path planning"), icon: "path", status: "ready",
    desc: tr("Piirrä kartta ja katso, miten A*, Dijkstra, RRT ja muut löytävät reitin.", "Draw a map and watch A*, Dijkstra, RRT and others find a path.") },
  { id: "map", group: G.mobile, name: tr("Varauskartta", "Occupancy grid"), icon: "map", status: "ready",
    desc: tr("Robotti kartoittaa ympäristön simuloidulla lidarilla (occupancy grid).", "A robot maps its surroundings with a simulated lidar.") },
  { id: "sim2d", group: G.mobile, name: tr("Mobiilirobotti 2D", "Mobile robot 2D"), icon: "sim", status: "ready",
    desc: tr("Aja robottia kartalla: reitinseuranta, anturit, hätäjarru ja odometrian virhe.", "Drive a robot on the map: path following, sensors, emergency stop and odometry error.") },

  { id: "pid", group: G.ctrl, name: tr("PID-viritin", "PID tuner"), icon: "pid", status: "ready",
    desc: tr("Viritä PID-säädin ja näe askelvaste heti.", "Tune a PID controller and see the step response instantly.") },
  { id: "nn2d", group: G.ctrl, name: tr("Neuroverkkosimulaatio 2D", "Neural network sim 2D"), icon: "brain", status: "ready",
    desc: tr("Robotin neuroverkko oppii kävelemään, ajamaan tai tasapainottamaan evoluutiolla.", "A robot's neural network learns to walk, drive or balance through evolution.") },
  { id: "nn3d", group: G.ctrl, name: tr("Neuroverkkosimulaatio 3D", "Neural network sim 3D"), icon: "brain", status: "ready",
    desc: tr("3D-fysiikkasimulaatio: kouluta pyöräauto, robotti-imuri, käsivarsi tai kävelijä.", "3D physics simulation: train a car, a robot vacuum, an arm or a walker.") },

  { id: "serial", group: G.hw, name: tr("Sarjaportti", "Serial port"), icon: "plug", status: "ready",
    desc: tr("Yhdistä mikrokontrolleriin, piirrä anturidata ja tallenna CSV:ksi.", "Connect to a microcontroller, plot sensor data and save as CSV.") },
  { id: "cv", group: G.hw, name: tr("Konenäkö", "Computer vision"), icon: "eye", status: "ready",
    desc: tr("Kameran kuvasta kohteen paikka: harmaasävy, kynnystys, reunat ja väritunnistus — ja valmis OpenCV-koodi.", "From a camera image to an object's position: grayscale, threshold, edges and colour detection — plus ready OpenCV code.") },

  { id: "sim3d", group: G.frames, name: tr("TF-puu ja URDF", "TF tree & URDF"), icon: "cube", status: "ready",
    desc: tr("TF-puu ja muunnokset kehysten välillä sekä URDF-mallien katselu.", "TF tree, transforms between frames and URDF model viewer.") },
  { id: "rot", group: G.frames, name: tr("Rotaatiomuunnin", "Rotation converter"), icon: "rotate", status: "ready",
    desc: tr("Muunna Euler-kulmien, kvaternion, akseli–kulman ja matriisin välillä.", "Convert between Euler angles, quaternions, axis–angle and matrices.") },
  { id: "units", group: G.frames, name: tr("Yksikkömuunnin", "Unit converter"), icon: "ruler", status: "ready",
    desc: tr("Momentti, kulmanopeus, voima, teho ja muut robotiikan yksiköt.", "Torque, angular velocity, force, power and other robotics units.") },
];
const isReady = (t) => t.status === "ready" || t.id === "dashboard";

/* ===== Teemat ===== */
const THEMES = [
  { id: "system",    name: tr("Järjestelmä", "System"),               colors: null },
  { id: "graphite",  name: tr("Grafiitti", "Graphite"),               colors: ["#14171c", "#181b21", "#4c8dff", "#2a2f37"] },
  { id: "light",     name: tr("Vaalea", "Light"),                     colors: ["#eceef1", "#ffffff", "#2563eb", "#e1e4e8"] },
  { id: "midnight",  name: tr("Yönsininen", "Midnight"),              colors: ["#0e1427", "#111a30", "#7c9cff", "#22304f"] },
  { id: "solarized", name: "Solarized",                               colors: ["#01313d", "#073642", "#2aa198", "#154d5b"] },
  { id: "terminal",  name: tr("Terminaali", "Terminal"),              colors: ["#080d08", "#0b120b", "#39ff7a", "#1a2e1a"] },
  { id: "sand",      name: tr("Hiekka", "Sand"),                      colors: ["#ebe5da", "#fbf8f2", "#c2410c", "#ddd4c4"] },
  { id: "contrast",  name: tr("Korkea kontrasti", "High contrast"),   colors: ["#000000", "#000000", "#ffd400", "#ffffff"] },
];
const ACCENTS = ["", "#4c8dff", "#7c5cff", "#e05cc5", "#f2555a", "#f5913a", "#f5c33b", "#3ecf8e", "#22b8cf"];

const AI_MODELS = [
  ["claude-opus-5-5", tr("Claude Opus 5.5 — paras vastausten laatu", "Claude Opus 5.5 — best answer quality")],
  ["claude-sonnet-5-5", tr("Claude Sonnet 5.5 — nopeampi ja edullisempi", "Claude Sonnet 5.5 — faster and cheaper")],
  ["claude-haiku-5-5", tr("Claude Haiku 5.5 — nopein ja edullisin", "Claude Haiku 5.5 — fastest and cheapest")],
];

// Ilmaisen Voltin mallit (WebLLM): [asetuksen arvo, mallin perusnimi, nimi asetuksissa]
const VOLT_MODELS = [
  ["qwen0.5", "Qwen2.5-0.5B-Instruct", tr("Kevyt — noin 0,4 Gt, nopein (vastaa englanniksi)", "Light — about 0.4 GB, fastest")],
  ["qwen1.5", "Qwen2.5-1.5B-Instruct", tr("Normaali — noin 1 Gt, suositus (vastaa englanniksi)", "Normal — about 1 GB (recommended)")],
  ["qwen3", "Qwen2.5-3B-Instruct", tr("Paras — noin 2 Gt, vaatii tehokkaan koneen (vastaa englanniksi)", "Best — about 2 GB, needs a powerful computer")],
  ["off", "", tr("Pois — vain paikallinen opas", "Off — local guide only")],
];

/* ===== Asetusten skeema ===== */
const SECTIONS = [
  { id: "appearance", title: tr("Ulkoasu", "Appearance"), desc: tr("Kieli, teema, värit ja käyttöliittymän tiheys.", "Language, theme, colours and interface density."), fields: [
    { key: "language", label: tr("Kieli", "Language"), desc: tr("Sivu latautuu uudelleen valitulla kielellä.", "The page reloads in the selected language."), type: "select", default: LANG, options: [["fi", "Suomi"], ["en", "English"]] },
    { key: "theme", type: "themes", default: "graphite" },
    { key: "accent", label: tr("Korostusväri", "Accent colour"), desc: tr("Tyhjä = teeman oma väri.", "Empty = the theme's own colour."), type: "swatches", default: "" },
    { key: "scale", label: tr("Käyttöliittymän koko", "Interface size"), desc: tr("Skaalaa tekstiä ja elementtejä.", "Scales text and elements."), type: "range", min: 0.85, max: 1.25, step: 0.05, default: 1, fmt: (v) => Math.round(v * 100) + " %" },
    { key: "density", label: tr("Tiheys", "Density"), type: "select", default: "comfortable", options: [["compact", tr("Tiivis", "Compact")], ["comfortable", tr("Normaali", "Normal")], ["spacious", tr("Väljä", "Spacious")]] },
    { key: "radius", label: tr("Kulmien pyöristys", "Corner rounding"), type: "select", default: "normal", options: [["sharp", tr("Terävä", "Sharp")], ["normal", tr("Normaali", "Normal")], ["round", tr("Pyöreä", "Round")]] },
    { key: "font", label: tr("Fontti", "Font"), type: "select", default: "sans", options: [["sans", "Sans-serif"], ["mono", "Monospace"]] },
    { key: "sidebarCollapsed", label: tr("Kapea sivupalkki", "Narrow sidebar"), desc: tr("Näytä vain ikonit (Ctrl+B).", "Show icons only (Ctrl+B)."), type: "toggle", default: false },
    { key: "statusbar", label: tr("Tilarivi", "Status bar"), desc: tr("Näytä yksiköt ja suorituskyky alareunassa.", "Show units and performance at the bottom."), type: "toggle", default: true },
  ]},
  { id: "units", title: tr("Yksiköt ja numerot", "Units & numbers"), desc: tr("Miten arvot syötetään ja näytetään kaikissa työkaluissa.", "How values are entered and shown in every tool."), fields: [
    { key: "lengthUnit", label: tr("Pituus", "Length"), type: "select", default: "m", options: [["m", tr("metri (m)", "metre (m)")], ["cm", tr("senttimetri (cm)", "centimetre (cm)")], ["mm", tr("millimetri (mm)", "millimetre (mm)")], ["in", tr("tuuma (in)", "inch (in)")], ["ft", tr("jalka (ft)", "foot (ft)")]] },
    { key: "angleUnit", label: tr("Kulma", "Angle"), type: "select", default: "deg", options: [["deg", tr("asteet (°)", "degrees (°)")], ["rad", tr("radiaanit (rad)", "radians (rad)")]] },
    { key: "massUnit", label: tr("Massa", "Mass"), type: "select", default: "kg", options: [["kg", tr("kilogramma (kg)", "kilogram (kg)")], ["g", tr("gramma (g)", "gram (g)")], ["lb", tr("pauna (lb)", "pound (lb)")]] },
    { key: "torqueUnit", label: tr("Momentti", "Torque"), type: "select", default: "Nm", options: [["Nm", "N·m"], ["Nmm", "N·mm"], ["kgfcm", "kgf·cm"], ["ozin", "oz·in"]] },
    { key: "decimals", label: tr("Desimaalit", "Decimals"), desc: tr("Näytettävien desimaalien määrä.", "Number of decimals shown."), type: "number", min: 0, max: 10, step: 1, default: 3 },
    { key: "notation", label: tr("Lukujen esitys", "Number format"), type: "select", default: "auto", options: [["auto", tr("Automaattinen", "Automatic")], ["fixed", tr("Desimaali", "Decimal")], ["sci", tr("Tieteellinen", "Scientific")]] },
    { key: "decimalSep", label: tr("Desimaalierotin", "Decimal separator"), type: "select", default: LANG === "en" ? "." : ",", options: [[",", tr("Pilkku (1,5)", "Comma (1,5)")], [".", tr("Piste (1.5)", "Point (1.5)")]] },
  ]},
  { id: "frames", title: tr("Koordinaatistot ja rotaatiot", "Frames & rotations"), desc: tr("Konventiot, joita kinematiikka- ja 3D-työkalut käyttävät.", "Conventions used by the kinematics and 3D tools."), fields: [
    { key: "upAxis", label: tr("Ylöspäin osoittava akseli", "Up axis"), desc: tr("ROS (REP-103) käyttää Z-ylös.", "ROS (REP-103) uses Z-up."), type: "select", default: "Z", options: [["Z", tr("Z ylös", "Z up")], ["Y", tr("Y ylös", "Y up")]] },
    { key: "handedness", label: tr("Kätisyys", "Handedness"), type: "select", default: "right", options: [["right", tr("Oikeakätinen", "Right-handed")], ["left", tr("Vasenkätinen", "Left-handed")]] },
    { key: "rotationRep", label: tr("Oletusrotaatioesitys", "Default rotation format"), type: "select", default: "euler", options: [["euler", tr("Euler-kulmat", "Euler angles")], ["quat", tr("Kvaternio", "Quaternion")], ["axisangle", tr("Akseli–kulma", "Axis–angle")], ["matrix", tr("Rotaatiomatriisi", "Rotation matrix")]] },
    { key: "eulerOrder", label: tr("Euler-järjestys", "Euler order"), type: "select", default: "ZYX", options: ["ZYX", "XYZ", "ZXY", "YXZ", "ZYZ", "ZXZ"].map((o) => [o, o + (o === "ZYX" ? " (yaw-pitch-roll)" : "")]) },
    { key: "eulerFrame", label: tr("Euler-tyyppi", "Euler type"), type: "select", default: "intrinsic", options: [["intrinsic", tr("Sisäinen (liikkuva)", "Intrinsic (moving)")], ["extrinsic", tr("Ulkoinen (kiinteä)", "Extrinsic (fixed)")]] },
    { key: "quatOrder", label: tr("Kvaternion järjestys", "Quaternion order"), type: "select", default: "xyzw", options: [["xyzw", "x, y, z, w (ROS)"], ["wxyz", "w, x, y, z"]] },
    { key: "dhConvention", label: tr("DH-konventio", "DH convention"), type: "select", default: "classic", options: [["classic", tr("Klassinen (Denavit–Hartenberg)", "Classic (Denavit–Hartenberg)")], ["modified", tr("Modifioitu (Craig)", "Modified (Craig)")]] },
  ]},
  { id: "sim", title: tr("Simulaatio", "Simulation"), desc: tr("Fysiikkamoottorin oletusasetukset uusille simulaatioille.", "Physics defaults for new simulations."), fields: [
    { key: "timestep", label: tr("Aika-askel", "Time step"), desc: tr("Fysiikan integrointiaskel millisekunteina.", "Physics integration step in milliseconds."), type: "number", min: 0.1, max: 100, step: 0.1, default: 5, suffix: "ms" },
    { key: "integrator", label: tr("Integraattori", "Integrator"), type: "select", default: "semi", options: [["euler", tr("Euler (eksplisiittinen)", "Euler (explicit)")], ["semi", tr("Semi-implisiittinen Euler", "Semi-implicit Euler")], ["rk4", "Runge–Kutta 4"]] },
    { key: "realtime", label: tr("Reaaliaikakerroin", "Real-time factor"), desc: tr("1× = reaaliaika.", "1× = real time."), type: "range", min: 0.1, max: 4, step: 0.1, default: 1, fmt: (v) => fmt(v, 1) + "×" },
    { key: "gravity", label: tr("Painovoima", "Gravity"), type: "number", min: 0, max: 30, step: 0.01, default: 9.81, suffix: "m/s²" },
    { key: "noise", label: tr("Anturikohina", "Sensor noise"), desc: tr("Simuloitujen antureiden kohinan taso.", "Noise level of simulated sensors."), type: "range", min: 0, max: 1, step: 0.05, default: 0.1, fmt: (v) => Math.round(v * 100) + " %" },
    { key: "seed", label: tr("Satunnaissiemen", "Random seed"), desc: tr("0 = satunnainen joka kerta.", "0 = random every time."), type: "number", min: 0, max: 999999, step: 1, default: 0 },
    { key: "autoStart", label: tr("Käynnistä automaattisesti", "Start automatically"), desc: tr("Aloita simulaatio heti, kun työkalu avataan.", "Start the simulation as soon as the tool opens."), type: "toggle", default: false },
    { key: "pauseOnBlur", label: tr("Pysäytä taustalla", "Pause in background"), desc: tr("Keskeytä, kun välilehti ei ole aktiivinen.", "Pause when the tab is not active."), type: "toggle", default: true },
  ]},
  { id: "viz", title: tr("Visualisointi", "Visualisation"), desc: tr("Kuinka simulaatiot ja kuvaajat piirretään.", "How simulations and plots are drawn."), fields: [
    { key: "showGrid", label: tr("Ruudukko", "Grid"), type: "toggle", default: true },
    { key: "gridSize", label: tr("Ruudukon koko", "Grid size"), type: "range", min: 8, max: 64, step: 4, default: 24, fmt: (v) => v + " px" },
    { key: "showAxes", label: tr("Koordinaattiakselit", "Coordinate axes"), desc: tr("Näytä X/Y/Z-akselit näkymissä.", "Show X/Y/Z axes in views."), type: "toggle", default: true },
    { key: "axisColors", label: tr("Akselivärit", "Axis colours"), type: "select", default: "rgb", options: [["rgb", tr("X punainen, Y vihreä, Z sininen", "X red, Y green, Z blue")], ["cmy", tr("Värisokeusystävällinen", "Colour-blind friendly")]] },
    { key: "frameLabels", label: tr("Koordinaatistojen nimet", "Frame labels"), type: "toggle", default: true },
    { key: "trail", label: tr("Jäljen pituus", "Trail length"), desc: tr("Kuinka monta pistettä liikeradasta piirretään.", "How many trajectory points are drawn."), type: "range", min: 0, max: 2000, step: 50, default: 500, fmt: (v) => v + "" },
    { key: "graphics", label: tr("Grafiikan laatu", "Graphics quality"), desc: tr("Robottisimulaatioiden ja rakentajien piirto. Matala sopii kevyille koneille: ei varjoja, ääriviivoja eikä pieniä yksityiskohtia. Muutos näkyy, kun näkymä avataan uudelleen.", "How robot simulations and builders are drawn. Low suits lighter computers: no shadows, outlines or small details. Takes effect when the view is reopened."),
      type: "select", default: "auto", options: [["auto", tr("Automaattinen", "Automatic")], ["low", tr("Matala (kevyt)", "Low (light)")], ["normal", tr("Normaali", "Normal")], ["high", tr("Korkea", "High")]] },
    { key: "antialias", label: tr("Reunanpehmennys", "Anti-aliasing"), type: "toggle", default: true },
    { key: "fpsCap", label: tr("Ruudunpäivitysraja", "Frame rate limit"), type: "select", default: "60", options: [["30", "30 FPS"], ["60", "60 FPS"], ["120", "120 FPS"], ["0", tr("Rajaton", "Unlimited")]] },
    { key: "showFps", label: tr("Näytä FPS", "Show FPS"), desc: tr("Näkyy tilarivillä.", "Shown in the status bar."), type: "toggle", default: true },
    { key: "plotPalette", label: tr("Kuvaajien väripaletti", "Plot palette"), type: "select", default: "default", options: [["default", tr("Oletus", "Default")], ["okabe", tr("Okabe–Ito (värisokeille)", "Okabe–Ito (colour-blind)")], ["mono", tr("Yksivärinen", "Monochrome")]] },
  ]},
  { id: "ai", title: tr("Tekoälyavustaja Volt", "AI assistant Volt"), desc: tr("Volt on ilmainen: tekoälymalli ladataan kerran ja se toimii omalla koneellasi ilman nettiä ja ilman tiliä. Oma Claude API -avain antaa halutessasi parhaat vastaukset.", "Volt is free: the AI model downloads once and runs on your own computer, offline and without an account. Your own Claude API key gives the best answers if you want them."), custom: "ai", fields: [
    { key: "voltModel", label: tr("Ilmainen Volt (koneella)", "Free Volt (on this computer)"), desc: tr("Isompi malli vastaa paremmin, mutta vaatii enemmän näytönohjaimen muistia. Vaatii Chromen tai Edgen (WebGPU).", "A bigger model answers better but needs more graphics memory. Needs Chrome or Edge (WebGPU)."),
      type: "select", default: "qwen1.5", options: VOLT_MODELS.map(([id, , label]) => [id, label]) },
    { key: "aiModel", label: tr("Claude-malli (API-avaimella)", "Claude model (with API key)"), desc: tr("Kaikki mallit maksavat käytön mukaan omalla API-avaimellasi.", "All models are billed per use on your own API key."), type: "select", default: "claude-opus-5-5", options: AI_MODELS },
    { key: "aiContext", label: tr("Lähetä avoimen työkalun tiedot", "Send the open tool's data"), desc: tr("Avustaja näkee työkalun syötteet ja voi auttaa juuri sinun tilanteessasi.", "The assistant sees the tool's inputs and can help with your exact situation."), type: "toggle", default: true },
  ]},
  { id: "a11y", title: tr("Saavutettavuus", "Accessibility"), desc: tr("Liike, vihjeet ja syöttötavat.", "Motion, hints and input."), fields: [
    { key: "motion", label: tr("Animaatiot", "Animations"), type: "select", default: "system", options: [["system", tr("Järjestelmän mukaan", "Follow system")], ["on", tr("Päällä", "On")], ["off", tr("Pois", "Off")]] },
    { key: "tooltips", label: tr("Työkaluvihjeet", "Tooltips"), desc: tr("Näytä selitteet, kun hiiri on painikkeen päällä.", "Show hints when hovering over buttons."), type: "toggle", default: true },
    { key: "confirmReset", label: tr("Vahvista nollaukset", "Confirm resets"), desc: tr("Kysy ennen kuin simulaatio tai tiedot nollataan.", "Ask before a simulation or data is reset."), type: "toggle", default: true },
  ]},
  { id: "shortcuts", title: tr("Pikanäppäimet", "Keyboard shortcuts"), desc: tr("Näppäinoikotiet koko sovelluksessa. Paina ? missä tahansa nähdäksesi listan.", "Shortcuts across the app. Press ? anywhere to see this list."), custom: "shortcuts" },
  { id: "data", title: tr("Tallennus ja tiedot", "Saving & data"),
    desc: tr("Kaikki tietosi (projektit, kurssien eteneminen, omat robotit, asetukset, käyttäjätilit ja mahdollinen API-avain) tallentuvat vain tähän selaimeen tällä laitteella. RoboLab ei käytä analytiikkaa, mainoksia tai seurantaa. Poikkeukset: jos kirjaudut vapaaehtoisella pilvitilillä, tilisi tiedot (ei API-avainta) tallennetaan myös RoboLabin pilveen (Supabase, EU) ja ne voi poistaa profiilista. Jos lisäät Claude API -avaimen, Voltille kirjoittamasi viestit (ja halutessasi avoimen työkalun arvot) lähetetään Anthropicille vastausta varten. Tallennus ei ole salattu: kuka tahansa tämän laitteen käyttäjä voi lukea sen selaimen kehitystyökaluilla. Jos tyhjennät selaimen tiedot tai käytät yksityistä ikkunaa, tiedot katoavat — tee siis varmuuskopio profiilista tai vie tärkeät projektit tiedostoiksi.",
      "All your data (projects, course progress, your robots, settings, user accounts and any API key) is stored only in this browser on this device. RoboLab uses no analytics, ads or tracking. Exceptions: if you sign in with an optional cloud account, your account's data (not the API key) is also stored in RoboLab's cloud (Supabase, EU) and can be deleted from your profile. If you add a Claude API key, the messages you write to Volt (and, if you allow it, the open tool's values) are sent to Anthropic to get an answer. The storage is not encrypted: anyone using this device can read it with the browser's developer tools. If you clear the browser's data or use a private window, the data is lost — so make a backup from your profile or export important projects as files."), custom: "data", fields: [
    { key: "autosave", label: tr("Tallenna automaattisesti", "Save automatically"), desc: tr("Muutokset tallentuvat heti.", "Changes are saved immediately."), type: "toggle", default: true },
    { key: "startPage", label: tr("Aloitussivu", "Start page"), type: "select", default: "dashboard", options: [["last", tr("Viimeksi avattu", "Last opened")], ...TOOLS.map((t) => [t.id, t.name])] },
  ]},
  { id: "updates", title: tr("Päivitykset", "Updates"), desc: tr("RoboLab huomaa uudet versiot itse. Projektit ja asetukset säilyvät päivityksissä.", "RoboLab notices new versions by itself. Projects and settings are kept across updates."), custom: "updates", fields: [
    { key: "autoUpdate", label: tr("Päivitä automaattisesti käynnistyessä", "Update automatically on start"), desc: tr("Kun RoboLab avataan ja uusi versio on valmis, se otetaan heti käyttöön. Kesken työn päivitystä kysytään aina ensin.", "When RoboLab opens and a new version is ready, it is applied right away. During work you are always asked first."), type: "toggle", default: true },
  ]},
];

// Näkyvät vain, kun "Lisäasetukset" on päällä — perusnäkymä pysyy aloittelijalle selkeänä
const ADVANCED = new Set([
  "radius", "font", "sidebarCollapsed", "statusbar",
  "torqueUnit", "notation", "decimalSep",
  "handedness", "eulerOrder", "eulerFrame", "quatOrder", "dhConvention",
  "integrator", "noise", "seed", "autoStart", "pauseOnBlur",
  "axisColors", "frameLabels", "trail", "antialias", "fpsCap", "showFps", "plotPalette",
  "confirmReset", "autosave", "startPage",
]);
const ADVANCED_SECTIONS = new Set(["shortcuts"]);

// Näppäinyhdistelmät: "+" = yhtä aikaa, " → " = peräkkäin
const SHORTCUTS = [
  [tr("Hae työkaluja ja komentoja", "Search tools and commands"), "Ctrl+K"],
  [tr("Avaa tekoälyavustaja", "Open the AI assistant"), "Ctrl+I"],
  [tr("Kumoa", "Undo"), "Ctrl+Z"],
  [tr("Tee uudelleen", "Redo"), "Ctrl+Y"],
  [tr("Tee uudelleen", "Redo"), "Ctrl+Shift+Z"],
  [tr("Tallenna nyt", "Save now"), "Ctrl+S"],
  [tr("Vie projekti JSON-tiedostona", "Export project as JSON"), "Ctrl+E"],
  [tr("Avaa asetukset", "Open settings"), "Ctrl+,"],
  [tr("Näytä / piilota sivupalkki", "Show / hide sidebar"), "Ctrl+B"],
  [tr("Siirry etusivulle", "Go to the home page"), "G → D"],
  [tr("Siirry projekteihin", "Go to projects"), "G → P"],
  [tr("Siirry asetuksiin", "Go to settings"), "G → S"],
  [tr("Näytä pikanäppäimet", "Show shortcuts"), "?"],
  [tr("Tauko / jatka simulaatio", "Pause / resume simulation"), tr("Välilyönti", "Space")],
  [tr("Sulje dialogi tai paneeli", "Close dialog or panel"), "Esc"],
];
const kbdHtml = (k) => k.split(" → ").map((step) => step.split("+").map((x) => `<kbd>${esc(x)}</kbd>`).join("+")).join(` <span class="note">${tr("sitten", "then")}</span> `);

/* ===== Tila ===== */
const STORE_KEY = "robolab-settings-v1";
const DEFAULTS = {};
SECTIONS.forEach((s) => (s.fields || []).forEach((f) => (DEFAULTS[f.key] = f.default)));
DEFAULTS.advanced = false;

// Hyväksyy vain skeeman mukaiset arvot: tuotu tiedosto ei voi syöttää mielivaltaista tekstiä käyttöliittymään
function sanitizeSettings(data) {
  const out = {};
  if (!data || typeof data !== "object") return out;
  for (const f of SECTIONS.flatMap((s) => s.fields || [])) {
    if (!(f.key in data)) continue;
    const v = data[f.key];
    if (f.type === "select" && f.options.some(([o]) => String(o) === String(v))) out[f.key] = String(v);
    else if (f.type === "toggle" && typeof v === "boolean") out[f.key] = v;
    else if ((f.type === "range" || f.type === "number") && Number.isFinite(+v)) out[f.key] = Math.min(f.max, Math.max(f.min, +v));
    else if (f.type === "themes" && THEMES.some((t) => t.id === v)) out[f.key] = v;
    else if (f.type === "swatches" && ACCENTS.includes(v)) out[f.key] = v;
  }
  if (typeof data.advanced === "boolean") out.advanced = data.advanced;
  return out;
}

let settings = { ...DEFAULTS };
try { Object.assign(settings, sanitizeSettings(JSON.parse(localStorage.getItem(STORE_KEY)))); } catch {}
settings.language = LANG;

function persist(force) {
  if (!settings.autosave && !force) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(settings)); } catch {}
}

function set(key, value) {
  settings[key] = value;
  // Kieli tallennetaan aina, koska se luetaan seuraavalla latauskerralla
  persist(key === "language");
  if (key === "language") { location.reload(); return; }
  applySettings();
}

/* ===== Asetusten soveltaminen ===== */
const mqDark = matchMedia("(prefers-color-scheme: dark)");
const mqMotion = matchMedia("(prefers-reduced-motion: reduce)");
let lessonNarrow = false; // kurssipaneeli auki → kapea sivupalkki (setLessonLayout)

function resolvedTheme() {
  return settings.theme === "system" ? (mqDark.matches ? "graphite" : "light") : settings.theme;
}

function applySettings() {
  const root = document.documentElement;
  root.dataset.theme = resolvedTheme();
  root.dataset.density = settings.density;
  root.dataset.radius = settings.radius;
  root.dataset.font = settings.font;
  const reduce = settings.motion === "off" || (settings.motion === "system" && mqMotion.matches);
  root.dataset.motion = reduce ? "reduced" : "full";
  root.style.setProperty("--scale", settings.scale);
  root.style.setProperty("--grid-px", settings.gridSize + "px");
  if (settings.accent) root.style.setProperty("--accent-user", settings.accent);
  else root.style.removeProperty("--accent-user");
  if (!settings.showGrid) root.style.setProperty("--grid", "transparent");
  else root.style.removeProperty("--grid");
  // Asennetun sovelluksen ikkunan otsikkopalkki teeman värillä
  $('meta[name="theme-color"]')?.setAttribute("content", getComputedStyle(root).getPropertyValue("--bg").trim() || "#0f1115");

  applySidebar();
  $("#statusbar").hidden = !settings.statusbar;
  document.querySelectorAll("[data-tip]").forEach((el) => {
    if (settings.tooltips) el.title = el.dataset.tip; else el.removeAttribute("title");
  });
  renderStatusbar();
}

/* ===== Projektit =====
   Jokainen projekti tallentaa työkalujen syötteet omaan lohkoonsa (project.tools[toolId]),
   joten yhden työkalun muutos ei koske muiden tietoihin. */
const PROJ_KEY = "robolab-projects-v1";
const PROJECT_FORMAT = "robolab-project";
const PROJECT_VERSION = 1;

const uid = () => Math.random().toString(36).slice(2, 10);
const newProject = (name) => ({ id: uid(), name, created: Date.now(), updated: Date.now(), notes: "", tools: {} });

let projects = (() => {
  let raw = null;
  try {
    raw = localStorage.getItem(PROJ_KEY);
    const s = JSON.parse(raw);
    if (s && s.version === PROJECT_VERSION && s.projects && typeof s.projects === "object") {
      // Korjataan puuttuva aktiivinen projekti tai työkalulohko sen sijaan, että kaikki projektit korvattaisiin uudella
      for (const [id, p] of Object.entries(s.projects)) {
        if (!p || typeof p !== "object") { delete s.projects[id]; continue; }
        if (!p.tools || typeof p.tools !== "object") p.tools = {};
        p.id = id; p.name = String(p.name || tr("Nimetön projekti", "Untitled project"));
      }
      const ids = Object.keys(s.projects);
      if (ids.length) { if (!s.projects[s.active]) s.active = ids[0]; return s; }
    }
  } catch {}
  // Lukukelvoton tallennus säilytetään omaan avaimeensa, ettei seuraava tallennus pyyhi sitä lopullisesti
  if (raw) try { localStorage.setItem(PROJ_KEY + "-broken-" + Date.now(), raw); } catch {}
  const p = newProject(tr("Oma projekti", "My project"));
  return { version: PROJECT_VERSION, active: p.id, projects: { [p.id]: p } };
})();

// Palauttaa false, jos tallennus epäonnistui (yleensä selaimen tallennustila täynnä)
function saveProjects() {
  try { localStorage.setItem(PROJ_KEY, JSON.stringify(projects)); markSaved(true); return true; }
  catch { markSaved(false); return false; }
}

// Tallennuksen tila tilarivillä: käyttäjä näkee, että muutokset ovat tallessa (tai että tallennus epäonnistui)
let saveState = { ok: true, at: null };
function markSaved(ok) {
  saveState = { ok, at: new Date() };
  const el = document.getElementById("save-status");
  if (el) { el.outerHTML = saveStatusHtml(); }
}
function saveStatusHtml() {
  if (!saveState.at) return `<span id="save-status" class="save-status">${tr("Tallentuu automaattisesti", "Saves automatically")}</span>`;
  if (!saveState.ok) return `<span id="save-status" class="save-status err" role="alert">⚠ ${tr("Tallennus epäonnistui — selaimen tallennustila voi olla täynnä", "Saving failed — browser storage may be full")}</span>`;
  const t = saveState.at.toLocaleTimeString(tr("fi-FI", "en-GB"), { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return `<span id="save-status" class="save-status ok" title="${tr("Tallennettu tähän selaimeen", "Saved in this browser")}">✓ ${tr("Tallennettu", "Saved")} ${t}</span>`;
}
const activeProject = () => projects.projects[projects.active];

function getToolState(id, defaults) {
  const saved = activeProject().tools[id] || {};
  const out = { ...defaults, ...saved };
  // Kentät, joiden oletus on luku, pidetään lukuina: tuodusta tiedostosta tullut teksti päätyisi muuten HTML:ään
  for (const k in defaults) {
    if (typeof defaults[k] !== "number" || !(k in saved) || saved[k] === null || typeof saved[k] === "number") continue;
    const v = Number(saved[k]);
    out[k] = Number.isFinite(v) ? v : defaults[k];
  }
  return out;
}
// opts.undo === false: tallennetaan ilman kumoamisaskelta (esim. koulutuksen tulos joka sukupolven jälkeen)
function saveToolState(id, state, opts = {}) {
  const p = activeProject();
  if (opts.undo !== false) snapshot(p);
  p.tools[id] = JSON.parse(JSON.stringify(state));
  p.updated = Date.now();
  saveProjects();
}

/* ===== Kumoa / tee uudelleen =====
   Ennen jokaista tallennusta otetaan kuva projektin työkalutiloista. Nopeat peräkkäiset muutokset
   (liukusäätimen veto, kartan piirto) yhdistetään yhdeksi kumottavaksi askeleeksi. */
const undoState = { project: null, undo: [], redo: [], last: 0 };
const UNDO_MAX = 100, UNDO_GROUP_MS = 700;
// Opitut neuroverkon painot eivät kuulu kumoamiseen: Ctrl+Z ei saa pyyhkiä tuntien koulutusta
// (ja ne ovat isoja, joten ne jätetään myös kumoamiskuvista pois)
const UNDO_KEEP = new Set(["nn2dBrain", "nn3dBrain", "nn2dStats", "nn3dStats", "nn2dRuns", "nn3dRuns"]);
const undoable = (tools) => JSON.stringify(tools, (k, v) => (UNDO_KEEP.has(k) ? undefined : v));

function snapshot(p) {
  if (undoState.project !== p.id) Object.assign(undoState, { project: p.id, undo: [], redo: [], last: 0 });
  const now = Date.now();
  if (now - undoState.last > UNDO_GROUP_MS) {
    undoState.undo.push(undoable(p.tools));
    if (undoState.undo.length > UNDO_MAX) undoState.undo.shift();
    undoState.redo = [];
  }
  undoState.last = now;
}

function undoRedo(dir) {
  const p = activeProject();
  const from = dir === "undo" ? undoState.undo : undoState.redo;
  const to = dir === "undo" ? undoState.redo : undoState.undo;
  if (undoState.project !== p.id || !from.length) {
    toast(dir === "undo" ? tr("Ei kumottavaa", "Nothing to undo") : tr("Ei uudelleen tehtävää", "Nothing to redo"));
    return;
  }
  to.push(undoable(p.tools));
  const kept = Object.fromEntries(Object.entries(p.tools).filter(([k]) => UNDO_KEEP.has(k)));
  p.tools = { ...JSON.parse(from.pop()), ...kept };
  p.updated = Date.now();
  undoState.last = 0;
  saveProjects();
  const top = $("#content").scrollTop;
  router();
  $("#content").scrollTop = top;
  toast(dir === "undo" ? tr("Kumottu", "Undone") : tr("Tehty uudelleen", "Redone"));
}

function exportActiveProject() {
  const p = activeProject();
  const data = { format: PROJECT_FORMAT, version: PROJECT_VERSION, exported: new Date().toISOString(), project: p };
  downloadFile(p.name.replace(/[^\w\-åäöÅÄÖ ]+/g, "_") + ".robolab.json", JSON.stringify(data, null, 2));
}

/* ===== Yhteiset apurit työkaluille ===== */
const TOOL_IMPL = {};

// Muotoilee luvun asetusten mukaan (desimaalit, erotin, esitystapa)
function fmt(v, digits = 2) {
  if (v === null || v === undefined || Number.isNaN(v)) return "–";
  if (!Number.isFinite(v)) return "∞";
  const d = Math.min(digits, settings.decimals);
  const sci = settings.notation === "sci" || (settings.notation === "auto" && Math.abs(v) >= 1e6);
  let s = sci ? v.toExponential(d) : v.toFixed(d);
  if (/^-0[.0]*$/.test(s)) s = s.slice(1); // ei "-0,000"
  return settings.decimalSep === "," ? s.replace(".", ",") : s;
}

// Asetusten pituus- ja kulmayksiköt: näytettävä arvo = SI-arvo / kerroin
const LEN_FACTOR = { m: 1, cm: 0.01, mm: 0.001, in: 0.0254, ft: 0.3048 };
const lenF = () => LEN_FACTOR[settings.lengthUnit] || 1;
const lenLabel = () => settings.lengthUnit;
const angF = () => (settings.angleUnit === "rad" ? 1 : Math.PI / 180);
const angLabel = () => (settings.angleUnit === "rad" ? "rad" : "°");
const fmtLen = (m, d = 3) => fmt(m / lenF(), settings.lengthUnit === "mm" ? Math.max(0, d - 2) : d);
const fmtAng = (rad, d = 2) => fmt(rad / angF(), settings.angleUnit === "rad" ? d + 2 : d);

// Tekstikenttien luvut: hyväksyy sekä pilkun että pisteen, näyttää asetusten erottimella
function fmtInput(v, sig = 6) {
  if (!Number.isFinite(v)) return "";
  if (Math.abs(v) < 1e-12) v = 0;
  const s = String(+v.toPrecision(sig));
  return settings.decimalSep === "," ? s.replace(".", ",") : s;
}
function parseInput(s) {
  const t = String(s).trim().replace(",", ".");
  const v = Number(t);
  return t === "" || !Number.isFinite(v) ? null : v;
}

// Tuodun, jaetun tai vanhan tilan luvut kenttien sallitulle alueelle: valtava arvo (esim. 1e9 iteraatiota)
// voisi muuten jäädyttää työkalun avattaessa. Muuttaa tilaa paikallaan.
function clampToFields(state, fields) {
  for (const f of fields) {
    if (f.type === "select" || f.type === "toggle" || typeof state[f.key] !== "number") continue;
    if (!Number.isFinite(f.min) || !Number.isFinite(f.max)) continue;
    const factor = typeof f.factor === "function" ? f.factor() : f.factor || 1;
    let v = Math.min(f.max * factor, Math.max(f.min * factor, state[f.key]));
    if (f.int) v = Math.round(v);
    state[f.key] = v;
  }
  return state;
}

// Lomakekentät: { key, label, unit, type, min, max, step, adv, help, options, factor, int }
// factor: näytettävä arvo = tallennettu / factor (esim. momentti valitussa yksikössä)
function fieldsHtml(fields, state, showAdv) {
  clampToFields(state, fields);
  return fields.filter((f) => (showAdv || !f.adv) && (!f.when || f.when(state))).map((f) => {
    const factor = typeof f.factor === "function" ? f.factor() : f.factor || 1;
    const unit = typeof f.unit === "function" ? f.unit() : f.unit || "";
    const v = state[f.key];
    let ctl;
    if (f.type === "select") {
      ctl = `<select data-f="${f.key}" aria-label="${esc(String(f.label ?? f.key))}">${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
    } else if (f.type === "toggle") {
      ctl = `<label class="switch"><input type="checkbox" data-f="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" ${v ? "checked" : ""}><span></span></label>`;
    } else {
      const shown = +(v / factor).toPrecision(6);
      const slider = f.type === "slider" ? `<input type="range" data-f="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" min="${f.min}" max="${f.max}" step="${f.step}" value="${shown}">` : "";
      // Ei min-attribuuttia: nuolinäppäinten ja spinnerin askeleet lasketaan silloin nykyisestä arvosta
      // (esim. 1,5 → 1,6 eikä 1,51, kun min = 0,01). Sallittu alue tarkistetaan bindFieldsissa.
      ctl = `${slider}<span class="num"><input type="number" data-f="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" max="${f.max}" step="${f.step}" value="${shown}">${unit ? `<i>${unit}</i>` : ""}</span>`;
    }
    // info: pidempi selitys "?"-napin takana (mitä arvo tarkoittaa, tyypilliset arvot)
    const info = f.info ? `<button type="button" class="info-btn" data-info aria-expanded="false" aria-label="${tr("Selitys", "Explanation")}: ${esc(stripTags(f.label))}">?</button>` : "";
    return `<div class="field ${f.type === "slider" ? "slider" : ""} ${f.type === "toggle" ? "inline" : ""}">
      <label>${f.label}${info}${f.help ? `<small>${f.help}</small>` : ""}</label>
      ${f.info ? `<div class="info-pop" hidden>${esc(f.info)}</div>` : ""}
      <div class="field-ctl">${ctl}</div>
    </div>`;
  }).join("");
}

// Sitoo kentät tilaan. Virheellinen syöte merkitään (myös näkyvä selitys kentän alle) eikä sitä tallenneta.
// f.int: vain kokonaisluvut (esim. moottorien määrä)
function bindFields(root, fields, state, onChange) {
  root.addEventListener("input", (e) => {
    const el = e.target, key = el.dataset.f;
    const f = fields.find((x) => x.key === key);
    if (!f) return;
    let val;
    if (f.type === "toggle") val = el.checked;
    else if (f.type === "select") val = el.value;
    else {
      const factor = typeof f.factor === "function" ? f.factor() : f.factor || 1;
      const n = parseFloat(el.value);
      const bad = el.value === "" || Number.isNaN(n) || n < f.min || n > f.max || (f.int && !Number.isInteger(n));
      const unit = typeof f.unit === "function" ? f.unit() : f.unit || "";
      const range = `${fmtInput(f.min)}–${fmtInput(f.max)}${unit ? " " + unit : ""}`;
      const msg = !Number.isFinite(f.min) || !Number.isFinite(f.max) ? tr("Kirjoita luku", "Type a number")
        : f.int ? tr(`Kokonaisluku ${range}`, `A whole number ${range}`) : tr(`Sallittu alue ${range}`, `Allowed range ${range}`);
      root.querySelectorAll(`[data-f="${key}"]`).forEach((x) => {
        if (x.type === "number") {
          x.classList.toggle("invalid", bad);
          x.title = bad ? msg : "";
          if (bad) x.setAttribute("aria-invalid", "true"); else x.removeAttribute("aria-invalid");
          const box = x.closest(".field");
          let err = box?.querySelector(".field-err");
          if (bad && box && !err) { err = document.createElement("small"); err.className = "field-err"; box.append(err); }
          if (err) { if (bad) err.textContent = msg; else err.remove(); }
        }
        if (!bad && x !== el) x.value = n;
      });
      if (bad) return;
      val = n * factor;
    }
    state[key] = val;
    onChange(key);
  });
}

function alertsHtml(list) {
  if (!list.length) return "";
  const ico = { err: "!", warn: "!", info: "i", ok: "✓" };
  // Teksti escapetaan aina: varoituksissa voi olla käyttäjän nimeämiä kehyksiä, kuormia ja URDF-niveliä
  return `<div class="alerts">${list.map((a) => `<div class="alert ${a.level}"><b>${ico[a.level]}</b><span>${esc(a.text)}</span></div>`).join("")}</div>`;
}

function resultTiles(items) {
  return `<div class="results">${items.map((r) => `
    <div class="result ${r.level || ""}">
      <div class="k">${r.label}</div>
      <div class="v">${r.value}<i>${r.unit || ""}</i></div>
      ${r.sub ? `<div class="s">${r.sub}</div>` : ""}
    </div>`).join("")}</div>`;
}

const stripTags = (s) => String(s).replace(/<[^>]*>/g, "");

/* ----- Työkalun otsikkorivi: suosikki, esimerkit, Kysy avustajalta ja lisävalikko -----
   Työkalu voi määritellä TOOL_IMPL[id].examples = [{ name, desc, apply() }]; apply tallentaa tilan. */
function toolHead(t, extra = "") {
  const impl = TOOL_IMPL[t.id];
  const fav = favs().includes(t.id);
  const examples = impl?.examples?.length ? `
    <div class="menu-wrap">
      <button class="btn" data-menu aria-haspopup="menu" aria-expanded="false">${tr("Esimerkit", "Examples")} ▾</button>
      <div class="menu" role="menu" hidden>
        <div class="menu-title">${tr("Täytä valmiit arvot", "Fill in ready-made values")}</div>
        ${impl.examples.map((e, i) => `<button role="menuitem" data-ex="${i}"><b>${esc(e.name)}</b>${e.desc ? `<small>${esc(e.desc)}</small>` : ""}</button>`).join("")}
      </div>
    </div>` : "";
  const quick = TOOL_SETTINGS[t.id] ? `
    <div class="menu-wrap">
      <button class="icon-btn" data-menu aria-haspopup="dialog" aria-expanded="false" aria-label="${tr("Työkalun asetukset", "Tool settings")}" title="${tr("Tähän työkaluun liittyvät asetukset", "Settings related to this tool")}">${icon("gear")}</button>
      <div class="menu right settings-pop" data-quick hidden>${quickSettingsHtml(t.id)}</div>
    </div>` : "";
  const tools = t.id === "projects" ? "" : `${quick}
    <button class="btn" data-act="ask" title="${tr("Kysy avustajalta tästä työkalusta (Ctrl+I)", "Ask the assistant about this tool (Ctrl+I)")}">${icon("spark")} ${tr("Kysy", "Ask")}</button>
    <div class="menu-wrap">
      <button class="icon-btn" data-menu aria-haspopup="menu" aria-expanded="false" aria-label="${tr("Lisää toimintoja", "More actions")}" title="${tr("Lisää toimintoja", "More actions")}">⋯</button>
      <div class="menu right" role="menu" hidden>
        <button role="menuitem" data-act="copy">${tr("Kopioi tulokset", "Copy results")}</button>
        <button role="menuitem" data-act="print">${tr("Tulosta raportti / PDF", "Print report / PDF")}</button>
        <button role="menuitem" data-act="fav">${fav ? tr("Poista suosikeista", "Remove from favourites") : tr("Lisää suosikkeihin", "Add to favourites")}</button>
      </div>
    </div>`;
  return `<div class="page-head">
    <div><h1>${t.name}${t.id === "projects" ? "" : ` <button class="fav ${fav ? "on" : ""}" data-act="fav" aria-pressed="${fav}" title="${fav ? tr("Poista suosikeista", "Remove from favourites") : tr("Lisää suosikkeihin", "Add to favourites")}">★</button>`}</h1><p>${t.desc}</p></div>
    <div class="actions">${examples}${extra}${tools}</div>
  </div>`;
}

/* ----- Pika-asetukset: kunkin työkalun kannalta olennaiset yleiset asetukset ⚙-napin takana ----- */
// DH-konventio vaihdetaan DH-taulukon omasta valinnasta (yleinen asetus on vain uusien mallien oletus)
const KIN_SET = ["lengthUnit", "angleUnit", "rotationRep", "eulerOrder", "eulerFrame", "quatOrder", "frameLabels", "showAxes", "showGrid"];
const TOOL_SETTINGS = {
  fk: KIN_SET, ik: KIN_SET, dh: KIN_SET,
  traj: ["angleUnit", "lengthUnit", "realtime", "decimals", "plotPalette", "showGrid"],
  pid: ["decimals", "notation", "decimalSep", "plotPalette"],
  motor: ["torqueUnit", "angleUnit", "decimals", "notation", "decimalSep"],
  power: ["decimals", "notation", "decimalSep"],
  serial: ["plotPalette", "decimals", "decimalSep"],
  // Kohina ja reittisuunnittelun siemen ovat työkalujen omissa lisäasetuksissa (yleinen asetus on vain uuden tilan oletus)
  path: ["lengthUnit", "showGrid"],
  map: ["lengthUnit", "seed", "realtime", "pauseOnBlur"],
  sim2d: ["timestep", "integrator", "realtime", "seed", "pauseOnBlur", "lengthUnit", "angleUnit"],
  sim3d: ["upAxis", "lengthUnit", "angleUnit", "quatOrder", "frameLabels", "showGrid", "antialias"],
  rot: ["angleUnit", "quatOrder", "upAxis", "decimalSep"], // Euler-järjestys ja -tyyppi ovat työkalun omissa valinnoissa
  units: ["decimalSep", "notation"],
  nn2d: ["graphics", "plotPalette", "decimals", "decimalSep"],
  nn3d: ["graphics", "showGrid", "antialias", "plotPalette", "decimals"],
  build2d: ["graphics", "antialias"],
  build3d: ["graphics", "showGrid", "antialias"],
};
const fieldByKey = (k) => SECTIONS.flatMap((s) => s.fields || []).find((f) => f.key === k);

function quickSettingsHtml(id) {
  const rows = TOOL_SETTINGS[id].map(fieldByKey).filter(Boolean).map((f) => {
    const v = settings[f.key];
    let ctl;
    if (f.type === "select") ctl = `<select data-qs="${f.key}">${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
    else if (f.type === "toggle") ctl = `<label class="switch"><input type="checkbox" data-qs="${f.key}" ${v ? "checked" : ""}><span></span></label>`;
    else if (f.type === "range") ctl = `<input type="range" data-qs="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"><span class="range-val" data-qv="${f.key}">${f.fmt(+v)}</span>`;
    else ctl = `<input type="number" data-qs="${f.key}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}" style="width:90px">${f.suffix ? `<span class="note">${f.suffix}</span>` : ""}`;
    return `<div class="qs-row"><label>${f.label}</label><div class="qs-ctl">${ctl}</div></div>`;
  }).join("");
  return `<div class="menu-title">${tr("Tähän työkaluun liittyvät asetukset", "Settings for this tool")}</div>
    <div class="qs-list">${rows}</div>
    <div class="qs-foot"><span class="note">${tr("Muutokset koskevat kaikkia työkaluja.", "Changes apply to all tools.")}</span>
      <a href="#/settings" class="link-btn">${tr("Kaikki asetukset", "All settings")} →</a></div>`;
}

// Arvo tallennetaan heti; työkalu piirretään uudelleen, kun valikko suljetaan (valikko pysyy auki usean muutoksen ajan)
let quickDirty = false;
document.addEventListener("change", (e) => {
  const key = e.target.dataset?.qs;
  if (!key) return;
  const f = fieldByKey(key);
  let v = e.target.type === "checkbox" ? e.target.checked : e.target.value;
  if (f.type === "range" || f.type === "number") {
    v = +v;
    if (!Number.isFinite(v)) return;
    v = Math.min(f.max, Math.max(f.min, v));
  }
  set(key, v);
  quickDirty = true;
});
document.addEventListener("input", (e) => {
  const key = e.target.dataset?.qs;
  const f = key && fieldByKey(key);
  if (f?.type === "range") document.querySelector(`[data-qv="${key}"]`).textContent = f.fmt(+e.target.value);
});

/* ----- Suosikit ja viimeksi käytetyt (selaimeen, eivät kuulu projektiin) ----- */
const readList = (k) => { try { const v = JSON.parse(localStorage.getItem(k)); return Array.isArray(v) ? v.filter((id) => TOOLS.some((t) => t.id === id)) : []; } catch { return []; } };
const writeList = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
const favs = () => readList("robolab-favs");
const recents = () => readList("robolab-recent");

function toggleFav(id) {
  const f = favs();
  const on = !f.includes(id);
  writeList("robolab-favs", on ? [...f, id] : f.filter((x) => x !== id));
  renderNav();
  document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.route === currentRoute()));
  document.querySelectorAll('[data-act="fav"]').forEach((b) => {
    if (b.classList.contains("fav")) { b.classList.toggle("on", on); b.setAttribute("aria-pressed", on); }
    b.title = on ? tr("Poista suosikeista", "Remove from favourites") : tr("Lisää suosikkeihin", "Add to favourites");
    if (!b.classList.contains("fav")) b.textContent = b.title;
  });
  toast(on ? tr("Lisätty suosikkeihin", "Added to favourites") : tr("Poistettu suosikeista", "Removed from favourites"));
}

function rememberRecent(id) {
  if (["dashboard", "projects", "settings"].includes(id)) return;
  writeList("robolab-recent", [id, ...recents().filter((x) => x !== id)].slice(0, 6));
}

/* ----- Tulosten kopiointi ja raportti ----- */
function resultsText() {
  const t = TOOLS.find((x) => x.id === currentRoute());
  const lines = [`RoboLab — ${t?.name || ""}`, `${tr("Projekti", "Project")}: ${activeProject().name}`, new Date().toLocaleString(tr("fi-FI", "en-GB")), ""];
  // Työkalun oma yhteenveto (esim. yksikkömuunnin), jos sen tiedot eivät ole tavallisissa kentissä
  const own = t && TOOL_IMPL[t.id]?.resultsText?.();
  if (own) lines.push(own, "");
  // Syötteet: kenttien nimet ja arvot
  const inputs = [...document.querySelectorAll("#content .field")].map((f) => {
    const label = f.querySelector("label")?.childNodes[0]?.textContent?.trim();
    const ctl = f.querySelector("select, input[type=number], input[type=text], input[type=checkbox]");
    if (!label || !ctl) return null;
    const unit = f.querySelector(".num i")?.textContent || "";
    // Kaksi lukukenttää samassa rivissä (esim. trajektorin alku → loppu): molemmat mukaan
    const pair = [...f.querySelectorAll("input[type=number], input[type=text]")];
    const val = ctl.tagName === "SELECT" ? ctl.selectedOptions[0]?.textContent : ctl.type === "checkbox" ? (ctl.checked ? tr("kyllä", "yes") : tr("ei", "no"))
      : pair.length === 2 ? `${pair[0].value} → ${pair[1].value}` : ctl.value;
    return `  ${label}: ${val}${unit ? " " + unit : ""}`;
  }).filter(Boolean);
  if (inputs.length) lines.push(tr("Syötteet:", "Inputs:"), ...inputs, "");
  const res = [...document.querySelectorAll("#content .result")].map((r) => {
    const k = r.querySelector(".k")?.textContent.trim(), v = r.querySelector(".v")?.innerText.replace(/\s+/g, " ").trim(), s = r.querySelector(".s")?.textContent.trim();
    return `  ${k}: ${v}${s ? ` (${s})` : ""}`;
  });
  if (res.length) lines.push(tr("Tulokset:", "Results:"), ...res, "");
  // Taulukot (DH-parametrit, TF-kehykset, kuormat, vertailu): solun kenttä tai teksti, poistonapit pois
  const cellText = (c) => {
    const x = c.querySelector("input:not([type=checkbox]):not([type=hidden]), select");
    if (x) return (x.tagName === "SELECT" ? x.selectedOptions[0]?.textContent : x.value) || "";
    return c.querySelector("button") && !c.textContent.replace(/[✕×]/g, "").trim() ? null : c.textContent.trim();
  };
  const tables = [...document.querySelectorAll("#content table")].map((tb) => [...tb.rows]
    .map((r) => [...r.cells].map(cellText).filter((s) => s !== null).join("\t")).filter((l) => l.trim()).map((l) => "  " + l).join("\n")).filter(Boolean);
  if (tables.length) lines.push(tr("Taulukot:", "Tables:"), ...tables, "");
  const al = [...document.querySelectorAll("#content .alert span")].map((a) => "  • " + a.textContent.trim());
  if (al.length) lines.push(tr("Huomiot:", "Notes:"), ...al);
  return lines.join("\n");
}

async function copyResults() {
  const text = resultsText();
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(ta); ta.select(); document.execCommand("copy"); ta.remove();
  }
  toast(tr("Tulokset kopioitu leikepöydälle", "Results copied to clipboard"));
}

function printReport() {
  const t = TOOLS.find((x) => x.id === currentRoute());
  const head = document.createElement("div");
  head.className = "print-head";
  head.textContent = `RoboLab · ${t?.name || ""} · ${activeProject().name} · ${new Date().toLocaleString(tr("fi-FI", "en-GB"))}`;
  $("#content").prepend(head);
  // Kuvaajat piirretään uudelleen tulostusasettelun leveyteen
  window.dispatchEvent(new Event("resize"));
  setTimeout(() => { window.print(); head.remove(); window.dispatchEvent(new Event("resize")); }, 120);
}

/* ----- Otsikkorivin valikot ja napit (yksi delegoitu kuuntelija) ----- */
function closeMenus(except) {
  document.querySelectorAll(".menu-wrap .menu:not([hidden])").forEach((m) => {
    if (m === except) return;
    m.hidden = true;
    m.previousElementSibling?.setAttribute("aria-expanded", "false");
    if (m.hasAttribute("data-quick") && quickDirty) {
      quickDirty = false;
      const top = $("#content").scrollTop;
      setTimeout(() => { router(); $("#content").scrollTop = top; }, 0);
    }
  });
}

document.addEventListener("click", (e) => {
  const menuBtn = e.target.closest("[data-menu]");
  if (menuBtn) {
    const menu = menuBtn.nextElementSibling;
    closeMenus(menu);
    menu.hidden = !menu.hidden;
    menuBtn.setAttribute("aria-expanded", String(!menu.hidden));
    if (!menu.hidden) menu.querySelector("button, select, input")?.focus();
    return;
  }
  if (!e.target.closest(".menu")) closeMenus();
  const infoBtn = e.target.closest("[data-info]");
  if (infoBtn) {
    const pop = infoBtn.closest(".field").querySelector(".info-pop");
    pop.hidden = !pop.hidden;
    infoBtn.setAttribute("aria-expanded", String(!pop.hidden));
    return;
  }
  const ex = e.target.closest("[data-ex]");
  if (ex) {
    const impl = TOOL_IMPL[currentRoute()];
    const item = impl?.examples?.[+ex.dataset.ex];
    if (!item) return;
    closeMenus();
    item.apply();
    router();
    toast(tr("Esimerkki: ", "Example: ") + item.name);
    return;
  }
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act) return;
  closeMenus();
  const id = currentRoute();
  if (act === "fav") toggleFav(id);
  else if (act === "copy") copyResults();
  else if (act === "print") printReport();
  else if (act === "ask") {
    const t = TOOLS.find((x) => x.id === id);
    window.Assistant?.prefill(tr(`Selitä ${t.name}-työkalun nykyiset tulokset ja kerro, mitä kannattaisi muuttaa.`, `Explain the current results of the ${t.name} tool and what I should change.`));
  }
});

// Valikoissa nuolinäppäimet ja Esc
document.addEventListener("keydown", (e) => {
  const menu = e.target.closest?.(".menu");
  if (!menu) return;
  // Asetuspaneelissa nuolet kuuluvat valintakentille; vain Esc suljetaan täällä
  if (menu.hasAttribute("data-quick")) {
    if (e.key === "Escape") { e.stopPropagation(); closeMenus(); menu.previousElementSibling?.focus(); }
    return;
  }
  const items = [...menu.querySelectorAll("button")];
  const i = items.indexOf(e.target);
  if (e.key === "ArrowDown") { e.preventDefault(); items[(i + 1) % items.length].focus(); }
  else if (e.key === "ArrowUp") { e.preventDefault(); items[(i - 1 + items.length) % items.length].focus(); }
  else if (e.key === "Escape") { e.stopPropagation(); closeMenus(); menu.previousElementSibling?.focus(); }
}, true);

function downloadFile(name, text, type = "application/json") {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/* ===== Seuraava askel =====
   Työkalun alle näytetään linkit luontevaan jatkotyökaluun. prepare() siirtää tarvittaessa tietoa mukana. */
const NEXT_STEPS = {
  fk: [["ik", tr("Raahaa kohdetta ja ratkaise nivelkulmat", "Drag a target and solve the joint angles")], ["dh", tr("Muokkaa käsivarren mittoja", "Edit the arm's dimensions")], ["traj", tr("Suunnittele sileä liike asennosta toiseen", "Plan a smooth move between poses")]],
  ik: [["traj", tr("Aja käsivarsi tähän asentoon sileällä liikkeellä", "Drive the arm to this pose with a smooth motion"), () => {
    const arm = window.loadArmModel(), st = getToolState("traj", {});
    const n = arm.q.length;
    const start = Array.isArray(st.armStart) && st.armStart.length === n ? st.armStart : arm.chain.joints.map((j) => Math.min(j.max, Math.max(j.min, 0)));
    saveToolState("traj", { ...st, mode: "arm", armStart: start, armEnd: [...arm.q] });
  }], ["fk", tr("Tarkastele asentoa ja muunnosmatriiseja", "Inspect the pose and transforms")]],
  dh: [["fk", tr("Liikuta niveliä", "Move the joints")], ["ik", tr("Ratkaise nivelkulmat kohteelle", "Solve joint angles for a target")], ["sim3d", tr("Kiinnitä käsivarsi robotin TF-puuhun", "Attach the arm to a robot's TF tree"), () => {
    const st = getToolState("sim3d", {});
    saveToolState("sim3d", { ...st, mode: "tf", armFrame: st.armFrame || "arm_base" });
  }]],
  pid: [["traj", tr("Suunnittele liike, jota säädin seuraa", "Plan the motion the controller follows")], ["sim2d", tr("Kokeile PID-suuntasäätöä mobiilirobotissa", "Try PID heading control on a mobile robot")]],
  traj: [["fk", tr("Tarkastele käsivarren asentoa", "Inspect the arm pose")], ["pid", tr("Viritä säädin seuraamaan liikettä", "Tune a controller to track the motion")]],
  // Käsivarren nivelen mitoituksen jälkeen jatketaan käsivarren työkaluihin, pyörärobotin jälkeen mobiilirobottiin
  motor: () => (getToolState("motor", {}).kind === "joint"
    ? [["power", tr("Mitoita akku ja säädin näille moottoreille", "Size the battery and regulator for these motors"), "importMotors"], ["traj", tr("Suunnittele nivelen liike ja vertaa nopeuksia", "Plan the joint's motion and compare speeds")], ["ik", tr("Kokeile käsivarren asentoja", "Try out arm poses")]]
    : [["power", tr("Mitoita akku ja säädin näille moottoreille", "Size the battery and regulator for these motors"), "importMotors"], ["sim2d", tr("Aja robottia simulaatiossa", "Drive the robot in simulation")]]),
  power: [["motor", tr("Tarkista moottorien virrankulutus", "Check the motors' current draw")], ["serial", tr("Mittaa todelliset virrat sarjaportilla", "Measure real currents over the serial port")]],
  serial: [["pid", tr("Viritä säädin mitatun datan perusteella", "Tune a controller from measured data")], ["power", tr("Vertaa mittauksia sähkölaskelmaan", "Compare measurements to the power budget")]],
  path: [["sim2d", tr("Aja robotti tällä kartalla", "Drive a robot on this map")], ["map", tr("Kartoita sama ympäristö lidarilla", "Map the same world with lidar")]],
  map: [["path", tr("Muokkaa karttaa", "Edit the map")], ["sim2d", tr("Aja robotti samalla kartalla", "Drive a robot on the same map")]],
  sim2d: [["path", tr("Muokkaa karttaa tai vaihda oletuskarttaan", "Edit the map or switch to the default map")], ["map", tr("Kartoita ympäristö lidarilla", "Map the world with lidar")], ["motor", tr("Mitoita moottorit tälle nopeudelle", "Size motors for this speed")]],
  sim3d: [["dh", tr("Rakenna oma robottikäsivarsi", "Build your own robot arm")], ["rot", tr("Muunna rotaatioita eri esitysten välillä", "Convert rotations between formats")]],
  rot: [["sim3d", tr("Rakenna TF-puu kehyksistä", "Build a TF tree from frames")], ["fk", tr("Katso rotaatiot robottikäsivarressa", "See rotations on a robot arm")]],
  units: [["motor", tr("Laske moottorin suorituskyky", "Compute motor performance")], ["power", tr("Laske sähköjärjestelmä", "Compute the power system")]],
  // Rakentaja ↔ simulaatio: robotti kulkee mukana (RSBridge määritellään tools/nn.js- ja tools/builder.js-tiedostoissa)
  build2d: [["nn2d", tr("Kouluta tämä robotti neuroverkkosimulaatiossa", "Train this robot in the neural network simulation"), () => RSBridge.builderToSim("2d")], ["build3d", tr("Rakenna 3D-versio", "Build a 3D version")]],
  build3d: [["nn3d", tr("Kouluta tämä robotti neuroverkkosimulaatiossa", "Train this robot in the neural network simulation"), () => RSBridge.builderToSim("3d")], ["sim3d", tr("Katso URDF-malleja ja TF-puuta", "View URDF models and the TF tree")]],
  nn2d: [["build2d", tr("Muokkaa robottia hiirellä rakentajassa", "Edit the robot with the mouse in the builder"), () => RSBridge.simToBuilder("2d")], ["nn3d", tr("Kokeile samaa 3D-fysiikalla", "Try the same with 3D physics")]],
  nn3d: [["build3d", tr("Muokkaa robottia hiirellä rakentajassa", "Edit the robot with the mouse in the builder"), () => RSBridge.simToBuilder("3d")], ["pid", tr("Vertaa perinteiseen säätöön (PID)", "Compare with classic control (PID)")]],
};

// Työkalun seuraavat askeleet (voi riippua työkalun tilasta, esim. moottorilaskurin nivel- tai pyörätila)
const nextSteps = (route) => (typeof NEXT_STEPS[route] === "function" ? NEXT_STEPS[route]() : NEXT_STEPS[route]);

function nextStepsHtml(route) {
  const steps = nextSteps(route);
  if (!steps) return "";
  return `<section class="next-steps" aria-label="${tr("Seuraava askel", "Next step")}">
    <h2 class="section-title">${tr("Seuraava askel", "Next step")}</h2>
    <div class="next-list">${steps.map(([to, label], i) => {
      const t = TOOLS.find((x) => x.id === to);
      return `<button class="next-card" data-next="${i}">${icon(t.icon)}<span><b>${t.name}</b><small>${label}</small></span><span aria-hidden="true">→</span></button>`;
    }).join("")}</div>
  </section>`;
}

// Työkalut piirtävät itsensä uudelleen (esim. "Palauta oletukset"), joten alaosa lisätään aina tarvittaessa uudelleen
const footerObserver = new MutationObserver(() => {
  const content = $("#content"), route = currentRoute();
  if (!TOOL_IMPL[route] || content.querySelector(".next-steps") || !content.querySelector(".page-head")) return;
  content.insertAdjacentHTML("beforeend", nextStepsHtml(route));
});

document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-next]");
  if (!b) return;
  const [to, , prep] = nextSteps(currentRoute())[+b.dataset.next];
  // Valmistelu voi estää siirtymisen (esim. rakentajan robotissa on virheitä tai käyttäjä perui korvauksen)
  if (typeof prep === "function") {
    const r = prep();
    if (r === false) return;
    if (r && typeof r.then === "function") { r.then((ok) => { if (ok !== false) location.hash = "#/" + to; }); return; }
  }
  location.hash = "#/" + to;
  // Kohdetyökalu voi tarjota saapumistoiminnon (esim. moottorien tuonti sähkölaskelmaan)
  if (typeof prep === "string") setTimeout(() => TOOL_IMPL[to]?.[prep]?.(), 50);
});

// Tiedostonvalinnan napit (label + piilotettu tiedostokenttä): näppäimistöllä Enter tai välilyönti avaa valinnan
document.addEventListener("keydown", (e) => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches?.('label.btn[role="button"]')) {
    e.preventDefault();
    e.target.querySelector('input[type="file"]')?.click();
  }
});

/* ===== Navigaatio ===== */
// Opettajille-sivu näkyy listoissa vain opettajille (Teacher-taso); suora linkki näyttää tasoesittelyn
const toolListed = (t) => t.nav !== false && (t.id !== "teach" || !window.Plans || Plans.canTeach());

// Valikossa näkyvät vain avoimet työkalut; lukitut kootaan yhteen riviin (ne näkyvät etusivun hakemistossa ja Tasot-sivulla)
const navShown = (t) => toolListed(t) && (!window.Plans || Plans.canTool(t.id));

function renderNav() {
  const groups = {};
  const f = favs();
  if (f.length) groups[tr("Suosikit", "Favourites")] = f.map((id) => TOOLS.find((t) => t.id === id)).filter((t) => t && navShown(t));
  if (!groups[tr("Suosikit", "Favourites")]?.length) delete groups[tr("Suosikit", "Favourites")];
  TOOLS.filter(navShown).forEach((t) => (groups[t.group] ||= []).push(t));
  const locked = TOOLS.filter((t) => toolListed(t) && !navShown(t)).length;
  $("#nav").innerHTML = Object.entries(groups).map(([g, items]) => `
    <div class="nav-group-title">${g}</div>
    ${items.map((t) => `
      <a href="#/${t.id}" class="nav-item ${isReady(t) ? "" : "planned"} ${t.id === "teach" ? "nav-teach" : ""}" data-route="${t.id}" data-tip="${esc(t.name)}">
        ${icon(t.icon)}<span class="label">${t.name}</span>
      </a>`).join("")}
  `).join("") + (locked ? `
    <a href="#/plans" class="nav-item nav-more" data-route="plans" data-tip="${tr("Lukitut työkalut", "Locked tools")}">
      ${icon("star")}<span class="label">${tr(`Lukitut työkalut (${locked})`, `Locked tools (${locked})`)}</span><span class="nav-lock" aria-hidden="true">🔒</span>
    </a>` : "");
}

let currentImpl = null;
let renderSeq = 0; // kasvaa joka sivunvaihdossa: myöhästynyt asynkroninen virhe ei koske uutta sivua

// Työkalun tallennetut tilat (useampi työkalu voi jakaa saman, esim. käsivarsi ja kartta)
const STATE_KEYS = { fk: ["arm"], ik: ["ik", "arm"], dh: ["arm"], traj: ["traj", "arm"], map: ["occ", "map"], path: ["path", "map"], sim2d: ["sim2d", "map"],
  // Neuroverkon painot (…Brain) ovat isoja eivätkä kerro avustajalle mitään; koulutuksen tilanne on …Stats-avaimessa
  nn2d: ["nn2d", "nn2dStats"], nn3d: ["nn3d", "nn3dStats"] };

function showToolError(content, tool, route, err) {
  content.innerHTML = `${toolHead(tool)}
    ${alertsHtml([{ level: "err", text: tr(`Työkalun avaaminen epäonnistui, todennäköisesti virheellisen tallennetun tiedon vuoksi (${err?.message || err}).`, `The tool could not be opened, probably because of invalid saved data (${err?.message || err}).`) }])}
    <div class="row-actions"><button class="btn primary" id="tool-reset">${tr("Palauta työkalun oletukset tässä projektissa", "Reset this tool's defaults in this project")}</button></div>`;
  $("#tool-reset").onclick = () => {
    for (const k of STATE_KEYS[route] || [route]) delete activeProject().tools[k];
    saveProjects();
    router();
  };
}

function currentRoute() {
  return location.hash.replace(/^#\//, "") || "";
}

function router() {
  let route = currentRoute();
  if (!route) {
    route = settings.startPage === "last" ? (localStorage.getItem("robolab-last") || "dashboard") : settings.startPage;
    history.replaceState(null, "", "#/" + route);
  }
  // Oppilaslinkki #/course/<kurssi> avaa kurssin suoraan (opettaja jakaa sen Opettajille-sivulta)
  const deep = route.match(/^course\/([\w-]+)$/);
  if (deep) {
    history.replaceState(null, "", "#/learn");
    setTimeout(() => window.Courses?.start(deep[1]), 0);
    route = "learn";
  }
  // Jaettu robotti #/share/<data> (neuroverkkosimulaation Jaa linkkinä): avataan kysymällä uuteen projektiin
  const shared = route.match(/^share\/([\w-]+)$/);
  if (shared) {
    history.replaceState(null, "", "#/dashboard");
    setTimeout(() => window.RSShare?.open(shared[1]), 0);
    route = "dashboard";
  }
  let tool = TOOLS.find((t) => t.id === route);
  if (route !== "settings" && !tool) {
    route = "dashboard";
    tool = TOOLS.find((t) => t.id === route);
    history.replaceState(null, "", "#/" + route);
  }
  try { localStorage.setItem("robolab-last", route); } catch {}
  rememberRecent(route);

  document.querySelectorAll(".nav-item").forEach((a) => a.classList.toggle("active", a.dataset.route === route));
  const content = $("#content");
  currentImpl?.unmount?.();
  currentImpl = null;
  const seq = ++renderSeq;
  const proj = `<a href="#/projects" class="crumb-proj" title="${tr("Vaihda projektia", "Switch project")}">${esc(activeProject().name)}</a><span>/</span>`;
  const settingsName = tr("Asetukset", "Settings");
  if (route === "settings") {
    $("#crumbs").innerHTML = `<span>RoboLab</span><span>/</span><b>${settingsName}</b>`;
    content.innerHTML = settingsPage();
    bindSettings();
  } else if (route === "dashboard") {
    $("#crumbs").innerHTML = `${proj}<b>${tool.name}</b>`;
    content.innerHTML = dashboardPage();
  } else if (window.Plans && !Plans.canTool(route)) {
    // Lukittu työkalu: esittely ja päivitys (tilaustaso, plans.js)
    $("#crumbs").innerHTML = `${proj}<b>${tool.name}</b>`;
    content.innerHTML = Plans.lockedHtml(tool);
  } else if (TOOL_IMPL[route]) {
    $("#crumbs").innerHTML = `${proj}<b>${tool.name}</b>`;
    currentImpl = TOOL_IMPL[route];
    // Rikkinäinen tallennettu tila (esim. käsin muokattu tuonti) ei saa lukita työkalua pysyvästi.
    // Asynkronisen renderin (3D-kirjastojen lataus) virhe näytetään samoin, jos sama sivu on yhä auki.
    const impl = currentImpl;
    const fail = (err) => {
      console.error(err);
      try { impl.unmount?.(); } catch {}
      if (currentImpl === impl) currentImpl = null;
      showToolError(content, tool, route, err);
    };
    try {
      const r = impl.render(content, tool);
      if (r && typeof r.then === "function") r.catch((err) => { if (seq === renderSeq) fail(err); });
    } catch (err) {
      fail(err);
    }
  }
  content.scrollTop = 0;
  $("#app").classList.remove("mobile-open");
  document.title = (route === "settings" ? settingsName : tool.name) + " · RoboLab";
}

/* ===== Sivut ===== */
// Etusivu: yksi selvä pääpolku (kurssi), omat pikalinkit ja kaikki työkalut tiiviinä hakemistona.
// Sivupalkki listaa samat työkalut, joten etusivulla ei toisteta niiden pitkiä kuvauksia.
const STARTER_TOOLS = ["build2d", "sim2d", "motor", "pid", "path", "cv", "fk", "power"];

function dashboardPage() {
  const byId = (id) => TOOLS.find((t) => t.id === id);
  const open = (t) => !window.Plans || Plans.canTool(t.id);
  const teacher = window.Plans && Plans.canTeach();
  const acc = typeof Accounts !== "undefined" ? Accounts.current() : null;
  const courses = window.Courses?.list?.() || [];
  const started = courses.some((c) => c.progress > 0);
  const ac = window.Courses?.resumable?.() || window.Courses?.active();

  // Pääpolku: kesken oleva kurssi, ensimmäinen kurssi tai kurssilista
  const lead = ac ? {
    attr: `data-resume="${ac.id}"`, kicker: tr("Jatka siitä, mihin jäit", "Pick up where you left off"),
    title: esc(ac.title), text: tr(`Vaihe ${ac.step}/${ac.steps}`, `Step ${ac.step}/${ac.steps}`), btn: tr("Jatka kurssia", "Continue course"), pct: (ac.step - 1) / ac.steps,
  } : !started ? {
    attr: `data-resume="start"`, kicker: tr("Uusi täällä? Aloita tästä", "New here? Start here"),
    title: tr("Ensimmäinen kurssi: miten robotti toimii", "First course: how a robot works"),
    text: tr("Rakenna robotti, kokeile sitä fysiikalla ja ohjaa se maaliin. Noin 20 minuuttia, ei ohjelmointia eikä tiliä.", "Build a robot, try it with physics and drive it to a goal. About 20 minutes, no programming or account needed."),
    btn: tr("Aloita kurssi", "Start the course"),
  } : {
    attr: "data-learn", kicker: tr("Kurssit", "Courses"), title: tr("Valitse seuraava kurssi", "Choose your next course"),
    text: tr(`${courses.filter((c) => c.progress >= 1).length}/${courses.length} kurssia suoritettu.`, `${courses.filter((c) => c.progress >= 1).length}/${courses.length} courses completed.`), btn: tr("Kurssit", "Courses"),
  };
  const leadHtml = `
    <button class="card course-banner home-lead" ${lead.attr}>
      <div class="home-lead-bot">${window.Robots ? Robots.svg("volt", ac ? "happy" : "idle", { size: 64 }) : icon("book")}</div>
      <div class="home-lead-text"><small>${lead.kicker}</small><h2>${lead.title}</h2><p>${lead.text}</p>
        ${lead.pct != null ? `<div class="course-progress"><span style="width:${Math.round(lead.pct * 100)}%"></span></div>` : ""}</div>
      <span class="btn primary">${lead.btn} →</span>
    </button>`;
  // Luokkaan liittynyt oppilas: opettajan antamat kurssit näkyvät Kurssit-sivulla
  const cls = window.Plans?.classInfo?.();
  const classHtml = cls ? `<a class="home-note" href="#/learn">🏫 ${tr(`Luokka ${esc(cls.name || cls.code)}: opettajan antamat kurssit löytyvät Kurssit-sivulta`, `Class ${esc(cls.name || cls.code)}: your teacher's courses are on the Courses page`)} →</a>` : "";
  const teachHtml = teacher ? `
    <a class="card teach-banner" href="#/teach">
      <div class="card-icon">${icon("cap")}</div>
      <div><h3>${tr("Opettajan työkalut", "Teacher tools")}</h3>
        <p>${tr("Luokkahuoneet, oppilaiden eteneminen, valmiit oppitunnit ja monisteet.", "Classrooms, student progress, ready lessons and worksheets.")}</p></div>
      <span aria-hidden="true">→</span></a>` : "";

  // Pikalinkit: suosikit ja viimeksi käytetyt avoimet työkalut, aluksi hyvät aloitustyökalut
  const isTool = (t) => t && t.nav !== false && !["dashboard", "learn", "projects", "teach"].includes(t.id) && toolListed(t) && open(t);
  let quick = [...new Set([...favs(), ...recents()])].map(byId).filter(isTool);
  const quickTitle = quick.length ? tr("Omat työkalut", "Your tools") : tr("Hyviä aloitustyökaluja", "Good tools to start with");
  if (!quick.length) quick = STARTER_TOOLS.map(byId).filter(isTool);
  const quickHtml = `
    <h2 class="section-title">${quickTitle}</h2>
    <div class="home-quick">${quick.slice(0, 6).map((t) => `
      <a href="#/${t.id}" title="${esc(t.desc)}">${icon(t.icon)}<span>${t.name}</span>${favs().includes(t.id) ? `<span class="fav-mini" aria-label="${tr("Suosikki", "Favourite")}">★</span>` : ""}</a>`).join("")}</div>`;

  // Kaikki työkalut ryhmittäin nimilistana; lukitut näkyvät himmeinä tasomerkillä
  const groups = {};
  TOOLS.filter((t) => t.group !== G.general && toolListed(t)).forEach((t) => (groups[t.group] ||= []).push(t));
  const dirHtml = `
    <h2 class="section-title">${tr("Kaikki työkalut", "All tools")}</h2>
    <div class="home-dir">${Object.entries(groups).map(([g, items]) => `
      <section class="home-group"><h3>${g}</h3>
        ${items.map((t) => `<a href="#/${t.id}" class="${open(t) ? "" : "locked"}" title="${esc(t.desc)}">${icon(t.icon)}<span>${t.name}</span>${open(t) ? "" : Plans.badge(Plans.tierForTool(t.id))}</a>`).join("")}
      </section>`).join("")}</div>`;
  const upgradeHtml = window.Plans && Plans.current().plan === "free" ? `
    <a class="upgrade-banner" href="#/plans">⭐ ${tr("Osa työkaluista ja kursseista on lukittu. Opettajan luokkakoodilla saat Education-tason maksutta.", "Some tools and courses are locked. With your teacher's class code you get the Education plan for free.")}
      <span class="ub-go">${tr("Tasot ja hinnat", "Plans and pricing")} →</span></a>` : "";
  return `
    <div class="page-head">
      <div>
        <h1>${acc?.name ? tr(`Hei, ${esc(acc.name)}!`, `Hi, ${esc(acc.name)}!`) : tr("Tervetuloa RoboLabiin!", "Welcome to RoboLab!")}</h1>
        <p>${tr("Opi robotiikkaa kursseilla tai kokeile työkaluja vapaasti.", "Learn robotics on the courses or try the tools freely.")}</p>
      </div>
    </div>
    ${teachHtml}
    ${leadHtml}
    ${classHtml}
    ${quickHtml}
    ${dirHtml}
    ${upgradeHtml}
    <p class="note dash-links"><a href="https://github.com/0ippi/RoboLab#readme" target="_blank" rel="noopener">${tr("Ohjeet", "Docs")}</a>
      · <a href="https://github.com/0ippi/RoboLab/issues" target="_blank" rel="noopener">${tr("Ilmoita ongelmasta", "Report a problem")}</a>
      · <a href="tietosuoja.html" target="_blank" rel="noopener">${tr("Tietosuojaseloste", "Privacy policy")}</a></p>
  `;
}

document.addEventListener("click", (e) => {
  if (e.target.closest("[data-learn]")) { location.hash = "#/learn"; return; }
  const resume = e.target.closest("[data-resume]");
  if (resume) { Courses.start(resume.dataset.resume); return; }
});

function axisColor(i) {
  return (settings.axisColors === "cmy" ? ["#e69f00", "#56b4e9", "#cc79a7"] : ["#f2555a", "#3ecf8e", "#4c8dff"])[i];
}

const fieldVisible = (f) => settings.advanced || !ADVANCED.has(f.key);

function visibleSections() {
  return SECTIONS.filter((s) => settings.advanced
    || (!ADVANCED_SECTIONS.has(s.id) && (s.custom || (s.fields || []).some(fieldVisible))));
}

function settingsPage() {
  const sections = visibleSections();
  return `
    <div class="page-head">
      <div><h1>${tr("Asetukset", "Settings")}</h1><p>${tr("Mukauta ulkoasua, yksiköitä ja simulaatioiden oletuksia.", "Customise appearance, units and simulation defaults.")}</p></div>
      <label class="adv-toggle">
        <span><b>${tr("Lisäasetukset", "Advanced settings")}</b><small>${tr("Näytä kaikki asetukset", "Show all settings")}</small></span>
        <span class="switch"><input type="checkbox" id="advanced" ${settings.advanced ? "checked" : ""}><span></span></span>
      </label>
    </div>
    <div class="settings">
      <nav class="settings-nav">
        ${sections.map((s, i) => `<a href="#" data-sec="${s.id}" class="${i ? "" : "active"}">${s.title}</a>`).join("")}
      </nav>
      <div class="settings-body">
        ${sections.map(sectionHtml).join("")}
      </div>
    </div>
  `;
}

// Työkalun omat pikanäppäimet näytetään yleisten edellä, kun työkalu on auki (työkalut lisäävät listansa tähän)
const TOOL_SHORTCUTS = {};
function shortcutsTable() {
  const rows = (list) => list.map(([a, k]) => `<tr><td>${a}</td><td>${kbdHtml(k)}</td></tr>`).join("");
  const own = TOOL_SHORTCUTS[currentRoute()];
  const tool = TOOLS.find((t) => t.id === currentRoute());
  return `<table class="shortcuts">${own ? `<tr><th colspan="2">${esc(tool?.name || "")}</th></tr>${rows(own)}<tr><th colspan="2">${tr("Koko sovellus", "Whole app")}</th></tr>` : ""}${rows(SHORTCUTS)}</table>`;
}

function sectionHtml(s) {
  let body = "";
  const rows = (s.fields || []).filter((f) => f.type !== "themes" && fieldVisible(f)).map(rowHtml).join("");
  const themeField = (s.fields || []).find((f) => f.type === "themes");
  if (s.custom === "shortcuts") body += `<div class="card set-list">${shortcutsTable()}</div>`;
  if (themeField) {
    // Kieli ensin, sitten teemat, sitten muut ulkoasuasetukset
    const lang = (s.fields || []).find((f) => f.key === "language");
    body += `<div class="card set-list" style="margin-bottom:var(--pad)">${rowHtml(lang)}</div>`;
    body += `<div class="card set-list" style="margin-bottom:var(--pad)">${themesHtml()}</div>`;
    body += `<div class="card set-list">${(s.fields || []).filter((f) => f.type !== "themes" && f.key !== "language" && fieldVisible(f)).map(rowHtml).join("")}</div>`;
  } else if (rows || s.custom === "data" || s.custom === "ai" || s.custom === "updates") {
    body += `<div class="card set-list">${s.custom === "ai" ? aiKeyRows() : ""}${s.custom === "updates" ? updateRows() : ""}${rows}${s.custom === "data" ? dataRows() : ""}</div>`;
  }
  return `<section class="set-section" id="sec-${s.id}"><h2>${s.title}</h2><p>${s.desc}</p>${body}</section>`;
}

function themesHtml() {
  return `<div class="themes">${THEMES.map((t) => {
    const c = t.colors;
    const preview = c
      ? `<div class="preview" style="background:${c[1]}"><div class="s" style="background:${c[0]};border-right:1px solid ${c[3]}"></div>
           <div class="m"><i style="background:${c[2]};width:55%"></i><i style="background:${c[3]};width:80%"></i><i style="background:${c[3]};width:65%"></i></div></div>`
      : `<div class="preview" style="background:linear-gradient(135deg,#ffffff 50%,#181b21 50%)"></div>`;
    return `<button class="theme-card ${settings.theme === t.id ? "active" : ""}" data-theme-id="${t.id}">
      ${preview}<div class="name">${t.name}${settings.theme === t.id ? "<span>✓</span>" : ""}</div></button>`;
  }).join("")}</div>`;
}

function rowHtml(f) {
  const v = settings[f.key];
  let ctl = "";
  switch (f.type) {
    case "toggle":
      ctl = `<label class="switch"><input type="checkbox" data-key="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" ${v ? "checked" : ""}><span></span></label>`;
      break;
    case "select":
      ctl = `<select data-key="${f.key}" aria-label="${esc(String(f.label ?? f.key))}">${f.options.map(([val, lab]) => `<option value="${esc(val)}" ${String(v) === String(val) ? "selected" : ""}>${esc(lab)}</option>`).join("")}</select>`;
      break;
    case "range":
      ctl = `<input type="range" data-key="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}"><span class="range-val" id="rv-${f.key}">${f.fmt(+v)}</span>`;
      break;
    case "number":
      ctl = `<input type="number" data-key="${f.key}" aria-label="${esc(String(f.label ?? f.key))}" min="${f.min}" max="${f.max}" step="${f.step}" value="${v}">${f.suffix ? `<span class="range-val" style="min-width:0">${f.suffix}</span>` : ""}`;
      break;
    case "swatches":
      ctl = `<div class="swatches">${ACCENTS.map((c) => `<button class="swatch ${c ? "" : "auto"} ${v === c ? "active" : ""}" data-accent="${c}" style="${c ? "background:" + c : ""}" title="${c || tr("Teeman oletus", "Theme default")}" aria-label="${c || tr("Teeman oletus", "Theme default")}"></button>`).join("")}</div>`;
      break;
  }
  return `<div class="set-row"><div class="txt"><b>${f.label}</b>${f.desc ? `<span>${f.desc}</span>` : ""}</div><div class="ctl">${ctl}</div></div>`;
}

/* ----- Tekoälyavustajan API-avain -----
   Tallennetaan erikseen (ei asetuksiin), jotta se ei päädy asetusten vientitiedostoon. */
const AI_KEY = "robolab-ai-key";
const getAiKey = () => { try { return localStorage.getItem(AI_KEY) || ""; } catch { return ""; } };

function aiKeyRows() {
  const has = !!getAiKey();
  const st = window.Assistant?.localStatus?.() || {};
  return `
    <div class="set-row"><div class="txt"><b>${tr("Ilmainen Volt", "Free Volt")}</b>
      <span>${has ? tr("Käytössä on Claude API -avain, joten Volt vastaa Claudella. Poista avain, niin Volt käyttää ilmaista mallia.", "A Claude API key is saved, so Volt answers with Claude. Remove the key to use the free model.")
        : st.ready ? tr("Malli on ladattu ja käytössä.", "The model is loaded and in use.")
        : tr("Malli ladataan ensimmäisellä kysymyksellä (kerran), minkä jälkeen se toimii myös ilman nettiä. Voit ladata sen myös nyt.", "The model downloads on your first question (once) and then also works offline. You can also download it now.")}</span></div>
      <div class="ctl">${has || settings.voltModel === "off" ? "" : st.ready ? `<span class="badge ok">${tr("valmis", "ready")}</span>`
        : `<button class="btn" id="ai-local-dl">${icon("download")} ${tr("Lataa nyt", "Download now")}</button>`}</div></div>
    <div class="set-row"><div class="txt"><b>${tr("Claude API -avain", "Claude API key")}</b>
      <span>${has ? tr("Avain on tallennettu tähän selaimeen.", "A key is saved in this browser.")
        : tr("Vapaaehtoinen päivitys: avaimella Volt vastaa Claudella, joka on ilmaista mallia selvästi taitavampi. Avaimen saat osoitteesta console.anthropic.com.", "Optional upgrade: with a key Volt answers with Claude, which is far more capable than the free model. Get a key at console.anthropic.com.")}</span>
      <span style="display:block;margin-top:4px">${tr("Avain tallennetaan vain tähän selaimeen eikä sitä viedä asetusten mukana. Älä käytä jaetulla koneella.", "The key is stored only in this browser and is never exported with settings. Do not use on a shared computer.")}</span></div>
      <div class="ctl">${has
        ? `<span class="badge ok">${tr("tallennettu", "saved")}</span><button class="btn danger" id="ai-key-del">${tr("Poista", "Remove")}</button>`
        : `<input type="password" id="ai-key" placeholder="sk-ant-…" autocomplete="off" style="width:180px"><button class="btn" id="ai-key-save">${tr("Tallenna", "Save")}</button>`}</div></div>`;
}

function dataRows() {
  return `
    <div class="set-row"><div class="txt"><b>${tr("Vie asetukset", "Export settings")}</b><span>${tr("Lataa asetukset JSON-tiedostona.", "Download settings as a JSON file.")}</span></div>
      <div class="ctl"><button class="btn" id="export">${icon("download")} ${tr("Vie", "Export")}</button></div></div>
    <div class="set-row"><div class="txt"><b>${tr("Tuo asetukset", "Import settings")}</b><span>${tr("Lataa aiemmin viety JSON-tiedosto.", "Load a previously exported JSON file.")}</span></div>
      <div class="ctl"><label class="btn" tabindex="0" role="button">${tr("Tuo…", "Import…")}<input type="file" id="import" accept="application/json" hidden></label></div></div>
    <div class="set-row"><div class="txt"><b>${tr("Palauta oletukset", "Reset to defaults")}</b><span>${tr("Nollaa kaikki asetukset alkuperäisiksi.", "Reset all settings to their defaults.")}</span></div>
      <div class="ctl"><button class="btn danger" id="reset">${tr("Palauta", "Reset")}</button></div></div>`;
}

function updateRows() {
  const cur = ROBOLAB_RELEASES[0];
  return `
    <div class="set-row"><div class="txt"><b>RoboLab ${esc(VERSION)}</b><span>${tr("Julkaistu", "Released")} ${esc(cur.date ? new Date(cur.date + "T12:00").toLocaleDateString(tr("fi-FI", "en-GB")) : "")}. ${esc(releaseNotes(cur)[0] || "")}</span></div>
      <div class="ctl"><button class="btn primary" id="upd-check">${tr("Tarkista päivitykset", "Check for updates")}</button></div></div>
    <div class="set-row"><div class="txt"><b>${tr("Mitä uutta", "What's new")}</b><span>${tr("Kaikki versiot ja niiden muutokset.", "All versions and their changes.")}</span></div>
      <div class="ctl"><button class="btn" id="upd-history">${tr("Näytä historia", "Show history")}</button></div></div>`;
}

function bindSettings() {
  $("#advanced").onchange = (e) => {
    const top = $("#content").scrollTop;
    set("advanced", e.target.checked);
    router();
    $("#content").scrollTop = top;
  };
  const body = $(".settings-body");
  body.addEventListener("input", (e) => {
    const el = e.target, key = el.dataset.key;
    if (!key) return;
    const field = SECTIONS.flatMap((s) => s.fields || []).find((f) => f.key === key);
    let val = el.type === "checkbox" ? el.checked : el.value;
    if (field.type === "range") { val = +val; $("#rv-" + key).textContent = field.fmt(val); }
    if (field.type === "number") {
      if (el.value === "" || isNaN(+val)) return;
      val = Math.min(field.max, Math.max(field.min, +val));
    }
    set(key, val);
  });
  body.addEventListener("click", (e) => {
    const theme = e.target.closest("[data-theme-id]");
    if (theme) { setTheme(theme.dataset.themeId); return; }
    const sw = e.target.closest("[data-accent]");
    if (sw) {
      set("accent", sw.dataset.accent);
      body.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
    }
  });
  const rerender = () => { const top = $("#content").scrollTop; router(); $("#content").scrollTop = top; };
  $("#ai-key-save")?.addEventListener("click", () => {
    const k = $("#ai-key").value.trim();
    if (!k) { $("#ai-key").classList.add("invalid"); return; }
    try { localStorage.setItem(AI_KEY, k); } catch {}
    toast(tr("API-avain tallennettu", "API key saved"));
    rerender();
  });
  $("#ai-local-dl")?.addEventListener("click", () => { Assistant.open(); Assistant.prepareLocal(); });
  $("#ai-key-del")?.addEventListener("click", () => {
    try { localStorage.removeItem(AI_KEY); } catch {}
    toast(tr("API-avain poistettu", "API key removed"));
    rerender();
  });
  $("#upd-check")?.addEventListener("click", async (e) => {
    e.target.disabled = true;
    await checkForUpdate(true);
    e.target.disabled = false;
  });
  $("#upd-history")?.addEventListener("click", showAllReleases);
  $("#export").onclick = exportSettings;
  $("#import").onchange = importSettings;
  $("#reset").onclick = () => {
    if (settings.confirmReset && !confirm(tr("Palautetaanko kaikki asetukset oletuksiin?", "Reset all settings to defaults?"))) return;
    settings = { ...DEFAULTS, language: LANG };
    persist(true); applySettings(); router();
    toast(tr("Asetukset palautettu oletuksiin", "Settings reset to defaults"));
  };

  // Osioiden navigaatio + aktiivisen osion seuranta
  const navLinks = [...document.querySelectorAll(".settings-nav a")];
  navLinks.forEach((a) => a.onclick = (e) => {
    e.preventDefault();
    $("#sec-" + a.dataset.sec).scrollIntoView({ behavior: settings.motion === "off" ? "auto" : "smooth" });
  });
  const obs = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (en.isIntersecting) navLinks.forEach((a) => a.classList.toggle("active", "sec-" + a.dataset.sec === en.target.id));
    });
  }, { root: $("#content"), rootMargin: "0px 0px -70% 0px" });
  document.querySelectorAll(".set-section").forEach((s) => obs.observe(s));
}

// Avaa asetukset ja vierittää osioon (avustaja ja haku käyttävät tätä)
function openSettingsSection(id) {
  const show = () => document.getElementById("sec-" + id)?.scrollIntoView({ block: "start" });
  if (currentRoute() === "settings") { show(); return; }
  location.hash = "#/settings";
  setTimeout(show, 60);
}

function setTheme(id) {
  set("theme", id);
  document.querySelectorAll(".themes").forEach((el) => (el.outerHTML = themesHtml()));
  toast(tr("Teema: ", "Theme: ") + THEMES.find((t) => t.id === id).name);
}

function exportSettings() {
  downloadFile(tr("robolab-asetukset.json", "robolab-settings.json"), JSON.stringify(settings, null, 2));
}

function importSettings(e) {
  const file = e.target.files[0];
  if (!file) return;
  file.text().then((txt) => {
    const data = sanitizeSettings(JSON.parse(txt));
    const langChanged = data.language && data.language !== LANG;
    Object.assign(settings, data);
    persist(true);
    if (langChanged) { location.reload(); return; }
    applySettings(); router();
    toast(tr("Asetukset tuotu", "Settings imported"));
  }).catch(() => toast(tr("Tiedoston lukeminen epäonnistui", "Could not read the file")));
}

/* ===== Tilarivi ===== */
let fps = 0;
function renderStatusbar() {
  const bar = $("#statusbar");
  const rep = { euler: "Euler " + settings.eulerOrder, quat: tr("Kvaternio", "Quaternion"), axisangle: tr("Akseli–kulma", "Axis–angle"), matrix: tr("Matriisi", "Matrix") }[settings.rotationRep];
  // Yksiköt ja simulaation asetukset vain edistyneessä tilassa: aloittelijalle ne ovat turhaa tekstiä
  bar.innerHTML = `
    ${settings.advanced ? `<span>${settings.lengthUnit} · ${settings.angleUnit === "deg" ? "deg" : "rad"} · ${settings.massUnit}</span>
    <span class="hide-sm">${rep}</span>
    <span class="hide-sm">${settings.upAxis}-${tr("ylös", "up")} · ${settings.handedness === "right" ? tr("oikeakätinen", "right-handed") : tr("vasenkätinen", "left-handed")}</span>
    <span class="hide-sm">dt ${settings.timestep} ms</span>` : ""}
    <span class="spacer"></span>
    ${saveStatusHtml()}
    <button class="sb-btn" id="sb-undo" title="${tr("Kumoa (Ctrl+Z)", "Undo (Ctrl+Z)")}" aria-label="${tr("Kumoa", "Undo")}">${icon("undo")}</button>
    <button class="sb-btn" id="sb-redo" title="${tr("Tee uudelleen (Ctrl+Y)", "Redo (Ctrl+Y)")}" aria-label="${tr("Tee uudelleen", "Redo")}">${icon("redo")}</button>
    <button class="sb-btn hide-sm" id="sb-keys" title="${tr("Pikanäppäimet (?)", "Shortcuts (?)")}" aria-label="${tr("Pikanäppäimet", "Shortcuts")}">${icon("keyboard")}</button>
    ${settings.showFps ? `<span id="fps">${fps} FPS</span>` : ""}
    <span>v${VERSION}</span>`;
  $("#sb-undo").onclick = () => undoRedo("undo");
  $("#sb-redo").onclick = () => undoRedo("redo");
  $("#sb-keys").onclick = openShortcuts;
}

(function fpsLoop() {
  let frames = 0, last = performance.now();
  function tick(now) {
    frames++;
    if (now - last >= 1000) {
      fps = Math.round((frames * 1000) / (now - last));
      frames = 0; last = now;
      const el = $("#fps");
      if (el) el.textContent = fps + " FPS";
    }
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
})();

/* ===== Pikanäppäinikkuna ===== */
function openShortcuts() {
  const d = $("#shortcuts-dialog");
  d.querySelector(".dlg-body").innerHTML = shortcutsTable();
  d.hidden = false;
  d.querySelector("button").focus();
}
function closeShortcuts() { $("#shortcuts-dialog").hidden = true; }

/* ===== Komentopaletti ===== */
let paletteItems = [], paletteSel = 0;

// Hakusanat työkaluille molemmilla kielillä (perusmuodot ja yleiset synonyymit)
const TOOL_KEYWORDS = {
  fk: "kinematiikka käsivarsi nivel robottikäsi forward kinematics arm joint manipulator",
  ik: "käänteinen kinematiikka kohde ratkaisu inverse kinematics target solver",
  dh: "denavit hartenberg taulukko parametri urdf table parameters",
  pid: "säädin säätö viritys askelvaste controller tuning step response feedback",
  traj: "liikerata trajektori profiili polynomi trapetsi s-käyrä trajectory profile motion",
  motor: "moottori vaihde välitys momentti nopeus rpm pyörä motor gear torque wheel",
  power: "akku virta jännite säädin johto sähkö lipo battery current voltage regulator wire",
  serial: "sarjaportti arduino esp32 uart anturi kuvaaja serial port sensor plot csv",
  path: "reitti reittisuunnittelu a* dijkstra rrt kartta path planning map maze",
  map: "lidar kartoitus kartta slam occupancy grid mapping",
  sim2d: "simulaatio robotti mobiili ajo odometria pure pursuit simulation mobile robot drive",
  sim3d: "3d tf kehys urdf ros malli frame model transform",
  rot: "rotaatio kvaternio euler matriisi kulma quaternion rotation matrix angle",
  units: "yksikkö muunnos newton tuuma rpm unit conversion convert",
  projects: "projekti tallennus vienti tuonti project save export import",
};

function commands() {
  const app = tr("Sovellus", "App");
  return [
    ...TOOLS.filter((t) => t.id !== "teach" || toolListed(t)).map((t) => ({ label: t.name, group: t.group, icon: t.icon, keywords: t.desc + " " + (TOOL_KEYWORDS[t.id] || ""), run: () => (location.hash = "#/" + t.id) })),
    { label: tr("Asetukset", "Settings"), group: app, icon: "gear", run: () => (location.hash = "#/settings") },
    ...SECTIONS.map((s) => ({ label: tr("Asetukset: ", "Settings: ") + s.title, group: app, icon: "gear", keywords: s.desc + " " + (s.fields || []).map((f) => f.label || "").join(" "), run: () => openSettingsSection(s.id) })),
    { label: tr("Tekoälyavustaja", "AI assistant"), group: app, icon: "spark", run: () => window.Assistant?.open() },
    { label: tr("Kumoa", "Undo"), group: app, icon: "undo", run: () => undoRedo("undo") },
    { label: tr("Tee uudelleen", "Redo"), group: app, icon: "redo", run: () => undoRedo("redo") },
    { label: tr("Vie projekti", "Export project"), group: app, icon: "download", run: exportActiveProject },
    { label: tr("Pikanäppäimet", "Keyboard shortcuts"), group: app, icon: "keyboard", run: openShortcuts },
    { label: tr("Näytä / piilota sivupalkki", "Show / hide sidebar"), group: app, icon: "sidebar", run: toggleSidebar },
  ];
}

function openPalette() {
  $("#palette").hidden = false;
  const input = $("#palette-input");
  input.value = "";
  filterPalette("");
  input.focus();
}
function closePalette() { $("#palette").hidden = true; }

/* ----- Sumea haku: sietää kirjoitusvirheet, ääkköset ja sanojen järjestyksen ----- */
const normalize = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const wordsOf = (s) => normalize(s).split(/[^a-z0-9*]+/).filter(Boolean);

// Damerau–Levenshtein (vierekkäisten kirjainten vaihto = 1 virhe), katkaistaan kun raja ylittyy
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

// Pisteet yhdelle hakusanalle sanalistaa vasten: alku > sisältyy > kirjoitusvirhe
function tokenScore(tok, words) {
  let best = 0;
  for (const w of words) {
    if (w.startsWith(tok)) best = Math.max(best, 3);
    else if (tok.length >= 3 && w.includes(tok)) best = Math.max(best, 2);
    else if (tok.length >= 4) {
      const max = tok.length >= 7 ? 2 : 1;
      // Verrataan myös sanan alkuun, jotta keskeneräinen sana löytyy ("kinemtaik" → "kinematiikka")
      let dist = Math.min(editDistance(tok, w, max), editDistance(tok, w.slice(0, tok.length), max));
      // Yhdyssanan osat: verrataan saman mittaisiin pätkiin sanan sisällä ("suunitelu" → "reittisuunnittelu")
      if (dist > max && tok.length >= 5 && w.length > tok.length) {
        for (let i = 1; i < w.length - 2 && dist > max; i++) {
          for (let len = tok.length - max; len <= tok.length + max && dist > max; len++) dist = Math.min(dist, editDistance(tok, w.slice(i, i + len), max));
        }
      }
      if (dist <= max) best = Math.max(best, 1);
    }
  }
  return best;
}

function fuzzyScore(query, c) {
  const toks = wordsOf(query);
  if (!toks.length) return 1;
  const name = wordsOf(c.label + " " + c.group), kw = wordsOf(c.keywords || "");
  let total = 0;
  for (const t of toks) {
    const s = Math.max(tokenScore(t, name) * 2, tokenScore(t, kw));
    if (!s) return 0; // jokaisen hakusanan pitää osua johonkin
    total += s;
  }
  return total;
}

function filterPalette(q) {
  const all = commands();
  paletteItems = all.map((c) => [c, fuzzyScore(q, c)]).filter(([, s]) => s > 0)
    .sort((a, b) => b[1] - a[1]).map(([c]) => c);
  paletteSel = 0;
  drawPalette();
}
function drawPalette() {
  $("#palette-list").innerHTML = paletteItems.length
    ? paletteItems.map((c, i) => `<li class="${i === paletteSel ? "sel" : ""}" data-i="${i}">${icon(c.icon)}<span>${esc(c.label)}</span><span class="grp">${c.group}</span></li>`).join("")
    : `<li>${tr("Ei tuloksia — kokeile tekoälyavustajaa (Ctrl+I)", "No results — try the AI assistant (Ctrl+I)")}</li>`;
  $("#palette-list .sel")?.scrollIntoView({ block: "nearest" });
}
function runPalette(i) {
  const c = paletteItems[i];
  if (!c) return;
  closePalette();
  c.run();
}

$("#palette-input").addEventListener("input", (e) => filterPalette(e.target.value));
$("#palette-input").addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") { paletteSel = Math.min(paletteItems.length - 1, paletteSel + 1); drawPalette(); e.preventDefault(); }
  else if (e.key === "ArrowUp") { paletteSel = Math.max(0, paletteSel - 1); drawPalette(); e.preventDefault(); }
  else if (e.key === "Enter") runPalette(paletteSel);
});
$("#palette-list").addEventListener("click", (e) => { const li = e.target.closest("[data-i]"); if (li) runPalette(+li.dataset.i); });
$("#palette").addEventListener("mousedown", (e) => { if (e.target.id === "palette") closePalette(); });
$("#palette-open").onclick = openPalette;
$("#shortcuts-dialog").addEventListener("mousedown", (e) => { if (e.target.id === "shortcuts-dialog") closeShortcuts(); });
$("#shortcuts-dialog button").onclick = closeShortcuts;

/* ===== Muut toiminnot ===== */
// Kurssin oppituntipaneelin ollessa auki sivupalkki kapenee kuvakkeiksi, jotta työkalu mahtuu kahteen sarakkeeseen
// (säätimet näkymän vieressä). Käyttäjän oma asetus ei muutu, ja sivupalkin voi silti avata (Ctrl+B).
function applySidebar() { $("#app").classList.toggle("collapsed", !!settings.sidebarCollapsed || lessonNarrow); }
function setLessonLayout(on) { lessonNarrow = on; applySidebar(); }
window.setLessonLayout = setLessonLayout;

function toggleSidebar() {
  if (matchMedia("(max-width: 860px)").matches) $("#app").classList.toggle("mobile-open");
  else if (lessonNarrow && !settings.sidebarCollapsed) setLessonLayout(false);
  else set("sidebarCollapsed", !settings.sidebarCollapsed);
}

/* ===== Opastuskierros: lyhyet kuplat työkalun tärkeimpien kohtien vieressä ensimmäisellä käyttökerralla =====
   Ei peitä sivua eikä estä käyttöä: kupla on kohteen vieressä, ja Ohita lopettaa. Nähdyt kierrokset: robolab-tips. */
const TIPS_KEY = "robolab-tips";
function tipsSeen(id) { try { return !!JSON.parse(localStorage.getItem(TIPS_KEY) || "{}")[id]; } catch { return false; } }
function markTips(id) {
  try { const d = JSON.parse(localStorage.getItem(TIPS_KEY) || "{}"); d[id] = Date.now(); localStorage.setItem(TIPS_KEY, JSON.stringify(d)); } catch {}
}
// steps: [{ sel: CSS-valitsin, text }]; force: näytetään, vaikka kierros on jo nähty (Opastus-nappi)
function coachTour(id, steps, { force = false } = {}) {
  if (!force && tipsSeen(id)) return;
  document.querySelector(".coach")?.remove();
  const unmark = () => document.querySelectorAll(".coach-target").forEach((e) => e.classList.remove("coach-target"));
  unmark();
  let i = 0, target = null;
  const box = document.createElement("div");
  box.className = "coach";
  box.setAttribute("role", "dialog");
  box.setAttribute("aria-label", tr("Opastus", "Guide"));
  document.body.append(box);
  const place = () => {
    if (!target?.isConnected) { end(false); return; }
    const r = target.getBoundingClientRect(), bw = box.offsetWidth, bh = box.offsetHeight;
    let top = r.bottom + 10;
    if (top + bh > innerHeight - 8) top = Math.max(8, r.top - bh - 10);
    box.style.top = top + "px";
    box.style.left = Math.min(Math.max(8, r.left), innerWidth - bw - 8) + "px";
  };
  // Kierros merkitään nähdyksi vain, kun käyttäjä painaa Ohita/Valmis/Esc. Jos hän siirtyy muualle heti, se näytetään seuraavalla kerralla.
  function end(seen = true) {
    box.remove(); unmark(); if (seen) markTips(id);
    window.removeEventListener("resize", place);
    document.removeEventListener("scroll", place, true);
    window.removeEventListener("hashchange", leave);
  }
  const leave = () => end(false);
  function show() {
    target = document.querySelector(steps[i].sel);
    if (!target) { if (++i < steps.length) show(); else end(); return; }
    unmark();
    target.classList.add("coach-target");
    target.scrollIntoView({ block: "nearest" });
    box.innerHTML = `<p><b>${i + 1}/${steps.length}</b> ${esc(steps[i].text)}</p>
      <div class="row-actions"><button class="link-btn" data-c="skip">${tr("Ohita", "Skip")}</button>
      <button class="btn primary" data-c="next">${i < steps.length - 1 ? tr("Seuraava", "Next") : tr("Valmis", "Done")}</button></div>`;
    place();
    box.querySelector('[data-c="next"]').focus({ preventScroll: true });
  }
  box.onclick = (e) => {
    const c = e.target.closest("[data-c]")?.dataset.c;
    if (c === "skip") end();
    else if (c === "next") { if (++i < steps.length) show(); else end(); }
  };
  box.onkeydown = (e) => { if (e.key === "Escape") end(); };
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
  window.addEventListener("hashchange", leave);
  show();
}

// Ilmoitus näkyy sitä pidempään, mitä pidempi teksti on (lyhyt 2,2 s, pitkä enintään 8 s)
function toast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  $("#toasts").append(el);
  setTimeout(() => el.remove(), Math.min(8000, 2200 + String(msg).length * 35));
}

$("#sidebar-toggle").onclick = toggleSidebar;
$("#scrim").onclick = () => $("#app").classList.remove("mobile-open");

// Tekstikentässä Ctrl+Z kuuluu selaimelle (tekstin kumoaminen); liukusäätimet ja valinnat eivät ole tekstikenttiä
const isTextField = (el) => el?.tagName === "TEXTAREA"
  || (el?.tagName === "INPUT" && !["range", "checkbox", "radio", "button", "file", "color"].includes(el.type));

// Kirjautumisnäkymän ollessa auki sovelluksen pikanäppäimet eivät saa toimia (esim. Ctrl+E veisi lukitun käyttäjän projektin).
// Kaappausvaiheessa pysäytetään vain leviäminen, joten kirjautumiskentän kirjoittaminen ja liittäminen toimivat.
document.addEventListener("keydown", (e) => {
  if (document.body.classList.contains("acc-locked") && (e.ctrlKey || e.metaKey || e.altKey || !e.target.closest?.(".acc-gate"))) e.stopImmediatePropagation();
}, true);

let gPressed = 0;
document.addEventListener("keydown", (e) => {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  const active = document.activeElement;
  const typing = /^(INPUT|SELECT|TEXTAREA)$/.test(active?.tagName);
  if (mod && key === "k") { e.preventDefault(); $("#palette").hidden ? openPalette() : closePalette(); }
  else if (mod && key === "i") { e.preventDefault(); window.Assistant?.toggle(); }
  else if (mod && key === "z" && !e.shiftKey && !isTextField(active)) { e.preventDefault(); undoRedo("undo"); }
  else if (mod && ((key === "z" && e.shiftKey) || key === "y") && !isTextField(active)) { e.preventDefault(); undoRedo("redo"); }
  else if (mod && key === "s") { e.preventDefault(); saveProjects(); persist(true); toast(tr("Tallennettu", "Saved")); }
  else if (mod && key === "e") { e.preventDefault(); exportActiveProject(); }
  else if (mod && e.key === ",") { e.preventDefault(); location.hash = "#/settings"; }
  else if (mod && key === "b") { e.preventDefault(); toggleSidebar(); }
  else if (e.key === "Escape") { closePalette(); closeShortcuts(); window.Assistant?.close(); $("#app").classList.remove("mobile-open"); }
  else if (!typing && !mod && e.key === "?") { e.preventDefault(); openShortcuts(); }
  else if (!typing && !mod && key === "g" && !TOOL_SHORTCUTS[currentRoute()]) gPressed = Date.now(); // työkalun omat näppäimet (esim. rakentajan G) ensin
  else if (!typing && !mod && Date.now() - gPressed < 800 && ["d", "p", "s"].includes(key)) {
    location.hash = { d: "#/dashboard", p: "#/projects", s: "#/settings" }[key];
    gPressed = 0;
  }
});

mqDark.addEventListener("change", applySettings);
mqMotion.addEventListener("change", applySettings);
window.addEventListener("hashchange", router);
document.addEventListener("click", (e) => { if (e.target.closest("#dash-ai")) window.Assistant?.open(); });

/* ===== Käynnistys ===== */
// Työkalutiedostot (tools/*.js) ladataan tämän jälkeen ja rekisteröityvät TOOL_IMPLiin ennen DOMContentLoadedia
document.addEventListener("DOMContentLoaded", () => {
  // index.html:n kiinteät tekstit valitulla kielellä
  $(".brand-text span").textContent = tr("Robotiikan työkalut", "Robotics toolkit");
  $(".sidebar-footer .label").textContent = tr("Asetukset", "Settings");
  $(".sidebar-footer .nav-item").dataset.tip = tr("Asetukset", "Settings");
  $("#palette-open span").textContent = tr("Hae työkaluja…", "Search tools…");
  $("#palette-input").placeholder = tr("Kirjoita työkalun, asetuksen tai komennon nimi…", "Type a tool, setting or command…");
  $("#sidebar-toggle").title = tr("Sivupalkki (Ctrl+B)", "Sidebar (Ctrl+B)");
  $("#sidebar-toggle").setAttribute("aria-label", tr("Näytä tai piilota sivupalkki", "Show or hide sidebar"));
  $("#shortcuts-dialog h2").textContent = tr("Pikanäppäimet", "Keyboard shortcuts");
  $("#shortcuts-dialog button").textContent = tr("Sulje", "Close");
  // Logo: Volt, RoboLabin oma robotti
  $(".brand-mark").classList.add("volt");
  $(".brand-mark").innerHTML = Robots.svg("volt", "idle", { size: 40 });
  $("#install-app span").textContent = tr("Asenna sovellus", "Install app");
  $("#install-app").title = tr("Asenna RoboLab koneelle omaksi sovellukseksi. Toimii myös ilman nettiä.", "Install RoboLab on this computer as its own app. Also works offline.");
  footerObserver.observe($("#content"), { childList: true });
  renderNav();
  applySettings();
  router();
});

/* ===== Asennettava sovellus (PWA) ===== */
// Service worker tallentaa sovelluksen ja kirjastot, joten asennettu RoboLab aukeaa ilman nettiä ja ilman palvelinta.
// ?nosw ohittaa tämän kehityksessä (esim. upotetut esikatseluselaimet, joissa service worker ei pääse verkkoon)
if ("serviceWorker" in navigator && location.protocol !== "file:" && !new URLSearchParams(location.search).has("nosw")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch((err) => console.warn("Service worker:", err)));
}
let installPrompt = null;
// Asennettu sovellus (standalone) ei näytä nappia. Työpöydän kuvakkeen ?app-ikkuna voi vielä asentua oikeaksi
// Windows-sovellukseksi: silloin se saa oman tehtäväpalkkikuvakkeen ja käynnistyy ilman selainta.
const inAppWindow = new URLSearchParams(location.search).has("app") || matchMedia("(display-mode: standalone)").matches;
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); // oma nappi selaimen oletuskehotteen sijaan
  if (matchMedia("(display-mode: standalone)").matches) return;
  installPrompt = e;
  if (inAppWindow) {
    $("#install-app span").textContent = tr("Asenna Windows-sovellukseksi", "Install as a Windows app");
    $("#install-app").title = tr("Asentaa RoboLabin oikeaksi sovellukseksi: oma ikkuna, tehtäväpalkin kuvake ja Käynnistä-valikko. Työpöydän pikakuvake avaa sen jatkossa.", "Installs RoboLab as a real app: its own window, taskbar icon and Start menu entry. The desktop shortcut opens it from then on.");
  }
  $("#install-app").hidden = false;
});
window.addEventListener("appinstalled", () => {
  installPrompt = null;
  $("#install-app").hidden = true;
  toast(tr("RoboLab asennettu! Löydät sen Käynnistä-valikosta ja työpöydältä.", "RoboLab installed! You'll find it in the Start menu and on the desktop."));
});
$("#install-app").onclick = async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  $("#install-app").hidden = true;
};

/* ===== Päivitykset =====
   version.js kertoo version ja muutoshistorian. Sovellus tarkistaa käynnistyessä, ikkunaan palatessa ja
   viiden minuutin välein, onko kansiossa uudempi versio. Jos on, näytetään palkki "Päivitä nyt": service worker
   hakee kaikki tiedostot uudelleen (myös offline-versio päivittyy) ja sivu latautuu. Projektit ja asetukset
   ovat selaimen tallennuksessa, joten päivitys ei koske niihin. */
const SEEN_KEY = "robolab-version-seen";
const cmpVer = (a, b) => {
  const pa = String(a).split(".").map(Number), pb = String(b).split(".").map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const releaseNotes = (r) => (LANG === "en" ? r.en : r.fi) || r.fi || [];
let updateOffered = null, lastCheck = 0;

function showReleases(list, title) {
  let dlg = $("#whats-new");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "whats-new";
    dlg.className = "rs-dlg";
    document.body.append(dlg);
  }
  dlg.innerHTML = `<h2>${esc(title)}</h2>
    <div class="wn-list">${list.map((r) => `<section><h3>RoboLab ${esc(r.version)} <small>${esc(r.date ? new Date(r.date + "T12:00").toLocaleDateString(tr("fi-FI", "en-GB")) : "")}</small></h3>
      <ul>${releaseNotes(r).map((n) => `<li>${esc(n)}</li>`).join("")}</ul></section>`).join("")}</div>
    <div class="row-actions rs-dlg-foot"><button class="btn primary" data-close>${tr("Selvä", "Got it")}</button></div>`;
  dlg.querySelector("[data-close]").onclick = () => dlg.close();
  dlg.showModal();
}
const showAllReleases = () => showReleases(ROBOLAB_RELEASES, tr("Versiohistoria", "Version history"));

// Päivityksen jälkeen (tai ensimmäisellä kerralla uuden version kanssa) kerrotaan, mikä muuttui
function announceUpdate() {
  let seen = null;
  try { seen = localStorage.getItem(SEEN_KEY); localStorage.setItem(SEEN_KEY, VERSION); } catch { return; }
  if (!seen || cmpVer(VERSION, seen) <= 0) return; // ensiasennus: ei ponnahdusta
  const fresh = ROBOLAB_RELEASES.filter((r) => cmpVer(r.version, seen) > 0);
  if (fresh.length) showReleases(fresh, tr(`RoboLab päivitettiin versioon ${VERSION}`, `RoboLab was updated to ${VERSION}`));
}

async function checkForUpdate(manual = false, startup = false) {
  lastCheck = Date.now();
  let text = null;
  try {
    const r = await fetch("version.js", { cache: "no-store" });
    // Palvelin pois päältä → service worker antaa tallennetun version (merkitty otsakkeella), eikä päivityksiä voi hakea
    if (r.ok && !r.headers.get("x-robolab-offline")) text = await r.text();
  } catch {}
  const latest = text?.match(/version:\s*"([\d.]+)"/)?.[1] || null;
  navigator.serviceWorker?.getRegistration().then((reg) => reg?.update()).catch(() => {});
  if (latest && cmpVer(latest, VERSION) > 0) {
    // Heti käynnistyksen jälkeen ei ole keskeneräistä työtä, joten päivitys voidaan ottaa suoraan käyttöön.
    // Automaattitesteissä (?memstore) ei ladata sivua uudelleen: julkaisun jälkeen välimuistin vanha version.js
    // ja verkon uusi versio eroavat hetken, ja uudelleenlataus katkaisisi testin kesken.
    const testing = /[?&]memstore\b/.test(location.search);
    if (startup && settings.autoUpdate && !testing) { toast(tr(`Päivitetään versioon ${latest}…`, `Updating to ${latest}…`)); applyUpdate(); }
    else offerUpdate(latest, text);
    return latest;
  }
  if (manual) toast(latest ? tr(`Sinulla on uusin versio (${VERSION}).`, `You have the latest version (${VERSION}).`)
    : tr("Päivityksiä ei voitu tarkistaa: RoboLabin palvelin ei ole käynnissä. Avaa RoboLab työpöydän kuvakkeesta.", "Couldn't check for updates: the RoboLab server isn't running. Open RoboLab from the desktop icon."));
  return null;
}

function offerUpdate(version, text) {
  if (updateOffered === version) return;
  updateOffered = version;
  $("#update-bar")?.remove();
  const notes = (() => { try { return releaseNotes(new Function(text + "; return ROBOLAB_RELEASES;")()[0]); } catch { return []; } })();
  const bar = document.createElement("div");
  bar.id = "update-bar";
  bar.className = "update-bar";
  bar.setAttribute("role", "status");
  bar.innerHTML = `<div><b>${tr(`Uusi versio ${esc(version)} on valmis`, `Version ${esc(version)} is ready`)}</b>
      ${notes.length ? `<span>${esc(notes[0])}${notes.length > 1 ? " " + tr(`(+${notes.length - 1} muuta)`, `(+${notes.length - 1} more)`) : ""}</span>` : ""}</div>
    <button class="btn" data-later>${tr("Myöhemmin", "Later")}</button>
    <button class="btn primary" data-now>${tr("Päivitä nyt", "Update now")}</button>`;
  bar.querySelector("[data-later]").onclick = () => bar.remove();
  bar.querySelector("[data-now]").onclick = applyUpdate;
  document.body.append(bar);
}

async function applyUpdate() {
  const btn = $("#update-bar [data-now]");
  if (btn) { btn.disabled = true; btn.textContent = tr("Päivitetään…", "Updating…"); }
  const sw = navigator.serviceWorker?.controller;
  if (sw) {
    await new Promise((res) => {
      const ch = new MessageChannel();
      ch.port1.onmessage = () => res();
      sw.postMessage({ type: "refresh" }, [ch.port2]);
      setTimeout(res, 20000); // ei jäädä odottamaan ikuisesti
    });
  }
  location.reload();
}

window.addEventListener("load", () => {
  announceUpdate();
  setTimeout(() => checkForUpdate(false, true), 1500);
  setInterval(() => checkForUpdate(), 5 * 60 * 1000);
});
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && Date.now() - lastCheck > 60 * 1000) checkForUpdate();
});
