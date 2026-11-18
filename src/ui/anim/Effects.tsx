// 再生中のコマ（Step）を見て演出を出す部品たち
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { FACILITIES, LANDMARKS, isLandmarkId } from '../../game/cards';
import type { FacilityId, GameState, LandmarkId } from '../../game/types';
import { CardArt } from '../components/CardArt';
import { Die } from '../components/Die';
import { type Step, coinDeltas, coinTiming } from './timeline';

/** 所持金の数字。値が変わったら ms かけてカウントアップ／ダウンする */
export function CountUp({ value, ms, delay = 0 }: { value: number; ms: number; delay?: number }) {
  const [shown, setShown] = useState(value);
  const target = useRef(value);

  useEffect(() => {
    const from = target.current;
    target.current = value;
    if (ms <= 0 || from === value) {
      setShown(value);
      return;
    }
    let raf = 0;
    let start = 0;
    const tick = (t: number) => {
      if (!start) start = t;
      const k = Math.min(1, (t - start) / ms);
      setShown(Math.round(from + (value - from) * k));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    // コインが届くまでは元の数字のまま
    const timer = setTimeout(() => (raf = requestAnimationFrame(tick)), delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
      setShown(value);
    };
  }, [value, ms, delay]);

  // アニメーションなしのときは、描画と同時に新しい値を出す（1フレーム遅れないように）
  return <>{ms <= 0 ? value : shown}</>;
}

/** 所持金の横に浮かぶ「+3」「−2」 */
export function CoinPopup({ step, stepKey, playerId }: { step: Step | null; stepKey: number; playerId: number }) {
  if (!step) return null;
  const d = coinDeltas(step).get(playerId);
  if (!d) return null;
  // 受け取る側はコインが届く頃に、払う側はコインが出ていくときに出す
  const delay = d > 0 ? Math.round(coinTiming(step).arrive * 0.8) : coinTiming(step).delay;
  return (
    <span
      key={stepKey}
      className={`popup ${d > 0 ? 'plus' : 'minus'}`}
      style={{ animationDuration: `${Math.max(step.ms - delay, 450)}ms`, animationDelay: `${delay}ms` }}
      data-testid={`popup-${playerId}`}
    >
      {d > 0 ? `+${d}` : `−${-d}`}
    </span>
  );
}

/** サイコロ。振るコマでは立方体が投げ込まれて転がる */
export function DiceView({
  dice,
  rolling,
  ms,
  rollKey,
}: {
  dice: number[];
  rolling: boolean;
  ms: number;
  rollKey: number;
}) {
  if (dice.length === 0) return <Die />;
  return (
    <>
      {dice.map((d, i) => (
        <Die key={i} value={d} rolling={rolling} ms={ms} index={i} rollKey={rollKey} />
      ))}
    </>
  );
}

interface Flight {
  id: number;
  kind: 'coin' | 'card';
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  delay: number;
  cardId?: FacilityId | LandmarkId;
}

function center(el: Element | null): { x: number; y: number } | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

function anchor(name: string): Element | null {
  return document.querySelector(`[data-anchor="${name}"]`);
}

/**
 * コインが山なりに飛ぶ／建てたカードが市場から持ち主の所へ飛ぶ。
 * 画面上の位置は data-anchor のついた要素から測る（見えていなければ飛ばさない）。
 */
export function FlyLayer({ step, stepKey }: { step: Step | null; stepKey: number }) {
  const [flights, setFlights] = useState<Flight[]>([]);

  useLayoutEffect(() => {
    if (!step) {
      setFlights([]);
      return;
    }
    const list: Flight[] = [];
    let n = 0;
    for (const e of step.events) {
      if (e.type === 'COINS_MOVED') {
        const from = center(anchor(e.from === 'bank' ? 'bank' : `coins-${e.from}`));
        const to = center(anchor(e.to === 'bank' ? 'bank' : `coins-${e.to}`));
        if (!from || !to) continue;
        // 枚数が多くても最大6枚まで、少しずつずらして飛ばす
        const count = Math.min(e.amount, 6);
        for (let i = 0; i < count; i++) {
          list.push({
            id: n++,
            kind: 'coin',
            x0: from.x + (i % 3) * 6 - 6,
            y0: from.y,
            x1: to.x,
            y1: to.y,
            delay: i * 70,
          });
        }
      } else if (e.type === 'BUILT' && !isLandmarkId(e.id)) {
        const from = center(anchor(`market-${e.id}`));
        const to = center(anchor(`coins-${e.playerId}`));
        if (!from || !to) continue;
        list.push({ id: n++, kind: 'card', x0: from.x, y0: from.y, x1: to.x, y1: to.y, delay: 0, cardId: e.id });
      }
    }
    setFlights(list);
    // stepKey が変わったら（＝次のコマ）測り直す
  }, [stepKey]);

  if (!step || flights.length === 0) return null;
  const timing = coinTiming(step);
  const ms = Math.max(timing.fly, 250);
  return (
    <div className="fly-layer" aria-hidden="true">
      {flights.map((f) => {
        const color = f.cardId && !isLandmarkId(f.cardId) ? FACILITIES[f.cardId].color : '';
        return (
          // 外側が横に、内側が山なりに縦に動く（2つを合わせて放物線になる）
          <span
            key={`${stepKey}-${f.id}`}
            className={`fly fly-${f.kind}`}
            style={
              {
                left: f.x0,
                top: f.y0,
                '--dx': `${f.x1 - f.x0}px`,
                '--dy': `${f.y1 - f.y0}px`,
                '--arc': `${-Math.min(90, 40 + Math.abs(f.x1 - f.x0) * 0.15)}px`,
                animationDuration: `${ms}ms`,
                animationDelay: `${timing.delay + f.delay}ms`,
              } as React.CSSProperties
            }
          >
            <span
              className="fly-y"
              style={{ animationDuration: `${ms}ms`, animationDelay: `${timing.delay + f.delay}ms` }}
            >
              {f.kind === 'coin' ? (
                <span className="fly-coin-face" />
              ) : (
                <span className={`fly-card-face c-${color}`}>
                  <CardArt id={f.cardId!} />
                </span>
              )}
            </span>
          </span>
        );
      })}
    </div>
  );
}

/** 「ハルの番」「もう1回！」の帯、ランドマーク完成、勝利の紙吹雪 */
export function Banner({
  step,
  stepKey,
  game,
  viewerId,
}: {
  step: Step | null;
  stepKey: number;
  game: GameState;
  viewerId: number;
}) {
  if (!step) return null;
  const e = step.events[0];
  if (step.kind === 'turn' && e.type === 'TURN_STARTED') {
    const p = game.players[e.playerId];
    const mine = p.isHuman && p.id === viewerId;
    return (
      <div
        key={stepKey}
        className={`banner${mine ? ' mine' : ''}`}
        style={{ animationDuration: `${step.ms}ms` }}
        role="status"
      >
        <span className="banner-text">{mine ? `${p.name}の番！` : `${p.name}の番`}</span>
      </div>
    );
  }
  if (step.kind === 'extraTurn') {
    return (
      <div key={stepKey} className="banner gold" style={{ animationDuration: `${step.ms}ms` }} role="status">
        <span className="banner-text">ゾロ目！もう1回！</span>
      </div>
    );
  }
  const done = step.events.find((x) => x.type === 'LANDMARK_COMPLETED');
  if (done && done.type === 'LANDMARK_COMPLETED') {
    return (
      <div key={stepKey} className="landmark-burst" style={{ animationDuration: `${step.ms}ms` }} role="status">
        <div className="burst-rays" style={{ animationDuration: `${step.ms}ms` }} />
        <Sparkles />
        <div className="burst-card" style={{ animationDuration: `${step.ms}ms` }}>
          <CardArt id={done.id} className="large" />
          <b>{LANDMARKS[done.id].name}</b>
          <span>
            {game.players[done.playerId].name}が完成！
          </span>
        </div>
      </div>
    );
  }
  if (step.kind === 'win' && e.type === 'GAME_WON') {
    return (
      <div key={stepKey} className="win-layer" role="status">
        <Confetti ms={step.ms} />
        <div className="win-text">{game.players[e.playerId].name}の勝ち！</div>
      </div>
    );
  }
  return null;
}

function Sparkles() {
  return (
    <div className="sparkles" aria-hidden="true">
      {Array.from({ length: 14 }, (_, i) => {
        const angle = (i / 14) * 360;
        const dist = 110 + ((i * 37) % 60);
        return (
          <span
            key={i}
            style={
              {
                '--tx': `${Math.cos((angle * Math.PI) / 180) * dist}px`,
                '--ty': `${Math.sin((angle * Math.PI) / 180) * dist}px`,
                animationDelay: `${(i % 4) * 60}ms`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

interface Bubble {
  key: string;
  x: number;
  y: number;
  side: boolean;
  cardId: FacilityId;
}

/** 発動したカードの絵を、持ち主の所持金の上にポンと出す（CPU の収入も目で追えるように） */
export function TriggerBubbles({ step, stepKey }: { step: Step | null; stepKey: number }) {
  const [bubbles, setBubbles] = useState<Bubble[]>([]);

  useLayoutEffect(() => {
    const list: Bubble[] = [];
    const perPlayer = new Map<number, number>();
    for (const e of step?.events ?? []) {
      if (e.type !== 'CARD_TRIGGERED') continue;
      const key = `${e.playerId}:${e.cardId}`;
      if (list.some((b) => b.key === key)) continue;
      const pos = center(anchor(`coins-${e.playerId}`));
      if (!pos) continue;
      const i = perPlayer.get(e.playerId) ?? 0;
      perPlayer.set(e.playerId, i + 1);
      // 画面の上の方（相手の欄）では、ヘッダーに隠れず所持金の数字も隠さないよう、数字の左に出す。
      // 同じ人に複数あれば横に並べる
      const side = pos.y < 110;
      list.push({ key, x: side ? pos.x - 48 - i * 38 : pos.x + i * 38 - 10, y: pos.y, side, cardId: e.cardId });
    }
    setBubbles(list);
  }, [stepKey]);

  if (!step || bubbles.length === 0) return null;
  const ms = Math.max(step.ms * 1.3, 500);
  return (
    <div aria-hidden="true">
      {bubbles.map((b) => (
        <span
          key={`${stepKey}-${b.key}`}
          className={`trigger-bubble c-${FACILITIES[b.cardId].color}${b.side ? ' side' : ''}`}
          style={{ left: b.x, top: b.y, animationDuration: `${ms}ms` }}
          data-testid="trigger-bubble"
        >
          <CardArt id={b.cardId} />
        </span>
      ))}
    </div>
  );
}

const CONFETTI_COLORS =['#E3B23C', '#2563C9', '#1F7A45', '#C23B3B', '#6E44B8', '#F6EFDF'];

function Confetti({ ms }: { ms: number }) {
  // 毎回同じ並びでよいので、番号から位置を決める
  return (
    <div className="confetti" aria-hidden="true">
      {Array.from({ length: 60 }, (_, i) => (
        <span
          key={i}
          style={
            {
              left: `${(i * 37) % 100}%`,
              background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
              animationDuration: `${ms * (0.6 + ((i * 7) % 5) / 10)}ms`,
              animationDelay: `${(i * 23) % 300}ms`,
              '--sway': `${((i * 13) % 80) - 40}px`,
              '--spin': `${360 + ((i * 47) % 720)}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

/** 卓の上をゆっくり昇っていく光の粒（照明のほこり）。位置は番号から決める */
export function Ambience({ count = 14 }: { count?: number }) {
  return (
    <div className="ambience" aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <span
          key={i}
          style={
            {
              left: `${(i * 41 + 7) % 100}%`,
              '--s': `${4 + ((i * 7) % 6)}px`,
              '--d': `${16 + ((i * 13) % 14)}s`,
              '--delay': `${-((i * 17) % 28)}s`,
              '--drift': `${((i * 29) % 60) - 30}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
