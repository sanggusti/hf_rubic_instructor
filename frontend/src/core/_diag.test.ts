import { describe, it } from 'vitest';
import { CubeMesh } from '../scene/cube/cube';
import { parseMove } from '../scene/cube/animator';
import type { Axis } from '../scene/cube/cube';
import { solvedState, applyMove, type State, type FaceKey } from './state';

const FACE_POS: Record<FaceKey, (i: number) => [number, number, number]> = {
    F: i => [(i % 3) - 1, 1 - Math.floor(i / 3), 1],
    B: i => [1 - (i % 3), 1 - Math.floor(i / 3), -1],
    U: i => [(i % 3) - 1, 1, Math.floor(i / 3) - 1],
    D: i => [(i % 3) - 1, -1, 1 - Math.floor(i / 3)],
    R: i => [1, 1 - Math.floor(i / 3), 1 - (i % 3)],
    L: i => [-1, 1 - Math.floor(i / 3), (i % 3) - 1]
};
const FACE_DIR: Record<FaceKey, 'up' | 'down' | 'left' | 'right' | 'front' | 'back'> = {
    U: 'up', D: 'down', L: 'left', R: 'right', F: 'front', B: 'back'
};
const FACES: FaceKey[] = ['U', 'D', 'L', 'R', 'F', 'B'];

function addr(cube: CubeMesh, x: number, y: number, z: number) {
    const found = cube.cubies.find(c => {
        const cl = c.cubelet;
        return cl.addressX === x && cl.addressY === y && cl.addressZ === z;
    });
    if (!found) throw new Error(`no cubie at ${x},${y},${z}`);
    return found.cubelet;
}
function labelCube(cube: CubeMesh): void {
    for (const f of FACES) for (let i = 0; i < 9; i++) {
        const [x, y, z] = FACE_POS[f](i);
        (addr(cube, x, y, z)[FACE_DIR[f]] as any).color = `${f}${i}`;
    }
}
function labelState(): State {
    const s = solvedState();
    for (const f of FACES) for (let i = 0; i < 9; i++) (s[f] as any)[i] = `${f}${i}`;
    return s;
}
function deriveState(cube: CubeMesh): State {
    const s = solvedState();
    for (const f of FACES) for (let i = 0; i < 9; i++) {
        const [x, y, z] = FACE_POS[f](i);
        (s[f] as any)[i] = (addr(cube, x, y, z)[FACE_DIR[f]] as any).color;
    }
    return s;
}
function applyMoveGeo(cube: CubeMesh, name: string): void {
    const spec = parseMove(name)!;
    const axisAddr: Record<Axis, (c: any) => number> = { x: c => c.addressX, y: c => c.addressY, z: c => c.addressZ };
    const pick = axisAddr[spec.axis];
    for (const c of cube.cubies.filter(c => spec.slices.includes(pick(c.cubelet)))) c.cubelet.rotate(spec.axis, spec.dir);
}
const MOVES = ['U', "U'", 'D', "D'", 'L', "L'", 'R', "R'", 'F', "F'", 'B', "B'", 'M', "M'", 'E', "E'", 'S', "S'", 'x', "x'", 'y', "y'", 'z', "z'"];

describe('diag', () => {
    it('finds per-move orientation mismatches', () => {
        for (const m of MOVES) {
            const cube = new CubeMesh();
            labelCube(cube);
            const log = labelState();
            applyMoveGeo(cube, m);
            applyMove(log, m);
            const geo = deriveState(cube);
            const diffs: string[] = [];
            for (const f of FACES) for (let i = 0; i < 9; i++) {
                if ((log[f] as any)[i] !== (geo[f] as any)[i]) diffs.push(`${f}${i}: log=${(log[f] as any)[i]} geo=${(geo[f] as any)[i]}`);
            }
            if (diffs.length) console.log(`MOVE ${m} -> ${diffs.length} diffs:`, diffs.join(' | '));
        }
    });
});
