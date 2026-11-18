import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from '../../game/ai';
import { applyAction } from '../../game/engine';
import { mulberry32 } from '../../game/rng';
import { createGame } from '../../game/state';
import type { GameEvent, GameState } from '../../game/types';
import {
  BASE_MS,
  LANDMARK_MS,
  accumulateRollEvents,
  buildSteps,
  coinDeltas,
  coinTiming,
  replayAll,
  viewAt,
} from './timeline';

function cpuGame(n: number, seed: number): GameState {
  return createGame(
    { seats: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isHuman: false })) },
    mulberry32(seed),
  );
}

/** CPU 同士で最後まで遊び、1アクションごとに (前の状態, 結果, イベント) を集める */
function playThrough(n: number, seed: number) {
  const rng = mulberry32(seed + 1000);
  let s = cpuGame(n, seed);
  const records: { from: GameState; to: GameState; events: GameEvent[] }[] = [];
  for (let i = 0; i < 5000 && s.phase !== 'gameOver'; i++) {
    const r = applyAction(s, chooseCpuAction(s), rng);
    records.push({ from: s, to: r.state, events: r.events });
    s = r.state;
  }
  return records;
}

const roll = (dice: number[]): GameEvent => ({ type: 'DICE_ROLLED', playerId: 0, dice });

describe('buildSteps：コマ分け', () => {
  it('サイコロ → 青・緑の収入はまとめて1コマ → 手番交代', () => {
    const events: GameEvent[] = [
      roll([1]),
      { type: 'CARD_TRIGGERED', playerId: 0, cardId: 'wheat' },
      { type: 'COINS_MOVED', from: 'bank', to: 0, amount: 1, cardId: 'wheat' },
      { type: 'CARD_TRIGGERED', playerId: 1, cardId: 'wheat' },
      { type: 'COINS_MOVED', from: 'bank', to: 1, amount: 1, cardId: 'wheat' },
    ];
    const steps = buildSteps(events, 'normal');
    expect(steps.map((s) => s.kind)).toEqual(['dice', 'income']);
    expect(steps[1].events).toHaveLength(4);
  });

  it('赤と青・緑は別のコマ（赤が先）', () => {
    const events: GameEvent[] = [
      roll([3]),
      { type: 'CARD_TRIGGERED', playerId: 1, cardId: 'cafe' },
      { type: 'COINS_MOVED', from: 0, to: 1, amount: 1, cardId: 'cafe' },
      { type: 'CARD_TRIGGERED', playerId: 0, cardId: 'bakery' },
      { type: 'COINS_MOVED', from: 'bank', to: 0, amount: 1, cardId: 'bakery' },
    ];
    expect(buildSteps(events, 'normal').map((s) => s.kind)).toEqual(['dice', 'income', 'income']);
  });

  it('紫はカードごとに別のコマ', () => {
    const events: GameEvent[] = [
      roll([6]),
      { type: 'CARD_TRIGGERED', playerId: 0, cardId: 'stadium' },
      { type: 'COINS_MOVED', from: 1, to: 0, amount: 2, cardId: 'stadium' },
      { type: 'CARD_TRIGGERED', playerId: 0, cardId: 'tv' },
      { type: 'COINS_MOVED', from: 1, to: 0, amount: 5, cardId: 'tv' },
    ];
    expect(buildSteps(events, 'normal').map((s) => s.kind)).toEqual(['dice', 'income', 'income']);
  });

  it('建設は「支払い＋建設」を1コマ。ランドマーク完成は0.8秒', () => {
    const facility = buildSteps(
      [
        { type: 'COINS_MOVED', from: 0, to: 'bank', amount: 1, cardId: 'wheat' },
        { type: 'BUILT', playerId: 0, id: 'wheat' },
        { type: 'TURN_STARTED', playerId: 1 },
      ],
      'normal',
    );
    expect(facility.map((s) => [s.kind, s.ms])).toEqual([
      ['build', BASE_MS.build],
      ['turn', BASE_MS.turn],
    ]);

    const landmark = buildSteps(
      [
        { type: 'COINS_MOVED', from: 0, to: 'bank', amount: 4, cardId: 'station' },
        { type: 'BUILT', playerId: 0, id: 'station' },
        { type: 'LANDMARK_COMPLETED', playerId: 0, id: 'station' },
      ],
      'normal',
    );
    expect(landmark).toHaveLength(1);
    expect(landmark[0].ms).toBe(LANDMARK_MS);
  });

  it('勝利・遊園地の追加手番もコマになる', () => {
    const steps = buildSteps(
      [
        { type: 'EXTRA_TURN', playerId: 0 },
        { type: 'TURN_STARTED', playerId: 0 },
        { type: 'GAME_WON', playerId: 0 },
      ],
      'normal',
    );
    expect(steps.map((s) => s.kind)).toEqual(['extraTurn', 'turn', 'win']);
    expect(steps[2].ms).toBe(BASE_MS.win);
  });

  it('「はやい」は時間が短く、「なし」はコマなし', () => {
    const events = [roll([4])];
    expect(buildSteps(events, 'fast')[0].ms).toBeLessThan(BASE_MS.dice);
    expect(buildSteps(events, 'fast')[0].ms).toBeGreaterThan(0);
    expect(buildSteps(events, 'none')).toEqual([]);
  });

  it('実際のゲームで、どのイベントもちょうど1回ずつコマに入る', () => {
    for (const seed of [1, 2, 3]) {
      for (const r of playThrough(4, seed)) {
        const flat = buildSteps(r.events, 'normal').flatMap((s) => s.events);
        expect(flat).toEqual(r.events);
      }
    }
  });
});

describe('viewAt / replayAll：画面の状態', () => {
  it('全イベントを再生すると、所持金・カード・ランドマーク・在庫・出目・手番がエンジンの結果と一致する（60ゲーム）', () => {
    let checked = 0;
    for (let seed = 1; seed <= 60; seed++) {
      for (const r of playThrough(2 + (seed % 3), seed)) {
        const v = replayAll(r.from, r.events);
        expect(v.players).toEqual(r.to.players);
        expect(v.supply).toEqual(r.to.supply);
        expect(v.dice).toEqual(r.to.dice);
        expect(v.current).toBe(r.to.current);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('再生中はフェーズ・ターン・ログが前のまま、最後まで行くと結果になる', () => {
    const rec = playThrough(3, 7).find((r) => r.events.some((e) => e.type === 'TURN_STARTED'))!;
    const steps = buildSteps(rec.events, 'normal');
    const mid = viewAt(rec.from, rec.to, steps, 0);
    expect(mid.phase).toBe(rec.from.phase);
    expect(mid.turn).toBe(rec.from.turn);
    expect(mid.log).toEqual(rec.from.log);
    expect(viewAt(rec.from, rec.to, steps, steps.length)).toBe(rec.to);
  });

  it('コマを1つずつ進めると、所持金はそのコマの分だけ動く', () => {
    const rec = playThrough(4, 11).find((r) =>
      r.events.some((e) => e.type === 'COINS_MOVED' && e.from === 'bank'),
    )!;
    const steps = buildSteps(rec.events, 'normal');
    let prevCoins = rec.from.players.map((p) => p.coins);
    steps.forEach((step, i) => {
      const coins = viewAt(rec.from, rec.to, steps, i).players.map((p) => p.coins);
      const d = coinDeltas(step);
      coins.forEach((c, id) => expect(c - prevCoins[id]).toBe(d.get(id) ?? 0));
      prevCoins = coins;
    });
  });

  it('入力の状態を書き換えない', () => {
    const rec = playThrough(2, 5)[3];
    const before = JSON.stringify(rec.from);
    viewAt(rec.from, rec.to, buildSteps(rec.events, 'normal'), 0);
    replayAll(rec.from, rec.events);
    expect(JSON.stringify(rec.from)).toBe(before);
  });
});

describe('accumulateRollEvents：サイコロ欄の表示', () => {
  it('振るとリセット、収入は貯まり、建設の支払いと手番交代は入らない', () => {
    const income: GameEvent = { type: 'COINS_MOVED', from: 'bank', to: 0, amount: 1, cardId: 'wheat' };
    let acc = accumulateRollEvents([income], [roll([2])]);
    expect(acc).toEqual([roll([2])]);
    acc = accumulateRollEvents(acc, [{ type: 'CARD_TRIGGERED', playerId: 0, cardId: 'wheat' }, income]);
    expect(acc).toHaveLength(3);
    acc = accumulateRollEvents(acc, [
      { type: 'COINS_MOVED', from: 0, to: 'bank', amount: 1, cardId: 'ranch' },
      { type: 'BUILT', playerId: 0, id: 'ranch' },
      { type: 'TURN_STARTED', playerId: 1 },
    ]);
    expect(acc).toHaveLength(3);
  });
});

describe('coinDeltas', () => {
  it('同じ人への出入りを合計し、0 は出さない', () => {
    const d = coinDeltas({
      kind: 'income',
      ms: 0,
      events: [
        { type: 'COINS_MOVED', from: 1, to: 0, amount: 2, cardId: 'restaurant' },
        { type: 'COINS_MOVED', from: 'bank', to: 1, amount: 2, cardId: 'wheat' },
        { type: 'COINS_MOVED', from: 'bank', to: 0, amount: 3, cardId: 'convenience' },
      ],
    });
    expect([...d.entries()].sort()).toEqual([[0, 5]]);
  });
});

describe('coinTiming', () => {
  it('収入はカードが光ってから飛び、コマの中で届き終わる', () => {
    const t = coinTiming({ kind: 'income', ms: 1000, events: [] });
    expect(t.delay).toBeGreaterThan(0);
    expect(t.arrive).toBeGreaterThan(t.delay);
    expect(t.delay + t.fly).toBeLessThanOrEqual(1000);
  });
  it('建設の支払いはすぐ飛ぶ', () => {
    const t = coinTiming({ kind: 'build', ms: 800, events: [] });
    expect(t.delay).toBe(0);
    expect(t.fly).toBeLessThanOrEqual(800);
  });
});
