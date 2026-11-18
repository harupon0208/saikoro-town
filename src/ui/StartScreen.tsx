import { useState } from 'react';
import type { GameConfig, GameOptions, SeatConfig } from '../game/types';
import { Ambience } from './anim/Effects';
import { Die } from './components/Die';
import { DEFAULT_OPTIONS, OptionsPicker } from './OptionsPicker';

interface Props {
  hasSave: boolean;
  onContinue: () => void;
  onDiscardSave: () => void;
  onStart: (config: GameConfig) => void;
  onHostRoom: () => void;
  onJoinRoom: () => void;
}

/** CPU の名前（オンライン対戦で空いた席にも使う） */
export const CPU_NAMES = ['ハル', 'ミナト', 'ソラ'];

const DEFAULT_SEATS: SeatConfig[] = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
  { name: 'ミナト', isHuman: false },
  { name: 'ソラ', isHuman: false },
];

export function StartScreen({ hasSave, onContinue, onDiscardSave, onStart, onHostRoom, onJoinRoom }: Props) {
  const [count, setCount] = useState(4);
  const [seats, setSeats] = useState<SeatConfig[]>(DEFAULT_SEATS);
  const [options, setOptions] = useState<GameOptions>(DEFAULT_OPTIONS);

  const setSeat = (i: number, patch: Partial<SeatConfig>) =>
    setSeats((prev) => prev.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const start = () => {
    onStart({
      seats: seats.slice(0, count).map((s, i) => ({
        name: s.name.trim() || `プレイヤー${i + 1}`,
        isHuman: s.isHuman,
      })),
      ...(options.expansions.length > 0 ? { options } : {}),
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

          <OptionsPicker value={options} onChange={setOptions} />

          <button className="primary big" onClick={start}>
            スタート
          </button>
        </section>
      )}

      <section className="panel online-panel" aria-label="オンラインで遊ぶ">
        <h2>オンラインで遊ぶ</h2>
        <p className="note">友達のスマホとつないで、それぞれの画面で遊べます。</p>
        <div className="row">
          <button className="primary" onClick={onHostRoom}>
            部屋を作る
          </button>
          <button onClick={onJoinRoom}>部屋に入る</button>
        </div>
      </section>
    </main>
  );
}
