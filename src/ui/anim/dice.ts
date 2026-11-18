// 3D サイコロの向きの計算。
// 立方体の面の置き方（CSS の座標：x は右、y は下、z は手前）：
//   1 = 手前(+z)  6 = 奥(-z)  3 = 右(+x)  4 = 左(-x)  2 = 上(-y)  5 = 下(+y)   ※向かい合う面の和は7
// 立方体には `rotateZ(z) rotateX(x) rotateY(y)` をかける。右から順に効くので、
// まず Y・X で出したい面を手前に向け、最後の Z は手前を向いたまま傾けるだけになる。

export interface Rotation {
  x: number;
  y: number;
  z: number;
}

/** 各面を手前に向けるための X・Y の回転（度） */
const FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  6: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  2: { x: -90, y: 0 },
  5: { x: 90, y: 0 },
};

/**
 * value の面が手前を向く回転。spinX・spinY 回ぶん余分に回して転がって見せ、tilt 度だけ傾ける。
 */
export function diceRotation(value: number, spinX = 0, spinY = 0, tilt = 0): Rotation {
  const f = FACE_ROTATION[value];
  if (!f) throw new Error(`サイコロの目は1〜6: ${value}`);
  return { x: f.x + 360 * spinX, y: f.y + 360 * spinY, z: tilt };
}

export function rotationCss(r: Rotation): string {
  return `rotateZ(${r.z}deg) rotateX(${r.x}deg) rotateY(${r.y}deg)`;
}

/** 面ごとの CSS（立方体の中心から half px 外へ出す） */
export const FACE_TRANSFORMS: Record<number, string> = {
  1: '',
  6: 'rotateY(180deg)',
  3: 'rotateY(90deg)',
  4: 'rotateY(-90deg)',
  2: 'rotateX(90deg)',
  5: 'rotateX(-90deg)',
};
