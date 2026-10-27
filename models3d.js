// Valmiit 3D-robottimallit. Mallin muoto on kuvattu README.md:ssä.
// Koordinaatit metreinä: x eteenpäin, y ylöspäin, z sivulle. Kulmat asteina.

// Pystysuora jalka, jossa lonkka ja polvi kääntyvät eteen-taakse (akseli z).
function leg(name, x, z, color, { hipY = 0.9, thigh = 0.45, shin = 0.4, w = 0.12, foot = 0.07, density } = {}) {
  const knee = hipY - thigh;
  return {
    bodies: [
      { id: name + 'Thigh', pos: [x, hipY - thigh / 2, z], shape: 'box', size: [w, thigh, w], density, color },
      {
        id: name + 'Shin', pos: [x, knee - shin / 2, z], foot: true, friction: 1.2, density, color,
        shapes: [
          { type: 'box', size: [w * 0.8, shin, w * 0.8] },
          { type: 'sphere', r: foot, pos: [0, -shin / 2, 0] }
        ]
      }
    ],
    joints: [
      { a: 'torso', b: name + 'Thigh', pos: [x, hipY, z], axis: [0, 0, 1], lower: -50, upper: 50, speed: 6 },
      { a: name + 'Thigh', b: name + 'Shin', pos: [x, knee, z], axis: [0, 0, 1], lower: -45, upper: 45, speed: 8 }
    ]
  };
}


function hexapod() {
  const opts = { hipY: 0.6, thigh: 0.3, shin: 0.28, w: 0.1, foot: 0.05, density: 3 };
  const legs = [];
  [0.6, 0, -0.6].forEach((x, i) => {
    legs.push(leg('l' + i, x, -0.38, '#b5e48c', opts));
    legs.push(leg('r' + i, x, 0.38, '#76c893', opts));
  });
  return {
    name: tr('Kuusijalkainen', 'Hexapod'),
    description: tr('Hyönteismäinen robotti, jolla on kuusi jalkaa. Vakaampi kuin nelijalkainen, joten kävely on helpompi oppia. 12 moottoria.', 'An insect-like robot with six legs. More stable than the quadruped, so walking is easier to learn. 12 motors.'),
    root: 'torso',
    fall: { rootContact: true, minUpright: 0.2 },
    sensors: { scan: 5 },
    bodies: [
      { id: 'torso', pos: [0, 0.7, 0], shape: 'box', size: [1.6, 0.2, 0.6], density: 2, color: '#52b69a' },
      ...legs.flatMap((l) => l.bodies)
    ],
    joints: legs.flatMap((l) => l.joints)
  };
}

// Hämähäkki: eturuumis ja takaruumis, kahdeksan jalkaa (neljä kummallakin puolella, viistosti eteen ja taakse).
// Lonkka kääntyy vaakatasossa ja polvi pystytasossa, joten robotti voi kulkea ja kääntyä mihin suuntaan tahansa.
function spider() {
  const Y = 0.6, hip = 0.24, knee = 0.6, shin = 0.56;
  const bodies = [{
    id: 'torso', pos: [0, Y, 0], density: 1, color: '#b77fe0',
    shapes: [
      { type: 'sphere', r: 0.24 },
      { type: 'sphere', r: 0.25, pos: [-0.4, 0.05, 0], color: '#8f5cc2' },
      { type: 'sphere', r: 0.04, pos: [0.21, 0.08, -0.06], color: '#ff5d8f' },
      { type: 'sphere', r: 0.04, pos: [0.21, 0.08, 0.06], color: '#ff5d8f' }
    ]
  }];
  const joints = [];
  // Kulmat mitataan +x-akselista (eteen) kohti +z:aa; toinen puoli peilikuvana
  [35, 70, 110, 145, -35, -70, -110, -145].forEach((deg, i) => {
    const t = RS.deg(deg), c = Math.cos(t), s = Math.sin(t);
    const color = i % 2 ? '#d3b0ff' : '#e0a3ff';
    bodies.push({
      id: 'thigh' + i, pos: [((hip + knee) / 2) * c, Y, ((hip + knee) / 2) * s], shape: 'box', size: [knee - hip, 0.07, 0.07],
      rot: [0, -deg, 0], density: 4, color
    });
    bodies.push({
      id: 'shin' + i, pos: [knee * c, Y - shin / 2, knee * s], foot: true, friction: 1.2, density: 4, color,
      shapes: [
        { type: 'box', size: [0.06, shin, 0.06] },
        { type: 'sphere', r: 0.05, pos: [0, -shin / 2, 0] }
      ]
    });
    joints.push({ a: 'torso', b: 'thigh' + i, pos: [hip * c, Y, hip * s], axis: [0, 1, 0], lower: -30, upper: 30, speed: 6 });
    joints.push({ a: 'thigh' + i, b: 'shin' + i, pos: [knee * c, Y, knee * s], axis: [-s, 0, c], lower: -40, upper: 40, speed: 8 });
  });
  return {
    name: tr('Hämähäkki', 'Spider'),
    description: tr('Kahdeksan jalkaa, neljä kummallakin puolella: lonkka kääntyy sivuttain ja polvi ylös-alas, joten robotti voi kulkea ja kääntyä mihin suuntaan tahansa. 16 moottoria.', 'Eight legs, four on each side: the hip swings sideways and the knee up and down, so the robot can move and turn in any direction. 16 motors.'),
    root: 'torso',
    fall: { rootContact: true, minUpright: 0.2 },
    sensors: { scan: 5 },
    bodies,
    joints
  };
}

function biped() {
  const side = (n, z, color) => ({
    bodies: [
      { id: n + 'Thigh', pos: [0, 0.975, z], shape: 'box', size: [0.13, 0.45, 0.13], density: 3, color },
      { id: n + 'Shin', pos: [0, 0.525, z], shape: 'box', size: [0.11, 0.45, 0.11], density: 3, color },
      { id: n + 'Foot', pos: [0.06, 0.26, z], shape: 'box', size: [0.36, 0.08, 0.2], density: 3, friction: 1.2, foot: true, color }
    ],
    joints: [
      { a: 'torso', b: n + 'Thigh', pos: [0, 1.2, z], axis: [0, 0, 1], lower: -50, upper: 50, speed: 6 },
      { a: n + 'Thigh', b: n + 'Shin', pos: [0, 0.75, z], axis: [0, 0, 1], lower: -45, upper: 45, speed: 8 },
      { a: n + 'Shin', b: n + 'Foot', pos: [0, 0.3, z], axis: [0, 0, 1], lower: -30, upper: 30, speed: 6 }
    ]
  });
  const l = side('l', -0.17, '#9cc0ff'), r = side('r', 0.17, '#4f6fc0');
  return {
    name: tr('Kaksijalkainen', 'Biped'),
    description: tr('Kaksi jalkaa, joissa lonkka, polvi ja nilkka. Leveät jalkaterät auttavat sivuttaisessa tasapainossa. Vaikein oppia. 6 moottoria.', 'Two legs with hip, knee and ankle. Wide feet help with sideways balance. The hardest to learn. 6 motors.'),
    root: 'torso',
    fall: { rootContact: true, minUpright: 0.4 },
    sensors: { scan: 5 },
    bodies: [
      {
        id: 'torso', pos: [0, 1.45, 0], density: 2, color: '#7aa2ff',
        shapes: [
          { type: 'box', size: [0.35, 0.5, 0.55] },
          { type: 'sphere', r: 0.14, pos: [0, 0.38, 0], color: '#c9d9ff' }
        ]
      },
      ...l.bodies, ...r.bodies
    ],
    joints: [...l.joints, ...r.joints]
  };
}

function balancer() {
  const wheel = (id, z) => ({
    id, pos: [0, 0.3, z], shape: 'cylinder', r: 0.3, h: 0.1, rot: [90, 0, 0], density: 5, friction: 1.5, foot: true, color: '#b34d72'
  });
  return {
    name: tr('Tasapainorobotti', 'Balancing robot'),
    description: tr('Kaksipyöräinen, segwaymainen robotti, jonka pitää pysyä pystyssä. Sopii "Pysy pystyssä" -tehtävään. 2 moottoria.', 'A two-wheeled, Segway-like robot that has to stay upright. Suits the "Stay upright" task. 2 motors.'),
    root: 'body',
    fall: { minUpright: 0.6 },
    sensors: { scan: 0 },
    bodies: [
      {
        id: 'body', pos: [0, 1.0, 0], color: '#ff7aa8',
        shapes: [
          { type: 'box', size: [0.25, 1.1, 0.5] },
          { type: 'box', size: [0.35, 0.25, 0.6], pos: [0, 0.6, 0], color: '#ffb3cd' }
        ]
      },
      wheel('wL', -0.33), wheel('wR', 0.33)
    ],
    joints: [
      { a: 'body', b: 'wL', pos: [0, 0.3, -0.33], axis: [0, 0, 1], strength: 60, speed: 15 },
      { a: 'body', b: 'wR', pos: [0, 0.3, 0.33], axis: [0, 0, 1], strength: 60, speed: 15 }
    ]
  };
}


function snake() {
  const n = 6, gap = 0.5;
  const bodies = [], joints = [];
  for (let i = 0; i < n; i++) {
    const x = (i - (n - 1) / 2) * gap;
    bodies.push({
      id: 'seg' + i, pos: [x, 0.09, 0], shape: 'capsule', r: 0.09, h: 0.28, rot: [0, 0, 90],
      friction: 1.0, foot: true, color: i === n - 1 ? '#ffe08a' : i % 2 ? '#e6b33a' : '#f2c75c'
    });
    if (i > 0) {
      // Nivelet vuorotellen sivuttain (y) ja pystysuunnassa (z), kuten oikeissa käärmerobotissa.
      joints.push({
        a: 'seg' + (i - 1), b: 'seg' + i, pos: [x - gap / 2, 0.09, 0],
        axis: i % 2 ? [0, 1, 0] : [0, 0, 1], lower: -60, upper: 60, speed: 5
      });
    }
  }
  return {
    name: tr('Käärme', 'Snake'),
    description: tr('Kuuden jakson ketju, jonka nivelet kääntyvät vuorotellen sivuttain ja ylös-alas. Voi oppia luikertelemaan. 5 moottoria.', 'A chain of six segments whose joints turn alternately sideways and up-down. Can learn to slither. 5 motors.'),
    root: 'seg2',
    sensors: { scan: 0 },
    bodies,
    joints
  };
}


function car() {
  const wheel = (id, x, z) => ({
    id, pos: [x, 0.36, z], shape: 'cylinder', r: 0.36, h: 0.22, rot: [90, 0, 0],
    friction: 1.5, foot: true, color: '#3a8f66'
  });
  const motor = (b, x, z) => ({ a: 'chassis', b, pos: [x, 0.36, z], axis: [0, 0, 1], strength: 20, speed: 12 });
  return {
    name: tr('Pyöräauto', 'Wheeled car'),
    description: tr('Runko ja neljä erikseen ohjattavaa pyörää, joten auto voi myös kääntyä. 4 moottoria.', 'A body and four separately driven wheels, so the car can also turn. 4 motors.'),
    root: 'chassis',
    fall: { minUpright: 0 },
    sensors: { scan: 5 },
    bodies: [
      {
        id: 'chassis', pos: [0, 0.75, 0], density: 2, color: '#6be3a4',
        shapes: [
          { type: 'box', size: [2.0, 0.3, 1.1] },
          { type: 'box', size: [0.8, 0.25, 0.8], pos: [-0.2, 0.27, 0], color: '#a8f0c9' }
        ]
      },
      wheel('wFL', 0.7, -0.68), wheel('wFR', 0.7, 0.68),
      wheel('wBL', -0.7, -0.68), wheel('wBR', -0.7, 0.68)
    ],
    joints: [
      motor('wFL', 0.7, -0.68), motor('wFR', 0.7, 0.68),
      motor('wBL', -0.7, -0.68), motor('wBR', -0.7, 0.68)
    ]
  };
}

// ----- RoboLabin hahmot yksinkertaistettuina 3D-robotteina -----
// deco = koriste etupinnalla (+x) tai päällä, plain = sylinteri ei ole pyörä, round = kulmien pyöristys
const sideWheel = (id, z, r, color, x = 0) => ({ id, pos: [x, r, z], shape: 'cylinder', r, h: 0.08, rot: [90, 0, 0], density: 5, friction: 1.5, foot: true, color });

function volt() {
  return {
    name: tr('Volt (perusrobotti)', 'Volt (base robot)'),
    description: tr('RoboLabin oma robotti: näyttöpää, korvat ja antenni kahden pyörän päällä. Kääntyy pyörien nopeuserolla. 2 moottoria.', "RoboLab's own robot: a screen head, ears and an antenna on two wheels. Turns with the wheel speed difference. 2 motors."),
    root: 'chassis',
    fall: { minUpright: 0.3 },
    sensors: { scan: 5 },
    bodies: [
      {
        id: 'chassis', pos: [0, 0.38, 0], density: 1.2, friction: 0, frictionCombine: 'min', color: '#4c8dff',
        shapes: [
          { type: 'box', size: [0.5, 0.28, 0.5] },
          { type: 'box', size: [0.55, 0.5, 0.72], pos: [0, 0.42, 0], color: '#eef3fb', deco: 'face', round: 0.32 },
          { type: 'box', size: [0.2, 0.26, 0.08], pos: [0, 0.42, -0.4], color: '#4c8dff', round: 0.4 },
          { type: 'box', size: [0.2, 0.26, 0.08], pos: [0, 0.42, 0.4], color: '#4c8dff', round: 0.4 },
          { type: 'cylinder', r: 0.02, h: 0.18, pos: [0, 0.75, 0], color: '#9aa8bd', plain: true },
          { type: 'sphere', r: 0.06, pos: [0, 0.86, 0], color: '#ffd23f' },
          { type: 'sphere', r: 0.06, pos: [0.2, -0.26, 0], color: '#9aa8bd' },
          { type: 'sphere', r: 0.06, pos: [-0.2, -0.26, 0], color: '#9aa8bd' }
        ]
      },
      sideWheel('wL', -0.33, 0.2, '#4c8dff'), sideWheel('wR', 0.33, 0.2, '#4c8dff')
    ],
    joints: [
      { a: 'chassis', b: 'wL', pos: [0, 0.2, -0.33], axis: [0, 0, 1], strength: 40, speed: 12 },
      { a: 'chassis', b: 'wR', pos: [0, 0.2, 0.33], axis: [0, 0, 1], strength: 40, speed: 12 }
    ]
  };
}

function grip() {
  return {
    name: tr('Grip (robottikäsi)', 'Grip (robot arm)'),
    description: tr('Teollisuusrobottikäsi tarttujalla: kääntyvä kanta, olka, kyynär ja ranne. Kohteet ovat ilmassa. 4 moottoria.', 'An industrial robot arm with a gripper: a turning base, shoulder, elbow and wrist. The targets are in the air. 4 motors.'),
    root: 'hand',
    sensors: { scan: 0 },
    target: { x: [-1.5, 1.5], y: [0.5, 2.0], z: [-1.5, 1.5] },
    bodies: [
      { id: 'base', pos: [0, 0.1, 0], shape: 'cylinder', r: 0.38, h: 0.2, static: true, color: '#3b4252', plain: true },
      { id: 'turret', pos: [0, 0.3, 0], shape: 'cylinder', r: 0.24, h: 0.2, color: '#ff8c42', plain: true },
      { id: 'upper', pos: [0, 0.8, 0], shape: 'box', size: [0.16, 0.8, 0.16], color: '#ff8c42' },
      { id: 'lower', pos: [0, 1.55, 0], shape: 'box', size: [0.13, 0.7, 0.13], color: '#ff8c42' },
      {
        id: 'hand', pos: [0, 2.0, 0], color: '#9aa8bd',
        shapes: [
          { type: 'box', size: [0.18, 0.12, 0.18] },
          { type: 'box', size: [0.04, 0.16, 0.06], pos: [0, 0.12, -0.07], color: '#3b4252', round: 0 },
          { type: 'box', size: [0.04, 0.16, 0.06], pos: [0, 0.12, 0.07], color: '#3b4252', round: 0 }
        ]
      }
    ],
    joints: [
      { a: 'base', b: 'turret', pos: [0, 0.2, 0], axis: [0, 1, 0], lower: -170, upper: 170, speed: 2 },
      { a: 'turret', b: 'upper', pos: [0, 0.4, 0], axis: [0, 0, 1], lower: -100, upper: 100, speed: 2 },
      { a: 'upper', b: 'lower', pos: [0, 1.2, 0], axis: [0, 0, 1], lower: -150, upper: 150, speed: 3 },
      { a: 'lower', b: 'hand', pos: [0, 1.9, 0], axis: [0, 0, 1], lower: -90, upper: 90, speed: 3 }
    ]
  };
}

function wobbly() {
  return {
    name: tr('Wobbly (tasapainorobotti)', 'Wobbly (balancing robot)'),
    description: tr('Munanmuotoinen tasapainorobotti kahdella pyörällä, rusetti päässä. Sopii "Pysy pystyssä" -tehtävään. 2 moottoria.', 'An egg-shaped balancing robot on two wheels with a bow on top. Suits the "Stay upright" task. 2 motors.'),
    root: 'body',
    fall: { minUpright: 0.6 },
    sensors: { scan: 0 },
    bodies: [
      {
        id: 'body', pos: [0, 0.95, 0], color: '#c4a4ff',
        shapes: [
          { type: 'capsule', r: 0.24, h: 0.45, pos: [0, -0.1, 0] },
          { type: 'sphere', r: 0.27, pos: [0, 0.38, 0], deco: 'soft' },
          { type: 'box', size: [0.08, 0.1, 0.32], pos: [0, 0.68, 0], color: '#ff7eb6', round: 0.4 }
        ]
      },
      sideWheel('wL', -0.3, 0.26, '#c4a4ff'), sideWheel('wR', 0.3, 0.26, '#c4a4ff')
    ],
    joints: [
      { a: 'body', b: 'wL', pos: [0, 0.26, -0.3], axis: [0, 0, 1], strength: 60, speed: 15 },
      { a: 'body', b: 'wR', pos: [0, 0.26, 0.3], axis: [0, 0, 1], strength: 60, speed: 15 }
    ]
  };
}

function dusty() {
  return {
    name: tr('Dusty (robotti-imuri)', 'Dusty (robot vacuum)'),
    description: tr('Pyöreä robotti-imuri: valorengas, lidar-torni ja kaksi pyörää. Kääntyy paikallaan. 2 moottoria.', 'A round robot vacuum: a light ring, a lidar turret and two wheels. Turns in place. 2 motors.'),
    root: 'chassis',
    fall: { minUpright: 0.3 },
    sensors: { scan: 3 },
    bodies: [
      {
        id: 'chassis', pos: [0, 0.2, 0], density: 2, friction: 0, frictionCombine: 'min', color: '#e6eef3',
        shapes: [
          { type: 'cylinder', r: 0.4, h: 0.15, deco: 'ring' },
          { type: 'cylinder', r: 0.41, h: 0.06, pos: [0, -0.06, 0], color: '#2ec4b6', plain: true },
          { type: 'cylinder', r: 0.09, h: 0.08, pos: [-0.12, 0.11, 0], color: '#2b3240', plain: true },
          { type: 'sphere', r: 0.06, pos: [0.3, -0.14, 0], color: '#9aa8bd' },
          { type: 'sphere', r: 0.06, pos: [-0.3, -0.14, 0], color: '#9aa8bd' }
        ]
      },
      sideWheel('wL', -0.33, 0.12, '#2b3240'), sideWheel('wR', 0.33, 0.12, '#2b3240')
    ],
    joints: [
      { a: 'chassis', b: 'wL', pos: [0, 0.12, -0.33], axis: [0, 0, 1], strength: 50, speed: 10 },
      { a: 'chassis', b: 'wR', pos: [0, 0.12, 0.33], axis: [0, 0, 1], strength: 50, speed: 10 }
    ]
  };
}

function zippy() {
  const c = 0.4;
  return {
    name: tr('Zippy (drooni)', 'Zippy (drone)'),
    description: tr('Nelikopteri, jonka aivot säätävät neljän roottorin työntövoimaa. Kohteet ovat ilmassa. 4 roottoria.', 'A quadcopter whose brain controls the thrust of four rotors. The targets are in the air. 4 rotors.'),
    root: 'body',
    sensors: { scan: 0 },
    target: { x: [-3, 3], y: [1, 2.5], z: [-3, 3] },
    bodies: [
      {
        id: 'body', pos: [0, 0.3, 0], density: 0.8, linearDamping: 0.5, angularDamping: 3, color: '#ffd23f',
        shapes: [
          { type: 'box', size: [0.46, 0.2, 0.46], deco: 'eye', round: 0.45 },
          { type: 'box', size: [1.15, 0.04, 0.06], rot: [0, 45, 0], color: '#9aa8bd', round: 0 },
          { type: 'box', size: [1.15, 0.04, 0.06], rot: [0, -45, 0], color: '#9aa8bd', round: 0 },
          ...[[c, c], [c, -c], [-c, c], [-c, -c]].map(([x, z], i) => ({ type: 'cylinder', r: 0.2, h: 0.02, pos: [x, 0.07, z], color: '#cfd8e3', plain: true, rotor: 'z' + i })),
          { type: 'box', size: [0.05, 0.16, 0.4], pos: [0, -0.17, -0.18], color: '#3b4252', round: 0 },
          { type: 'box', size: [0.05, 0.16, 0.4], pos: [0, -0.17, 0.18], color: '#3b4252', round: 0 }
        ]
      }
    ],
    joints: [],
    thrusters: [[c, c], [c, -c], [-c, c], [-c, -c]].map(([x, z], i) => ({ body: 'body', pos: [x, 0.05, z], dir: [0, 1, 0], weight: 0.5, rid: 'z' + i }))
  };
}

function neura() {
  const legs = [
    leg('fl', 0.42, -0.26, '#c9d4df', { hipY: 0.72, thigh: 0.32, shin: 0.3, w: 0.1, foot: 0.06 }),
    leg('fr', 0.42, 0.26, '#8b98ad', { hipY: 0.72, thigh: 0.32, shin: 0.3, w: 0.1, foot: 0.06 }),
    leg('bl', -0.42, -0.26, '#c9d4df', { hipY: 0.72, thigh: 0.32, shin: 0.3, w: 0.1, foot: 0.06 }),
    leg('br', -0.42, 0.26, '#8b98ad', { hipY: 0.72, thigh: 0.32, shin: 0.3, w: 0.1, foot: 0.06 })
  ];
  return {
    name: tr('Neura (oppiva nelijalkainen)', 'Neura (learning quadruped)'),
    description: tr('Kävelevä aivokupoli: lasikuvussa hehkuu neuroverkko, edessä anturivisiiri. Neljä jalkaa, joissa lonkka ja polvi. 8 moottoria.', 'A walking brain dome: a neural network glows in the glass dome, with a sensor visor in front. Four legs with hip and knee. 8 motors.'),
    root: 'torso',
    fall: { rootContact: true, minUpright: 0.2 },
    sensors: { scan: 5 },
    bodies: [
      {
        id: 'torso', pos: [0, 0.8, 0], density: 1.6, color: '#eef3f1',
        shapes: [
          { type: 'box', size: [1.0, 0.2, 0.6], round: 0.5 },
          { type: 'sphere', r: 0.34, pos: [0, 0.24, 0], color: '#3ddc97', deco: 'brain' },
          { type: 'box', size: [0.08, 0.12, 0.34], pos: [0.52, 0.02, 0], color: '#14213d', deco: 'visor', round: 0.4 }
        ]
      },
      ...legs.flatMap((l) => l.bodies)
    ],
    joints: legs.flatMap((l) => l.joints)
  };
}

export const MODELS3D = {
  volt: volt(),
  grip: grip(),
  wobbly: wobbly(),
  dusty: dusty(),
  zippy: zippy(),
  neura: neura(),
  car: car(),
  balancer: balancer(),
  hexapod: hexapod(),
  spider: spider(),
  biped: biped(),
  snake: snake()
};

// Tehtävä, joka valitaan automaattisesti mallin vaihtuessa (jos malli sopii vain tiettyyn tehtävään).
export const DEFAULT_TASK3D = { balancer: 'balance', grip: 'target', wobbly: 'balance', zippy: 'target', dusty: 'target' };
