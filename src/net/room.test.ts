import { afterEach, describe, expect, it, vi } from 'vitest';
import { isValidAction } from '../game/engine';
import { createGame } from '../game/state';
import type { Action, GameState } from '../game/types';
import { HOST_ID, seatOf, seatsFor } from './lobby';
import { GuestRoom, type GuestHandlers, HostRoom } from './room';
import { type HostEndpoint, type Link, NetError, type Network, makeLink } from './transport';

type Ends = ReturnType<typeof makeLink>;

/** メモリの中だけでつなぐ通信（メッセージは JSON を通して、少しあとに届く） */
function memoryNetwork() {
  const rooms = new Map<string, HostEndpoint>();
  const pairs: { host: Link; guest: Link }[] = [];
  const net: Network = {
    async host(code) {
      if (rooms.has(code)) throw new NetError('taken', 'taken');
      const ep: HostEndpoint = { onLink: () => {}, close: () => rooms.delete(code) };
      rooms.set(code, ep);
      return ep;
    },
    async join(code) {
      const ep = rooms.get(code);
      if (!ep) throw new NetError('notFound', 'notFound');
      const deliver = (to: () => Ends) => (m: unknown) => {
        const copy = JSON.parse(JSON.stringify(m));
        queueMicrotask(() => to().receive(copy));
      };
      const h: Ends = makeLink(
        deliver(() => g),
        () => queueMicrotask(() => g.remoteClosed()),
      );
      const g: Ends = makeLink(
        deliver(() => h),
        () => queueMicrotask(() => h.remoteClosed()),
      );
      pairs.push({ host: h.link, guest: g.link });
      ep.onLink(h.link);
      return g.link;
    },
  };
  return { net, rooms, pairs };
}

function handlers(): GuestHandlers & { states: GameState[]; log: string[] } {
  const states: GameState[] = [];
  const log: string[] = [];
  return {
    states,
    log,
    onRoom: (m, c) => log.push('room:' + m.map((x) => x.name).join(',') + ':' + c),
    onState: (s) => states.push(s),
    onPresence: (o) => log.push('presence:' + o.join(',')),
    onPick: () => log.push('pick'),
    onReject: (r) => log.push('reject:' + r),
    onClosed: () => log.push('closed'),
    onLost: () => log.push('lost'),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

afterEach(() => {
  vi.useRealTimers();
});

describe('オンラインの部屋', () => {
  it('部屋を作り、友達が入ると全員に参加者が届く。始めると状態が届く', async () => {
    const { net } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.1234, isValidAction);
    expect(room.code).toBe('1234');
    const ha = handlers();
    const a = await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await flush();
    expect(room.members.map((m) => m.name)).toEqual(['ホスト', 'アキ']);
    expect(ha.log).toContain('room:ホスト,アキ:4');

    room.setCount(3);
    const s = createGame({ seats: seatsFor(room.members, room.count, ['ハル']) }, () => 0.5);
    room.start(s);
    await flush();
    expect(ha.states).toHaveLength(1);
    expect(seatOf(ha.states[0], 'ca')).toBeDefined();
    a.leave();
    room.close();
  });

  it('友達の操作は、自分の席でルール上できるものだけホストに届く', async () => {
    const { net } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.5, isValidAction);
    const got: Action[] = [];
    room.onAction = (a) => got.push(a);
    const ha = handlers();
    const a = await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await flush();
    const s = createGame({ seats: seatsFor(room.members, 2, []) }, () => 0.5);
    const mine = seatOf(s, 'ca')!;
    const host = seatOf(s, HOST_ID)!;
    s.current = mine;
    room.start(s);
    await flush();

    a.sendAction({ type: 'CHOOSE_DICE', playerId: host, count: 1 }); // 人の席
    a.sendAction({ type: 'KEEP', playerId: mine }); // 今はできない操作
    a.sendAction({ type: 'CHOOSE_DICE', playerId: mine, count: 1 }); // OK
    await flush();
    await flush();
    expect(got).toEqual([{ type: 'CHOOSE_DICE', playerId: mine, count: 1 }]);
    // できない操作のあとは、今の状態が送り直される（最初の1回 + 2回）
    expect(ha.states).toHaveLength(3);
    room.close();
  });

  it('始まってから新しい人は断られる。通信が切れた人は同じ端末 ID で席に戻れる', async () => {
    const { net, pairs } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.5, isValidAction);
    const ha = handlers();
    await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await flush();
    const s = createGame({ seats: seatsFor(room.members, 2, []) }, () => 0.5);
    room.start(s);
    await flush();

    const hb = handlers();
    await GuestRoom.join(net, room.code, 'cb', 'ベン', hb);
    await flush();
    await flush();
    expect(hb.log).toContain('reject:このゲームはもう始まっています');

    // アキの通信が切れる
    pairs[0].guest.close();
    await flush();
    expect(room.offline()).toEqual([seatOf(s, 'ca')]);

    const ha2 = handlers();
    await GuestRoom.join(net, room.code, 'ca', 'アキ', ha2);
    await flush();
    expect(room.offline()).toEqual([]);
    expect(ha2.states).toHaveLength(1); // 今の状態がすぐ届く
    room.close();
  });

  it('ホストが部屋を閉じたら友達に知らせる（「通信切れ」ではなく）', async () => {
    const { net } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.5, isValidAction);
    const ha = handlers();
    await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await flush();
    room.close();
    await flush();
    await flush();
    expect(ha.log).toContain('closed');
    expect(ha.log).not.toContain('lost');
  });

  it('つながりが切れたら友達に「通信切れ」を知らせる', async () => {
    const { net, pairs } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.5, isValidAction);
    const ha = handlers();
    await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await flush();
    pairs[0].host.close();
    await flush();
    expect(ha.log).toContain('lost');
    room.close();
  });

  it('コードがかぶったら別のコードで開き直す', async () => {
    const { net } = memoryNetwork();
    const seq = [0.1111, 0.1111, 0.2222];
    let i = 0;
    const rng = () => seq[i++];
    const r1 = await HostRoom.open(net, 'A', rng, isValidAction);
    const r2 = await HostRoom.open(net, 'B', rng, isValidAction);
    expect([r1.code, r2.code]).toEqual(['1111', '2222']);
    r1.close();
    r2.close();
  });

  it('しばらく返事がない友達は「通信切れ」にする', async () => {
    vi.useFakeTimers();
    const { net, pairs } = memoryNetwork();
    const room = await HostRoom.open(net, 'ホスト', () => 0.5, isValidAction);
    const ha = handlers();
    await GuestRoom.join(net, room.code, 'ca', 'アキ', ha);
    await vi.advanceTimersByTimeAsync(10);
    room.start(createGame({ seats: seatsFor(room.members, 2, []) }, () => 0.5));
    // 友達の端末が眠った：届いたものに返事をしない
    pairs[0].guest.setHandlers(
      () => {},
      () => {},
    );
    await vi.advanceTimersByTimeAsync(20000);
    expect(room.offline()).toHaveLength(1);
    room.close();
  });
});
