// 再生中のコマを一言で説明する（サイコロ欄に出す）。React には依存しない
import { FACILITIES, LANDMARKS, isLandmarkId } from '../../game/cards';
import type { GameState } from '../../game/types';
import type { Step } from './timeline';

/** 再生中に、いま何が起きているかを一言で（CPU の手番も追えるように） */
export function stepCaption(step: Step | null, game: GameState): string {
  if (!step) return '…';
  const name = (id: number) => game.players[id].name;
  for (const e of step.events) {
    switch (e.type) {
      case 'DICE_ROLLED':
        return `${name(e.playerId)}がサイコロを振った`;
      case 'LANDMARK_COMPLETED':
        return `${name(e.playerId)}が${LANDMARKS[e.id].name}を完成させた！`;
      case 'BUILT':
        if (!step.events.some((x) => x.type === 'LANDMARK_COMPLETED') && !isLandmarkId(e.id)) {
          return `${name(e.playerId)}が${FACILITIES[e.id].name}を建てた`;
        }
        break;
      case 'CARDS_SWAPPED':
        return `${name(e.a)}と${name(e.b)}がカードを交換`;
      case 'CARD_TRIGGERED':
        return `${name(e.playerId)}の${FACILITIES[e.cardId].name}が発動！`;
      case 'COINS_MOVED':
        if (e.support && e.to !== 'bank') return `${name(e.to)}は0コインなので1コインもらった`;
        if (e.cardId === 'airport' && e.to !== 'bank') return `${name(e.to)}の空港：+${e.amount}コイン`;
        break;
      case 'HARBOR_ADDED':
        return `${name(e.playerId)}は港で+2！`;
      case 'TUNA_ROLLED':
        return `マグロ漁船：${e.dice.join('+')}=${e.dice[0] + e.dice[1]}！`;
      case 'MARKET_REFILLED':
        return '市場に新しいカードが並んだ';
      case 'EXTRA_TURN':
        return 'ゾロ目でもう1回！';
      case 'TURN_STARTED':
        return `${name(e.playerId)}の番`;
    }
  }
  return '…';
}
