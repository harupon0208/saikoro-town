// 出目表：サイコロの目ごとに、どのカードが動くか・誰が持っているか・その目が出る確率
import { FACILITIES, optionsOf } from '../../game/cards';
import { rollTotal } from '../../game/engine';
import type { GameState, Player } from '../../game/types';
import { shortEffect } from '../labels';
import { cardsForRoll, rollChance } from '../rolls';
import { CardArt } from './CardArt';
import type { CardId } from './Cards';

export function RollTable({
  game,
  viewer,
  onPick,
}: {
  game: GameState;
  viewer: Player;
  onPick: (id: CardId) => void;
}) {
  const harbor = optionsOf(game).expansions.includes('harbor');
  const max = harbor ? 14 : 12;
  const current = game.dice.length > 0 ? rollTotal(game) : null;
  const numbers = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <section className="roll-table" aria-label="出目表">
      <p className="roll-note">
        その目が出たときに動くカード（赤 → 青・緑 → 紫 の順に処理）。名前の横は持っている人と枚数。
      </p>
      <ol className="roll-rows">
        {numbers.map((n) => {
          const ids = cardsForRoll(game, n);
          const chance = rollChance(n);
          const owned = ids.some((id) => game.players.some((p) => p.cards[id] > 0));
          return (
            <li
              key={n}
              className={`roll-row${n === current ? ' now' : ''}${owned ? '' : ' quiet'}`}
              data-testid={`roll-${n}`}
            >
              <div className="roll-num">
                <b>{n}</b>
                {n > 12 && <small>港で+2</small>}
                {chance.one > 0 && <small>1個 {chance.one}%</small>}
                {chance.two > 0 && <small>2個 {chance.two}%</small>}
              </div>
              <div className="roll-cards">
                {ids.length === 0 && <span className="muted">動くカードなし</span>}
                {ids.map((id) => {
                  const c = FACILITIES[id];
                  const owners = game.players.filter((p) => p.cards[id] > 0);
                  return (
                    <button key={id} className={`roll-card c-${c.color}`} onClick={() => onPick(id)}>
                      <CardArt id={id} />
                      <span className="roll-card-text">
                        <b>{c.name}</b>
                        <small>{shortEffect(id)}</small>
                      </span>
                      <span className="roll-owners">
                        {owners.length === 0 ? (
                          <span className="nobody">なし</span>
                        ) : (
                          owners.map((p) => (
                            <span key={p.id} className={p.id === viewer.id ? 'me' : ''}>
                              {p.name}×{p.cards[id]}
                            </span>
                          ))
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
