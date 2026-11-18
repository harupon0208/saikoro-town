// 再生するコマ（Step）から「どの効果音を、コマの何ミリ秒目に鳴らすか」を決める。React にも音の再生にも依存しない
import { isLandmarkId } from '../../game/cards';
import type { GameEvent, GameState } from '../../game/types';
import { type Step, buildSteps, coinTiming } from '../anim/timeline';

export type SoundName =
  | 'click'
  | 'roll'
  | 'land'
  | 'trigger'
  | 'coin'
  | 'pay'
  | 'build'
  | 'landmark'
  | 'swap'
  | 'turn'
  | 'myTurn'
  | 'extraTurn'
  | 'win'
  | 'pick';

export interface Cue {
  name: SoundName;
  /** コマの始まりから何ミリ秒後に鳴らすか */
  at: number;
  /** 長さのある音（サイコロが転がる音）の長さ */
  dur?: number;
}

/** 1回の受け渡しで鳴らすコインの音の数（飛ぶコインの数と同じく最大6） */
const MAX_COIN_SOUNDS = 6;
/** コインの音の間隔（飛ぶコインのずれと同じ） */
const COIN_GAP = 70;

/**
 * 1コマぶんの効果音。
 * landAt はサイコロのコマのうち転がっている割合（Die.tsx の LAND_AT）。
 */
export function cuesForStep(step: Step, game: GameState, landAt: number): Cue[] {
  const cues: Cue[] = [];
  const t = coinTiming(step);
  switch (step.kind) {
    case 'dice': {
      const land = Math.round(step.ms * landAt * 0.9);
      cues.push({ name: 'roll', at: 0, dur: land }, { name: 'land', at: land });
      break;
    }
    case 'income': {
      cues.push({ name: 'trigger', at: 0 });
      let n = 0;
      for (const e of step.events) {
        if (e.type !== 'COINS_MOVED') continue;
        for (let i = 0; i < Math.min(e.amount, MAX_COIN_SOUNDS) && n < MAX_COIN_SOUNDS * 2; i++, n++) {
          cues.push({ name: 'coin', at: t.arrive + i * COIN_GAP });
        }
      }
      break;
    }
    case 'build': {
      const landmark = step.events.some((e) => e.type === 'LANDMARK_COMPLETED');
      if (step.events.some((e) => e.type === 'COINS_MOVED')) cues.push({ name: 'pay', at: 0 });
      if (landmark) cues.push({ name: 'landmark', at: 120 });
      else if (step.events.some((e) => e.type === 'BUILT' && !isLandmarkId(e.id))) {
        cues.push({ name: 'build', at: Math.round(t.fly * 0.85) });
      }
      break;
    }
    case 'swap':
      cues.push({ name: 'swap', at: 0 });
      break;
    case 'extraTurn':
      cues.push({ name: 'extraTurn', at: 0 });
      break;
    case 'turn': {
      const e = step.events[0];
      const human = e.type === 'TURN_STARTED' && game.players[e.playerId].isHuman;
      cues.push({ name: human ? 'myTurn' : 'turn', at: 0 });
      break;
    }
    case 'win':
      cues.push({ name: 'win', at: 0 });
      break;
  }
  return cues;
}

/**
 * アニメーション「なし」のとき：イベントをまとめて、同じ音は1回だけすぐ鳴らす。
 * （長さのある音やコインの連打は鳴らさない）
 */
export function cuesForEvents(events: GameEvent[], game: GameState): Cue[] {
  const names = new Set<SoundName>();
  for (const step of buildSteps(events, 'normal')) {
    for (const c of cuesForStep(step, game, 0.7)) {
      if (c.name === 'roll') continue;
      names.add(c.name);
    }
  }
  return [...names].map((name) => ({ name, at: 0 }));
}
