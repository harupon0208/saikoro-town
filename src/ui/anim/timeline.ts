// アニメーションの台本。applyAction が返したイベントを「再生する1コマ（Step）」にまとめ、
// 各コマまで再生したときに画面に出す状態（view）を計算する。React には依存しない。
//
// 状態そのものはすぐ確定させて保存し、画面だけが台本どおりに遅れて追いつく（SPEC 8章）。

import { FACILITIES, isLandmarkId } from '../../game/cards';
import type { FacilityId, GameEvent, GameState } from '../../game/types';

export type Speed = 'normal' | 'fast' | 'none';

export type StepKind =
  | 'dice'
  | 'harbor'
  | 'tuna'
  | 'income'
  | 'support'
  | 'swap'
  | 'build'
  | 'refill'
  | 'extraTurn'
  | 'turn'
  | 'win';

export interface Step {
  kind: StepKind;
  /** 再生にかける時間（ミリ秒） */
  ms: number;
  /** このコマで起きるイベント（同時に再生する） */
  events: GameEvent[];
}

/**
 * 「ふつう」のときの長さ。SPEC 10章の目安よりかなり長め：
 * 「全体的に早く進んでしまう」という感想を2回受けて、ひとつひとつをじっくり目で追えるようにした。
 */
export const BASE_MS: Record<StepKind, number> = {
  dice: 1900, // 立体のサイコロが投げ込まれて転がり、出た目を読む間まで
  harbor: 1300, // 港で+2
  tuna: 1600, // マグロ漁船のサイコロ
  income: 1300, // カードが光る → コインが飛ぶ → 数字が増える、を順に見せる
  support: 1300, // 0コインのとき銀行から1コイン・空港の10コイン
  refill: 1300, // 市場に新しいカードが並ぶ
  swap: 1400,
  build: 1200,
  extraTurn: 1500,
  turn: 1300,
  win: 3200,
};
/** ランドマーク完成（お祝いの演出を見せるため長め） */
export const LANDMARK_MS = 2600;
/** 「はやい」は最初のころの「ふつう」の半分くらい */
export const SPEED_FACTOR: Record<Speed, number> = { normal: 1, fast: 0.25, none: 0 };

/** 収入イベントの「同時に再生するまとまり」。赤 / 青・緑 / 紫（カードごと） */
function incomeGroup(cardId: FacilityId): string {
  const color = FACILITIES[cardId].color;
  if (color === 'red') return 'red';
  if (color === 'purple') return `purple:${cardId}`;
  return 'blue-green';
}

function isIncomeEvent(e: GameEvent): boolean {
  if (e.type === 'CARD_TRIGGERED') return true;
  return e.type === 'COINS_MOVED' && e.to !== 'bank' && !!e.cardId && !isLandmarkId(e.cardId);
}

/** イベント列を再生用のコマに分ける。'none' なら空（アニメーションなし） */
export function buildSteps(events: GameEvent[], speed: Speed): Step[] {
  if (speed === 'none') return [];
  const factor = SPEED_FACTOR[speed];
  const steps: Step[] = [];
  let group: string | null = null;

  const push = (kind: StepKind, e: GameEvent) => {
    steps.push({ kind, ms: BASE_MS[kind], events: [e] });
  };

  for (const e of events) {
    if (isIncomeEvent(e)) {
      const g = incomeGroup((e as { cardId: FacilityId }).cardId);
      const last = steps[steps.length - 1];
      if (last && last.kind === 'income' && group === g) last.events.push(e);
      else {
        push('income', e);
        group = g;
      }
      continue;
    }
    group = null;
    const last = steps[steps.length - 1];
    switch (e.type) {
      case 'DICE_ROLLED':
        push('dice', e);
        break;
      case 'COINS_MOVED':
        // 0コインでもらう1コイン・空港の10コイン / 建設の支払い（続く BUILT と同じコマにする）
        push(e.from === 'bank' ? 'support' : 'build', e);
        break;
      case 'HARBOR_ADDED':
        push('harbor', e);
        break;
      case 'TUNA_ROLLED':
        push('tuna', e);
        break;
      case 'MARKET_REFILLED':
        push('refill', e);
        break;
      case 'BUILT':
      case 'LANDMARK_COMPLETED':
        if (last && last.kind === 'build' && !last.events.some((x) => x.type === e.type)) {
          last.events.push(e);
        } else {
          push('build', e);
        }
        if (e.type === 'LANDMARK_COMPLETED') steps[steps.length - 1].ms = LANDMARK_MS;
        break;
      case 'CARDS_SWAPPED':
        push('swap', e);
        break;
      case 'EXTRA_TURN':
        push('extraTurn', e);
        break;
      case 'TURN_STARTED':
        push('turn', e);
        break;
      case 'GAME_WON':
        push('win', e);
        break;
    }
  }

  for (const s of steps) s.ms = Math.round(s.ms * factor);
  return steps;
}

// ---------------------------------------------------------------------------
// 画面に出す状態

/** 画面がイベントに合わせて追いかける部分 */
type Replayed = Pick<GameState, 'players' | 'supply' | 'dice' | 'current' | 'harborBonus' | 'deck'>;

function applyEvent(v: Replayed, e: GameEvent): void {
  switch (e.type) {
    case 'DICE_ROLLED':
      v.dice = [...e.dice];
      delete v.harborBonus;
      break;
    case 'HARBOR_ADDED':
      v.harborBonus = true;
      break;
    case 'MARKET_REFILLED':
      for (const id of e.cards) v.supply[id] += 1;
      if (v.deck) v.deck = v.deck.slice(e.cards.length);
      break;
    case 'COINS_MOVED':
      if (e.from !== 'bank') v.players[e.from].coins -= e.amount;
      if (e.to !== 'bank') v.players[e.to].coins += e.amount;
      break;
    case 'CARDS_SWAPPED': {
      const a = v.players[e.a].cards;
      const b = v.players[e.b].cards;
      a[e.aCard] -= 1;
      b[e.aCard] += 1;
      b[e.bCard] -= 1;
      a[e.bCard] += 1;
      break;
    }
    case 'BUILT':
      if (isLandmarkId(e.id)) v.players[e.playerId].landmarks[e.id] = true;
      else {
        v.players[e.playerId].cards[e.id] += 1;
        v.supply[e.id] -= 1;
      }
      break;
    case 'TURN_STARTED':
      v.current = e.playerId;
      delete v.harborBonus;
      break;
  }
}

/**
 * steps[0..index] まで（index のコマは「再生中」として結果を先に反映）進めたときの画面の状態。
 * index が steps.length 以上なら to をそのまま返す。
 * ターン数・フェーズ・ログ・選択待ちは、再生が終わるまで from のまま（先に結果を見せない）。
 */
export function viewAt(from: GameState, to: GameState, steps: Step[], index: number): GameState {
  if (index >= steps.length) return to;
  const v: GameState = JSON.parse(JSON.stringify(from));
  for (let i = 0; i <= index; i++) for (const e of steps[i].events) applyEvent(v, e);
  return v;
}

/** すべてのイベントを再生した結果（テスト用：to と一致するはず） */
export function replayAll(from: GameState, events: GameEvent[]): Replayed {
  const v: Replayed = JSON.parse(
    JSON.stringify({
      players: from.players,
      supply: from.supply,
      dice: from.dice,
      current: from.current,
      harborBonus: from.harborBonus,
      deck: from.deck,
    }),
  );
  for (const e of events) applyEvent(v, e);
  return v;
}

// ---------------------------------------------------------------------------
// サイコロ欄の「+9」表示用

/** 直近のサイコロ以降のイベントを貯める。新しく振ったらリセット。建設などは入れない */
export function accumulateRollEvents(prev: GameEvent[], events: GameEvent[]): GameEvent[] {
  let acc = prev;
  for (const e of events) {
    if (e.type === 'DICE_ROLLED') acc = [e];
    else if (e.type === 'CARD_TRIGGERED' || e.type === 'CARDS_SWAPPED' || isIncomeEvent(e)) acc = [...acc, e];
  }
  return acc;
}

/**
 * 1コマの中でコインが飛ぶタイミング（ミリ秒）。
 * 収入のコマは「カードが光る → コインが飛ぶ → 届いて数字が増える」と順に見せるため、少し待ってから飛ばす。
 */
export function coinTiming(step: Step): { delay: number; fly: number; arrive: number } {
  const delay = step.kind === 'income' ? Math.round(step.ms * 0.25) : 0;
  const fly = Math.round(step.ms * (step.kind === 'income' ? 0.5 : 0.6));
  return { delay, fly, arrive: delay + Math.round(fly * 0.85) };
}

/** 1コマの中で各プレイヤーの所持金がいくら動いたか（「+3」のポップアップ用） */
export function coinDeltas(step: Step): Map<number, number> {
  const d = new Map<number, number>();
  for (const e of step.events) {
    if (e.type !== 'COINS_MOVED') continue;
    if (e.from !== 'bank') d.set(e.from, (d.get(e.from) ?? 0) - e.amount);
    if (e.to !== 'bank') d.set(e.to, (d.get(e.to) ?? 0) + e.amount);
  }
  for (const [k, v] of d) if (v === 0) d.delete(k);
  return d;
}
