import { describe, expect, it } from 'vitest';
import { createGame } from '../../game/state';
import { stepCaption } from './caption';
import type { Step } from './timeline';

const game = createGame(
  { seats: [{ name: 'あなた', isHuman: true }, { name: 'ハル', isHuman: false }] },
  () => 0,
);
// 手番の順はランダムに並ぶので、席の名前をここで決めておく
game.players[0].name = 'あなた';
game.players[1].name = 'ハル';
const step = (events: Step['events'], kind: Step['kind'] = 'build'): Step => ({ kind, ms: 500, events });

describe('stepCaption', () => {
  it('再生していなければ「…」', () => {
    expect(stepCaption(null, game)).toBe('…');
  });
  it('サイコロ・発動・建設・ランドマーク・交換・手番を一言で', () => {
    expect(stepCaption(step([{ type: 'DICE_ROLLED', playerId: 1, dice: [3] }], 'dice'), game)).toBe(
      'ハルがサイコロを振った',
    );
    expect(stepCaption(step([{ type: 'CARD_TRIGGERED', playerId: 1, cardId: 'bakery' }], 'income'), game)).toBe(
      'ハルのパン屋が発動！',
    );
    expect(
      stepCaption(
        step([
          { type: 'COINS_MOVED', from: 1, to: 'bank', amount: 1 },
          { type: 'BUILT', playerId: 1, id: 'wheat' },
        ]),
        game,
      ),
    ).toBe('ハルが麦畑を建てた');
    expect(
      stepCaption(
        step([
          { type: 'BUILT', playerId: 0, id: 'station' },
          { type: 'LANDMARK_COMPLETED', playerId: 0, id: 'station' },
        ]),
        game,
      ),
    ).toBe('あなたが駅を完成させた！');
    expect(stepCaption(step([{ type: 'CARDS_SWAPPED', a: 0, b: 1, aCard: 'wheat', bCard: 'bakery' }], 'swap'), game)).toBe(
      'あなたとハルがカードを交換',
    );
    expect(stepCaption(step([{ type: 'EXTRA_TURN', playerId: 0 }], 'extraTurn'), game)).toBe('ゾロ目でもう1回！');
    expect(stepCaption(step([{ type: 'TURN_STARTED', playerId: 1 }], 'turn'), game)).toBe('ハルの番');
  });
});
