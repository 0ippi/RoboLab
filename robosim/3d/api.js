// 3D-simulaation sisäänkäynti RoboLabin työkaluille: ladataan dynaamisesti vasta, kun
// 3D-simulaatio tai -rakentaja avataan, koska Rapier (WebAssembly) ja Three.js ovat isoja.
import RAPIER from '@dimforge/rapier3d-compat';

export { MODELS3D, DEFAULT_TASK3D } from './models3d.js';
export { TASKS3D, TASK_HELP3D } from './tasks3d.js';
export { TERRAINS3D, buildTerrain3D } from './terrain3d.js';
export { normalizeModel3D, modelInfo3D, Robot3D } from './robot3d.js';
export { Episode3D } from './sim3d.js';
export { View3D } from './view3d.js';
export { RAPIER };

let ready = null;
export function init() {
  ready ||= RAPIER.init().then(() => RAPIER);
  return ready;
}
