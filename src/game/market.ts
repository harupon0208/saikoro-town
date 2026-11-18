// 市場を「山札から10種類だけ並べる」ときの決まり（港の拡張のおすすめルール）
import { FACILITIES, facilityIdsFor } from './cards';
import type { FacilityId, GameOptions, Rng } from './types';

/** 市場に並べる種類の数 */
export const MARKET_KINDS = 10;

/** 1種類あたりの枚数（紫はプレイ人数と同じ） */
export function stockOf(id: FacilityId, players: number): number {
  const stock = FACILITIES[id].stock;
  return stock === 'players' ? players : stock;
}

/** このゲームで使う全カードを混ぜた山札 */
export function makeDeck(options: GameOptions, players: number, rng: Rng): FacilityId[] {
  const deck: FacilityId[] = [];
  for (const id of facilityIdsFor(options)) for (let i = 0; i < stockOf(id, players); i++) deck.push(id);
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * 並んでいる種類が10になるまで山札から引く（同じ種類は今ある山に重ねる）。
 * supply と deck を書き換え、引いたカードを順に返す。
 */
export function refill(supply: Record<FacilityId, number>, deck: FacilityId[]): FacilityId[] {
  const drawn: FacilityId[] = [];
  const kinds = () => (Object.keys(supply) as FacilityId[]).filter((id) => supply[id] > 0).length;
  while (kinds() < MARKET_KINDS && deck.length > 0) {
    const id = deck.shift()!;
    supply[id] += 1;
    drawn.push(id);
  }
  return drawn;
}
