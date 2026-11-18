// CPU の思考。状態を見て次の Action を返すだけ（実行は applyAction が行う）。

import { FACILITIES, FACILITY_IDS, LANDMARKS } from './cards';
import { applyAction, getBuildOptions, swappableCards } from './engine';
import type { Action, FacilityId, GameState, LandmarkId, Personality, Player } from './types';

export const PERSONALITY_LABELS: Record<Personality, string> = {
  steady: 'コツコツ型',
  ranchFactory: '牧場工場型',
  resourceFactory: '資源工場型',
  balanced: 'バランス型',
};

const ONE_DIE = [0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0].map((x) => x / 6);
const TWO_DICE = [0, 0, 1, 2, 3, 4, 5, 6, 5, 4, 3, 2, 1].map((x) => x / 36);

const LANDMARK_PRIORITY: Record<Personality, LandmarkId[]> = {
  steady: ['mall', 'station', 'park', 'tower'],
  ranchFactory: ['station', 'mall', 'park', 'tower'],
  resourceFactory: ['station', 'mall', 'park', 'tower'],
  balanced: ['station', 'mall', 'park', 'tower'],
};

/** これ未満の点数のカードは買わない */
const BUY_THRESHOLD = 0.3;

function personalityOf(p: Player): Personality {
  return p.personality ?? 'balanced';
}

function rollProb(roll: number, twoDice: boolean): number {
  return (twoDice ? TWO_DICE : ONE_DIE)[roll] ?? 0;
}

function hitProb(rolls: number[], twoDice: boolean): number {
  return rolls.reduce((a, r) => a + rollProb(r, twoDice), 0);
}

function ownsHighCard(p: Player): boolean {
  return FACILITY_IDS.some((id) => p.cards[id] > 0 && FACILITIES[id].rolls.some((r) => r >= 7));
}

/** ルール1：駅あり かつ 7以上の目のカードを持っていれば2個（コツコツ型は常に1個） */
function chooseDiceCount(p: Player): 1 | 2 {
  if (personalityOf(p) === 'steady') return 1;
  return p.landmarks.station && ownsHighCard(p) ? 2 : 1;
}

/** 評価時に自分が2個振りする前提で考えるか */
function evalTwoDice(p: Player): boolean {
  const per = personalityOf(p);
  if (per === 'steady') return false;
  if (per === 'ranchFactory' || per === 'resourceFactory') return true;
  return p.landmarks.station;
}

function iconCount(p: Player, icons: string[]): number {
  return FACILITY_IDS.filter((id) => icons.includes(FACILITIES[id].icon)).reduce(
    (n, id) => n + p.cards[id],
    0,
  );
}

/** 1周（全員の手番1回ずつ）あたりの期待収入 = 確率 × 収入 */
function expectedValue(state: GameState, p: Player, id: FacilityId): number {
  const def = FACILITIES[id];
  const own2 = evalTwoDice(p);
  const opponents = state.players.filter((o) => o.id !== p.id);
  const mall = p.landmarks.mall && (def.icon === 'shop' || def.icon === 'cup') ? 1 : 0;
  const ownP = hitProb(def.rolls, own2);
  const oppP = opponents.reduce((a, o) => a + hitProb(def.rolls, o.landmarks.station), 0);

  switch (def.color) {
    case 'blue':
      return (ownP + oppP) * def.income;
    case 'red':
      return oppP * (def.income + mall);
    case 'green':
      if (def.multiplierIcons) return ownP * def.income * iconCount(p, def.multiplierIcons);
      return ownP * (def.income + mall);
    case 'purple': {
      if (id === 'stadium') return ownP * def.income * opponents.length;
      if (id === 'tv') return ownP * Math.min(5, Math.max(...opponents.map((o) => o.coins), 0));
      return ownP * 1;
    }
  }
}

function personalityBonus(p: Player, id: FacilityId): number {
  switch (personalityOf(p)) {
    case 'steady':
      return { bakery: 0.6, convenience: 0.6, cafe: 0.4 }[id as string] ?? 0;
    case 'ranchFactory':
      if (id === 'ranch') return 0.6;
      if (id === 'cheese') return 0.3 + 0.3 * p.cards.ranch;
      return 0;
    case 'resourceFactory':
      if (id === 'forest') return 0.5;
      if (id === 'mine') return 0.4;
      if (id === 'furniture') return 0.3 + 0.3 * iconCount(p, ['gear']);
      return 0;
    case 'balanced':
      return 0;
  }
}

export function scoreFacility(state: GameState, p: Player, id: FacilityId): number {
  return expectedValue(state, p, id) + personalityBonus(p, id) - 0.05 * p.cards[id];
}

function chooseBuild(state: GameState): FacilityId | LandmarkId | null {
  const p = state.players[state.current];
  const options = getBuildOptions(state);

  for (const lm of LANDMARK_PRIORITY[personalityOf(p)]) {
    if (options.includes(lm)) return lm;
  }

  let best: FacilityId | null = null;
  let bestScore = BUY_THRESHOLD;
  for (const id of options) {
    if (id in LANDMARKS) continue;
    const score = scoreFacility(state, p, id as FacilityId);
    if (score > bestScore) {
      bestScore = score;
      best = id as FacilityId;
    }
  }
  return best;
}

/** ルール2：今の出目で自分の収入が0、または次のランドマークに届かないなら振り直す */
function shouldReroll(state: GameState): boolean {
  const me = state.current;
  const before = state.players[me].coins;
  const after = applyAction(state, { type: 'KEEP', playerId: me }, () => 0).state;
  const gain = after.players[me].coins - before;
  if (gain <= 0) return true;
  const p = state.players[me];
  const remaining = (Object.keys(LANDMARKS) as LandmarkId[])
    .filter((id) => !p.landmarks[id])
    .map((id) => LANDMARKS[id].cost);
  if (remaining.length === 0) return false;
  return after.players[me].coins < Math.min(...remaining);
}

function chooseTvTarget(state: GameState): number {
  const others = state.players.filter((o) => o.id !== state.current);
  return others.reduce((best, o) => (o.coins > best.coins ? o : best)).id;
}

function chooseSwap(state: GameState): Action {
  const me = state.players[state.current];
  const playerId = state.current;
  const mine = swappableCards(me);
  if (mine.length === 0) return { type: 'SKIP_SWAP', playerId };
  const give = mine.reduce((a, b) => (FACILITIES[b].cost < FACILITIES[a].cost ? b : a));

  let best: { targetId: number; take: FacilityId } | null = null;
  for (const o of state.players) {
    if (o.id === me.id) continue;
    for (const id of swappableCards(o)) {
      if (!best || FACILITIES[id].cost > FACILITIES[best.take].cost) best = { targetId: o.id, take: id };
    }
  }
  if (!best || FACILITIES[best.take].cost <= FACILITIES[give].cost) {
    return { type: 'SKIP_SWAP', playerId };
  }
  return { type: 'SWAP', playerId, targetId: best.targetId, give, take: best.take };
}

/** 手番プレイヤー（CPU）の次のアクションを決める */
export function chooseCpuAction(state: GameState): Action {
  const playerId = state.current;
  const p = state.players[playerId];

  switch (state.phase) {
    case 'chooseDice':
      return { type: 'CHOOSE_DICE', playerId, count: chooseDiceCount(p) };
    case 'rolled':
      return shouldReroll(state) ? { type: 'REROLL', playerId } : { type: 'KEEP', playerId };
    case 'resolving':
      if (state.pendingChoice?.type === 'tv') {
        return { type: 'CHOOSE_TARGET', playerId, targetId: chooseTvTarget(state) };
      }
      return chooseSwap(state);
    case 'build':
      return { type: 'BUILD', playerId, id: chooseBuild(state) };
    case 'gameOver':
      throw new Error('ゲームは終了しています');
  }
}
