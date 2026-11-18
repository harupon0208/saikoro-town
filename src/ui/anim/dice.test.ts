import { describe, expect, it } from 'vitest';
import { FACE_TRANSFORMS, diceRotation } from './dice';

// CSS の rotateX / rotateY / rotateZ と同じ行列で、面の向き（法線）を回して確かめる
type V = [number, number, number];
const rad = (d: number) => (d * Math.PI) / 180;
const rx = (d: number, [x, y, z]: V): V => [x, y * Math.cos(rad(d)) - z * Math.sin(rad(d)), y * Math.sin(rad(d)) + z * Math.cos(rad(d))];
const ry = (d: number, [x, y, z]: V): V => [x * Math.cos(rad(d)) + z * Math.sin(rad(d)), y, -x * Math.sin(rad(d)) + z * Math.cos(rad(d))];
const rz = (d: number, [x, y, z]: V): V => [x * Math.cos(rad(d)) - y * Math.sin(rad(d)), x * Math.sin(rad(d)) + y * Math.cos(rad(d)), z];

/** 面の CSS（FACE_TRANSFORMS）から、その面が向いている方向を出す */
function faceNormal(value: number): V {
  const t = FACE_TRANSFORMS[value];
  const m = /rotate([XY])\((-?\d+)deg\)/.exec(t);
  const n: V = [0, 0, 1];
  if (!m) return n;
  return m[1] === 'X' ? rx(Number(m[2]), n) : ry(Number(m[2]), n);
}

/** 立方体の `rotateZ rotateX rotateY` を面の向きにかける（右から順） */
function apply(r: { x: number; y: number; z: number }, n: V): V {
  return rz(r.z, rx(r.x, ry(r.y, n)));
}

const close = (a: V, b: V) => a.every((v, i) => Math.abs(v - b[i]) < 1e-9);

describe('3D サイコロの向き', () => {
  it('向かい合う面の和は7（面の置き方が正しい）', () => {
    for (let v = 1; v <= 6; v++) {
      const a = faceNormal(v);
      const b = faceNormal(7 - v);
      expect(close(a, [-b[0], -b[1], -b[2]])).toBe(true);
    }
  });

  it('どの目でも、余分に何回転させても、傾けても、その目の面が手前を向く', () => {
    for (let v = 1; v <= 6; v++) {
      for (const [sx, sy, tilt] of [
        [0, 0, 0],
        [2, 1, 0],
        [3, 2, 9],
        [-1, 4, -12],
      ]) {
        const r = diceRotation(v, sx, sy, tilt);
        expect(close(apply(r, faceNormal(v)), [0, 0, 1])).toBe(true);
        // 他の面は手前を向かない
        for (let o = 1; o <= 6; o++) {
          if (o !== v) expect(apply(r, faceNormal(o))[2]).toBeLessThan(0.5);
        }
      }
    }
  });

  it('1〜6以外はエラー', () => {
    expect(() => diceRotation(0)).toThrow();
    expect(() => diceRotation(7)).toThrow();
  });
});
