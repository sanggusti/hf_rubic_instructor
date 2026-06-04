import './style.css';
import { createScene } from './scene/scene';
import { CubeMesh } from './scene/cube/cube';
import { MoveAnimator } from './scene/cube/animator';
import { attachKeyboard } from './ui/controls/keyboard';
import { attachDragControls } from './ui/controls/drag-controls';
import { DebuggerPanel } from './ui/debugger';
import { applyMove, solvedState, type State } from './core/state';
import DEBUG_CONFIG from './configs/debug-config';

const app = document.getElementById('app')!;
const ctx = createScene(app);

const cube = new CubeMesh();
ctx.scene.add(cube.root);

const animator = new MoveAnimator(cube, cube.root);

let state: State = solvedState();

const debuggerPanel = !DEBUG_CONFIG.withoutUIMode ? new DebuggerPanel(document.body) : null;
debuggerPanel?.render(state);

animator.onMoveComplete = (name) => {
  applyMove(state, name);
  debuggerPanel?.pushMove(name);
  debuggerPanel?.render(state);
};

function resetCube(): void {
  if (animator.isBusy()) return;
  cube.root.clear();
  cube.cubies.length = 0;
  const fresh = new CubeMesh();
  for (const c of fresh.cubies) {
    cube.root.add(c.mesh);
    cube.cubies.push(c);
  }
  state = solvedState();
  debuggerPanel?.reset();
  debuggerPanel?.render(state);
}

attachKeyboard(animator, {
  onReset: resetCube
});

attachDragControls(cube, animator, ctx.camera, ctx.renderer.domElement);

renderHelp();

function tick(now: number): void {
  animator.update(now);
  ctx.controls?.update();
  ctx.renderer.render(ctx.scene, ctx.camera);
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

function renderHelp(): void {
  if (DEBUG_CONFIG.withoutUIMode) return;
  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = `
    <div><b>Drag</b> a face to rotate that layer</div>
    <div><b>U/D/L/R/F/B</b> face turns &nbsp; <b>M/E/S</b> middle slices &nbsp; <b>X/Y/Z</b> whole cube</div>
    <div><b>Shift</b>+key = prime (counter-clockwise) &nbsp; <b>Space</b> = scramble &nbsp; <b>Enter</b> = reset</div>
  `;
  document.body.appendChild(help);
}
