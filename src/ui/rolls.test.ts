import { describe, expect, it } from 'vitest';
import { createGame } from '../game/state';
import { cardsForRoll, rollChance } from './rolls';

const seats = [
  { name: 'A', isHuman: true },
  { name: 'B', isHuman: false },
];
const base = createGame({ seats }, () => 0);
const harbor = createGame({ seats, options: { expansions: ['harbor'], market: 'ten' } }, () => 0);

describe('出目表', () => {
  it('その目で動くカードを、赤 → 青・緑 → 紫 の順に並べる', () => {
    expect(cardsForRoll(base, 3)).toEqual(['cafe', 'bakery']);
    expect(cardsForRoll(base, 6)).toEqual(['stadium', 'tv', 'business']);
    expect(cardsForRoll(base, 9)).toEqual(['restaurant', 'mine']);
  });

  it('使うカードだけ（基本セットには港の拡張のカードは出ない）', () => {
    expect(cardsForRoll(base, 1)).toEqual(['wheat']);
    expect(cardsForRoll(harbor, 1)).toEqual(['sushi', 'wheat']);
    expect(cardsForRoll(base, 13)).toEqual([]);
    expect(cardsForRoll(harbor, 13)).toEqual(['tuna', 'warehouse']);
    // 10種類の市場で今並んでいなくても、出目表には出す
    expect(cardsForRoll(harbor, 8)).toEqual(['burger', 'furniture', 'mackerel', 'tax']);
  });

  it('確率：1個振りは1〜6が17%、2個振りは7が17%・2と12が3%', () => {
    expect(rollChance(3)).toEqual({ one: 17, two: 6 });
    expect(rollChance(7)).toEqual({ one: 0, two: 17 });
    expect(rollChance(2).two).toBe(3);
    expect(rollChance(12).two).toBe(3);
    expect(rollChance(13)).toEqual({ one: 0, two: 0 });
  });
});
