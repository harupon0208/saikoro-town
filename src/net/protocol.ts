// ホストと友達の端末のあいだでやりとりするメッセージ。届いたものは必ず形を確かめてから使う
import { isGameState } from '../game/save';
import type { Action, FacilityId, GameEvent, GameState, LandmarkId } from '../game/types';

export interface RoomMember {
  name: string;
  connected: boolean;
}

export interface Pick {
  playerId: number;
  id: FacilityId | LandmarkId;
}

/** 友達 → ホスト */
export type ToHost =
  | { t: 'hello'; clientId: string; name: string }
  | { t: 'action'; action: Action }
  | { t: 'pong' };

/** ホスト → 友達 */
export type ToGuest =
  /** 部屋の様子（始まる前）。members[0] がホスト */
  | { t: 'room'; code: string; members: RoomMember[]; count: number }
  /** ゲームの状態と、そこに至るイベント（入り直したときは events が空） */
  | { t: 'state'; state: GameState; events: GameEvent[]; offline: number[] }
  /** 通信が切れている人の席 */
  | { t: 'presence'; offline: number[] }
  /** CPU が建てようとしているカード */
  | { t: 'pick'; pick: Pick | null }
  | { t: 'reject'; reason: string }
  /** ホストが部屋を閉じた */
  | { t: 'closed' }
  | { t: 'ping' };

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isInt = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isIntList = (x: unknown): x is number[] => Array.isArray(x) && x.every(isInt);

const ACTION_TYPES = ['CHOOSE_DICE', 'REROLL', 'KEEP', 'CHOOSE_TARGET', 'SWAP', 'SKIP_SWAP', 'BUILD'];

function isAction(x: unknown): x is Action {
  // 中身の正しさは isValidAction が確かめる。ここでは形だけ
  return isObj(x) && isStr(x.type) && ACTION_TYPES.includes(x.type) && isInt(x.playerId);
}

export function parseToHost(x: unknown): ToHost | null {
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'hello':
      return isStr(x.clientId) && x.clientId.length <= 64 && isStr(x.name)
        ? { t: 'hello', clientId: x.clientId, name: x.name.slice(0, 20) }
        : null;
    case 'action':
      return isAction(x.action) ? { t: 'action', action: x.action } : null;
    case 'pong':
      return { t: 'pong' };
    default:
      return null;
  }
}

function isMember(x: unknown): x is RoomMember {
  return isObj(x) && isStr(x.name) && typeof x.connected === 'boolean';
}

export function parseToGuest(x: unknown): ToGuest | null {
  if (!isObj(x)) return null;
  switch (x.t) {
    case 'room':
      return isStr(x.code) && Array.isArray(x.members) && x.members.every(isMember) && isInt(x.count)
        ? { t: 'room', code: x.code, members: x.members, count: x.count }
        : null;
    case 'state':
      return isGameState(x.state) && Array.isArray(x.events) && x.events.every(isObj) && isIntList(x.offline)
        ? { t: 'state', state: x.state, events: x.events as GameEvent[], offline: x.offline }
        : null;
    case 'presence':
      return isIntList(x.offline) ? { t: 'presence', offline: x.offline } : null;
    case 'pick':
      if (x.pick === null) return { t: 'pick', pick: null };
      return isObj(x.pick) && isInt(x.pick.playerId) && isStr(x.pick.id)
        ? { t: 'pick', pick: { playerId: x.pick.playerId, id: x.pick.id as Pick['id'] } }
        : null;
    case 'reject':
      return isStr(x.reason) ? { t: 'reject', reason: x.reason } : null;
    case 'closed':
      return { t: 'closed' };
    case 'ping':
      return { t: 'ping' };
    default:
      return null;
  }
}
