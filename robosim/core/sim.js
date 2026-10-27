// Episodi: yksi maailma, jossa koko populaatio liikkuu yhtä aikaa.
// Robotit eivät törmää toisiinsa, joten ne voidaan simuloida samassa maailmassa.
RS.DT = 1 / 60;

// Kohdepisteet "Mene kohteeseen" -tehtävää varten. Samat kaikille saman episodin roboteille.
// Käyttäjän omat reittipisteet (cfg.targets) korvaavat arvotut: piste ilman y:tä asetetaan maan tasalle
// robotin rungon korkeudelle, jolloin maassa kulkeva robotti voi saavuttaa sen.
RS.makeTargets = function (model, terrain, rng, startX, own, rootLift) {
  if (own?.length) {
    return own.map((p) => ({ x: +p.x || 0, y: Number.isFinite(p.y) ? p.y : RS.groundHeight(terrain, +p.x || 0) + rootLift }));
  }
  const spec = model.target || { x: [3, 8], y: [0.6, 1.6], mirror: true };
  const list = [];
  let x = startX;
  for (let i = 0; i < 30; i++) {
    if (model.target) {
      x = RS.uniform(rng, spec.x[0], spec.x[1]);
      list.push({ x, y: RS.uniform(rng, spec.y[0], spec.y[1]) });
    } else {
      x += RS.uniform(rng, spec.x[0], spec.x[1]) * (rng() < 0.5 ? -1 : 1);
      list.push({ x, y: RS.groundHeight(terrain, x) + RS.uniform(rng, spec.y[0], spec.y[1]) });
    }
  }
  return list;
};

RS.Episode = class {
  // cfg: { model, taskFn, terrain, seed, population, layers, duration, targets? }
  constructor(cfg) {
    this.cfg = cfg;
    this.world = new planck.World({ gravity: RS.V(0, -10) });
    this.terrain = RS.buildTerrain(this.world, cfg.terrain, RS.rng(cfg.seed));
    this.brain = new RS.Brain(cfg.layers);
    this.info = RS.modelInfo(cfg.model);
    this.obs = new Float32Array(this.info.obsSize);
    this.t = 0;
    this.steps = 0;
    this.maxSteps = Math.round(cfg.duration / RS.DT);
    this.finished = false;

    this.agents = cfg.population.map((params) => {
      const robot = new RS.Robot(this.world, cfg.model);
      robot.terrain = this.terrain;
      return {
        robot, params, fitness: 0, done: false, mem: {}, targetIdx: 0,
        prevX: robot.startX, prevY: robot.startY, prevTargetDist: 0, lastActions: []
      };
    });
    const first = this.agents[0].robot;
    this.targets = RS.makeTargets(cfg.model, this.terrain, RS.rng(cfg.seed + 7), first.startX, cfg.targets,
      first.startY - RS.groundHeight(this.terrain, first.startX));
    for (const a of this.agents) a.prevTargetDist = this.targetDist(a);
  }

  targetOf(a) { return this.targets[a.targetIdx % this.targets.length]; }

  targetDist(a) {
    const p = a.robot.root.getPosition(), t = this.targetOf(a);
    return Math.hypot(t.x - p.x, t.y - p.y);
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

    this.world.step(RS.DT, 8, 3);
    this.t += RS.DT;
    this.steps++;
    const last = this.steps >= this.maxSteps;

    let alive = 0;
    for (const a of this.agents) {
      if (a.done) continue;
      const r = a.robot.root;
      const p = r.getPosition(), v = r.getLinearVelocity(), ang = r.getAngle();
      let energy = 0;
      for (const x of a.lastActions) energy += Math.abs(x);
      const tdist = this.targetDist(a);
      const s = {
        t: this.t, dt: RS.DT, x: p.x, y: p.y, prevX: a.prevX, prevY: a.prevY,
        startX: a.robot.startX, startY: a.robot.startY, vx: v.x, vy: v.y,
        angle: ang, angVel: r.getAngularVelocity(), upright: Math.cos(ang),
        energy, actions: a.lastActions, footContacts: a.robot.footContacts(),
        fallen: a.robot.isFallen(), target: this.targetOf(a),
        targetDist: tdist, prevTargetDist: a.prevTargetDist,
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
      a.prevX = p.x;
      a.prevY = p.y;
      if (s.newTarget) a.targetIdx++;
      a.prevTargetDist = s.newTarget ? this.targetDist(a) : tdist;
      if (s.done || last) {
        a.done = true;
        // Kaatuneet poistetaan maailmasta, jotta loput simuloituvat nopeammin.
        if (!last) a.robot.destroy();
      } else alive++;
    }
    if (alive === 0) this.finished = true;
  }

  fitness() { return this.agents.map((a) => a.fitness); }

  // Indeksi robottiin, jota kamera seuraa: paras elossa oleva.
  leader() {
    let best = -1, bestAlive = -1;
    this.agents.forEach((a, i) => {
      if (best < 0 || a.fitness > this.agents[best].fitness) best = i;
      if (!a.done && (bestAlive < 0 || a.fitness > this.agents[bestAlive].fitness)) bestAlive = i;
    });
    return bestAlive >= 0 ? bestAlive : best;
  }
};
