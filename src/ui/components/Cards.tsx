import { FACILITIES, FACILITY_IDS, LANDMARKS, byRoll, facilityIdsFor, optionsOf, playerLandmarks } from '../../game/cards';
import type { FacilityId, GameState, LandmarkId, Player } from '../../game/types';
import { CoinPopup, CountUp } from '../anim/Effects';
import { type Step, coinDeltas, coinTiming } from '../anim/timeline';
import { COLOR_LEGEND, COLOR_NAMES, rollsLabel, shortEffect } from '../labels';
import { CardArt } from './CardArt';

export type CardId = FacilityId | LandmarkId;

/** 再生中の演出の情報（GameScreen が作って配る） */
export interface Fx {
  step: Step | null;
  stepKey: number;
  /** 光らせるカード：`${playerId}:${cardId}` */
  glow: Set<string>;
  /** キラッとさせるランドマーク：`${playerId}:${landmarkId}` */
  sparkle: Set<string>;
  /** 所持金のカウントアップにかける時間 */
  coinMs: number;
  /** カウントアップを始めるまでの待ち（コインが届くまで） */
  coinDelay: number;
}

/** 市場・自分の街で使うカード1枚 */
export function CardTile({
  id,
  dim,
  corner,
  glow,
  anchor,
  stock,
  order = 0,
  pickedBy,
  onClick,
}: {
  id: FacilityId;
  dim?: boolean;
  /** 右上に出す文字（市場ならコスト、自分の街なら枚数） */
  corner: string;
  glow?: boolean;
  anchor?: string;
  /** 市場の残り枚数（市場のときだけ） */
  stock?: number;
  /** 出てくるときの順番（少しずつずらして出す） */
  order?: number;
  /** CPU がこのカードを建てようとしている（その人の名前） */
  pickedBy?: string;
  onClick: () => void;
}) {
  const c = FACILITIES[id];
  return (
    <button
      className={`card c-${c.color}${dim ? ' dim' : ''}${glow ? ' glow' : ''}${pickedBy ? ' cpu-pick' : ''}`}
      style={{ '--order': order } as React.CSSProperties}
      onClick={onClick}
      data-anchor={anchor}
      data-card={id}
      aria-label={`${c.name}（${corner}）`}
    >
      <span className="card-top">
        <span className="badge">{rollsLabel(id)}</span>
        <span className="corner">{corner}</span>
      </span>
      <span className="art-wrap">
        <CardArt id={id} />
        {stock !== undefined && (
          <span key={stock} className={`stock${stock === 0 ? ' out' : stock <= 2 ? ' low' : ''}`} data-testid={`stock-${id}`}>
            {stock === 0 ? '売り切れ' : `残り${stock}`}
          </span>
        )}
      </span>
      {pickedBy && (
        <span className="pick-tag" data-testid="cpu-pick">
          {pickedBy}が選んだ！
        </span>
      )}
      <span className="card-name">{c.name}</span>
      <span className="card-eff">{shortEffect(id)}</span>
    </button>
  );
}

export function Legend() {
  return (
    <span className="legend">
      {COLOR_LEGEND.map((l, i) => (
        <span key={l.color}>
          {i > 0 && ' ・ '}
          <b className={`t-${l.color}`}>{COLOR_NAMES[l.color]}</b> {l.label}
        </span>
      ))}
    </span>
  );
}

/** 市場に出すカード：全種類を並べる（売り切れも出す）／10種類だけ並べる（並んでいるものだけ） */
export function marketIds(game: GameState): FacilityId[] {
  const options = optionsOf(game);
  const ids = facilityIdsFor(options);
  return (options.market === 'ten' ? ids.filter((id) => game.supply[id] > 0) : ids).sort(byRoll);
}

/** 市場 */
export function Market({
  game,
  viewer,
  pick,
  onPick,
}: {
  game: GameState;
  viewer: Player;
  /** CPU が建てようとしているカード */
  pick?: { playerId: number; id: CardId } | null;
  onPick: (id: CardId) => void;
}) {
  return (
    <section className="market" aria-label="市場">
      <div className="section-head">
        <h2>
          市場
          {game.deck && (
            <small className="deck-count" data-testid="deck-count">
              山札 {game.deck.length}枚
            </small>
          )}
        </h2>
        <Legend />
      </div>
      <div className="card-grid">
        {marketIds(game).map((id, i) => {
          const c = FACILITIES[id];
          const soldOut = game.supply[id] <= 0;
          const ownedPurple = c.color === 'purple' && viewer.cards[id] > 0;
          return (
            <CardTile
              key={id}
              id={id}
              corner={`${c.cost}c`}
              dim={soldOut || ownedPurple || viewer.coins < c.cost}
              anchor={`market-${id}`}
              stock={game.supply[id]}
              order={i}
              pickedBy={pick?.id === id ? game.players[pick.playerId].name : undefined}
              onClick={() => onPick(id)}
            />
          );
        })}
      </div>
    </section>
  );
}

/** 自分の街：持っている施設とランドマーク */
export function Town({ player, fx, onPick }: { player: Player; fx: Fx; onPick: (id: CardId) => void }) {
  const owned = FACILITY_IDS.filter((id) => player.cards[id] > 0).sort(byRoll);
  return (
    <section className="town" aria-label={`${player.name}の街`}>
      <div className="section-head">
        <h2>{player.name}の街</h2>
        <Legend />
      </div>
      <div className="card-grid">
        {owned.map((id, i) => (
          <CardTile
            key={id}
            order={i}
            id={id}
            corner={`×${player.cards[id]}`}
            glow={fx.glow.has(`${player.id}:${id}`)}
            onClick={() => onPick(id)}
          />
        ))}
      </div>
      <h3>ランドマーク</h3>
      <ul className="lm-list">
        {playerLandmarks(player).map((id) => (
          <li key={id} className={player.landmarks[id] ? 'built' : ''}>
            <button onClick={() => onPick(id)}>
              <CardArt id={id} className="small" />
              <b>{LANDMARKS[id].name}</b>
              <span>{player.landmarks[id] ? '完成' : `${LANDMARKS[id].cost}c`}</span>
              <small>{LANDMARKS[id].description}</small>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** ランドマークの■□表示 */
export function LandmarkDots({ player, fx }: { player: Player; fx?: Fx }) {
  const ids = playerLandmarks(player);
  return (
    <span className="lm-dots" aria-label={`ランドマーク ${ids.filter((id) => player.landmarks[id]).length}/${ids.length}`}>
      {ids.map((id) => (
        <span
          key={id}
          className={`${player.landmarks[id] ? 'on' : ''}${fx?.sparkle.has(`${player.id}:${id}`) ? ' sparkle' : ''}`}
          title={LANDMARKS[id].name}
        />
      ))}
    </span>
  );
}

/** 所持金（カウントアップ＋「+3」） */
export function Coins({ player, fx, suffix = 'c' }: { player: Player; fx: Fx; suffix?: string }) {
  return (
    <span className="coins-wrap" data-anchor={`coins-${player.id}`} data-testid={`coins-${player.id}`}>
      {/* コインが届いたときに広がる輪（数字は作り直さないので、カウントアップは途切れない） */}
      {fx.step && coinDeltas(fx.step).has(player.id) && (
        <span
          key={fx.stepKey}
          className="coin-ring"
          style={{ animationDelay: `${coinTiming(fx.step).arrive}ms` }}
        />
      )}
      <CountUp value={player.coins} ms={fx.coinMs} delay={fx.coinDelay} />
      {suffix && ` ${suffix}`}
      <CoinPopup step={fx.step} stepKey={fx.stepKey} playerId={player.id} />
    </span>
  );
}

/** 相手の詳しい一覧 */
export function Rivals({
  players,
  current,
  fx,
  anchors,
  offline = [],
  onPick,
}: {
  players: Player[];
  current: number;
  fx: Fx;
  /** オンライン対戦：通信が切れている人の席 */
  offline?: number[];
  /** 所持金に data-anchor をつけるか（スマホの上部と二重にならないように） */
  anchors: boolean;
  onPick: (id: CardId) => void;
}) {
  return (
    <section className="rivals" aria-label="相手">
      {players.map((p) => (
        <div key={p.id} className={`rival panel-light${p.id === current ? ' turn' : ''}`}>
          <div className="rival-head">
            <b>{p.name}</b>
            {offline.includes(p.id) && <span className="offline-tag">通信切れ</span>}
            {anchors ? <Coins player={p} fx={fx} /> : <span>{p.coins} c</span>}
          </div>
          <div className="rival-lms">
            {playerLandmarks(p).map((id) => (
              <span
                key={id}
                className={`${p.landmarks[id] ? 'on' : ''}${fx.sparkle.has(`${p.id}:${id}`) ? ' sparkle' : ''}`}
              >
                {LANDMARKS[id].name}
              </span>
            ))}
          </div>
          <div className="chips">
            {FACILITY_IDS.filter((id) => p.cards[id] > 0)
              .sort(byRoll)
              .map((id) => (
              <button
                key={id}
                className={`chip c-${FACILITIES[id].color}${fx.glow.has(`${p.id}:${id}`) ? ' glow' : ''}`}
                onClick={() => onPick(id)}
              >
                {FACILITIES[id].emoji} {FACILITIES[id].name}×{p.cards[id]}
              </button>
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}

export function LogList({ game }: { game: GameState }) {
  return (
    <ol className="log-list" aria-label="ログ">
      {[...game.log]
        .slice(-80)
        .reverse()
        .map((e, i) => (
          <li key={game.log.length - i}>
            <span className="log-turn">{e.turn}</span>
            {e.text}
          </li>
        ))}
    </ol>
  );
}
