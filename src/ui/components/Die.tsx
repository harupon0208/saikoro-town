import { useLayoutEffect, useRef, useState } from 'react';
import { FACE_TRANSFORMS, type Rotation, diceRotation, rotationCss } from '../anim/dice';
import { themeImageUrl } from '../assets';

// 面の点の位置（3×3 のマスのどこに点を置くか）
const PIPS: Record<number, number[]> = {
  1: [4],
  2: [2, 6],
  3: [2, 4, 6],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

function Face({ n }: { n: number }) {
  const img = themeImageUrl(`dice-${n}`);
  return (
    <div className={`face f${n}`} style={{ transform: `${FACE_TRANSFORMS[n]} translateZ(var(--half))` }}>
      {img ? (
        <img src={img} alt="" />
      ) : (
        Array.from({ length: 9 }, (_, i) => <span key={i} className={PIPS[n].includes(i) ? `pip${n === 1 ? ' red' : ''}` : ''} />)
      )}
    </div>
  );
}

/** サイコロのコマのうち、転がっている割合。残りは出た目を読む時間 */
export const LAND_AT = 0.7;

const rand = (a: number, b: number) => a + Math.random() * (b - a);

/**
 * 立体のサイコロ。rolling になると、パネルの奥から投げ込まれて転がり、
 * 跳ねながら止まって value の面が上（手前）を向く。
 * rollKey が変わるたびに投げ直す（振り直しにも対応）。
 */
export function Die({
  value,
  rolling = false,
  ms = 0,
  index = 0,
  rollKey = 0,
}: {
  value?: number;
  rolling?: boolean;
  ms?: number;
  index?: number;
  rollKey?: number;
}) {
  const tilt = useRef(rand(-10, 10));
  const [rot, setRot] = useState<Rotation>(() => diceRotation(value ?? 1, 0, 0, tilt.current));
  const [moving, setMoving] = useState(false);

  useLayoutEffect(() => {
    if (!value) return;
    if (!rolling) {
      setMoving(false);
      setRot(diceRotation(value, 0, 0, tilt.current));
      return;
    }
    // 投げる前：でたらめな向きに置いてから（アニメーションなし）、次のフレームで止まる向きへ回す
    tilt.current = rand(-12, 12);
    setMoving(false);
    setRot({ x: rand(0, 360), y: rand(0, 360), z: rand(0, 360) });
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        setMoving(true);
        const dir = index % 2 === 0 ? 1 : -1;
        setRot(diceRotation(value, dir * (2 + Math.round(rand(0, 1))), -dir * (1 + Math.round(rand(0, 1))), tilt.current));
      });
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, [rolling, rollKey, value, index]);

  if (!value) {
    return <div className="die empty" role="img" aria-label="サイコロ" />;
  }

  return (
    <div
      className={`die${rolling ? ' rolling' : ''}`}
      role="img"
      aria-label={`サイコロ ${value}`}
      data-value={value}
      style={
        {
          animationDuration: `${Math.round(ms * LAND_AT)}ms`,
          '--throw-x': `${index === 0 ? 150 : 110}px`,
          '--throw-y': `${index === 0 ? -60 : -30}px`,
        } as React.CSSProperties
      }
    >
      <div className="die-shadow" />
      <div
        className="cube"
        style={{
          transform: rotationCss(rot),
          transition: moving ? `transform ${Math.round(ms * LAND_AT * 0.9)}ms cubic-bezier(0.15, 0.6, 0.25, 1)` : 'none',
        }}
      >
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Face key={n} n={n} />
        ))}
      </div>
    </div>
  );
}
