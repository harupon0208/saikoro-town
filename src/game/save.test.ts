import { describe, expect, it } from 'vitest';
import { chooseCpuAction } from './ai';
import { applyAction } from './engine';
import { mulberry32 } from './rng';
import { SAVE_KEY, clearSave, deserialize, loadGame, saveGame, serialize, type StorageLike } from './save';
import { newGame } from './testUtils';
import type { GameState } from './types';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(k: string) {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.data.set(k, v);
  }
  removeItem(k: string) {
    this.data.delete(k);
  }
}

const brokenStorage: StorageLike = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
  removeItem() {
    throw new Error('blocked');
  },
};

/** 途中まで進めたゲーム（選択待ちなども含む状態） */
function midGame(steps: number): GameState {
  let s = newGame(3, 7);
  const rng = mulberry32(99);
  for (let i = 0; i < steps && s.phase !== 'gameOver'; i++) {
    s = applyAction(s, chooseCpuAction(s), rng).state;
  }
  return s;
}

describe('途中保存', () => {
  it('保存した状態を読み込むと、保存前とまったく同じ状態に戻る', () => {
    const storage = new MemoryStorage();
    for (const steps of [0, 1, 7, 40, 150]) {
      const s = midGame(steps);
      expect(saveGame(storage, s)).toBe(true);
      const loaded = loadGame(storage);
      expect(loaded).toEqual(s);
      expect(JSON.stringify(loaded)).toBe(JSON.stringify(s));
    }
  });

  it('読み込んだ状態から続きを進めると、保存しなかった場合と同じ結果になる', () => {
    const s = midGame(30);
    const loaded = deserialize(serialize(s))!;
    const a = applyAction(s, chooseCpuAction(s), mulberry32(5));
    const b = applyAction(loaded, chooseCpuAction(loaded), mulberry32(5));
    expect(b).toEqual(a);
  });

  it('保存データにはバージョン番号がつく', () => {
    const data = JSON.parse(serialize(newGame(2)));
    expect(data.version).toBe(1);
  });

  it('壊れた保存データやバージョンが違うデータは無視する', () => {
    const good = JSON.parse(serialize(newGame(2)));
    const cases = [
      '{not json',
      'null',
      '[]',
      JSON.stringify({ ...good, version: 2 }),
      JSON.stringify({ state: good.state }),
      JSON.stringify({ version: 1, state: { ...good.state, players: [] } }),
      JSON.stringify({ version: 1, state: { ...good.state, phase: 'unknown' } }),
      JSON.stringify({ version: 1, state: { ...good.state, current: 9 } }),
      JSON.stringify({ version: 1, state: { ...good.state, supply: {} } }),
    ];
    const storage = new MemoryStorage();
    for (const text of cases) {
      expect(deserialize(text)).toBeNull();
      storage.setItem(SAVE_KEY, text);
      expect(loadGame(storage)).toBeNull();
      expect(storage.getItem(SAVE_KEY)).toBeNull(); // 壊れたデータは消える
    }
    // その後、新しいゲームを普通に保存・再開できる
    const fresh = newGame(2);
    saveGame(storage, fresh);
    expect(loadGame(storage)).toEqual(fresh);
  });

  it('港の拡張を入れる前の保存データ（拡張の施設がない）も、そのまま続きから遊べる', () => {
    const old = JSON.parse(serialize(newGame(2)));
    for (const p of old.state.players) {
      delete p.cards.sushi;
      delete p.cards.tuna;
    }
    delete old.state.supply.sushi;
    const loaded = deserialize(JSON.stringify(old));
    expect(loaded).not.toBeNull();
    expect(loaded!.players[0].cards.sushi).toBe(0);
    expect(loaded!.supply.sushi).toBe(0);
    expect(Object.keys(loaded!.players[0].landmarks)).toHaveLength(4);
  });

  it('保存がなければ null', () => {
    expect(loadGame(new MemoryStorage())).toBeNull();
  });

  it('clearSave で保存が消える', () => {
    const storage = new MemoryStorage();
    saveGame(storage, newGame(2));
    clearSave(storage);
    expect(loadGame(storage)).toBeNull();
  });

  it('localStorage が使えない環境でもエラーで止まらない', () => {
    const s = newGame(2);
    expect(saveGame(undefined, s)).toBe(false);
    expect(loadGame(undefined)).toBeNull();
    expect(() => clearSave(undefined)).not.toThrow();
    expect(saveGame(brokenStorage, s)).toBe(false);
    expect(loadGame(brokenStorage)).toBeNull();
    expect(() => clearSave(brokenStorage)).not.toThrow();
  });
});
