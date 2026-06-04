// Logical Rubik's cube state, decoupled from Three.js.
// Faces: U(up), D(down), L(left), R(right), F(front), B(back).
// Each face is a flat array of 9 sticker colors (same letter as its solved face).
// Sticker indices, from the viewer's perspective looking at that face:
//   0 1 2
//   3 4 5
//   6 7 8

export type FaceKey = 'U' | 'D' | 'L' | 'R' | 'F' | 'B';
export type Color = FaceKey;

export type State = Record<FaceKey, Color[]>;

export function solvedState(): State {
  const mk = (c: Color): Color[] => Array(9).fill(c);
  return { U: mk('U'), D: mk('D'), L: mk('L'), R: mk('R'), F: mk('F'), B: mk('B') };
}

function rotateFaceCW(face: Color[]): Color[] {
  const f = face;
  return [f[6], f[3], f[0], f[7], f[4], f[1], f[8], f[5], f[2]];
}
function rotateFaceCCW(face: Color[]): Color[] {
  const f = face;
  return [f[2], f[5], f[8], f[1], f[4], f[7], f[0], f[3], f[6]];
}

// A "cycle" describes which (face, indices) move where for a CW quarter turn of a face layer.
// Each entry: 4 ordered groups of stickers; each turn shifts group i -> group i+1 (mod 4).
type Cycle = Array<[FaceKey, number[]]>;

const CYCLES: Record<FaceKey, Cycle> = {
  U: [
    ['F', [0, 1, 2]],
    ['L', [0, 1, 2]],
    ['B', [0, 1, 2]],
    ['R', [0, 1, 2]]
  ],
  D: [
    ['F', [6, 7, 8]],
    ['R', [6, 7, 8]],
    ['B', [6, 7, 8]],
    ['L', [6, 7, 8]]
  ],
  R: [
    ['U', [2, 5, 8]],
    ['B', [6, 3, 0]],
    ['D', [2, 5, 8]],
    ['F', [2, 5, 8]]
  ],
  L: [
    ['U', [0, 3, 6]],
    ['F', [0, 3, 6]],
    ['D', [0, 3, 6]],
    ['B', [8, 5, 2]]
  ],
  F: [
    ['U', [6, 7, 8]],
    ['R', [0, 3, 6]],
    ['D', [2, 1, 0]],
    ['L', [8, 5, 2]]
  ],
  B: [
    ['U', [2, 1, 0]],
    ['L', [0, 3, 6]],
    ['D', [6, 7, 8]],
    ['R', [8, 5, 2]]
  ]
};

function applyFaceTurn(state: State, face: FaceKey, prime: boolean): void {
  state[face] = prime ? rotateFaceCCW(state[face]) : rotateFaceCW(state[face]);
  const cycle = CYCLES[face];
  const order = prime ? [3, 2, 1, 0] : [0, 1, 2, 3];
  const groups = order.map(i => cycle[i]);
  const tmp = groups[0][1].map(idx => state[groups[0][0]][idx]);
  for (let i = 0; i < 3; i++) {
    const [fromFace, fromIdx] = groups[i + 1];
    const [toFace, toIdx] = groups[i];
    for (let k = 0; k < 3; k++) state[toFace][toIdx[k]] = state[fromFace][fromIdx[k]];
  }
  const [lastFace, lastIdx] = groups[3];
  for (let k = 0; k < 3; k++) state[lastFace][lastIdx[k]] = tmp[k];
}

// Slice and whole-cube rotations are expressed via face turns.
const COMPOUND: Record<string, string[]> = {
  M:  ["L", "R'", "x'"],   // middle layer follows L
  "M'": ["L'", "R", "x"],
  E:  ["D", "U'", "y'"],   // equatorial follows D
  "E'": ["D'", "U", "y"],
  S:  ["F'", "B", "z"],    // standing follows F
  "S'": ["F", "B'", "z'"],
  // Whole-cube rotations re-color faces (leave logical state shape intact via face permutations).
  // We model x/y/z as cycles of *labels* by applying face turns + relabel; here we approximate via face permutations:
};

// Whole-cube rotation: permute face arrays + rotate each face.
// x: rotate around R axis (clockwise looking from +X). F->U, U->B, B->D, D->F. L,R rotate.
function rotX(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const F = s.F, U = s.U, B = s.B, D = s.D;
    s.U = F;
    s.B = rotateFaceCW(rotateFaceCW(U));
    s.D = rotateFaceCW(rotateFaceCW(B));
    s.F = D;
    s.R = rotateFaceCW(s.R);
    s.L = rotateFaceCCW(s.L);
  } else {
    const F = s.F, U = s.U, B = s.B, D = s.D;
    s.F = U;
    s.U = rotateFaceCW(rotateFaceCW(B));
    s.B = rotateFaceCW(rotateFaceCW(D));
    s.D = F;
    s.R = rotateFaceCCW(s.R);
    s.L = rotateFaceCW(s.L);
  }
}
// y: rotate around U axis (clockwise looking from +Y). F->L, L->B, B->R, R->F.
function rotY(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const F = s.F, L = s.L, B = s.B, R = s.R;
    s.L = F; s.B = L; s.R = B; s.F = R;
    s.U = rotateFaceCW(s.U);
    s.D = rotateFaceCCW(s.D);
  } else {
    const F = s.F, L = s.L, B = s.B, R = s.R;
    s.F = L; s.L = B; s.B = R; s.R = F;
    s.U = rotateFaceCCW(s.U);
    s.D = rotateFaceCW(s.D);
  }
}
// z: rotate around F axis (clockwise looking from +Z). U->R, R->D, D->L, L->U.
function rotZ(state: State, prime: boolean): void {
  const s = state;
  if (!prime) {
    const U = s.U, R = s.R, D = s.D, L = s.L;
    s.R = rotateFaceCW(U);
    s.D = rotateFaceCW(R);
    s.L = rotateFaceCW(D);
    s.U = rotateFaceCW(L);
    s.F = rotateFaceCW(s.F);
    s.B = rotateFaceCCW(s.B);
  } else {
    const U = s.U, R = s.R, D = s.D, L = s.L;
    s.L = rotateFaceCCW(U);
    s.U = rotateFaceCCW(R);
    s.R = rotateFaceCCW(D);
    s.D = rotateFaceCCW(L);
    s.F = rotateFaceCCW(s.F);
    s.B = rotateFaceCW(s.B);
  }
}

export function applyMove(state: State, move: string): void {
  if (!move) return;
  if (COMPOUND[move]) {
    for (const m of COMPOUND[move]) applyMove(state, m);
    return;
  }
  const prime = move.endsWith("'");
  const base = prime ? move.slice(0, -1) : move;
  if (base === 'x') return rotX(state, prime);
  if (base === 'y') return rotY(state, prime);
  if (base === 'z') return rotZ(state, prime);
  if ('UDLRFB'.includes(base)) return applyFaceTurn(state, base as FaceKey, prime);
}

export function isSolved(state: State): boolean {
  return (Object.keys(state) as FaceKey[]).every(f =>
    state[f].every(c => c === state[f][4])
  );
}

export function cloneState(s: State): State {
  return {
    U: [...s.U], D: [...s.D], L: [...s.L], R: [...s.R], F: [...s.F], B: [...s.B]
  };
}
