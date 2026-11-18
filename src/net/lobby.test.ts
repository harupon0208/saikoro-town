import { describe, expect, it } from 'vitest';
import { createGame } from '../game/state';
import {
  HOST_ID,
  type Member,
  canControl,
  isRoomCode,
  join,
  leave,
  makeRoomCode,
  offlineSeats,
  seatOf,
  seatsFor,
  uniqueName,
} from './lobby';

const host: Member = { clientId: HOST_ID, name: 'ホスト', connected: true };

describe('部屋コード', () => {
  it('4桁の数字（先頭が0でも4桁）', () => {
    expect(makeRoomCode(() => 0)).toBe('0000');
    expect(makeRoomCode(() => 0.0421)).toBe('0421');
    expect(makeRoomCode(() => 0.99999)).toBe('9999');
    expect(isRoomCode('0421')).toBe(true);
    expect(isRoomCode('421')).toBe(false);
    expect(isRoomCode('12a4')).toBe(false);
  });
});

describe('参加', () => {
  it('名前がかぶったら番号をつける。空なら「ゲスト」', () => {
    expect(uniqueName('ハル', ['ハル'])).toBe('ハル2');
    expect(uniqueName('ハル', ['ハル', 'ハル2'])).toBe('ハル3');
    expect(uniqueName('  ', [])).toBe('ゲスト');
  });

  it('4人まで。満員なら断る', () => {
    let members = [host];
    for (const id of ['a', 'b', 'c']) {
      const r = join(members, id, id, false);
      if (!r.ok) throw new Error(r.reason);
      members = r.members;
    }
    expect(members).toHaveLength(4);
    expect(join(members, 'd', 'd', false)).toEqual({ ok: false, reason: 'この部屋は満員です' });
  });

  it('始まったあとは新しい人は入れないが、同じ端末なら席に戻れる', () => {
    const r1 = join([host], 'a', 'アキ', false);
    if (!r1.ok) throw new Error();
    const off = leave(r1.members, 'a', true);
    expect(off[1].connected).toBe(false);
    expect(join(off, 'b', 'ベン', true).ok).toBe(false);
    const back = join(off, 'a', 'ちがう名前', true);
    expect(back.ok && back.rejoined && back.member).toEqual({ clientId: 'a', name: 'アキ', connected: true });
  });

  it('始まる前に抜けた人は一覧から消える。ホストのふりはできない', () => {
    const r = join([host], 'a', 'アキ', false);
    if (!r.ok) throw new Error();
    expect(leave(r.members, 'a', false)).toEqual([host]);
    expect(join([], HOST_ID, 'x', false).ok).toBe(false);
  });
});

describe('席', () => {
  it('参加者のあとを CPU で埋める（名前がかぶる CPU は飛ばす）', () => {
    const members: Member[] = [host, { clientId: 'a', name: 'ハル', connected: true }];
    const seats = seatsFor(members, 4, ['ハル', 'ミナト', 'ソラ']);
    expect(seats).toEqual([
      { name: 'ホスト', isHuman: true, owner: HOST_ID },
      { name: 'ハル', isHuman: true, owner: 'a' },
      { name: 'ミナト', isHuman: false },
      { name: 'ソラ', isHuman: false },
    ]);
  });

  it('自分の席の操作だけできる。切れている人の席がわかる', () => {
    const members: Member[] = [host, { clientId: 'a', name: 'アキ', connected: false }];
    const s = createGame({ seats: seatsFor(members, 3, ['ハル']) }, () => 0.3);
    const mine = seatOf(s, 'a')!;
    const hostSeat = seatOf(s, HOST_ID)!;
    const cpu = s.players.find((p) => !p.isHuman)!.id;
    expect(s.players[mine].name).toBe('アキ');
    expect(canControl(s, 'a', { type: 'KEEP', playerId: mine })).toBe(true);
    expect(canControl(s, 'a', { type: 'KEEP', playerId: hostSeat })).toBe(false);
    expect(canControl(s, 'a', { type: 'KEEP', playerId: cpu })).toBe(false);
    expect(canControl(s, 'a', { type: 'KEEP', playerId: 9 })).toBe(false);
    expect(offlineSeats(s, members)).toEqual([mine]);
  });
});
