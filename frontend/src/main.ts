import './style.css';
import { createScene } from './scene/scene';
import { CubeMesh } from './scene/cube/cube';
import { MoveAnimator } from './scene/cube/animator';
import { attachKeyboard } from './ui/controls/keyboard';
import { attachDragControls } from './ui/controls/drag-controls';
import { DebuggerPanel } from './ui/debugger';
import { LessonsPanel } from './ui/lessons_panel';
import { LessonEngine, type LessonApi } from './education/lesson_engine';
import { LESSON_CATALOG } from './education/lesson_catalog';
import { applyMove, solvedState, isSolved, cloneState, type State } from './core/state';
import { generateScramble } from './scene/cube/scramble';
import DEBUG_CONFIG from './configs/debug-config';

declare global {
  interface Window {
    rubikInstructor?: RubikInstructorApi;
  }
}

export interface RubikInstructorApi {
  applyMoves(moves: string[] | string): { accepted: string[]; rejected: string[] };
  scramble(length?: number): string[];
  reset(): void;
  getState(): State;
  isSolved(): boolean;
  isBusy(): boolean;
  /** Subscribe to completed moves (after each animated quarter-turn settles). */
  onMove(fn: (move: string, state: State) => void): () => void;
}

function boot(container: HTMLElement): void {
  const ctx = createScene(container);

  const cube = new CubeMesh();
  ctx.scene.add(cube.root);

  const animator = new MoveAnimator(cube, cube.root);

  let state: State = solvedState();

  const debuggerPanel = !DEBUG_CONFIG.withoutUIMode ? new DebuggerPanel(container) : null;
  debuggerPanel?.render(state);

  const moveSubscribers = new Set<(m: string, s: State) => void>();
  let lessonEngine: LessonEngine | null = null;

  animator.onMoveComplete = (name) => {
    applyMove(state, name);
    debuggerPanel?.pushMove(name);
    debuggerPanel?.render(state);
    for (const fn of moveSubscribers) {
      try { fn(name, cloneState(state)); } catch (e) { console.error(e); }
    }
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
    lessonEngine?.handleCubeReset();
  }

  attachKeyboard(animator, { onReset: resetCube });
  attachDragControls(cube, animator, ctx.camera, ctx.renderer.domElement);

  renderHelp(container);

  function tick(now: number): void {
    animator.update(now);
    ctx.controls?.update();
    ctx.renderer.render(ctx.scene, ctx.camera);
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  const VALID = /^([UDLRFBMESxyz])('?)$/;
  const api: RubikInstructorApi = {
    applyMoves(moves) {
      const arr = typeof moves === 'string'
        ? moves.split(/\s+/).filter(Boolean)
        : moves;
      const accepted: string[] = [];
      const rejected: string[] = [];
      for (const m of arr) {
        if (!VALID.test(m)) { rejected.push(m); continue; }
        animator.enqueue(m) ? accepted.push(m) : rejected.push(m);
      }
      return { accepted, rejected };
    },
    scramble(length = 20) {
      const seq = generateScramble(length);
      for (const m of seq) animator.enqueue(m);
      return seq;
    },
    reset() { resetCube(); },
    getState() { return cloneState(state); },
    isSolved() { return isSolved(state); },
    isBusy() { return animator.isBusy(); },
    onMove(fn) {
      moveSubscribers.add(fn);
      return () => moveSubscribers.delete(fn);
    }
  };
  window.rubikInstructor = api;

  if (!DEBUG_CONFIG.withoutUIMode) {
    const lessonApi: LessonApi = {
      applyMoves: api.applyMoves,
      getState: api.getState,
      isSolved: api.isSolved,
      onMove: api.onMove
    };
    const storage = typeof localStorage !== 'undefined' ? localStorage : null;
    lessonEngine = new LessonEngine(lessonApi, LESSON_CATALOG, storage);
    new LessonsPanel(container, lessonEngine);
  }

  // Notify any host (e.g. Gradio) that may be waiting on the API to attach.
  window.dispatchEvent(new CustomEvent('rubik-instructor-ready'));
}

function renderHelp(container: HTMLElement): void {
  if (DEBUG_CONFIG.withoutUIMode) return;
  const help = document.createElement('div');
  help.id = 'help';
  help.innerHTML = `
    <div><b>Drag</b> a face to rotate that layer</div>
    <div><b>U/D/L/R/F/B</b> face turns &nbsp; <b>M/E/S</b> middle slices &nbsp; <b>X/Y/Z</b> whole cube</div>
    <div><b>Shift</b>+key = prime (counter-clockwise) &nbsp; <b>Space</b> = scramble &nbsp; <b>Enter</b> = reset</div>
  `;
  container.appendChild(help);
}

function start(): void {
  const el = document.getElementById('app');
  if (el) { boot(el); return; }
  // The bundle may load before Gradio injects #app. Watch for it.
  const obs = new MutationObserver(() => {
    const target = document.getElementById('app');
    if (target) {
      obs.disconnect();
      boot(target);
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
