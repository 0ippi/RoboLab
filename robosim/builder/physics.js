// Fysiikkatesti: pudottaa robotin maahan samalla fysiikalla kuin simulaatio
// (3D: Rapier, 2D: planck.js), jotta näkee, pysyykö se kasassa ja miten moottorit liikkuvat.
import RAPIER from '@dimforge/rapier3d-compat';
import { Robot3D, normalizeModel3D } from '../3d/robot3d.js';
import { buildTerrain3D } from '../3d/terrain3d.js';
import { to2D, to3D } from './model.js';

let rapierReady = null;
export function initPhysics() {
  if (!rapierReady) rapierReady = RAPIER.init();
  return rapierReady;
}

export class PhysicsTest {
  constructor(model, dim) {
    this.dim = dim;
    this.t = 0;
    if (dim === '2d') {
      const m = RS.normalizeModel(to2D(model));
      this.world = new planck.World({ gravity: RS.V(0, -10) });
      const terrain = RS.buildTerrain(this.world, 'flat', RS.rng(1));
      this.robot = new RS.Robot(this.world, m);
      this.robot.terrain = terrain;
      // 2D-kappaleella on oma kulma, joten piirrossa osan sisäinen kierto on nolla.
      this.bodies = this.robot.parts.map((p) => {
        const src = model.bodies.find((b) => b.id === p.spec.id);
        return { ...src, rot: [0, 0, 0] };
      });
      this.motors = this.robot.motors.map((mo) => ({
        label: `${mo.spec.a} – ${mo.spec.b}`, kind: 'speed'
      }));
    } else {
      const m = normalizeModel3D(to3D(model));
      this.world = new RAPIER.World({ x: 0, y: -9.81, z: 0 });
      this.world.timestep = 1 / 60;
      const terrain = buildTerrain3D(RAPIER, this.world, 'flat', RS.rng(1));
      this.robot = new Robot3D(RAPIER, this.world, m, terrain);
      this.bodies = this.robot.parts.map((p) => model.bodies.find((b) => b.id === p.spec.id));
      // Robot3D luo moottorit samassa järjestyksessä kuin moottorilliset nivelet ovat mallissa.
      const motorJoints = m.joints.filter((j) => j.motor !== false);
      this.motors = this.robot.motors.map((mo, i) => ({
        label: `${motorJoints[i].a} – ${motorJoints[i].b}`,
        kind: mo.control === 'position' && mo.limited ? 'angle' : 'speed'
      }));
    }
    // Roottorit saavat omat liukusäätimensä moottorien perään (sama järjestys kuin neuroverkon ulostuloissa)
    (this.robot.thrusters || []).forEach((_, i) => this.motors.push({ label: tr(`Roottori ${i + 1}`, `Rotor ${i + 1}`), kind: 'thrust' }));
    this.actions = new Array(this.motors.length).fill(0);
  }

  step() {
    this.robot.act(this.actions);
    if (this.dim === '2d') this.world.step(1 / 60, 8, 3);
    else this.world.step();
    this.t += 1 / 60;
  }

  poses() {
    if (this.dim === '2d') {
      return this.robot.parts.map(({ body }) => {
        const p = body.getPosition(), a = body.getAngle();
        return { x: p.x, y: p.y, z: 0, qx: 0, qy: 0, qz: Math.sin(a / 2), qw: Math.cos(a / 2) };
      });
    }
    return this.robot.parts.map(({ body }) => {
      const p = body.translation(), r = body.rotation();
      return { x: p.x, y: p.y, z: p.z, qx: r.x, qy: r.y, qz: r.z, qw: r.w };
    });
  }

  fallen() {
    return this.robot.isFallen();
  }

  rootHeight() {
    const r = this.robot.root;
    return this.dim === '2d' ? r.getPosition().y : r.translation().y;
  }

  free() {
    if (this.dim === '3d') this.world.free();
  }
}
