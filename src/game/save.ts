// 途中保存。保存先（Storage）は引数で受け取るので、テストや localStorage が使えない環境でも動く。

import { FACILITIES, FACILITY_IDS, isFacilityId, isLandmarkId } from './cards';
import type { GameState, Phase } from './types';

export const SAVE_KEY = 'saikoro-town:save';
export const SAVE_VERSION = 1;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const PHASES: Phase[] = ['chooseDice', 'rolled', 'harbor', 'resolving', 'build', 'gameOver'];
/** 基本セットのランドマーク（どのゲームにも必ずある） */
const BASE_LANDMARKS = ['station', 'mall', 'park', 'tower'];

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
  const state = fillNewCards(data.state);
  return isGameState(state) ? state : null;
}

/**
 * 拡張のカードを足す前の保存データには、拡張の施設の枚数が入っていない。0 で埋める
 * （ホストから届いた状態にも使う）
 */
export function fillNewCards(x: unknown): unknown {
  if (!isObj(x)) return x;
  const fill = (rec: unknown) => {
    if (!isObj(rec)) return rec;
    const out = { ...rec };
    for (const id of FACILITY_IDS) if (FACILITIES[id].expansion && out[id] === undefined) out[id] = 0;
    return out;
  };
  const players = Array.isArray(x.players)
    ? x.players.map((p) => (isObj(p) ? { ...p, cards: fill(p.cards) } : p))
    : x.players;
  return { ...x, players, supply: fill(x.supply) };
}

function isObj(x: unknown): x is Record<string, unknown> {
  return typeof x === 'object' && x !== null && !Array.isArray(x);
}

function isInt(x: unknown): x is number {
  return typeof x === 'number' && Number.isInteger(x);
}

/** JSON から読んだ値が GameState の形か（保存データ・オンラインで届いた状態の確認に使う） */
export function isGameState(x: unknown): x is GameState {
  if (!isObj(x)) return false;
  const { players, supply, current, phase, dice, rerollUsed, turn, log } = x;
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) return false;
  for (const p of players) {
    if (!isObj(p) || !isInt(p.id) || typeof p.name !== 'string' || typeof p.isHuman !== 'boolean')
      return false;
    if (!isInt(p.coins) || p.coins < 0) return false;
    if (p.owner !== undefined && typeof p.owner !== 'string') return false;
    if (!isObj(p.cards) || !FACILITY_IDS.every((id) => isInt((p.cards as Record<string, unknown>)[id])))
      return false;
    // ランドマーク：基本の4つは必ず、拡張のぶんはあってもよい
    if (!isObj(p.landmarks)) return false;
    const lms = p.landmarks;
    if (!BASE_LANDMARKS.every((id) => typeof lms[id] === 'boolean')) return false;
    if (!Object.keys(lms).every((id) => isLandmarkId(id) && typeof lms[id] === 'boolean')) return false;
  }
  if (!isObj(supply) || !FACILITY_IDS.every((id) => isInt(supply[id]))) return false;
  if (!isInt(current) || current < 0 || current >= players.length) return false;
  if (typeof phase !== 'string' || !PHASES.includes(phase as Phase)) return false;
  if (!Array.isArray(dice) || !dice.every(isInt)) return false;
  if (typeof rerollUsed !== 'boolean' || !isInt(turn) || !Array.isArray(log)) return false;
  const { options, deck, harborBonus } = x;
  if (options !== undefined) {
    if (!isObj(options) || !Array.isArray(options.expansions) || !options.expansions.every((e) => e === 'harbor'))
      return false;
    if (options.market !== 'all' && options.market !== 'ten') return false;
  }
  if (deck !== undefined && !(Array.isArray(deck) && deck.every((d) => typeof d === 'string' && isFacilityId(d))))
    return false;
  if (harborBonus !== undefined && typeof harborBonus !== 'boolean') return false;
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
