import { describe, expect, it } from 'vitest';
import { FACILITIES } from './cards';
import { chooseCpuAction } from './ai';
import { applyAction, isValidAction } from './engine';
import { mulberry32 } from './rng';
import { createGame } from './state';
import { coinDeltas, newGame, roll } from './testUtils';
import type { GameState } from './types';

const MAX_ACTIONS = 20000;

function cpuGame(n: number, seed: number): GameState {
  return createGame(
    { seats: Array.from({ length: n }, (_, i) => ({ name: `CPU${i + 1}`, isHuman: false })) },
    mulberry32(seed),
  );
}

describe('CPU', () => {
  it('CPU同士だけで100ゲーム回して、全ゲームが正常に終わる', () => {
    const turns: number[] = [];
    for (let g = 0; g < 100; g++) {
      const n = 2 + (g % 3);
      let s = cpuGame(n, g + 1);
      const rng = mulberry32(1000 + g);
      let count = 0;
      while (s.phase !== 'gameOver') {
        const action = chooseCpuAction(s);
        expect(isValidAction(s, action)).toBe(true);
        const before = s;
        const r = applyAction(s, action, rng);
        s = r.state;

        // 毎アクション：所持金がマイナスにならず、イベントと所持金の増減が一致する
        const d = coinDeltas(r.events, n);
        s.players.forEach((p, i) => {
          expect(p.coins).toBeGreaterThanOrEqual(0);
          expect(p.coins - before.players[i].coins).toBe(d[i]);
        });

        count++;
        if (count > MAX_ACTIONS) throw new Error(`ゲーム${g}が終わらない`);
      }
      expect(s.winner).toBeDefined();
      expect(Object.values(s.players[s.winner!].landmarks).every(Boolean)).toBe(true);
      turns.push(s.turn);
    }
    expect(turns).toHaveLength(100);
  });

  it('CPUの紫カードは1人1枚まで・在庫はマイナスにならない（30ゲーム中）', () => {
    for (let g = 0; g < 30; g++) {
      let s = cpuGame(4, 500 + g);
      const rng = mulberry32(g);
      while (s.phase !== 'gameOver') {
        s = applyAction(s, chooseCpuAction(s), rng).state;
        for (const p of s.players) {
          for (const id of ['stadium', 'tv', 'business'] as const) expect(p.cards[id]).toBeLessThanOrEqual(1);
        }
        expect(Object.values(s.supply).every((v) => v >= 0)).toBe(true);
      }
    }
  });

  it('テレビ局では一番お金を持っている人を選ぶ', () => {
    const s = newGame(4);
    s.players[0].cards.tv = 1;
    s.players[1].coins = 4;
    s.players[2].coins = 9;
    s.players[3].coins = 6;
    const r = roll(s, 6);
    expect(chooseCpuAction(r.state)).toEqual({ type: 'CHOOSE_TARGET', playerId: 0, targetId: 2 });
  });

  it('ビジネスセンターでは自分の一番安い施設と、相手の一番高い施設を交換', () => {
    const s = newGame(3);
    s.players[0].cards.business = 1;
    s.players[0].cards.forest = 1;
    s.players[1].cards.cheese = 1;
    s.players[2].cards.mine = 1;
    const r = roll(s, 6);
    const a = chooseCpuAction(r.state);
    expect(a).toMatchObject({ type: 'SWAP', targetId: 2, take: 'mine' });
    if (a.type === 'SWAP') expect(FACILITIES[a.give].cost).toBe(1);
  });

  it('駅がなければ1個、駅があり7以上の目のカードを持っていれば2個', () => {
    const s = newGame(2);
    s.players[0].personality = 'ranchFactory';
    expect(chooseCpuAction(s)).toMatchObject({ count: 1 });
    s.players[0].landmarks.station = true;
    expect(chooseCpuAction(s)).toMatchObject({ count: 1 });
    s.players[0].cards.cheese = 1;
    expect(chooseCpuAction(s)).toMatchObject({ count: 2 });
  });

  it('買えるならランドマークを買う', () => {
    const s = newGame(2);
    s.players[0].coins = 10;
    const r = roll(s, 5);
    const a = chooseCpuAction(r.state);
    expect(a.type === 'BUILD' && ['station', 'mall'].includes(a.id as string)).toBe(true);
  });

  it('電波塔：収入0なら振り直す', () => {
    const s = newGame(2);
    s.players[0].landmarks.tower = true;
    const r = roll(s, 5);
    expect(chooseCpuAction(r.state)).toEqual({ type: 'REROLL', playerId: 0 });
  });

  it('CPUの判断は入力の状態を変えない', () => {
    const s = newGame(2);
    s.players[0].landmarks.tower = true;
    const r = roll(s, 1).state;
    const snap = JSON.stringify(r);
    chooseCpuAction(r);
    expect(JSON.stringify(r)).toBe(snap);
  });
});

