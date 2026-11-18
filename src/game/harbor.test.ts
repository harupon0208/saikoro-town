// 港の拡張のルール
import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from './ai';
import { FACILITIES, facilityIdsFor, playerLandmarks } from './cards';
import { applyAction, isValidAction, rollTotal } from './engine';
import { MARKET_KINDS } from './market';
import { mulberry32 } from './rng';
import { createGame } from './state';
import { act, coinDeltas, diceRng, roll } from './testUtils';
import type { FacilityId, GameOptions, GameState } from './types';

const HARBOR: GameOptions = { expansions: ['harbor'], market: 'all' };
const HARBOR_TEN: GameOptions = { expansions: ['harbor'], market: 'ten' };

/** 全員人間の n 人ゲーム（手番順は P0, P1, ... に固定） */
function harborGame(n: number, options: GameOptions = HARBOR, seed = 1): GameState {
  const s = createGame(
    { seats: Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isHuman: true })), options },
    mulberry32(seed),
  );
  s.players.forEach((p, i) => {
    p.id = i;
    p.name = `P${i}`;
  });
  return s;
}

const kinds = (s: GameState) => (Object.keys(s.supply) as FacilityId[]).filter((id) => s.supply[id] > 0);

describe('港の拡張：準備', () => {
  it('ランドマークは6つ（港・空港が増える）。基本セットは4つのまま', () => {
    expect(Object.keys(harborGame(2).players[0].landmarks)).toEqual([
      'station',
      'mall',
      'park',
      'tower',
      'harbor',
      'airport',
    ]);
    const base = createGame({ seats: [{ name: 'A', isHuman: true }, { name: 'B', isHuman: true }] }, () => 0);
    expect(Object.keys(base.players[0].landmarks)).toHaveLength(4);
    expect(base.options).toBeUndefined();
    expect(base.supply.sushi).toBe(0);
  });

  it('画面に出すランドマークの並びはコストの安い順', () => {
    expect(playerLandmarks(harborGame(2).players[0])).toEqual(['harbor', 'station', 'mall', 'park', 'tower', 'airport']);
  });

  it('全種類を並べる：拡張の施設も6枚ずつ、紫は人数ぶん', () => {
    const s = harborGame(3);
    expect(s.supply.sushi).toBe(6);
    expect(s.supply.tuna).toBe(6);
    expect(s.supply.publisher).toBe(3);
    expect(s.supply.tax).toBe(3);
    expect(kinds(s)).toHaveLength(25);
  });

  it('10種類だけ並べる：並んでいるのは10種類。並んでいる分＋山札＝全カード', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = harborGame(4, HARBOR_TEN, seed);
      expect(kinds(s)).toHaveLength(MARKET_KINDS);
      const total = facilityIdsFor(HARBOR_TEN).reduce((a, id) => {
        const st = FACILITIES[id].stock;
        return a + (st === 'players' ? 4 : st);
      }, 0);
      const shown = Object.values(s.supply).reduce((a, b) => a + b, 0);
      expect(shown + s.deck!.length).toBe(total);
    }
  });
});

describe('港', () => {
  function withHarbor() {
    const s = harborGame(2);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.harbor = true;
    return s;
  }

  it('合計10以上なら「+2するか」を選ぶ。+2すると12として収入を処理する', () => {
    const s = withHarbor();
    s.players[0].cards.market = 1; // 青果市場 11–12：麦畑1枚 × 2
    const r = roll(s, 5, 5);
    expect(r.state.phase).toBe('harbor');
    const add = act(r.state, { type: 'HARBOR', playerId: 0, add: true });
    expect(rollTotal(add.state)).toBe(12);
    expect(add.events).toContainEqual({ type: 'HARBOR_ADDED', playerId: 0 });
    expect(add.state.players[0].coins).toBe(3 + 2);
    expect(add.state.phase).toBe('build');

    const keep = act(r.state, { type: 'HARBOR', playerId: 0, add: false });
    expect(rollTotal(keep.state)).toBe(10);
    expect(keep.state.players[0].coins).toBe(3);
  });

  it('合計9以下、または港がなければ選ばない', () => {
    expect(roll(withHarbor(), 4, 5).state.phase).toBe('build');
    const s = harborGame(2);
    s.players[0].landmarks.station = true;
    expect(roll(s, 5, 5).state.phase).toBe('build');
  });

  it('電波塔があれば、振り直すかを先に決めてから港を選ぶ', () => {
    const s = withHarbor();
    s.players[0].landmarks.tower = true;
    const r = roll(s, 6, 5);
    expect(r.state.phase).toBe('rolled');
    expect(act(r.state, { type: 'KEEP', playerId: 0 }).state.phase).toBe('harbor');
    const re = act(r.state, { type: 'REROLL', playerId: 0 }, diceRng(6, 6));
    expect(re.state.phase).toBe('harbor');
  });

  it('次の手番では+2は消えている', () => {
    const s = withHarbor();
    const r = act(roll(s, 5, 5).state, { type: 'HARBOR', playerId: 0, add: true });
    const next = act(r.state, { type: 'BUILD', playerId: 0, id: null });
    expect(next.state.harborBonus).toBeUndefined();
  });
});

describe('港の拡張の施設', () => {
  it('寿司屋・サバ漁船は港がないと発動しない', () => {
    const s = harborGame(2);
    s.players[1].cards.sushi = 1;
    s.players[1].cards.mackerel = 1;
    let r = roll(s, 1);
    expect(r.events.some((e) => e.type === 'CARD_TRIGGERED' && e.cardId === 'sushi')).toBe(false);
    s.players[1].landmarks.harbor = true;
    r = roll(s, 1);
    // 振った人：麦畑+1・寿司屋-3。持ち主：麦畑+1・寿司屋+3
    expect(coinDeltas(r.events, 2)).toEqual([1 - 3, 1 + 3]);
  });

  it('寿司屋：港があれば振った人から3コイン（モールで4）', () => {
    const s = harborGame(2);
    s.players[0].coins = 10;
    s.players[1].cards.sushi = 1;
    s.players[1].landmarks.harbor = true;
    s.players[1].landmarks.mall = true;
    const r = roll(s, 1);
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 0, to: 1, amount: 4, cardId: 'sushi' });
  });

  it('サバ漁船：港があれば誰の手番でも3コイン', () => {
    const s = harborGame(2);
    s.players[0].landmarks.station = true;
    s.players[1].cards.mackerel = 2;
    s.players[1].landmarks.harbor = true;
    const r = roll(s, 4, 4);
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 'bank', to: 1, amount: 6, cardId: 'mackerel' });
  });

  it('マグロ漁船：手番の人が2個振った合計 × 枚数。持っている人全員が同じ目を使う', () => {
    const s = harborGame(3);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.harbor = true;
    s.players[1].landmarks.harbor = true;
    s.players[1].cards.tuna = 2;
    s.players[2].cards.tuna = 1; // 港がない
    s.players[0].cards.tuna = 1;
    const r = act(roll(s, 6, 6).state, { type: 'HARBOR', playerId: 0, add: false }, diceRng(3, 4));
    const tunaRolls = r.events.filter((e) => e.type === 'TUNA_ROLLED');
    expect(tunaRolls).toEqual([{ type: 'TUNA_ROLLED', playerId: 0, dice: [3, 4] }]);
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 'bank', to: 0, amount: 7, cardId: 'tuna' });
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 'bank', to: 1, amount: 14, cardId: 'tuna' });
    expect(r.state.players[2].coins).toBe(3);
  });

  it('花畑と花屋：花屋は自分の花畑の枚数 × 1（モールで × 2）', () => {
    const s = harborGame(2);
    s.players[0].cards.flower = 2;
    s.players[0].cards.flowerShop = 1;
    s.players[0].landmarks.station = true;
    expect(roll(s, 4).events).toContainEqual({
      type: 'COINS_MOVED',
      from: 'bank',
      to: 0,
      amount: 2,
      cardId: 'flower',
    });
    s.players[0].landmarks.mall = true;
    expect(roll(s, 3, 3).events).toContainEqual({
      type: 'COINS_MOVED',
      from: 'bank',
      to: 0,
      amount: 4,
      cardId: 'flowerShop',
    });
  });

  it('食品倉庫：自分の☕の枚数 × 2', () => {
    const s = harborGame(2);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.harbor = true;
    s.players[0].cards.warehouse = 1;
    s.players[0].cards.cafe = 1;
    s.players[0].cards.pizza = 2;
    const r = act(roll(s, 6, 6).state, { type: 'HARBOR', playerId: 0, add: true }); // 14 は倉庫の目ではない
    expect(r.events.some((e) => e.type === 'CARD_TRIGGERED' && e.cardId === 'warehouse')).toBe(false);
    const r2 = act(roll(s, 6, 6).state, { type: 'HARBOR', playerId: 0, add: false });
    expect(r2.events).toContainEqual({ type: 'COINS_MOVED', from: 'bank', to: 0, amount: 6, cardId: 'warehouse' });
  });

  it('ピザ屋は7、ハンバーガー屋は8で、振った人から1コイン', () => {
    const s = harborGame(2);
    s.players[0].landmarks.station = true;
    s.players[1].cards.pizza = 1;
    s.players[1].cards.burger = 1;
    expect(roll(s, 3, 4).events).toContainEqual({ type: 'COINS_MOVED', from: 0, to: 1, amount: 1, cardId: 'pizza' });
    expect(roll(s, 4, 4).events).toContainEqual({ type: 'COINS_MOVED', from: 0, to: 1, amount: 1, cardId: 'burger' });
  });

  it('出版社：相手全員から、☕と🏪のカード1枚につき1コイン', () => {
    const s = harborGame(3);
    s.players[0].landmarks.station = true;
    s.players[0].cards.publisher = 1;
    s.players[1].cards.cafe = 2; // パン屋1 + カフェ2 = 3
    s.players[1].coins = 10;
    const r = roll(s, 3, 4);
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 1, to: 0, amount: 3, cardId: 'publisher' });
    expect(r.events).toContainEqual({ type: 'COINS_MOVED', from: 2, to: 0, amount: 1, cardId: 'publisher' });
  });

  it('税務署：10コイン以上の相手から半分（切り捨て）。9コイン以下からは取らない', () => {
    const s = harborGame(3);
    s.players[0].landmarks.station = true;
    s.players[0].cards.tax = 1;
    s.players[1].coins = 11;
    s.players[2].coins = 9;
    const r = roll(s, 4, 4);
    expect(r.state.players[1].coins).toBe(6);
    expect(r.state.players[2].coins).toBe(9);
    expect(r.state.players[0].coins).toBe(3 + 5);
  });
});

describe('空港・勝利', () => {
  it('空港：何も建てなかった手番は10コイン。建てたらもらえない', () => {
    const s = harborGame(2);
    s.players[0].landmarks.airport = true;
    const built = roll(s, 6).state;
    const none = act(built, { type: 'BUILD', playerId: 0, id: null });
    expect(none.events).toContainEqual({ type: 'COINS_MOVED', from: 'bank', to: 0, amount: 10, cardId: 'airport' });
    expect(none.state.players[0].coins).toBe(13);
    const bought = act(built, { type: 'BUILD', playerId: 0, id: 'wheat' });
    expect(bought.state.players[0].coins).toBe(2);
  });

  it('勝つには6つ全部。基本の4つだけでは勝てない', () => {
    const s = harborGame(2);
    const p = s.players[0];
    p.landmarks = { station: true, mall: true, park: true, tower: false, harbor: false, airport: true };
    p.coins = 30;
    s.phase = 'build';
    s.dice = [6];
    const r = act(s, { type: 'BUILD', playerId: 0, id: 'tower' });
    expect(r.state.phase).not.toBe('gameOver');
    const again = { ...r.state, current: 0, phase: 'build' as const };
    const r2 = act(again, { type: 'BUILD', playerId: 0, id: 'harbor' });
    expect(r2.state.phase).toBe('gameOver');
    expect(r2.state.winner).toBe(0);
  });

  it('港・空港は建設の候補に出る（基本セットでは出ない）', () => {
    const s = harborGame(2);
    s.players[0].coins = 40;
    const r = roll(s, 6);
    expect(isValidAction(r.state, { type: 'BUILD', playerId: 0, id: 'airport' })).toBe(true);
    const base = createGame({ seats: [{ name: 'A', isHuman: true }, { name: 'B', isHuman: true }] }, () => 0.9);
    base.players[base.current].coins = 40;
    const rb = roll(base, 6);
    expect(isValidAction(rb.state, { type: 'BUILD', playerId: rb.state.current, id: 'airport' })).toBe(false);
    expect(isValidAction(rb.state, { type: 'BUILD', playerId: rb.state.current, id: 'sushi' })).toBe(false);
  });
});

describe('10種類だけ並べる市場', () => {
  it('山を買い切ったら、山札から引いて10種類に戻す', () => {
    const s = harborGame(2, HARBOR_TEN, 3);
    const id = kinds(s)[0];
    s.supply[id] = 1;
    s.players[0].coins = 20;
    const r = act(roll(s, 6).state, { type: 'BUILD', playerId: 0, id });
    expect(r.state.supply[id]).toBe(0);
    expect(kinds(r.state)).toHaveLength(MARKET_KINDS);
    const refill = r.events.find((e) => e.type === 'MARKET_REFILLED');
    expect(refill).toBeDefined();
    expect(r.state.deck!.length).toBe(s.deck!.length - (refill as { cards: FacilityId[] }).cards.length);
  });

  it('補充したとき、新しく並んだ種類と、今ある山に重ねた種類を記録する', () => {
    const s = harborGame(2, HARBOR_TEN, 3);
    for (const id of Object.keys(s.supply) as FacilityId[]) s.supply[id] = 0;
    const shown: FacilityId[] = ['wheat', 'ranch', 'bakery', 'cafe', 'convenience', 'forest', 'cheese', 'furniture', 'mine', 'apple'];
    for (const id of shown) s.supply[id] = 2;
    s.supply.wheat = 1;
    s.deck = ['ranch', 'sushi', 'tuna'];
    s.players[0].coins = 5;
    s.phase = 'build';
    s.dice = [6];
    const r = act(s, { type: 'BUILD', playerId: 0, id: 'wheat' });
    expect(r.events).toContainEqual({
      type: 'MARKET_REFILLED',
      cards: ['ranch', 'sushi'],
      newKinds: ['sushi'],
      restocked: ['ranch'],
    });
    expect(r.state.refill).toEqual({ turn: s.turn, newKinds: ['sushi'], restocked: ['ranch'] });
    expect(r.state.deck).toEqual(['tuna']);
    expect(r.state.log.map((l) => l.text)).toContain('市場に新しいカード（新しく並んだ：寿司屋 ／ 補充：牧場）');
  });

  it('並んでいないカードは建てられない', () => {
    const s = harborGame(2, HARBOR_TEN, 3);
    const hidden = facilityIdsFor(HARBOR_TEN).find((id) => s.supply[id] === 0)!;
    s.players[0].coins = 20;
    const r = roll(s, 6);
    expect(isValidAction(r.state, { type: 'BUILD', playerId: 0, id: hidden })).toBe(false);
  });
});

describe('CPU（港の拡張）', () => {
  for (const options of [HARBOR, HARBOR_TEN]) {
    it(`CPU同士で30ゲーム回して全部ちゃんと終わる（市場：${options.market}）`, { timeout: 30_000 }, () => {
      for (let g = 0; g < 30; g++) {
        const n = 2 + (g % 3);
        let s = createGame(
          { seats: Array.from({ length: n }, (_, i) => ({ name: `C${i}`, isHuman: false })), options },
          mulberry32(g + 7),
        );
        const rng = mulberry32(500 + g);
        let count = 0;
        while (s.phase !== 'gameOver') {
          const action = chooseCpuAction(s);
          expect(isValidAction(s, action)).toBe(true);
          const before = s;
          const r = applyAction(s, action, rng);
          s = r.state;
          const d = coinDeltas(r.events, n);
          s.players.forEach((p, i) => {
            expect(p.coins).toBeGreaterThanOrEqual(0);
            expect(p.coins - before.players[i].coins).toBe(d[i]);
          });
          for (const id of Object.keys(s.supply) as FacilityId[]) expect(s.supply[id]).toBeGreaterThanOrEqual(0);
          if (++count > 20000) throw new Error(`ゲーム${g}が終わらない`);
        }
        expect(Object.values(s.players[s.winner!].landmarks)).toHaveLength(6);
        expect(Object.values(s.players[s.winner!].landmarks).every(Boolean)).toBe(true);
      }
    });
  }
});
