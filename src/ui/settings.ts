// 見た目の設定（アニメーションの速さ）。ゲームの保存とは別のキーに置く
import type { StorageLike } from '../game/save';
import type { Speed } from './anim/timeline';

export const SETTINGS_KEY = 'saikoro-town:settings';

export interface Settings {
  speed: Speed;
  /** 効果音を鳴らすか */
  sound: boolean;
  /** 効果音の音量（0〜1） */
  volume: number;
}

export const DEFAULT_SETTINGS: Settings = { speed: 'normal', sound: true, volume: 0.7 };
const SPEEDS: Speed[] = ['normal', 'fast', 'none'];

export function loadSettings(storage: StorageLike | undefined): Settings {
  try {
    const raw = storage?.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const data = JSON.parse(raw) as Partial<Settings>;
    const volume = typeof data.volume === 'number' && data.volume >= 0 && data.volume <= 1 ? data.volume : DEFAULT_SETTINGS.volume;
    return {
      speed: SPEEDS.includes(data.speed as Speed) ? (data.speed as Speed) : DEFAULT_SETTINGS.speed,
      sound: typeof data.sound === 'boolean' ? data.sound : DEFAULT_SETTINGS.sound,
      volume,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(storage: StorageLike | undefined, settings: Settings): void {
  try {
    storage?.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // 保存できなくても遊べればよい
  }
}

/** 端末の「視差効果を減らす」がオンなら、「ふつう」を「はやい」として扱う（動きは CSS でも止める） */
export function effectiveSpeed(speed: Speed, reducedMotion: boolean): Speed {
  return reducedMotion && speed === 'normal' ? 'fast' : speed;
}

/** CPU の1アクションごとの間（再生が終わってから数える）。SPEC 9章は0.6〜1秒だが、ゆっくり見たいという希望で長め */
export function cpuDelayMs(speed: Speed): number {
  // 「ふつう」は CPU が考えている様子を見せる
  return speed === 'fast' ? 300 : 1300;
}

/** CPU が建てるカードを指し示しておく時間（「なし」では指さない） */
export function cpuPickMs(speed: Speed): number {
  return speed === 'normal' ? 1100 : speed === 'fast' ? 350 : 0;
}
