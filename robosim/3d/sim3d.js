// 3D-episodi: yksi Rapier-maailma, jossa koko populaatio liikkuu yhtä aikaa.
// Robotit eivät törmää toisiinsa (törmäysryhmät), joten ne voidaan simuloida päällekkäin.
import { buildTerrain3D } from './terrain3d.js';
import { Robot3D, modelInfo3D } from './robot3d.js';

export const DT = 1 / 60;

function makeTargets(model, terrain, rng, start, own) {
  const list = [];
  // Käyttäjän omat reittipisteet: maassa kulkevalle robotille maan pinnalle, ilmassa liikkuvalle annetulle korkeudelle
  if (own?.length) {
    return own.map((p) => {
      const x = +p.x || 0, z = +p.z || 0;
      return { x, y: Number.isFinite(p.y) ? p.y : terrain.heightAt(x, z), z };
    });
  }
  // Mallin oma kohdealue (esim. robottikäden ulottuvilla olevat pisteet ilmassa)
  const area = model.target;
  if (area) {
    for (let i = 0; i < 30; i++) {
      list.push({
        x: RS.uniform(rng, area.x[0], area.x[1]),
        y: RS.uniform(rng, area.y[0], area.y[1]),
        z: RS.uniform(rng, area.z[0], area.z[1])
      });
    }
    return list;
  }
  let x = start.x, z = start.z;
  for (let i = 0; i < 30; i++) {
    const ang = rng() * Math.PI * 2, d = RS.uniform(rng, 3, 7);
    x = RS.clamp(x + Math.cos(ang) * d, terrain.bounds.X0 + 5, terrain.bounds.X1 - 5);
    z = RS.clamp(z + Math.sin(ang) * d, terrain.bounds.Z0 + 5, terrain.bounds.Z1 - 5);
    list.push({ x, y: terrain.heightAt(x, z), z });
  }
  return list;
}

export class Episode3D {
  // cfg: { RAPIER, model, taskFn, terrain, seed, population, layers, duration, targets? }
  constructor(cfg) {
    this.cfg = cfg;
    const R = cfg.RAPIER;
    this.world = new R.World({ x: 0, y: -9.81, z: 0 });
    this.world.timestep = DT;
    this.terrain = buildTerrain3D(R, this.world, cfg.terrain, RS.rng(cfg.seed));
    this.brain = new RS.Brain(cfg.layers);
    this.info = modelInfo3D(cfg.model);
    this.obs = new Float32Array(this.info.obsSize);
    this.t = 0;
    this.steps = 0;
    this.maxSteps = Math.round(cfg.duration / DT);
    this.finished = false;

    this.agents = cfg.population.map((params) => {
      const robot = new Robot3D(R, this.world, cfg.model, this.terrain);
      return {
        robot, params, fitness: 0, done: false, mem: {}, targetIdx: 0,
        prevX: robot.startX, prevY: robot.startY, prevZ: robot.startZ, prevYaw: robot.yaw(),
        prevTargetDist: 0, lastActions: []
      };
    });
    const r0 = this.agents[0].robot;
    this.targets = makeTargets(cfg.model, this.terrain, RS.rng(cfg.seed + 7), { x: r0.startX, z: r0.startZ }, cfg.targets);
    for (const a of this.agents) a.prevTargetDist = this.targetDist(a);
  }

  targetOf(a) { return this.targets[a.targetIdx % this.targets.length]; }

  targetDist(a) {
    const p = a.robot.root.translation(), t = this.targetOf(a);
    // Ilmassa olevat kohteet mitataan kolmiulotteisesti, maassa olevat vaakatasossa.
    if (this.info.targetDims === 3) return Math.hypot(t.x - p.x, t.y - p.y, t.z - p.z);
    return Math.hypot(t.x - p.x, t.z - p.z);
  }

  step() {
    if (this.finished) return;
    for (const a of this.agents) {
      if (a.done) continue;
      a.robot.observe(this.obs, this.t, this.targetOf(a));
      const out = this.brain.forward(a.params, this.obs);
      a.robot.act(out);
      a.lastActions = Array.from(out);
    }

    this.world.step();
    this.t += DT;
    this.steps++;
    const last = this.steps >= this.maxSteps;

    let alive = 0;
    for (const a of this.agents) {
      if (a.done) continue;
      const robot = a.robot, r = robot.root;
      const p = r.translation(), v = r.linvel();
      let energy = 0;
      for (const x of a.lastActions) energy += Math.abs(x);
      const yaw = robot.yaw();
      let dyaw = yaw - a.prevYaw;
      if (dyaw > Math.PI) dyaw -= 2 * Math.PI;
      if (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      const tdist = this.targetDist(a);
      const s = {
        t: this.t, dt: DT, x: p.x, y: p.y, z: p.z,
        prevX: a.prevX, prevY: a.prevY, prevZ: a.prevZ,
        startX: robot.startX, startY: robot.startY, startZ: robot.startZ,
        vx: v.x, vy: v.y, vz: v.z, yaw, yawRate: dyaw / DT,
        upright: robot.upright(), energy, actions: a.lastActions,
        footContacts: robot.footContacts(), fallen: robot.isFallen(),
        target: this.targetOf(a), targetDist: tdist, prevTargetDist: a.prevTargetDist,
        last, done: false, newTarget: false
      };
      let reward;
      try {
        reward = this.cfg.taskFn(s, a.mem);
      } catch (e) {
        this.finished = true;
        throw new Error(tr('Virhe tehtävän koodissa: ', 'Error in the task code: ') + e.message);
      }
      if (typeof reward === 'number' && isFinite(reward)) a.fitness += reward;
      a.prevX = p.x; a.prevY = p.y; a.prevZ = p.z; a.prevYaw = yaw;
      if (s.newTarget) a.targetIdx++;
      a.prevTargetDist = s.newTarget ? this.targetDist(a) : tdist;
      if (s.done || last) {
        a.done = true;
        if (!last) {
          a.lastPos = { x: p.x, y: p.y, z: p.z };
          robot.destroy();
        }
      } else alive++;
    }
    if (alive === 0) this.finished = true;
  }

  fitness() { return this.agents.map((a) => a.fitness); }

  leader() {
    let best = -1, bestAlive = -1;
    this.agents.forEach((a, i) => {
      if (best < 0 || a.fitness > this.agents[best].fitness) best = i;
      if (!a.done && (bestAlive < 0 || a.fitness > this.agents[bestAlive].fitness)) bestAlive = i;
    });
    return bestAlive >= 0 ? bestAlive : best;
  }

  // Rapier-maailma varaa muistia WebAssemblyssä, joten se pitää vapauttaa erikseen.
  free() {
    this.world.free();
    this.finished = true;
  }

  // Robotin sijainti, myös poistetun (silloin viimeinen tunnettu).
  positionOf(a) {
    if (a.robot.parts.length) return a.robot.root.translation();
    return a.lastPos || { x: a.robot.startX, y: a.robot.startY, z: a.robot.startZ };
  }
}
