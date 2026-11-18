// テスト用の補助関数（本番コードからは使わない）
import { applyAction } from './engine';
import { mulberry32 } from './rng';
import { createGame } from './state';
import type { Action, ActionResult, GameEvent, GameState, Rng } from './types';

/** 全員人間の n 人ゲーム（手番順は P0, P1, ... に固定） */
export function newGame(n: number, seed = 1): GameState {
  const s = createGame(
    { seats: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHuman: true })) },
    mulberry32(seed),
  );
  s.players.forEach((p, i) => {
    p.id = i;
    p.name = `P${i}`;
  });
  return s;
}

/** 指定した目を順番に出す乱数 */
export function diceRng(...values: number[]): Rng {
  let i = 0;
  return () => {
    const v = values[i++];
    if (v === undefined) throw new Error('diceRng: 目が足りません');
    return (v - 0.5) / 6;
  };
}

export function act(s: GameState, action: Action, rng: Rng = () => 0): ActionResult {
  return applyAction(s, action, rng);
}

/** 手番プレイヤーが指定の目を振る */
export function roll(s: GameState, ...dice: number[]): ActionResult {
  return act(
    s,
    { type: 'CHOOSE_DICE', playerId: s.current, count: dice.length as 1 | 2 },
    diceRng(...dice),
  );
}

/** COINS_MOVED から各プレイヤーの所持金の増減を計算する */
export function coinDeltas(events: GameEvent[], n: number): number[] {
  const d = Array(n).fill(0);
  for (const e of events) {
    if (e.type !== 'COINS_MOVED') continue;
    if (e.from !== 'bank') d[e.from] -= e.amount;
    if (e.to !== 'bank') d[e.to] += e.amount;
  }
  return d;
}
