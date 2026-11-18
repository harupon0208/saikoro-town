import { useState } from 'react';
import type { GameConfig, SeatConfig } from '../game/types';
import { Ambience } from './anim/Effects';
import { Die } from './components/Die';

interface Props {
  hasSave: boolean;
  onContinue: () => void;
  onDiscardSave: () => void;
  onStart: (config: GameConfig) => void;
}

const DEFAULT_SEATS: SeatConfig[] = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
  { name: 'ミナト', isHuman: false },
  { name: 'ソラ', isHuman: false },
];

export function StartScreen({ hasSave, onContinue, onDiscardSave, onStart }: Props) {
  const [count, setCount] = useState(4);
  const [seats, setSeats] = useState<SeatConfig[]>(DEFAULT_SEATS);

  const setSeat = (i: number, patch: Partial<SeatConfig>) =>
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const start = () => {
    onStart({
      seats: seats.slice(0, count).map((s, i) => ({
        name: s.name.trim() || `プレイヤー${i + 1}`,
        isHuman: s.isHuman,
      })),
    });
  };

  return (
    <main className="start">
      <Ambience count={18} />
      <div className="title-dice" aria-hidden="true">
        <Die value={5} />
        <Die value={3} index={1} />
      </div>
      <h1>サイコロタウン</h1>
      <p className="title-ornament">サイコロで街をそだてよう</p>

      {hasSave ? (
        <section className="panel">
          <p>前回のゲームが保存されています。</p>
          <div className="row">
            <button className="primary" onClick={onContinue}>
              続きから
            </button>
            <button
              onClick={() => {
                if (window.confirm('保存されたゲームを消して、新しく始めますか？')) onDiscardSave();
              }}
            >
              新しく始める
            </button>
          </div>
        </section>
      ) : (
        <section className="panel">
          <h2>人数</h2>
          <div className="row">
            {[2, 3, 4].map((n) => (
              <button key={n} className={n === count ? 'selected' : ''} onClick={() => setCount(n)}>
                {n}人
              </button>
            ))}
          </div>

          <h2>席</h2>
          {seats.slice(0, count).map((seat, i) => (
            <div key={i} className="row seat">
              <input
                value={seat.name}
                maxLength={10}
                onChange={(e) => setSeat(i, { name: e.target.value })}
                aria-label={`席${i + 1}の名前`}
              />
              <button
                className={seat.isHuman ? 'selected' : ''}
                onClick={() => setSeat(i, { isHuman: true })}
              >
                人間
              </button>
              <button
                className={!seat.isHuman ? 'selected' : ''}
                onClick={() => setSeat(i, { isHuman: false })}
              >
                CPU
              </button>
            </div>
          ))}
          <p className="note">手番の順番はスタート時にランダムで決まります。</p>

          <button className="primary big" onClick={start}>
            スタート
          </button>
        </section>
      )}
    </main>
  );
}
