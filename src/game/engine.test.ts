import { describe, expect, it } from 'vitest';
import { FACILITIES } from './cards';
import { getBuildOptions, isValidAction } from './engine';
import { createGame } from './state';
import { mulberry32 } from './rng';
import { act, coinDeltas, diceRng, newGame, roll } from './testUtils';
import type { GameState } from './types';

describe('初期状態', () => {
  it('全員3コイン・麦畑1・パン屋1・ランドマーク未建設', () => {
    for (const n of [2, 3, 4]) {
      const s = newGame(n);
      expect(s.players).toHaveLength(n);
      for (const p of s.players) {
        expect(p.coins).toBe(3);
        expect(p.cards.wheat).toBe(1);
        expect(p.cards.bakery).toBe(1);
        const others = Object.entries(p.cards).filter(([id]) => id !== 'wheat' && id !== 'bakery');
        expect(others.every(([, c]) => c === 0)).toBe(true);
        expect(Object.values(p.landmarks).every((b) => b === false)).toBe(true);
      }
      expect(s.phase).toBe('chooseDice');
      expect(s.supply.wheat).toBe(6); // 初期カードは在庫から減らさない
      expect(s.supply.bakery).toBe(6);
    }
  });

  it('手番順はランダム（席の並びが入れ替わる）', () => {
    const seats = ['A', 'B', 'C', 'D'].map((name) => ({ name, isHuman: true }));
    const orders = new Set(
      Array.from({ length: 20 }, (_, i) =>
        createGame({ seats }, mulberry32(i)).players.map((p) => p.name).join(''),
      ),
    );
    expect(orders.size).toBeGreaterThan(1);
  });

  it('CPUには性格が割り当てられる', () => {
    const s = createGame(
      { seats: [{ name: 'あなた', isHuman: true }, { name: 'CPU', isHuman: false }] },
      mulberry32(3),
    );
    const cpu = s.players.find((p) => !p.isHuman)!;
    const human = s.players.find((p) => p.isHuman)!;
    expect(cpu.personality).toBeDefined();
    expect(human.personality).toBeUndefined();
  });
});

describe('青カード', () => {
  it('他人の手番でも収入が入る', () => {
    const s = newGame(2);
    const { state } = roll(s, 1); // P0 が 1
    expect(state.players[0].coins).toBe(4);
    expect(state.players[1].coins).toBe(4); // P1 の麦畑も発動
  });
});

describe('緑カード', () => {
  it('自分の手番でしか収入が入らない', () => {
    let s = newGame(2);
    s.players[1].cards.convenience = 1;
    s = roll(s, 4).state; // P0 の手番で 4
    expect(s.players[1].coins).toBe(3);
    s = act(s, { type: 'BUILD', playerId: 0, id: null }).state;
    s = roll(s, 4).state; // P1 の手番で 4
    expect(s.players[1].coins).toBe(6);
  });
});

describe('赤カード', () => {
  it('振った人から奪う。逆順で処理し、足りなければある分だけ（6章の例）', () => {
    const s = newGame(4);
    s.players[0].coins = 2; // A
    s.players[1].cards.cafe = 1; // B
    s.players[3].cards.cafe = 2; // D
    const { state, events } = roll(s, 3);
    expect(state.players[3].coins).toBe(5); // D が先に2コイン
    expect(state.players[1].coins).toBe(3); // B は何ももらえない
    expect(state.players[0].coins).toBe(1); // A は0になった後にパン屋で+1
    const moves = events.filter((e) => e.type === 'COINS_MOVED');
    expect(moves[0]).toMatchObject({ from: 0, to: 3, amount: 2, cardId: 'cafe' });
    expect(moves.some((e) => e.type === 'COINS_MOVED' && e.to === 1)).toBe(false);
  });

  it('自分の赤カードは自分の手番では発動しない', () => {
    const s = newGame(2);
    s.players[0].cards.cafe = 1;
    const { state } = roll(s, 3);
    expect(state.players[0].coins).toBe(4); // パン屋だけ
  });
});

describe('処理の順番', () => {
  it('赤 → 青緑 → 紫：赤で0になった後に緑で収入が入る', () => {
    const s = newGame(2);
    s.players[0].coins = 1;
    s.players[1].cards.cafe = 1;
    const { state } = roll(s, 3);
    expect(state.players[1].coins).toBe(4);
    expect(state.players[0].coins).toBe(1); // 1→0→パン屋で1
  });

  it('イベントが 赤 → 青緑 → 紫 の順に並ぶ', () => {
    // 6 の目で赤・青・緑・紫が全部出るカードはないので、紫の発動を 6、赤緑青を別の目で確認する
    let s = newGame(3);
    s.players[0].cards.stadium = 1;
    s.players[0].landmarks.station = true;
    s.players[1].cards.restaurant = 1; // 赤 9-10
    s.players[2].cards.apple = 1; // 青 10
    s.players[0].cards.apple = 1; // 青 10（自分）
    const r1 = roll(s, 4, 6); // 10
    const colors1 = r1.events
      .filter((e) => e.type === 'CARD_TRIGGERED')
      .map((e) => (e.type === 'CARD_TRIGGERED' ? FACILITIES[e.cardId].color : ''));
    expect(colors1).toEqual(['red', 'blue', 'blue']);

    s = newGame(3);
    s.players[0].cards.stadium = 1;
    s.players[0].landmarks.station = true;
    s.players[1].cards.cafe = 1; // 赤 3
    s.players[0].cards.bakery = 1; // 緑 3
    s.players[0].coins = 5;
    // 3 は1個振りで。紫は 6 で別途確認
    const r2 = roll(s, 3);
    const order2 = r2.events.filter((e) => e.type === 'CARD_TRIGGERED').map((e) => (e as { cardId: string }).cardId);
    expect(order2).toEqual(['cafe', 'bakery']);

    // 6：スタジアム（紫）は最後
    s = newGame(3);
    s.players[0].cards.stadium = 1;
    s.players[1].cards.cafe = 1;
    const r3 = roll(s, 6);
    const triggered = r3.events.filter((e) => e.type === 'CARD_TRIGGERED');
    expect(triggered.at(-1)).toMatchObject({ cardId: 'stadium' });
  });

  it('紫の中ではスタジアム → テレビ局の順。選択待ちで止まる', () => {
    const s = newGame(3);
    s.players[0].cards.tv = 1;
    s.players[0].cards.stadium = 1;
    const { state, events } = roll(s, 6);
    expect(state.pendingChoice).toEqual({ type: 'tv', playerId: 0 });
    const idx = (id: string) => events.findIndex((e) => e.type === 'CARD_TRIGGERED' && e.cardId === id);
    expect(idx('stadium')).toBeLessThan(idx('tv'));
  });
});

describe('工場・市場', () => {
  function withStation(s: GameState) {
    s.players[0].landmarks.station = true;
    return s;
  }

  it('チーズ工場：牧場3枚・工場1枚で9、工場2枚で18', () => {
    let s = withStation(newGame(2));
    s.players[0].cards.ranch = 3;
    s.players[0].cards.cheese = 1;
    expect(roll(s, 3, 4).state.players[0].coins).toBe(3 + 9);

    s = withStation(newGame(2));
    s.players[0].cards.ranch = 3;
    s.players[0].cards.cheese = 2;
    expect(roll(s, 3, 4).state.players[0].coins).toBe(3 + 18);
  });

  it('家具工場：森と鉱山の両方を数える', () => {
    const s = withStation(newGame(2));
    s.players[0].cards.forest = 1;
    s.players[0].cards.mine = 2;
    s.players[0].cards.furniture = 1;
    expect(roll(s, 3, 5).state.players[0].coins).toBe(3 + 3 * 3);
  });

  it('青果市場：麦畑とりんご園の両方を数える', () => {
    const s = withStation(newGame(2));
    s.players[0].cards.wheat = 2;
    s.players[0].cards.apple = 1;
    s.players[0].cards.market = 1;
    expect(roll(s, 5, 6).state.players[0].coins).toBe(3 + 3 * 2);
  });
});

describe('ショッピングモール', () => {
  function mallGame() {
    const s = newGame(2);
    s.players[0].landmarks.mall = true;
    s.players[0].landmarks.station = true;
    s.players[1].coins = 20;
    return s;
  }

  it('パン屋 +1', () => {
    expect(roll(mallGame(), 2).state.players[0].coins).toBe(3 + 2);
  });
  it('コンビニ +1', () => {
    const s = mallGame();
    s.players[0].cards.convenience = 2;
    expect(roll(s, 4).state.players[0].coins).toBe(3 + 8);
  });
  it('カフェ・ファミレス +1（相手の手番）', () => {
    let s = mallGame();
    s.players[0].cards.cafe = 1;
    s.players[0].cards.restaurant = 1;
    s.current = 1;
    let r = roll(s, 3);
    expect(r.state.players[0].coins).toBe(3 + 2);
    s = mallGame();
    s.players[0].cards.restaurant = 1;
    s.players[1].landmarks.station = true;
    s.current = 1;
    r = roll(s, 4, 5);
    expect(r.state.players[0].coins).toBe(3 + 3);
  });
  it('麦畑・牧場・工場は変わらない', () => {
    let s = mallGame();
    expect(roll(s, 1).state.players[0].coins).toBe(3 + 1);
    s = mallGame();
    s.players[0].cards.bakery = 0;
    s.players[0].cards.ranch = 2;
    expect(roll(s, 2).state.players[0].coins).toBe(3 + 2);
    s = mallGame();
    s.players[0].cards.ranch = 1;
    s.players[0].cards.cheese = 1;
    expect(roll(s, 3, 4).state.players[0].coins).toBe(3 + 3);
  });
});

describe('紫カード', () => {
  it('スタジアム：足りない相手からはある分だけ', () => {
    const s = newGame(3);
    s.players[0].cards.stadium = 1;
    s.players[1].coins = 1;
    s.players[2].coins = 5;
    const { state } = roll(s, 6);
    expect(state.players[0].coins).toBe(3 + 1 + 2);
    expect(state.players[1].coins).toBe(0);
    expect(state.players[2].coins).toBe(3);
    expect(state.phase).toBe('build');
  });

  it('テレビ局：3人以上なら相手を選ぶ。足りない相手からはある分だけ', () => {
    const s = newGame(3);
    s.players[0].cards.tv = 1;
    s.players[2].coins = 2;
    let r = roll(s, 6);
    expect(r.state.phase).toBe('resolving');
    expect(r.state.pendingChoice).toEqual({ type: 'tv', playerId: 0 });
    expect(isValidAction(r.state, { type: 'CHOOSE_TARGET', playerId: 0, targetId: 0 })).toBe(false);
    r = act(r.state, { type: 'CHOOSE_TARGET', playerId: 0, targetId: 2 });
    expect(r.state.players[0].coins).toBe(5);
    expect(r.state.players[2].coins).toBe(0);
    expect(r.state.phase).toBe('build');
  });

  it('テレビ局：2人戦では自動で相手から取る', () => {
    const s = newGame(2);
    s.players[0].cards.tv = 1;
    s.players[1].coins = 10;
    const { state } = roll(s, 6);
    expect(state.phase).toBe('build');
    expect(state.players[0].coins).toBe(8);
    expect(state.players[1].coins).toBe(5);
  });

  it('ビジネスセンター：紫カードは交換できない', () => {
    const s = newGame(2);
    s.players[0].cards.business = 1;
    s.players[0].cards.stadium = 1;
    s.players[1].cards.tv = 1;
    s.players[1].cards.mine = 1;
    s.players[1].coins = 0; // スタジアムで動かないように
    const r = roll(s, 6);
    expect(r.state.pendingChoice).toEqual({ type: 'business', playerId: 0 });
    const base = { type: 'SWAP' as const, playerId: 0, targetId: 1 };
    expect(isValidAction(r.state, { ...base, give: 'stadium', take: 'mine' })).toBe(false);
    expect(isValidAction(r.state, { ...base, give: 'business', take: 'mine' })).toBe(false);
    expect(isValidAction(r.state, { ...base, give: 'wheat', take: 'tv' })).toBe(false);
    expect(isValidAction(r.state, { ...base, give: 'wheat', take: 'mine' })).toBe(true);

    const done = act(r.state, { ...base, give: 'wheat', take: 'mine' });
    expect(done.state.players[0].cards.mine).toBe(1);
    expect(done.state.players[0].cards.wheat).toBe(0);
    expect(done.state.players[1].cards.wheat).toBe(2);
    expect(done.state.players[1].cards.mine).toBe(0);
    expect(done.events).toContainEqual({ type: 'CARDS_SWAPPED', a: 0, b: 1, aCard: 'wheat', bCard: 'mine' });
    expect(done.state.phase).toBe('build');
  });

  it('ビジネスセンター：スキップできる', () => {
    const s = newGame(2);
    s.players[0].cards.business = 1;
    const r = act(roll(s, 6).state, { type: 'SKIP_SWAP', playerId: 0 });
    expect(r.state.phase).toBe('build');
    expect(r.state.players[0].cards.wheat).toBe(1);
  });

  it('ビジネスセンター：交換できる相手がいなければ自動スキップ', () => {
    const s = newGame(2);
    s.players[0].cards.business = 1;
    s.players[1].cards.wheat = 0;
    s.players[1].cards.bakery = 0;
    const { state } = roll(s, 6);
    expect(state.phase).toBe('build');
    expect(state.pendingChoice).toBeUndefined();
  });

  it('紫カードは1人1枚まで。在庫はプレイ人数と同じ枚数', () => {
    for (const n of [2, 3, 4]) {
      const s = newGame(n);
      expect(s.supply.stadium).toBe(n);
      expect(s.supply.tv).toBe(n);
      expect(s.supply.business).toBe(n);
      expect(s.supply.wheat).toBe(6);
    }
    let s = newGame(2);
    s.players[0].coins = 30;
    s = roll(s, 1).state;
    expect(getBuildOptions(s)).toContain('stadium');
    s.players[0].cards.stadium = 1;
    expect(getBuildOptions(s)).not.toContain('stadium');
    expect(isValidAction(s, { type: 'BUILD', playerId: 0, id: 'stadium' })).toBe(false);
  });
});

describe('建設', () => {
  it('在庫0のカードは買えない', () => {
    let s = newGame(2);
    s.players[0].coins = 10;
    s.supply.cafe = 0;
    s = roll(s, 1).state;
    expect(getBuildOptions(s)).not.toContain('cafe');
    expect(isValidAction(s, { type: 'BUILD', playerId: 0, id: 'cafe' })).toBe(false);
    expect(() => act(s, { type: 'BUILD', playerId: 0, id: 'cafe' })).toThrow();
  });

  it('お金が足りないものは買えない。買うと在庫とお金が減る', () => {
    let s = newGame(2);
    s = roll(s, 5).state; // 誰も収入なし、3コイン
    expect(getBuildOptions(s)).not.toContain('station');
    const r = act(s, { type: 'BUILD', playerId: 0, id: 'forest' });
    expect(r.state.players[0].coins).toBe(0);
    expect(r.state.players[0].cards.forest).toBe(1);
    expect(r.state.supply.forest).toBe(5);
    expect(r.state.current).toBe(1);
    expect(r.state.turn).toBe(2);
  });

  it('ランドマーク4つで即勝利', () => {
    let s = newGame(2);
    s.players[0].landmarks = { station: true, mall: true, park: true, tower: false };
    s.players[0].coins = 22;
    s = roll(s, 3, 4).state;
    expect(s.phase).toBe('build');
    const r = act(s, { type: 'BUILD', playerId: 0, id: 'tower' });
    expect(r.state.phase).toBe('gameOver');
    expect(r.state.winner).toBe(0);
    expect(r.events.at(-1)).toEqual({ type: 'GAME_WON', playerId: 0 });
    expect(r.events.some((e) => e.type === 'TURN_STARTED')).toBe(false);
    expect(isValidAction(r.state, { type: 'CHOOSE_DICE', playerId: 0, count: 1 })).toBe(false);
    expect(isValidAction(r.state, { type: 'CHOOSE_DICE', playerId: 1, count: 1 })).toBe(false);
  });
});

describe('サイコロ・ランドマーク', () => {
  it('駅がないと2個振りできない', () => {
    const s = newGame(2);
    expect(isValidAction(s, { type: 'CHOOSE_DICE', playerId: 0, count: 2 })).toBe(false);
    s.players[0].landmarks.station = true;
    expect(isValidAction(s, { type: 'CHOOSE_DICE', playerId: 0, count: 2 })).toBe(true);
  });

  it('手番でない人は操作できない', () => {
    const s = newGame(2);
    expect(isValidAction(s, { type: 'CHOOSE_DICE', playerId: 1, count: 1 })).toBe(false);
  });

  it('電波塔がなければ振り直しフェーズは飛ばす', () => {
    const { state } = roll(newGame(2), 5);
    expect(state.phase).toBe('build');
  });

  it('電波塔の振り直しは1手番1回', () => {
    const s = newGame(2);
    s.players[0].landmarks.tower = true;
    let r = roll(s, 5);
    expect(r.state.phase).toBe('rolled');
    expect(isValidAction(r.state, { type: 'REROLL', playerId: 0 })).toBe(true);
    r = act(r.state, { type: 'REROLL', playerId: 0 }, () => 0); // 1 が出る
    expect(r.state.dice).toEqual([1]);
    expect(r.state.rerollUsed).toBe(true);
    expect(r.state.phase).toBe('build');
    expect(isValidAction(r.state, { type: 'REROLL', playerId: 0 })).toBe(false);
    // 次の手番ではまた使える
    let s2 = act(r.state, { type: 'BUILD', playerId: 0, id: null }).state; // P1 の番
    s2 = act(roll(s2, 5).state, { type: 'BUILD', playerId: 1, id: null }).state; // P0 の番
    expect(s2.current).toBe(0);
    expect(s2.rerollUsed).toBe(false);
    expect(roll(s2, 5).state.phase).toBe('rolled');
  });

  it('振り直さなければ最初の目で収入処理', () => {
    const s = newGame(2);
    s.players[0].landmarks.tower = true;
    const r = act(roll(s, 1).state, { type: 'KEEP', playerId: 0 });
    expect(r.state.players[0].coins).toBe(4);
    expect(r.state.phase).toBe('build');
  });

  it('遊園地：2個振りゾロ目で追加手番', () => {
    const s = newGame(2);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.park = true;
    const r1 = roll(s, 3, 3);
    const r2 = act(r1.state, { type: 'BUILD', playerId: 0, id: null });
    expect(r2.events).toContainEqual({ type: 'EXTRA_TURN', playerId: 0 });
    expect(r2.state.current).toBe(0);
    expect(r2.state.phase).toBe('chooseDice');
    expect(r2.state.turn).toBe(s.turn); // 追加手番ではターン数は増えない
  });

  it('遊園地：ゾロ目でなければ追加手番なし', () => {
    const s = newGame(2);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.park = true;
    const r = act(roll(s, 3, 4).state, { type: 'BUILD', playerId: 0, id: null });
    expect(r.state.current).toBe(1);
  });

  it('遊園地：1個振りでは発動しない', () => {
    const s = newGame(2);
    s.players[0].landmarks.station = true;
    s.players[0].landmarks.park = true;
    const r = act(roll(s, 3).state, { type: 'BUILD', playerId: 0, id: null });
    expect(r.events.some((e) => e.type === 'EXTRA_TURN')).toBe(false);
    expect(r.state.current).toBe(1);
  });

  it('電波塔で振り直したら、ゾロ目判定は最後の目で行う', () => {
    const base = newGame(2);
    base.players[0].landmarks = { station: true, mall: false, park: true, tower: true };

    // 1回目ゾロ目 → 振り直してゾロ目でない → 追加手番なし
    let r = roll(base, 3, 3);
    r = act(r.state, { type: 'REROLL', playerId: 0 }, diceRng(2, 5));
    expect(r.state.dice).toEqual([2, 5]);
    r = act(r.state, { type: 'BUILD', playerId: 0, id: null });
    expect(r.state.current).toBe(1);

    // 1回目ゾロ目でない → 振り直してゾロ目 → 追加手番
    r = roll(base, 2, 5);
    r = act(r.state, { type: 'REROLL', playerId: 0 }, diceRng(4, 4));
    r = act(r.state, { type: 'BUILD', playerId: 0, id: null });
    expect(r.state.current).toBe(0);
    expect(r.events).toContainEqual({ type: 'EXTRA_TURN', playerId: 0 });
  });
});

describe('イベント', () => {
  it('COINS_MOVED の合計と所持金の増減が一致する（いろいろな場面）', () => {
    const s = newGame(4);
    s.players[0].landmarks.station = true;
    s.players[0].cards.stadium = 1;
    s.players[0].coins = 5;
    s.players[1].cards.cafe = 3;
    s.players[2].coins = 1;
    s.players[3].cards.restaurant = 2;
    for (const dice of [[1], [3], [6], [4, 6], [2, 3]]) {
      const r = roll(s, ...dice);
      const d = coinDeltas(r.events, 4);
      r.state.players.forEach((p, i) => expect(p.coins - s.players[i].coins).toBe(d[i]));
    }
    // 建設の支払いも含めて一致
    const before = roll(s, 5).state;
    const built = act(before, { type: 'BUILD', playerId: 0, id: 'cafe' });
    const d = coinDeltas(built.events, 4);
    built.state.players.forEach((p, i) => expect(p.coins - before.players[i].coins).toBe(d[i]));
  });

  it('入力の state は変更されない（純粋関数）', () => {
    const s = newGame(2);
    const snapshot = JSON.stringify(s);
    roll(s, 1);
    expect(JSON.stringify(s)).toBe(snapshot);
  });
});
