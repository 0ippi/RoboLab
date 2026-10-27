// Valmiit robottimallit. Mallin muoto on kuvattu README.md:ssä.
// Koordinaatit metreinä, y ylöspäin, maa on y = 0. Kulmat asteina.
RS.MODELS = {
  // ----- RoboLabin hahmot yksinkertaistettuina robotteina (sivukuva) -----
  // deco = koriste (kasvot, silmä, aivoverkko…), plain = ympyrä ei ole pyörä, round = kulmien pyöristys
  volt: {
    name: tr('Volt (perusrobotti)', 'Volt (base robot)'),
    description: tr('RoboLabin oma robotti: näyttöpää ja kaksi pyörää. Hyvä ensimmäinen robotti. 2 moottoria.', "RoboLab's own robot: a screen head and two wheels. A good first robot. 2 motors."),
    root: 'chassis',
    fall: { minUpright: 0.3 },
    sensors: { lidar: 5 },
    bodies: [
      {
        id: 'chassis', x: 0, y: 0.5, density: 1.5, color: '#4c8dff',
        shapes: [
          { type: 'box', w: 0.7, h: 0.3 },
          { type: 'box', w: 0.8, h: 0.55, y: 0.42, color: '#eef3fb', deco: 'face', round: 0.3 },
          { type: 'box', w: 0.05, h: 0.2, y: 0.78, color: '#9aa8bd', round: 0 },
          { type: 'circle', r: 0.07, y: 0.92, color: '#ffd23f', plain: true }
        ]
      },
      { id: 'wheelB', shape: 'circle', r: 0.2, x: -0.3, y: 0.2, friction: 1.5, foot: true, color: '#4c8dff' },
      { id: 'wheelF', shape: 'circle', r: 0.2, x: 0.3, y: 0.2, friction: 1.5, foot: true, color: '#4c8dff' }
    ],
    joints: [
      { a: 'chassis', b: 'wheelB', x: -0.3, y: 0.2, torque: 12, speed: 10 },
      { a: 'chassis', b: 'wheelF', x: 0.3, y: 0.2, torque: 12, speed: 10 }
    ]
  },

  grip: {
    name: tr('Grip (robottikäsi)', 'Grip (robot arm)'),
    description: tr('Teollisuusrobottikäsi tarttujalla, kiinnitetty maahan. Sopii "Mene kohteeseen" -tehtävään. 3 moottoria.', 'An industrial robot arm with a gripper, fixed to the ground. Suits the "Reach the target" task. 3 motors.'),
    root: 'hand',
    sensors: { lidar: 0 },
    target: { x: [-1.6, 1.6], y: [0.6, 2.2] },
    bodies: [
      {
        id: 'base', x: 0, y: 0.15, static: true, color: '#3b4252',
        shapes: [{ type: 'box', w: 0.8, h: 0.2, y: -0.05 }, { type: 'box', w: 0.5, h: 0.14, y: 0.1, color: '#ff8c42' }]
      },
      { id: 'upper', shape: 'box', w: 0.16, h: 0.9, x: 0, y: 0.7, color: '#ff8c42' },
      { id: 'lower', shape: 'box', w: 0.13, h: 0.8, x: 0, y: 1.55, color: '#ff8c42' },
      {
        id: 'hand', x: 0, y: 2.03, color: '#9aa8bd',
        shapes: [
          { type: 'box', w: 0.22, h: 0.14 },
          { type: 'box', w: 0.05, h: 0.18, x: -0.08, y: 0.14, color: '#3b4252' },
          { type: 'box', w: 0.05, h: 0.18, x: 0.08, y: 0.14, color: '#3b4252' }
        ]
      }
    ],
    joints: [
      { a: 'base', b: 'upper', x: 0, y: 0.28, lower: -150, upper: 150, torque: 40, speed: 3 },
      { a: 'upper', b: 'lower', x: 0, y: 1.15, lower: -160, upper: 160, torque: 20, speed: 4 },
      { a: 'lower', b: 'hand', x: 0, y: 1.95, lower: -90, upper: 90, torque: 3, speed: 4 }
    ]
  },

  wobbly: {
    name: tr('Wobbly (tasapainorobotti)', 'Wobbly (balancing robot)'),
    description: tr('Munanmuotoinen robotti yhden pyörän päällä. Sopii "Pysy pystyssä" -tehtävään. 1 moottori.', 'An egg-shaped robot on one wheel. Suits the "Stay upright" task. 1 motor.'),
    root: 'body',
    fall: { minUpright: 0.5 },
    sensors: { lidar: 0 },
    bodies: [
      {
        id: 'body', x: 0, y: 0.95, color: '#c4a4ff',
        shapes: [
          { type: 'box', w: 0.5, h: 0.75, y: -0.1, round: 0.48 },
          { type: 'circle', r: 0.3, y: 0.38, deco: 'soft', plain: true },
          { type: 'box', w: 0.22, h: 0.1, y: 0.72, color: '#ff7eb6', round: 0.4 }
        ]
      },
      { id: 'wheel', shape: 'circle', r: 0.26, x: 0, y: 0.26, friction: 1.5, foot: true, color: '#c4a4ff' }
    ],
    joints: [{ a: 'body', b: 'wheel', x: 0, y: 0.26, torque: 15, speed: 15 }]
  },

  dusty: {
    name: tr('Dusty (robotti-imuri)', 'Dusty (robot vacuum)'),
    description: tr('Matala robotti-imuri, jossa on lidar ja yksi vetopyörä. Hidas mutta sinnikäs. 1 moottori.', 'A low robot vacuum with a lidar and one drive wheel. Slow but persistent. 1 motor.'),
    root: 'chassis',
    fall: { minUpright: 0.3 },
    sensors: { lidar: 5 },
    bodies: [
      {
        id: 'chassis', x: 0, y: 0.2, density: 1.5, friction: 0.05, color: '#e6eef3',
        shapes: [
          { type: 'box', w: 1.0, h: 0.2, deco: 'ring', round: 0.45 },
          { type: 'box', w: 0.1, h: 0.16, x: 0.5, color: '#2ec4b6', round: 0.4 },
          { type: 'box', w: 0.22, h: 0.1, x: -0.12, y: 0.14, color: '#2b3240' },
          { type: 'circle', r: 0.05, x: 0.35, y: -0.15, color: '#9aa8bd', plain: true }
        ]
      },
      { id: 'wheel', shape: 'circle', r: 0.1, x: -0.2, y: 0.1, friction: 1.5, foot: true, color: '#2ec4b6' }
    ],
    joints: [{ a: 'chassis', b: 'wheel', x: -0.2, y: 0.1, torque: 6, speed: 7 }]
  },

  zippy: {
    name: tr('Zippy (drooni)', 'Zippy (drone)'),
    description: tr('Kaksiroottorinen drooni, jonka aivot säätävät roottorien työntövoimaa. Sopii "Mene kohteeseen" -tehtävään: kohteet ovat ilmassa. 2 roottoria.', 'A two-rotor drone whose brain controls the rotor thrust. Suits the "Reach the target" task: the targets are in the air. 2 rotors.'),
    root: 'body',
    sensors: { lidar: 0 },
    target: { x: [-3, 3], y: [1, 3] },
    bodies: [
      {
        id: 'body', x: 0, y: 0.4, density: 0.6, linearDamping: 0.4, angularDamping: 2.5, color: '#ffd23f',
        shapes: [
          { type: 'box', w: 0.6, h: 0.3, deco: 'eye', round: 0.45 },
          { type: 'box', w: 1.3, h: 0.05, y: 0.1, color: '#9aa8bd', round: 0 },
          { type: 'box', w: 0.42, h: 0.04, x: -0.6, y: 0.18, color: '#cfd8e3', round: 0, rotor: 'z1' },
          { type: 'box', w: 0.42, h: 0.04, x: 0.6, y: 0.18, color: '#cfd8e3', round: 0, rotor: 'z2' },
          { type: 'box', w: 0.05, h: 0.2, x: -0.22, y: -0.2, color: '#3b4252', round: 0 },
          { type: 'box', w: 0.05, h: 0.2, x: 0.22, y: -0.2, color: '#3b4252', round: 0 }
        ]
      }
    ],
    joints: [],
    thrusters: [
      { body: 'body', x: -0.6, y: 0.15, angle: 90, weight: 1, rid: 'z1' },
      { body: 'body', x: 0.6, y: 0.15, angle: 90, weight: 1, rid: 'z2' }
    ]
  },

  neura: {
    name: tr('Neura (oppiva nelijalkainen)', 'Neura (learning quadruped)'),
    description: tr('Kävelevä aivokupoli: lasikuvussa hehkuu neuroverkko, alla neljä jalkaa reisineen ja sääriineen. 8 moottoria.', 'A walking brain dome: a neural network glows in the glass dome, with four legs below, each with a thigh and a shin. 8 motors.'),
    root: 'torso',
    fall: { rootContact: true },
    sensors: { lidar: 5 },
    bodies: [
      {
        id: 'torso', x: 0, y: 0.95, density: 1.2, color: '#eef3f1',
        shapes: [
          { type: 'box', w: 1.1, h: 0.22, round: 0.5 },
          { type: 'circle', r: 0.4, y: 0.3, color: '#3ddc97', deco: 'brain', plain: true },
          { type: 'box', w: 0.22, h: 0.13, x: 0.6, y: 0.02, color: '#14213d', deco: 'visor', round: 0.5 }
        ]
      },
      ...[['bB', -0.4, '#8b98ad'], ['fB', 0.4, '#8b98ad'], ['bF', -0.4, '#c9d4df'], ['fF', 0.4, '#c9d4df']].flatMap(([n, x, color]) => [
        { id: n + 'Thigh', shape: 'box', w: 0.12, h: 0.36, x, y: 0.66, color },
        { id: n + 'Shin', shape: 'box', w: 0.1, h: 0.36, x, y: 0.3, friction: 1.2, foot: true, color }
      ])
    ],
    joints: [['bB', -0.4], ['fB', 0.4], ['bF', -0.4], ['fF', 0.4]].flatMap(([n, x]) => [
      { a: 'torso', b: n + 'Thigh', x, y: 0.84, lower: -60, upper: 60, torque: 9, speed: 6 },
      { a: n + 'Thigh', b: n + 'Shin', x, y: 0.48, lower: -100, upper: 10, torque: 7, speed: 8 }
    ])
  },

  // ----- Muut mallit -----
  biped: {
    name: tr('Kaksijalkainen kävelijä', 'Biped walker'),
    description: tr('Kaksi jalkaa: lonkka, polvi ja nilkka. 6 moottoria.', 'Two legs: hip, knee and ankle. 6 motors.'),
    root: 'torso',
    fall: { rootContact: true },
    sensors: { lidar: 5 },
    bodies: [
      { id: 'torso', shape: 'box', w: 0.9, h: 0.35, x: 0, y: 1.75, density: 1.5, color: '#7aa2ff' },
      { id: 'thighB', shape: 'box', w: 0.16, h: 0.6, x: 0, y: 1.3, color: '#4f6fc0' },
      { id: 'shinB', shape: 'box', w: 0.13, h: 0.6, x: 0, y: 0.7, color: '#4f6fc0' },
      { id: 'footB', shape: 'box', w: 0.42, h: 0.1, x: 0.08, y: 0.35, friction: 1.2, foot: true, color: '#4f6fc0' },
      { id: 'thighF', shape: 'box', w: 0.16, h: 0.6, x: 0, y: 1.3, color: '#9cc0ff' },
      { id: 'shinF', shape: 'box', w: 0.13, h: 0.6, x: 0, y: 0.7, color: '#9cc0ff' },
      { id: 'footF', shape: 'box', w: 0.42, h: 0.1, x: 0.08, y: 0.35, friction: 1.2, foot: true, color: '#9cc0ff' }
    ],
    joints: [
      { a: 'torso', b: 'thighB', x: 0, y: 1.6, lower: -40, upper: 80, torque: 9, speed: 6 },
      { a: 'thighB', b: 'shinB', x: 0, y: 1.0, lower: -120, upper: 0, torque: 8, speed: 8 },
      { a: 'shinB', b: 'footB', x: 0, y: 0.4, lower: -35, upper: 35, torque: 3, speed: 6 },
      { a: 'torso', b: 'thighF', x: 0, y: 1.6, lower: -40, upper: 80, torque: 9, speed: 6 },
      { a: 'thighF', b: 'shinF', x: 0, y: 1.0, lower: -120, upper: 0, torque: 8, speed: 8 },
      { a: 'shinF', b: 'footF', x: 0, y: 0.4, lower: -35, upper: 35, torque: 3, speed: 6 }
    ]
  },


  car: {
    name: tr('Pyöräauto', 'Wheeled car'),
    description: tr('Runko ja kaksi moottoroitua pyörää. 2 moottoria.', 'A body and two motorised wheels. 2 motors.'),
    root: 'chassis',
    fall: { minUpright: 0 },
    sensors: { lidar: 5 },
    bodies: [
      { id: 'chassis', shape: 'box', w: 1.8, h: 0.35, x: 0, y: 0.8, density: 2, color: '#6be3a4' },
      { id: 'wheelB', shape: 'circle', r: 0.38, x: -0.65, y: 0.4, friction: 1.5, foot: true, color: '#3a8f66' },
      { id: 'wheelF', shape: 'circle', r: 0.38, x: 0.65, y: 0.4, friction: 1.5, foot: true, color: '#3a8f66' }
    ],
    joints: [
      { a: 'chassis', b: 'wheelB', x: -0.65, y: 0.4, torque: 20, speed: 12 },
      { a: 'chassis', b: 'wheelF', x: 0.65, y: 0.4, torque: 20, speed: 12 }
    ]
  },


  worm: {
    name: tr('Mato', 'Worm'),
    description: tr('Viiden jakson ketju, joka voi oppia ryömimään. 4 moottoria.', 'A chain of five segments that can learn to crawl. 4 motors.'),
    root: 'seg3',
    sensors: { lidar: 0 },
    bodies: [
      { id: 'seg1', shape: 'box', w: 0.5, h: 0.2, x: -1.0, y: 0.12, foot: true, color: '#c39bff' },
      { id: 'seg2', shape: 'box', w: 0.5, h: 0.2, x: -0.5, y: 0.12, foot: true, color: '#c39bff' },
      { id: 'seg3', shape: 'box', w: 0.5, h: 0.2, x: 0.0, y: 0.12, foot: true, color: '#e0cbff' },
      { id: 'seg4', shape: 'box', w: 0.5, h: 0.2, x: 0.5, y: 0.12, foot: true, color: '#c39bff' },
      { id: 'seg5', shape: 'box', w: 0.5, h: 0.2, x: 1.0, y: 0.12, foot: true, color: '#c39bff' }
    ],
    joints: [
      { a: 'seg1', b: 'seg2', x: -0.75, y: 0.12, lower: -70, upper: 70, torque: 4, speed: 5 },
      { a: 'seg2', b: 'seg3', x: -0.25, y: 0.12, lower: -70, upper: 70, torque: 4, speed: 5 },
      { a: 'seg3', b: 'seg4', x: 0.25, y: 0.12, lower: -70, upper: 70, torque: 4, speed: 5 },
      { a: 'seg4', b: 'seg5', x: 0.75, y: 0.12, lower: -70, upper: 70, torque: 4, speed: 5 }
    ]
  }
};
