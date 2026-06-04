import * as THREE from 'three';
import type { CubeMesh, Cubie, Axis } from '../../scene/cube/cube';
import type { MoveAnimator } from '../../scene/cube/animator';
import type { FaceKey } from '../../core/state';

interface PendingDrag {
  startScreen: THREE.Vector2;
  hitFace: FaceKey;
  hitCubie: Cubie;
  hitWorldPoint: THREE.Vector3;
}

export interface DragOptions {
  onMove?: (move: string) => void;
  // Pixels of drag below which we ignore the gesture.
  threshold?: number;
}

export function attachDragControls(
  cube: CubeMesh,
  animator: MoveAnimator,
  camera: THREE.Camera,
  domEl: HTMLElement,
  opts: DragOptions = {}
): () => void {
  const threshold = opts.threshold ?? 14;
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let pending: PendingDrag | null = null;

  function ndcFromEvent(ev: PointerEvent): void {
    const rect = domEl.getBoundingClientRect();
    ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
  }

  function findStickerHit(): { face: FaceKey; point: THREE.Vector3; cubie: Cubie } | null {
    raycaster.setFromCamera(ndc, camera);
    // Collect sticker meshes for raycasting.
    const stickers: THREE.Object3D[] = [];
    for (const c of cube.cubies) {
      c.mesh.traverse(child => {
        if ((child as any).userData?.isSticker) stickers.push(child);
      });
    }
    const hits = raycaster.intersectObjects(stickers, false);
    if (!hits.length) return null;
    const hit = hits[0];
    const face = hit.object.userData.face as FaceKey;
    const cubie = findOwningCubie(cube, hit.object);
    if (!cubie) return null;
    return { face, point: hit.point.clone(), cubie };
  }

  function onPointerDown(ev: PointerEvent): void {
    if (animator.isBusy()) return;
    ndcFromEvent(ev);
    const hit = findStickerHit();
    if (!hit) return;
    pending = {
      startScreen: new THREE.Vector2(ev.clientX, ev.clientY),
      hitFace: hit.face,
      hitCubie: hit.cubie,
      hitWorldPoint: hit.point
    };
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
  }

  function onPointerUp(ev: PointerEvent): void {
    if (!pending) return;
    const dx = ev.clientX - pending.startScreen.x;
    const dy = ev.clientY - pending.startScreen.y;
    if (Math.hypot(dx, dy) < threshold) { pending = null; return; }

    const move = resolveDragToMove(camera, pending, dx, dy);
    pending = null;
    if (move && animator.enqueue(move)) opts.onMove?.(move);
  }

  function onPointerCancel(): void { pending = null; }

  domEl.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerCancel);
  return () => {
    domEl.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
  };
}

function findOwningCubie(cube: CubeMesh, sticker: THREE.Object3D): Cubie | null {
  let n: THREE.Object3D | null = sticker;
  while (n) {
    const found = cube.cubies.find(c => c.mesh === n);
    if (found) return found;
    n = n.parent;
  }
  return null;
}

// Standard normal vectors for each face in cube-local (root) coords.
const FACE_NORMAL: Record<FaceKey, THREE.Vector3> = {
  R: new THREE.Vector3(1, 0, 0),
  L: new THREE.Vector3(-1, 0, 0),
  U: new THREE.Vector3(0, 1, 0),
  D: new THREE.Vector3(0, -1, 0),
  F: new THREE.Vector3(0, 0, 1),
  B: new THREE.Vector3(0, 0, -1)
};

// In-plane axes for each face: two perpendicular unit vectors lying in the face plane.
// Each entry maps a face to two rotation axes that quarter-turns of a layer along this face can pivot around.
const FACE_PLANE_AXES: Record<FaceKey, [THREE.Vector3, THREE.Vector3]> = {
  U: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  D: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)],
  R: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  L: [new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1)],
  F: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)],
  B: [new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 1, 0)]
};

function resolveDragToMove(
  camera: THREE.Camera,
  pending: PendingDrag,
  dx: number,
  dy: number
): string | null {
  // Project the two in-plane axes from the hit point into screen space; pick the one whose
  // screen direction better aligns with the drag vector. The cross product of that axis with
  // the face normal selects the rotation axis of the layer being swiped, and the sign tells us
  // which direction.
  const screenDrag = new THREE.Vector2(dx, -dy); // y inverted for screen space
  const [a1, a2] = FACE_PLANE_AXES[pending.hitFace];
  const s1 = projectDirToScreen(camera, pending.hitWorldPoint, a1);
  const s2 = projectDirToScreen(camera, pending.hitWorldPoint, a2);
  const dot1 = Math.abs(s1.dot(screenDrag));
  const dot2 = Math.abs(s2.dot(screenDrag));
  const dragAxis = dot1 >= dot2 ? a1 : a2;
  const dragScreen = dot1 >= dot2 ? s1 : s2;
  const sign = Math.sign(dragScreen.dot(screenDrag)) as 1 | -1 | 0;
  if (sign === 0) return null;

  // The swiped layer rotates around the axis perpendicular to (face normal, dragAxis):
  //   rotAxis = faceNormal × dragAxis.
  const faceNormal = FACE_NORMAL[pending.hitFace];
  const rotAxisVec = new THREE.Vector3().crossVectors(faceNormal, dragAxis).normalize();
  const rotAxis = dominantAxis(rotAxisVec);
  if (!rotAxis) return null;
  const rotAxisSign = (rotAxisVec[rotAxis] >= 0 ? 1 : -1) as 1 | -1;

  // The slice is the cubie's coord on this rotation axis.
  const slice = Math.round(pending.hitCubie.coord[rotAxis]);

  // Build the move name from (rotAxis, slice). Direction = positive screen drag along dragAxis
  // means rotation by +sign * rotAxisSign around rotAxisVec, i.e., dir = +sign * rotAxisSign.
  const dir = (sign * rotAxisSign) as 1 | -1;
  return moveFromAxisSlice(rotAxis, slice, dir);
}

function projectDirToScreen(
  camera: THREE.Camera,
  worldPoint: THREE.Vector3,
  dir: THREE.Vector3
): THREE.Vector2 {
  const a = worldPoint.clone().project(camera);
  const b = worldPoint.clone().add(dir).project(camera);
  return new THREE.Vector2(b.x - a.x, b.y - a.y);
}

function dominantAxis(v: THREE.Vector3): Axis | null {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  if (ax > ay && ax > az) return 'x';
  if (ay > ax && ay > az) return 'y';
  if (az > ax && az > ay) return 'z';
  return null;
}

// Map (axis, slice, dir) → move name. dir convention matches MoveAnimator (CW from +axis).
function moveFromAxisSlice(axis: Axis, slice: number, dir: 1 | -1): string | null {
  // Lookup: for each (axis, slice) what is the canonical move and which dir is its base?
  // Use BASE_MOVES table from animator.ts — replicated here to keep this module decoupled.
  // axis y, slice +1 → U (base dir +1); slice -1 → D (base dir -1); slice 0 → E (base dir -1).
  // axis x, slice +1 → R (+1); -1 → L (-1); 0 → M (-1).
  // axis z, slice +1 → F (+1); -1 → B (-1); 0 → S (+1).
  const TABLE: Record<Axis, Record<number, { name: string; baseDir: 1 | -1 }>> = {
    y: { 1: { name: 'U', baseDir: 1 }, [-1]: { name: 'D', baseDir: -1 }, 0: { name: 'E', baseDir: -1 } },
    x: { 1: { name: 'R', baseDir: 1 }, [-1]: { name: 'L', baseDir: -1 }, 0: { name: 'M', baseDir: -1 } },
    z: { 1: { name: 'F', baseDir: 1 }, [-1]: { name: 'B', baseDir: -1 }, 0: { name: 'S', baseDir: 1 } }
  };
  const entry = TABLE[axis][slice];
  if (!entry) return null;
  // If dir matches baseDir, plain move; otherwise prime.
  return dir === entry.baseDir ? entry.name : entry.name + "'";
}
