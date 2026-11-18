// 遊ぶバージョン（基本／港の拡張）と市場の並べ方を選ぶ。開始画面とオンラインの部屋で使う
import type { GameOptions } from '../game/types';

export const DEFAULT_OPTIONS: GameOptions = { expansions: [], market: 'all' };

/** 港の拡張を選んだときの市場の初期値（25種類は多いので10種類） */
const HARBOR_DEFAULT_MARKET: GameOptions['market'] = 'ten';

/** 港の拡張のルール説明（public/rules/harbor.html。サイトに置いてあるので誰でも見られる） */
export const HARBOR_RULES_URL = `${import.meta.env.BASE_URL}rules/harbor.html`;

export function optionsLabel(o: GameOptions): string {
  if (!o.expansions.includes('harbor')) return '基本セット';
  return `港の拡張・市場${o.market === 'ten' ? '10種類' : '全種類'}`;
}

export function OptionsPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: GameOptions;
  onChange: (o: GameOptions) => void;
  disabled?: boolean;
}) {
  const harbor = value.expansions.includes('harbor');
  return (
    <>
      <h2>バージョン</h2>
      <div className="row" role="radiogroup" aria-label="バージョン">
        <button
          role="radio"
          aria-checked={!harbor}
          className={!harbor ? 'selected' : ''}
          disabled={disabled}
          onClick={() => onChange({ expansions: [], market: 'all' })}
        >
          基本
        </button>
        <button
          role="radio"
          aria-checked={harbor}
          className={harbor ? 'selected' : ''}
          disabled={disabled}
          onClick={() => onChange({ expansions: ['harbor'], market: harbor ? value.market : HARBOR_DEFAULT_MARKET })}
        >
          ⚓ 港の拡張
        </button>
      </div>
      {harbor && (
        <>
          <p className="note">
            港・空港のランドマークと、寿司屋・漁船など10種類の施設が増えます。勝つにはランドマーク6つ。{' '}
            <a className="rules-link" href={HARBOR_RULES_URL} target="_blank" rel="noopener">
              ルールを見る
            </a>
          </p>
          <h2>市場</h2>
          <div className="row" role="radiogroup" aria-label="市場">
            <button
              role="radio"
              aria-checked={value.market === 'ten'}
              className={value.market === 'ten' ? 'selected' : ''}
              disabled={disabled}
              onClick={() => onChange({ ...value, market: 'ten' })}
            >
              10種類だけ
            </button>
            <button
              role="radio"
              aria-checked={value.market === 'all'}
              className={value.market === 'all' ? 'selected' : ''}
              disabled={disabled}
              onClick={() => onChange({ ...value, market: 'all' })}
            >
              全種類
            </button>
          </div>
          <p className="note">
            {value.market === 'ten'
              ? '山札から10種類だけ並べ、売り切れたら引き足します。毎回ちがう市場になります。'
              : '25種類すべてを並べます。'}
          </p>
        </>
      )}
    </>
  );
}
