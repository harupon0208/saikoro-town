import { describe, expect, it } from 'vitest';
import { createGame } from '../../game/state';
import type { GameEvent } from '../../game/types';
import { buildSteps } from '../anim/timeline';
import { cuesForEvents, cuesForStep } from './cues';

const game = createGame(
  { seats: [{ name: 'あなた', isHuman: true }, { name: 'ハル', isHuman: false }] },
  () => 0,
);
const human = game.players.find((p) => p.isHuman)!.id;
const cpu = game.players.find((p) => !p.isHuman)!.id;

const names = (events: GameEvent[]) =>
  buildSteps(events, 'normal').flatMap((s) => cuesForStep(s, game, 0.7).map((c) => c.name));

describe('効果音の台本', () => {
  it('サイコロは転がる音のあと、止まる音（止まるのはコマの途中）', () => {
    const [step] = buildSteps([{ type: 'DICE_ROLLED', playerId: human, dice: [3] }], 'normal');
    const cues = cuesForStep(step, game, 0.7);
    expect(cues.map((c) => c.name)).toEqual(['roll', 'land']);
    expect(cues[1].at).toBeGreaterThan(0);
    expect(cues[1].at).toBeLessThan(step.ms);
    expect(cues[0].dur).toBe(cues[1].at);
  });

  it('収入はカードの音のあと、コインが届く頃に枚数ぶん（最大6）', () => {
    const cues = buildSteps(
      [
        { type: 'CARD_TRIGGERED', playerId: human, cardId: 'mine' },
        { type: 'COINS_MOVED', from: 'bank', to: human, amount: 5, cardId: 'mine' },
      ],
      'normal',
    ).flatMap((s) => cuesForStep(s, game, 0.7));
    expect(cues[0].name).toBe('trigger');
    const coins = cues.filter((c) => c.name === 'coin');
    expect(coins).toHaveLength(5);
    expect(coins[0].at).toBeGreaterThan(0);
    expect(coins[1].at).toBeGreaterThan(coins[0].at);
  });

  it('建設は支払いと建てる音、ランドマークはファンファーレ', () => {
    expect(
      names([
        { type: 'COINS_MOVED', from: human, to: 'bank', amount: 1 },
        { type: 'BUILT', playerId: human, id: 'wheat' },
      ]),
    ).toEqual(['pay', 'build']);
    expect(
      names([
        { type: 'COINS_MOVED', from: human, to: 'bank', amount: 4 },
        { type: 'BUILT', playerId: human, id: 'station' },
        { type: 'LANDMARK_COMPLETED', playerId: human, id: 'station' },
      ]),
    ).toEqual(['pay', 'landmark']);
  });

  it('人間の番とCPUの番で音が違う。ゾロ目・交換・勝利にも音', () => {
    expect(names([{ type: 'TURN_STARTED', playerId: human }])).toEqual(['myTurn']);
    expect(names([{ type: 'TURN_STARTED', playerId: cpu }])).toEqual(['turn']);
    expect(names([{ type: 'EXTRA_TURN', playerId: human }])).toEqual(['extraTurn']);
    expect(names([{ type: 'CARDS_SWAPPED', a: human, b: cpu, aCard: 'wheat', bCard: 'bakery' }])).toEqual(['swap']);
    expect(names([{ type: 'GAME_WON', playerId: human }])).toEqual(['win']);
  });

  it('アニメーションなしでは、同じ音は1回だけ、すぐ鳴らす', () => {
    const cues = cuesForEvents(
      [
        { type: 'DICE_ROLLED', playerId: human, dice: [1] },
        { type: 'CARD_TRIGGERED', playerId: human, cardId: 'wheat' },
        { type: 'COINS_MOVED', from: 'bank', to: human, amount: 3, cardId: 'wheat' },
      ],
      game,
    );
    expect(cues.map((c) => c.name)).toEqual(['land', 'trigger', 'coin']);
    expect(cues.every((c) => c.at === 0)).toBe(true);
  });
});
