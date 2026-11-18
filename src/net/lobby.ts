// オンライン対戦の部屋の決まりごと。通信にも React にも依存しない（単体テストあり）
import type { Action, GameState, Rng, SeatConfig } from '../game/types';

/** ホスト自身の端末 ID */
export const HOST_ID = 'host';
export const MAX_PLAYERS = 4;
export const MIN_PLAYERS = 2;

export interface Member {
  /** 端末の ID（タブごと。入り直したときに同じ席へ戻すのに使う） */
  clientId: string;
  name: string;
  connected: boolean;
}

/** 4桁の部屋コード（0000〜9999） */
export function makeRoomCode(rng: Rng): string {
  return String(Math.floor(rng() * 10000)).padStart(4, '0');
}

export function isRoomCode(s: string): boolean {
  return /^\d{4}$/.test(s);
}

/** 名前を整える：空なら「ゲスト」、ほかの人と同じなら番号をつける */
export function uniqueName(name: string, taken: string[]): string {
  const base = name.trim().slice(0, 10) || 'ゲスト';
  if (!taken.includes(base)) return base;
  for (let i = 2; ; i++) {
    const n = `${base.slice(0, 9)}${i}`;
    if (!taken.includes(n)) return n;
  }
}

export type JoinResult =
  | { ok: true; members: Member[]; member: Member; rejoined: boolean }
  | { ok: false; reason: string };

/**
 * 参加を受け付ける。同じ端末 ID なら（通信が切れて入り直した人）その席に戻す。
 * ゲームが始まってからは、新しい人は入れない。
 */
export function join(members: Member[], clientId: string, name: string, started: boolean): JoinResult {
  const i = members.findIndex((m) => m.clientId === clientId);
  if (i >= 0) {
    const member = { ...members[i], connected: true };
    return { ok: true, members: members.map((m, j) => (j === i ? member : m)), member, rejoined: true };
  }
  if (clientId === HOST_ID) return { ok: false, reason: '参加できませんでした' };
  if (started) return { ok: false, reason: 'このゲームはもう始まっています' };
  if (members.length >= MAX_PLAYERS) return { ok: false, reason: 'この部屋は満員です' };
  const member: Member = {
    clientId,
    name: uniqueName(name, members.map((m) => m.name)),
    connected: true,
  };
  return { ok: true, members: [...members, member], member, rejoined: false };
}

/** 通信が切れた：始まる前なら部屋から外す。始まってからは席を残して「切断中」にする */
export function leave(members: Member[], clientId: string, started: boolean): Member[] {
  if (clientId === HOST_ID) return members;
  if (!started) return members.filter((m) => m.clientId !== clientId);
  return members.map((m) => (m.clientId === clientId ? { ...m, connected: false } : m));
}

/** 人数として選べる最小（参加者の数。ただし2人以上） */
export function minCount(members: Member[]): number {
  return Math.max(MIN_PLAYERS, members.length);
}

/** 参加者の席を先に並べ、残りを CPU で埋める */
export function seatsFor(members: Member[], count: number, cpuNames: string[]): SeatConfig[] {
  const n = Math.min(MAX_PLAYERS, Math.max(count, minCount(members)));
  const seats: SeatConfig[] = members.map((m) => ({ name: m.name, isHuman: true, owner: m.clientId }));
  const used = new Set(seats.map((s) => s.name));
  for (const base of cpuNames) {
    if (seats.length >= n) break;
    if (used.has(base)) continue;
    used.add(base);
    seats.push({ name: base, isHuman: false });
  }
  for (let i = 1; seats.length < n; i++) {
    const name = uniqueName(`CPU${i}`, [...used]);
    used.add(name);
    seats.push({ name, isHuman: false });
  }
  return seats;
}

/** この端末が、この操作をしてよいか（自分の席の操作か） */
export function canControl(state: GameState, clientId: string, action: Action): boolean {
  const p = state.players[action.playerId];
  return !!p && p.isHuman && p.owner === clientId;
}

/** その端末の席（なければ undefined） */
export function seatOf(state: GameState, clientId: string): number | undefined {
  return state.players.find((p) => p.owner === clientId)?.id;
}

/** 通信が切れている人の席 */
export function offlineSeats(state: GameState, members: Member[]): number[] {
  const off = new Set(members.filter((m) => !m.connected).map((m) => m.clientId));
  return state.players.filter((p) => p.owner !== undefined && off.has(p.owner)).map((p) => p.id);
}
