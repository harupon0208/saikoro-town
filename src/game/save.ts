// 途中保存。保存先（Storage）は引数で受け取るので、テストや localStorage が使えない環境でも動く。

import { FACILITY_IDS, LANDMARK_IDS } from './cards';
import type { GameState, Phase } from './types';

export const SAVE_KEY = 'saikoro-town:save';
export const SAVE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PHASES: Phase[] = ['chooseDice', 'rolled', 'resolving', 'build', 'gameOver'];

export function serialize(state: GameState): string {
  return JSON.stringify({ version: SAVE_VERSION, state });
}

/** 読み込めないデータ・バージョン違いは null を返す */
export function deserialize(text: string | null): GameState | null {
  if (!text) return null;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObj(data) || data.version !== SAVE_VERSION) return null;
  return isGameState(data.state) ? (data.state as GameState) : null;
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

function isGameState(x: unknown): boolean {
  if (!isObj(x)) return false;
  const { players, supply, current, phase, dice, rerollUsed, turn, log } = x;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) return false;
  for (const p of players) {
    if (!isObj(p) || !isInt(p.id) || typeof p.name !== 'string' || typeof p.isHuman !== 'boolean')
      return false;
    if (!isInt(p.coins) || p.coins < 0) return false;
    if (!isObj(p.cards) || !FACILITY_IDS.every((id) => isInt((p.cards as Record<string, unknown>)[id])))
      return false;
    if (
      !isObj(p.landmarks) ||
      !LANDMARK_IDS.every((id) => typeof (p.landmarks as Record<string, unknown>)[id] === 'boolean')
    )
      return false;
  }
  if (!isObj(supply) || !FACILITY_IDS.every((id) => isInt(supply[id]))) return false;
  if (!isInt(current) || current < 0 || current >= players.length) return false;
  if (typeof phase !== 'string' || !PHASES.includes(phase as Phase)) return false;
  if (!Array.isArray(dice) || !dice.every(isInt)) return false;
  if (typeof rerollUsed !== 'boolean' || !isInt(turn) || !Array.isArray(log)) return false;
  return true;
}

/** ブラウザの localStorage。使えない環境では undefined */
export function getDefaultStorage(): StorageLike | undefined {
  try {
    const ls = (globalThis as { localStorage?: StorageLike }).localStorage;
    if (!ls) return undefined;
    const probe = `${SAVE_KEY}:probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return undefined;
  }
}

/** 保存する。失敗しても例外は出さず false を返す */
export function saveGame(storage: StorageLike | undefined, state: GameState): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, serialize(state));
    return true;
  } catch {
    return false;
  }
}

/** 読み込む。保存がない・壊れている・バージョン違いなら null（壊れたデータは消す） */
export function loadGame(storage: StorageLike | undefined): GameState | null {
  if (!storage) return null;
  try {
    const text = storage.getItem(SAVE_KEY);
    const state = deserialize(text);
    if (text && !state) storage.removeItem(SAVE_KEY);
    return state;
  } catch {
    return null;
  }
}

export function clearSave(storage: StorageLike | undefined): void {
  if (!storage) return;
  try {
    storage.removeItem(SAVE_KEY);
  } catch {
    // 何もしない
  }
}
