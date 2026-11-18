import { useEffect, useMemo, useRef, useState } from 'react';
import { FACILITIES, LANDMARKS, LANDMARK_IDS, isLandmarkId } from '../game/cards';
import { getBuildOptions, swappableCards } from '../game/engine';
import type { Action, FacilityId, GameEvent, GameState, Phase, Player } from '../game/types';
import { Ambience, Banner, DiceView, FlyLayer, TriggerBubbles } from './anim/Effects';
import type { CpuPick } from './App';
import { stepCaption } from './anim/caption';
import { type Speed, type Step, coinTiming } from './anim/timeline';
import { themeImageUrl } from './assets';
import { CardArt } from './components/CardArt';
import { LAND_AT } from './components/Die';
import { type CardId, Coins, type Fx, LandmarkDots, LogList, Market, Rivals, Town } from './components/Cards';
import { Sheet } from './components/Sheet';
import { COLOR_NAMES, incomeFormula, rollsLabel } from './labels';
import type { Settings } from './settings';
import { playSound } from './sound/synth';
import { useMediaQuery } from './useMediaQuery';

interface Props {
  /** 画面に出す状態（再生中は途中の状態） */
  game: GameState;
  /** 再生中のコマ。再生していなければ null */
  step: Step | null;
  stepKey: number;
  speed: Speed;
  rollEvents: GameEvent[];
  /** CPU が建てようとしているカード（建てる前に少し指し示す） */
  cpuPick: CpuPick | null;
  dispatch: (action: Action) => void;
  /** 再生中に画面をタップしたとき：今のコマを飛ばす */
  onSkip: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
  onExit: () => void;
  /** オンライン対戦：自分の席（同じ端末で遊ぶときは undefined） */
  viewerId?: number;
  /** オンライン対戦：通信が切れている人の席 */
  offline?: number[];
  /** オンライン対戦：部屋を出る */
  onLeaveRoom?: () => void;
}

const NO_OFFLINE: number[] = [];

const PHASE_LABELS: Record<Phase, string> = {
  chooseDice: 'サイコロ',
  rolled: '振り直し',
  resolving: '収入',
  build: '建設',
  gameOver: '終了',
};

type Tab = 'market' | 'town' | 'rivals' | 'log';
const TABS: { id: Tab; label: string }[] = [
  { id: 'market', label: '市場' },
  { id: 'town', label: '自分の街' },
  { id: 'rivals', label: '相手' },
  { id: 'log', label: 'ログ' },
];

/** 再生中のコマから、光らせるカード・キラッとさせるランドマークを集める */
function makeFx(step: Step | null, stepKey: number, speed: Speed): Fx {
  const glow = new Set<string>();
  const sparkle = new Set<string>();
  for (const e of step?.events ?? []) {
    if (e.type === 'CARD_TRIGGERED') glow.add(`${e.playerId}:${e.cardId}`);
    if (e.type === 'CARDS_SWAPPED') {
      glow.add(`${e.a}:${e.bCard}`);
      glow.add(`${e.b}:${e.aCard}`);
    }
    if (e.type === 'BUILT' && !isLandmarkId(e.id)) glow.add(`${e.playerId}:${e.id}`);
    if (e.type === 'LANDMARK_COMPLETED') sparkle.add(`${e.playerId}:${e.id}`);
  }
  // 数字はコインが届き始めてから、届き終わるまでに数える
  const t = step ? coinTiming(step) : null;
  const coinMs = speed === 'none' ? 0 : t ? Math.max(t.arrive - t.delay, 150) : 300;
  const coinDelay = speed === 'none' || !t ? 0 : t.delay + Math.round(t.fly * 0.5);
  return { step, stepKey, glow, sparkle, coinMs, coinDelay };
}

export function GameScreen(props: Props) {
  const { game, step, stepKey, speed, rollEvents, cpuPick, dispatch, onSkip, settings, onSettings, onExit } = props;
  const { viewerId, offline = NO_OFFLINE, onLeaveRoom } = props;
  const online = viewerId !== undefined;
  const isDesktop = useMediaQuery('(min-width: 768px)');
  const playing = step !== null;
  const current = game.players[game.current];
  const humans = game.players.filter((p) => p.isHuman);

  // 「自分」として下に表示する人：人間の手番ならその人、CPUの手番中は最後に操作した人間
  const viewerRef = useRef(humans[0]?.id ?? game.current);
  if (current.isHuman) viewerRef.current = current.id;
  // オンラインでは自分の席がいつも下
  if (online) viewerRef.current = viewerId;
  const viewer = game.players[online || humans.length > 0 ? viewerRef.current : game.current];
  const rivals = game.players.filter((p) => p.id !== viewer.id);
  const myTurn = current.isHuman && current.id === viewer.id && game.phase !== 'gameOver';
  const canAct = myTurn && !playing;

  const fx = useMemo(() => makeFx(step, stepKey, speed), [step, stepKey, speed]);

  const [tab, setTab] = useState<Tab>('market');
  const [detail, setDetail] = useState<CardId | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  // 建設フェーズになったら自動で市場タブを開く
  useEffect(() => {
    if (canAct && game.phase === 'build') setTab('market');
  }, [canAct, game.phase]);

  // 同じ端末で人間が複数いるとき：手番の最初に「〇〇さんの番です」を出す
  const [readyKey, setReadyKey] = useState('');
  const turnKey = `${game.turn}-${game.current}`;
  const needHandoff = !online && humans.length >= 2 && canAct && game.phase === 'chooseDice' && readyKey !== turnKey;

  const buildOptions = canAct ? getBuildOptions(game) : [];
  const background = themeImageUrl('background');
  const logo = themeImageUrl('logo');

  const market = <Market game={game} viewer={viewer} pick={cpuPick} onPick={setDetail} />;
  const town = <Town player={viewer} fx={fx} onPick={setDetail} />;
  const log = <LogList game={game} />;
  const dicePanel = (
    <DicePanel
      game={game}
      viewer={viewer}
      rollEvents={rollEvents}
      canAct={canAct}
      playing={playing}
      step={step}
      stepKey={stepKey}
      cpuPick={cpuPick}
      offline={offline}
      dispatch={dispatch}
    />
  );
  const myBar = (
    <MyBar game={game} viewer={viewer} options={buildOptions} myTurn={myTurn} fx={fx} onPick={setDetail} />
  );

  return (
    <div
      className={`table${isDesktop ? ' desktop' : ' mobile'}${playing ? ' playing' : ''} speed-${speed}`}
      style={background ? { backgroundImage: `url(${background})` } : undefined}
      // 再生中にタップしたら、そのアニメーションを飛ばす（操作は受け付けない）
      onClickCapture={(e) => {
        if (!playing) return;
        e.stopPropagation();
        e.preventDefault();
        onSkip();
      }}
      data-testid="table"
    >
      <Ambience />
      <header className="wood-bar">
        <h1>{logo ? <img src={logo} alt="サイコロタウン" /> : 'サイコロタウン'}</h1>
        <span className="header-right">
          <span data-testid="phase">
            ターン {game.turn} ・ {PHASE_LABELS[game.phase]}
          </span>
          <button className="icon-btn" aria-label="設定" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </span>
      </header>

      <main className="felt">
        {isDesktop ? (
          <div className="desk-grid">
            <div className="desk-rivals">
              <Rivals players={rivals} current={game.current} fx={fx} anchors offline={offline} onPick={setDetail} />
            </div>
            <div className="desk-center">{dicePanel}</div>
            <div className="desk-log felt-dark">
              <h2>ログ</h2>
              {log}
            </div>
            <div className="desk-market">{market}</div>
            <div className="desk-me">
              {myBar}
              {town}
            </div>
          </div>
        ) : (
          <>
            <div className="rival-strip">
              {rivals.map((p) => (
                <button
                  key={p.id}
                  className={`rival-mini panel-light${p.id === game.current ? ' turn' : ''}`}
                  onClick={() => setTab('rivals')}
                >
                  <span className="rival-mini-head">
                    <b>{p.name}</b>
                    {offline.includes(p.id) && (
                      <span className="offline-tag" title="通信が切れています">
                        通信切れ
                      </span>
                    )}
                    <Coins player={p} fx={fx} />
                  </span>
                  <LandmarkDots player={p} fx={fx} />
                </button>
              ))}
            </div>
            {dicePanel}
            {myBar}
            <div className="tab-body" key={tab}>
              {tab === 'market' && market}
              {tab === 'town' && town}
              {tab === 'rivals' && (
                <Rivals
                  players={rivals}
                  current={game.current}
                  fx={fx}
                  anchors={false}
                  offline={offline}
                  onPick={setDetail}
                />
              )}
              {tab === 'log' && <div className="felt-dark">{log}</div>}
            </div>
          </>
        )}
      </main>

      {!isDesktop && (
        <nav className="tabbar" aria-label="タブ">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={tab === t.id ? 'active' : ''}
              aria-pressed={tab === t.id}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </nav>
      )}

      <FlyLayer step={step} stepKey={stepKey} />
      <TriggerBubbles step={step} stepKey={stepKey} />
      <Banner step={step} stepKey={stepKey} game={game} viewerId={viewer.id} />

      {detail && (
        <DetailSheet
          id={detail}
          game={game}
          viewer={viewer}
          canBuild={buildOptions.includes(detail)}
          myBuildPhase={canAct && game.phase === 'build'}
          onBuild={() => {
            dispatch({ type: 'BUILD', playerId: viewer.id, id: detail });
            setDetail(null);
          }}
          onClose={() => setDetail(null)}
        />
      )}

      {canAct && game.pendingChoice?.type === 'tv' && <TvSheet game={game} me={viewer} dispatch={dispatch} />}
      {canAct && game.pendingChoice?.type === 'business' && (
        <BusinessSheet key={turnKey} game={game} me={viewer} dispatch={dispatch} />
      )}

      {showSettings && (
        <SettingsSheet
          settings={settings}
          onChange={onSettings}
          onClose={() => setShowSettings(false)}
          onLeaveRoom={onLeaveRoom}
        />
      )}

      {needHandoff && (
        <div className="handoff" onClick={() => setReadyKey(turnKey)} role="button" aria-label="手番を始める">
          <div>
            <p className="handoff-name">{current.name}さんの番です</p>
            <p>タップして始める</p>
          </div>
        </div>
      )}

      {!playing && game.phase === 'gameOver' && game.winner !== undefined && (
        <GameOverSheet game={game} onExit={onExit} />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------

function DicePanel({
  game,
  viewer,
  rollEvents,
  canAct,
  playing,
  step,
  stepKey,
  cpuPick,
  offline,
  dispatch,
}: {
  game: GameState;
  viewer: Player;
  rollEvents: GameEvent[];
  canAct: boolean;
  playing: boolean;
  step: Step | null;
  stepKey: number;
  cpuPick: CpuPick | null;
  offline: number[];
  dispatch: (a: Action) => void;
}) {
  const current = game.players[game.current];
  const total = game.dice.reduce((a, b) => a + b, 0);
  const playerId = current.id;
  const rolling = step?.kind === 'dice';
  // 振るたびに変わる番号（合計の「ポン」を、振ったときだけ出すため）
  const rollId = useRef(0);
  const lastRollKey = useRef(-1);
  if (rolling && stepKey !== lastRollKey.current) {
    lastRollKey.current = stepKey;
    rollId.current += 1;
  }

  let prompt: React.ReactNode = null;
  if (game.phase === 'gameOver') prompt = null;
  else if (playing)
    prompt = (
      <span key={stepKey} className="waiting caption" data-testid="caption">
        {stepCaption(step, game)}
      </span>
    );
  else if (cpuPick) {
    const name = isLandmarkId(cpuPick.id) ? LANDMARKS[cpuPick.id].name : FACILITIES[cpuPick.id].name;
    prompt = (
      <span className="waiting caption pick-caption" data-testid="caption">
        {current.name}は「{name}」を建てる！
      </span>
    );
  } else if (!canAct && !current.isHuman) {
    prompt = (
      <span className="waiting thinking-text" data-testid="thinking">
        {current.name}が考え中
        <span className="dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      </span>
    );
  } else if (!canAct && offline.includes(current.id)) {
    prompt = (
      <span className="waiting" data-testid="waiting-offline">
        {current.name}の通信が切れています。戻ってくるのを待っています…
      </span>
    );
  } else if (!canAct) prompt = <span className="waiting">{current.name}の番…</span>;
  else if (game.phase === 'chooseDice') {
    prompt = (
      <>
        <button className="btn gold" onClick={() => dispatch({ type: 'CHOOSE_DICE', playerId, count: 1 })}>
          1個振る
        </button>
        {current.landmarks.station && (
          <button className="btn gold" onClick={() => dispatch({ type: 'CHOOSE_DICE', playerId, count: 2 })}>
            2個振る
          </button>
        )}
      </>
    );
  } else if (game.phase === 'rolled') {
    prompt = (
      <>
        <button className="btn" onClick={() => dispatch({ type: 'REROLL', playerId })}>
          振り直す
        </button>
        <button className="btn gold" onClick={() => dispatch({ type: 'KEEP', playerId })}>
          この目で進む
        </button>
      </>
    );
  } else if (game.phase === 'build') {
    prompt = (
      <>
        <span className="hint">市場のカードかランドマークをタップして建設</span>
        <button className="btn" onClick={() => dispatch({ type: 'BUILD', playerId, id: null })}>
          何も買わない
        </button>
      </>
    );
  }

  return (
    <section
      className={`dice-panel felt-dark${canAct ? ' my-turn' : ''}${!playing && !canAct && !current.isHuman && game.phase === 'chooseDice' ? ' thinking' : ''}`}
      data-anchor="bank"
      aria-label="サイコロ"
    >
      <div className="dice-row">
        <div className="dice" data-testid="dice">
          <DiceView dice={game.dice} rolling={rolling} ms={step?.ms ?? 0} rollKey={stepKey} />
        </div>
        <span className="dice-total" data-testid="dice-total">
          {game.dice.length > 0 && (
            // 転がっている間は隠しておき、止まった瞬間にポンと出す
            <span
              key={`${rollId.current}-${game.dice.join('-')}-${game.turn}`}
              className="total-pop"
              style={rolling ? { animationDelay: `${Math.round((step?.ms ?? 0) * LAND_AT)}ms` } : undefined}
            >
              {total}
              {game.dice.length === 2 && game.dice[0] === game.dice[1] && <small className="doubles">ゾロ目</small>}
            </span>
          )}
        </span>
        <div className="dice-result">
          {!rolling && <IncomeLines game={game} viewer={viewer} events={rollEvents} />}
        </div>
      </div>
      <div className="prompt">{prompt}</div>
    </section>
  );
}

/** サイコロ欄の右側：この出目で起きたお金の動き */
function IncomeLines({ game, viewer, events }: { game: GameState; viewer: Player; events: GameEvent[] }) {
  if (game.dice.length === 0) return <span className="muted">まだ振っていません</span>;

  const moves = events.filter(
    (e): e is Extract<GameEvent, { type: 'COINS_MOVED' }> =>
      e.type === 'COINS_MOVED' && e.to !== 'bank' && !!e.cardId && !isLandmarkId(e.cardId),
  );
  const mine = moves.filter((e) => e.to === viewer.id || e.from === viewer.id);
  const shown = (mine.length > 0 ? mine : moves).slice(0, 3);
  if (shown.length === 0) {
    return <span className="muted">{game.phase === 'rolled' ? '振り直す？' : '収入なし'}</span>;
  }

  return (
    <ul>
      {shown.map((e, i) => {
        const id = e.cardId as FacilityId;
        const to = game.players[e.to as number];
        const gain = e.to === viewer.id;
        const lose = e.from === viewer.id;
        const formula = incomeFormula(to, id, e.amount);
        return (
          <li key={i} style={{ animationDelay: `${i * 90}ms` }}>
            <CardArt id={id} />
            <b>
              {FACILITIES[id].name}
              {!gain && !lose && `（${to.name}）`}
              {lose && `（${to.name}へ）`}
            </b>
            <span className={lose ? 'minus' : 'plus'}>
              {formula && !lose ? formula : `${lose ? '−' : '+'}${e.amount}`}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function MyBar({
  game,
  viewer,
  options,
  myTurn,
  fx,
  onPick,
}: {
  game: GameState;
  viewer: Player;
  options: CardId[];
  myTurn: boolean;
  fx: Fx;
  onPick: (id: CardId) => void;
}) {
  return (
    <section className={`my-bar panel-light${myTurn ? ' turn' : ''}`} aria-label={`${viewer.name}の所持金とランドマーク`}>
      <span className="my-coins" aria-label={`${viewer.name}の所持金`}>
        <span className="coin" />
        <Coins player={viewer} fx={fx} suffix="" />
      </span>
      {LANDMARK_IDS.map((id) => {
        const built = viewer.landmarks[id];
        const buyable = game.phase === 'build' && options.includes(id);
        const sparkle = fx.sparkle.has(`${viewer.id}:${id}`);
        return (
          <button
            key={id}
            className={`lm-tile${built ? ' built' : ''}${buyable ? ' buyable' : ''}${sparkle ? ' sparkle' : ''}`}
            onClick={() => onPick(id)}
            data-landmark={id}
          >
            <b>{LANDMARKS[id].name.replace('ショッピング', '')}</b>
            <small>{built ? '完成' : `${LANDMARKS[id].cost}c`}</small>
          </button>
        );
      })}
    </section>
  );
}

function DetailSheet({
  id,
  game,
  viewer,
  canBuild,
  myBuildPhase,
  onBuild,
  onClose,
}: {
  id: CardId;
  game: GameState;
  viewer: Player;
  canBuild: boolean;
  myBuildPhase: boolean;
  onBuild: () => void;
  onClose: () => void;
}) {
  let title: string;
  let cost: number;
  let desc: string;
  let meta: string;
  let colorClass: string;
  let reason = '';

  if (isLandmarkId(id)) {
    const l = LANDMARKS[id];
    ({ name: title, cost, description: desc } = l);
    meta = 'ランドマーク';
    colorClass = 'c-landmark';
    if (viewer.landmarks[id]) reason = '完成済み';
  } else {
    const c = FACILITIES[id];
    ({ name: title, cost, description: desc } = c);
    meta = `${COLOR_NAMES[c.color]}・目 ${rollsLabel(id)}・在庫 ${game.supply[id]}・所持 ${viewer.cards[id]}`;
    colorClass = `c-${c.color}`;
    if (game.supply[id] <= 0) reason = '売り切れ';
    else if (c.color === 'purple' && viewer.cards[id] > 0) reason = '紫のカードは1人1枚まで';
  }
  if (!reason && viewer.coins < cost) reason = `コインが足りません（あと${cost - viewer.coins}c）`;

  return (
    <Sheet onClose={onClose}>
      <div className={`detail ${colorClass}`}>
        <CardArt id={id} className="large" />
        <h2>{title}</h2>
        <p className="detail-meta">
          {meta}・{cost}c
        </p>
        <p>{desc}</p>
      </div>
      {myBuildPhase && (
        <button className="btn gold wide" disabled={!canBuild} onClick={onBuild}>
          {canBuild ? `${cost}c で建てる` : reason || '建てられません'}
        </button>
      )}
    </Sheet>
  );
}

const SPEED_OPTIONS: { id: Speed; label: string }[] = [
  { id: 'normal', label: 'ふつう' },
  { id: 'fast', label: 'はやい' },
  { id: 'none', label: 'なし' },
];

function SettingsSheet({
  settings,
  onChange,
  onClose,
  onLeaveRoom,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
  onClose: () => void;
  onLeaveRoom?: () => void;
}) {
  return (
    <Sheet onClose={onClose}>
      <h2>設定</h2>
      <p>アニメーションの速さ</p>
      <div className="segmented" role="radiogroup" aria-label="アニメーションの速さ">
        {SPEED_OPTIONS.map((o) => (
          <button
            key={o.id}
            role="radio"
            aria-checked={settings.speed === o.id}
            className={settings.speed === o.id ? 'active' : ''}
            onClick={() => onChange({ ...settings, speed: o.id })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <p className="note">アニメーション中に画面をタップすると、その演出を飛ばせます。</p>

      <p>効果音</p>
      <div className="segmented" role="radiogroup" aria-label="効果音">
        {[
          { on: true, label: 'オン' },
          { on: false, label: 'オフ' },
        ].map((o) => (
          <button
            key={o.label}
            role="radio"
            aria-checked={settings.sound === o.on}
            className={settings.sound === o.on ? 'active' : ''}
            onClick={() => onChange({ ...settings, sound: o.on })}
          >
            {o.label}
          </button>
        ))}
      </div>
      <label className={`volume${settings.sound ? '' : ' off'}`}>
        <span>音量</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(settings.volume * 100)}
          disabled={!settings.sound}
          aria-label="音量"
          onChange={(e) => onChange({ ...settings, volume: Number(e.target.value) / 100 })}
          // 指を離したときに今の音量で鳴らしてみる
          onPointerUp={() => playSound('coin')}
        />
      </label>
      {onLeaveRoom && (
        <button
          className="btn wide leave-room"
          onClick={() => {
            if (window.confirm('部屋を出ますか？（ゲームには戻れなくなることがあります）')) onLeaveRoom();
          }}
        >
          部屋を出る
        </button>
      )}
    </Sheet>
  );
}

function TvSheet({ game, me, dispatch }: { game: GameState; me: Player; dispatch: (a: Action) => void }) {
  return (
    <Sheet>
      <h2>テレビ局</h2>
      <p>誰から5コインもらいますか？</p>
      <div className="choice-list">
        {game.players
          .filter((o) => o.id !== me.id)
          .map((o) => (
            <button
              key={o.id}
              className="btn"
              onClick={() => dispatch({ type: 'CHOOSE_TARGET', playerId: me.id, targetId: o.id })}
            >
              {o.name}
              <span>{o.coins}c</span>
            </button>
          ))}
      </div>
    </Sheet>
  );
}

/** ビジネスセンター：相手 → 渡すカード → もらうカード → 確認 */
function BusinessSheet({ game, me, dispatch }: { game: GameState; me: Player; dispatch: (a: Action) => void }) {
  const [targetId, setTargetId] = useState<number | null>(null);
  const [give, setGive] = useState<FacilityId | null>(null);
  const [take, setTake] = useState<FacilityId | null>(null);
  const playerId = me.id;
  const target = targetId === null ? null : game.players[targetId];

  /** 施設を選ぶボタン：出目・絵・名前・持っている枚数・効果 */
  const cardButtons = (owner: Player, pick: (id: FacilityId) => void) =>
    swappableCards(owner).map((id) => (
      <button
        key={id}
        className={`btn chip-btn swap-card c-${FACILITIES[id].color}`}
        data-testid={`swap-${id}`}
        onClick={() => pick(id)}
      >
        <span className="swap-roll">{rollsLabel(id)}</span>
        <CardArt id={id} />
        <span className="swap-text">
          <b>
            {FACILITIES[id].name}
            <small>×{owner.cards[id]}</small>
          </b>
          <span className="swap-desc">{FACILITIES[id].description}</span>
        </span>
      </button>
    ));

  /** 持っている施設の一覧（見るだけ） */
  const holdings = (owner: Player) => {
    const ids = swappableCards(owner);
    if (ids.length === 0) return <span className="muted">交換できる施設なし</span>;
    return (
      <span className="swap-holdings">
        {ids.map((id) => (
          <span key={id} className={`chip c-${FACILITIES[id].color}`}>
            {FACILITIES[id].emoji} {FACILITIES[id].name}×{owner.cards[id]}
          </span>
        ))}
      </span>
    );
  };

  let step: number;
  let body;
  if (!target) {
    step = 1;
    body = (
      <>
        <p>交換する相手を選んでください</p>
        <div className="choice-list">
          {game.players
            .filter((o) => o.id !== playerId)
            .map((o) => (
              <button
                key={o.id}
                className="btn swap-target"
                disabled={swappableCards(o).length === 0}
                onClick={() => setTargetId(o.id)}
              >
                <span className="swap-target-head">
                  <b>{o.name}</b>
                  <span>{o.coins} c</span>
                </span>
                {holdings(o)}
              </button>
            ))}
        </div>
        <button className="btn wide" onClick={() => dispatch({ type: 'SKIP_SWAP', playerId })}>
          交換しない
        </button>
      </>
    );
  } else if (!give) {
    step = 2;
    body = (
      <>
        <p>{target.name}に渡す施設を選んでください</p>
        <div className="swap-ref">
          <span>{target.name}の施設：</span>
          {holdings(target)}
        </div>
        <div className="choice-list">{cardButtons(me, setGive)}</div>
        <button className="btn wide" onClick={() => setTargetId(null)}>
          戻る
        </button>
      </>
    );
  } else if (!take) {
    step = 3;
    body = (
      <>
        <p>{target.name}からもらう施設を選んでください</p>
        <div className="choice-list">{cardButtons(target, setTake)}</div>
        <button className="btn wide" onClick={() => setGive(null)}>
          戻る
        </button>
      </>
    );
  } else {
    step = 3;
    body = (
      <>
        <div className="swap-confirm">
          <div>
            <small>渡す</small>
            <CardArt id={give} />
            <b>{FACILITIES[give].name}</b>
            <span className="swap-desc">
              {rollsLabel(give)}：{FACILITIES[give].description}
            </span>
          </div>
          <span className="swap-arrow" aria-hidden="true">
            ⇄
          </span>
          <div>
            <small>{target.name}から</small>
            <CardArt id={take} />
            <b>{FACILITIES[take].name}</b>
            <span className="swap-desc">
              {rollsLabel(take)}：{FACILITIES[take].description}
            </span>
          </div>
        </div>
        <button
          className="btn gold wide"
          onClick={() => dispatch({ type: 'SWAP', playerId, targetId: target.id, give, take })}
        >
          交換する
        </button>
        <button className="btn wide" onClick={() => setTake(null)}>
          戻る
        </button>
      </>
    );
  }

  return (
    <Sheet>
      <h2>ビジネスセンター（{step}/3）</h2>
      {body}
    </Sheet>
  );
}

function GameOverSheet({ game, onExit }: { game: GameState; onExit: () => void }) {
  const winner = game.players[game.winner!];
  const built = (p: Player) => LANDMARK_IDS.filter((id) => p.landmarks[id]).length;
  const ranked = [...game.players].sort((a, b) => built(b) - built(a) || b.coins - a.coins);
  return (
    <Sheet>
      <div className="gameover">
        <p className="crown">👑</p>
        <h2>{winner.name}の勝ち！</h2>
        <ol>
          {ranked.map((p) => (
            <li key={p.id}>
              <b>{p.name}</b>
              <LandmarkDots player={p} />
              <span>{p.coins}c</span>
            </li>
          ))}
        </ol>
        <button className="btn gold wide" onClick={onExit}>
          新しいゲーム
        </button>
      </div>
    </Sheet>
  );
}
