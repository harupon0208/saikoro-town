// 部屋の進行役。ホスト側（HostRoom）と友達側（GuestRoom）。React には依存しない
import type { Action, GameEvent, GameState, Rng } from '../game/types';
import {
  HOST_ID,
  MAX_PLAYERS,
  type Member,
  canControl,
  join,
  leave,
  makeRoomCode,
  minCount,
  offlineSeats,
  uniqueName,
} from './lobby';
import { type Pick, type RoomMember, type ToGuest, parseToGuest, parseToHost } from './protocol';
import { type HostEndpoint, type Link, NetError, type Network } from './transport';

/** 生きているか確かめる間隔と、返事がないとみなすまでの時間 */
const PING_MS = 4000;
const DEAD_MS = 15000;

interface GuestConn {
  link: Link;
  lastSeen: number;
}

export class HostRoom {
  members: Member[];
  count = 4;
  started = false;
  private game: GameState | null = null;
  private conns = new Map<string, GuestConn>();
  private timer: ReturnType<typeof setInterval>;

  /** 部屋の様子が変わった（参加・退出・通信切れ） */
  onChange: () => void = () => {};
  /** 友達が操作した（自分の席で、ルール上できる操作だけ届く） */
  onAction: (action: Action) => void = () => {};

  private constructor(
    private readonly ep: HostEndpoint,
    readonly code: string,
    hostName: string,
    private readonly isValid: (s: GameState, a: Action) => boolean,
  ) {
    this.members = [{ clientId: HOST_ID, name: uniqueName(hostName, []), connected: true }];
    ep.onLink = (link) => this.accept(link);
    this.timer = setInterval(() => this.heartbeat(), PING_MS);
  }

  /** 部屋を開く。コードがかぶったら別のコードで数回やり直す */
  static async open(
    net: Network,
    hostName: string,
    rng: Rng,
    isValid: (s: GameState, a: Action) => boolean,
  ): Promise<HostRoom> {
    for (let i = 0; ; i++) {
      const code = makeRoomCode(rng);
      try {
        const ep = await net.host(code);
        return new HostRoom(ep, code, hostName, isValid);
      } catch (e) {
        if (!(e instanceof NetError && e.kind === 'taken') || i >= 5) throw e;
      }
    }
  }

  get hostName() {
    return this.members[0].name;
  }

  setHostName(name: string) {
    if (this.started) return;
    const others = this.members.slice(1).map((m) => m.name);
    this.members = [{ ...this.members[0], name: uniqueName(name, others) }, ...this.members.slice(1)];
    this.sendRoom();
    this.onChange();
  }

  setCount(n: number) {
    if (this.started) return;
    this.count = Math.min(MAX_PLAYERS, Math.max(minCount(this.members), n));
    this.sendRoom();
    this.onChange();
  }

  /** ゲーム開始（最初の状態を全員に配る） */
  start(state: GameState) {
    this.started = true;
    this.game = state;
    this.broadcast({ t: 'state', state, events: [], offline: this.offline() });
    this.onChange();
  }

  /** ホストで状態が進んだら全員に配る */
  publish(state: GameState, events: GameEvent[]) {
    this.game = state;
    this.broadcast({ t: 'state', state, events, offline: this.offline() });
  }

  sendPick(pick: Pick | null) {
    this.broadcast({ t: 'pick', pick });
  }

  offline(): number[] {
    return this.game ? offlineSeats(this.game, this.members) : [];
  }

  close() {
    clearInterval(this.timer);
    this.broadcast({ t: 'closed' });
    for (const c of this.conns.values()) c.link.close();
    this.conns.clear();
    this.ep.close();
  }

  // --- 内部 ---

  private accept(link: Link) {
    let clientId: string | null = null;
    const conn: GuestConn = { link, lastSeen: Date.now() };
    link.setHandlers(
      (raw) => {
        conn.lastSeen = Date.now();
        const msg = parseToHost(raw);
        if (!msg) return;
        if (msg.t === 'hello') {
          if (clientId) return;
          const r = join(this.members, msg.clientId, msg.name, this.started);
          if (!r.ok) {
            link.send({ t: 'reject', reason: r.reason } satisfies ToGuest);
            setTimeout(() => link.close(), 300);
            return;
          }
          clientId = msg.clientId;
          // 同じ端末の古いつながりは閉じる
          const old = this.conns.get(clientId);
          this.conns.set(clientId, conn);
          old?.link.close();
          this.members = r.members;
          if (!this.started) this.count = Math.max(this.count, minCount(this.members));
          if (this.game) {
            link.send({ t: 'state', state: this.game, events: [], offline: this.offline() } satisfies ToGuest);
            this.broadcast({ t: 'presence', offline: this.offline() });
          } else this.sendRoom();
          this.onChange();
        } else if (msg.t === 'action' && clientId) {
          const g = this.game;
          if (g && canControl(g, clientId, msg.action) && this.isValid(g, msg.action)) this.onAction(msg.action);
          // できない操作が届いたら（行き違いなど）、今の状態を送り直して合わせる
          else if (g) link.send({ t: 'state', state: g, events: [], offline: this.offline() } satisfies ToGuest);
        }
      },
      () => {
        if (!clientId || this.conns.get(clientId) !== conn) return;
        this.conns.delete(clientId);
        this.members = leave(this.members, clientId, this.started);
        if (!this.started) this.sendRoom();
        else this.broadcast({ t: 'presence', offline: this.offline() });
        this.onChange();
      },
    );
  }

  private heartbeat() {
    const now = Date.now();
    for (const c of [...this.conns.values()]) {
      if (now - c.lastSeen > DEAD_MS) c.link.close();
      else c.link.send({ t: 'ping' } satisfies ToGuest);
    }
  }

  private sendRoom() {
    const members: RoomMember[] = this.members.map((m) => ({ name: m.name, connected: m.connected }));
    this.broadcast({ t: 'room', code: this.code, members, count: this.count });
  }

  private broadcast(msg: ToGuest) {
    for (const c of this.conns.values()) c.link.send(msg);
  }
}

// ---------------------------------------------------------------------------

export type GuestStatus = 'lobby' | 'game' | 'lost' | 'closed';

export interface GuestHandlers {
  onRoom: (members: RoomMember[], count: number) => void;
  onState: (state: GameState, events: GameEvent[], offline: number[]) => void;
  onPresence: (offline: number[]) => void;
  onPick: (pick: Pick | null) => void;
  /** 断られた（満員・もう始まっている） */
  onReject: (reason: string) => void;
  /** ホストが部屋を閉じた */
  onClosed: () => void;
  /** ホストとの通信が切れた */
  onLost: () => void;
}

export class GuestRoom {
  private ended = false;
  private lastSeen = Date.now();
  private timer: ReturnType<typeof setInterval>;

  private constructor(
    private readonly link: Link,
    readonly code: string,
    private readonly h: GuestHandlers,
  ) {
    link.setHandlers(
      (raw) => this.receive(raw),
      () => this.end(() => h.onLost()),
    );
    this.timer = setInterval(() => {
      if (Date.now() - this.lastSeen > DEAD_MS) {
        this.link.close();
        this.end(() => h.onLost());
      }
    }, PING_MS);
  }

  static async join(
    net: Network,
    code: string,
    clientId: string,
    name: string,
    h: GuestHandlers,
  ): Promise<GuestRoom> {
    const link = await net.join(code);
    const room = new GuestRoom(link, code, h);
    link.send({ t: 'hello', clientId, name });
    return room;
  }

  sendAction(action: Action) {
    this.link.send({ t: 'action', action });
  }

  /** 自分から抜ける */
  leave() {
    this.ended = true;
    clearInterval(this.timer);
    this.link.close();
  }

  private end(notify: () => void) {
    if (this.ended) return;
    this.ended = true;
    clearInterval(this.timer);
    notify();
  }

  private receive(raw: unknown) {
    this.lastSeen = Date.now();
    const msg = parseToGuest(raw);
    if (!msg || this.ended) return;
    switch (msg.t) {
      case 'ping':
        this.link.send({ t: 'pong' });
        break;
      case 'room':
        this.h.onRoom(msg.members, msg.count);
        break;
      case 'state':
        this.h.onState(msg.state, msg.events, msg.offline);
        break;
      case 'presence':
        this.h.onPresence(msg.offline);
        break;
      case 'pick':
        this.h.onPick(msg.pick);
        break;
      case 'reject':
        this.end(() => this.h.onReject(msg.reason));
        this.link.close();
        break;
      case 'closed':
        this.end(() => this.h.onClosed());
        this.link.close();
        break;
    }
  }
}

/** この端末（タブ）の ID。再読み込みしても同じ（sessionStorage）なので、入り直すと同じ席に戻れる */
export function getClientId(): string {
  const KEY = 'saikoro-town:client';
  try {
    let id = sessionStorage.getItem(KEY);
    if (!id) {
      id = `c-${randomId()}`;
      sessionStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return `c-${randomId()}`;
  }
}

/** Math.random に頼らない乱数の ID（自動テストでは Math.random を固定するため） */
function randomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
