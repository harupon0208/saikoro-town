import { describe, expect, it } from 'vitest';
import type { StorageLike } from '../game/save';
import { DEFAULT_SETTINGS, SETTINGS_KEY, cpuDelayMs, cpuPickMs, effectiveSpeed, loadSettings, saveSettings } from './settings';

function memory(init: Record<string, string> = {}): StorageLike & { data: Record<string, string> } {
  const data = { ...init };
  return {
    data,
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v;
    },
    removeItem: (k) => {
      delete data[k];
    },
  };
}

describe('設定', () => {
  it('保存して読み込める', () => {
    const s = memory();
    saveSettings(s, { speed: 'fast', sound: false, volume: 0.3 });
    expect(loadSettings(s)).toEqual({ speed: 'fast', sound: false, volume: 0.3 });
  });

  it('前の版の保存（速さだけ）なら、効果音は初期値（オン）', () => {
    const s = memory({ [SETTINGS_KEY]: '{"speed":"fast"}' });
    expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, speed: 'fast' });
    expect(DEFAULT_SETTINGS.sound).toBe(true);
  });

  it('音量が範囲外なら初期値', () => {
    const s = memory({ [SETTINGS_KEY]: '{"speed":"normal","sound":true,"volume":5}' });
    expect(loadSettings(s).volume).toBe(DEFAULT_SETTINGS.volume);
  });

  it('保存がない・壊れている・知らない値なら初期値', () => {
    expect(loadSettings(memory())).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{oops' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(memory({ [SETTINGS_KEY]: '{"speed":"turbo"}' }))).toEqual(DEFAULT_SETTINGS);
    expect(loadSettings(undefined)).toEqual(DEFAULT_SETTINGS);
  });

  it('storage が例外を投げても止まらない', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {},
    };
    expect(loadSettings(broken)).toEqual(DEFAULT_SETTINGS);
    expect(() => saveSettings(broken, { ...DEFAULT_SETTINGS, speed: 'none' })).not.toThrow();
  });

  it('視差効果を減らす設定では「ふつう」が「はやい」になる', () => {
    expect(effectiveSpeed('normal', true)).toBe('fast');
    expect(effectiveSpeed('none', true)).toBe('none');
    expect(effectiveSpeed('normal', false)).toBe('normal');
  });
});

describe('CPU の間', () => {
  it('「ふつう」は「はやい」より長く、「なし」では建てるカードを指さない', () => {
    expect(cpuDelayMs('normal')).toBeGreaterThan(cpuDelayMs('fast'));
    expect(cpuPickMs('normal')).toBeGreaterThan(cpuPickMs('fast'));
    expect(cpuPickMs('none')).toBe(0);
  });
});
