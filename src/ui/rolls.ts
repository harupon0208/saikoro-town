// 出目表の中身（React に依存しない）
import { FACILITIES, facilityIdsFor, optionsOf } from '../game/cards';
import type { Color, FacilityId, GameState } from '../game/types';

/** 処理の順（赤 → 青・緑 → 紫） */
const COLOR_ORDER: Record<Color, number> = { red: 0, blue: 1, green: 1, purple: 2 };

/** 2個振りで各合計が出る通り（36通り中） */
const TWO_DICE_WAYS = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1];

/** その目が出る確率（%）。13・14 は港の+2でしか出ない */
export function rollChance(n: number): { one: number; two: number } {
  return {
    one: n >= 1 && n <= 6 ? Math.round(100 / 6) : 0,
    two: Math.round(((TWO_DICE_WAYS[n] ?? 0) / 36) * 100),
  };
}

/** その目で動くカード（このゲームで使うものだけ。処理の順） */
export function cardsForRoll(game: GameState, n: number): FacilityId[] {
  return facilityIdsFor(optionsOf(game))
    .filter((id) => FACILITIES[id].rolls.includes(n))
    .sort((a, b) => COLOR_ORDER[FACILITIES[a].color] - COLOR_ORDER[FACILITIES[b].color]);
}

