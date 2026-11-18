import { FACILITIES, FACILITY_IDS } from './cards';
import type { FacilityId, GameConfig, GameState, Personality, Player, Rng } from './types';

export const PERSONALITIES: Personality[] = ['steady', 'ranchFactory', 'resourceFactory', 'balanced'];

export function emptyCards(): Record<FacilityId, number> {
  return Object.fromEntries(FACILITY_IDS.map((id) => [id, 0])) as Record<FacilityId, number>;
}

/**
 * 初期状態をつくる。席の並びはランダムに入れ替え、players 配列の順番がそのまま手番順になる。
 */
export function createGame(config: GameConfig, rng: Rng): GameState {
  const n = config.seats.length;
  if (n < 2 || n > 4) throw new Error('プレイ人数は2〜4人です');

  const seats = [...config.seats];
  for (let i = seats.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [seats[i], seats[j]] = [seats[j], seats[i]];
  }

  const players: Player[] = seats.map((seat, id) => {
    const cards = emptyCards();
    cards.wheat = 1;
    cards.bakery = 1;
    const p: Player = {
      id,
      name: seat.name,
      isHuman: seat.isHuman,
      coins: 3,
      cards,
      landmarks: { station: false, mall: false, park: false, tower: false },
    };
    if (!seat.isHuman) p.personality = PERSONALITIES[Math.floor(rng() * PERSONALITIES.length)];
    return p;
  });

  const supply = Object.fromEntries(
    FACILITY_IDS.map((id) => {
      const stock = FACILITIES[id].stock;
      return [id, stock === 'players' ? n : stock];
    }),
  ) as Record<FacilityId, number>;

  return {
    players,
    supply,
    current: 0,
    phase: 'chooseDice',
    dice: [],
    rerollUsed: false,
    turn: 1,
    log: [{ turn: 1, text: `ゲーム開始。最初の手番は${players[0].name}` }],
  };
}
