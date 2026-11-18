// 端末どうしをつなぐ部分。本番は PeerJS（WebRTC）。開発サーバーで ?net=local を付けると、
// 同じブラウザのタブどうしを BroadcastChannel でつなぐ（自動テスト用。本番ビルドには入らない）

/** 1本のつながり。届いたメッセージは onMessage を設定するまで溜めておく */
export interface Link {
  send(msg: unknown): void;
  close(): void;
  setHandlers(onMessage: (msg: unknown) => void, onClose: () => void): void;
}

export interface HostEndpoint {
  /** 新しい友達がつながったとき */
  onLink: (link: Link) => void;
  close(): void;
}

export class NetError extends Error {
  constructor(
    public readonly kind: 'taken' | 'notFound' | 'network',
    message: string,
  ) {
    super(message);
  }
}

export interface Network {
  /** 部屋を開く。コードが使われていたら NetError('taken') */
  host(code: string): Promise<HostEndpoint>;
  /** 部屋に入る */
  join(code: string): Promise<Link>;
}

/** Link の実装を楽にする：受け取りを溜めておき、閉じたら一度だけ知らせる */
export function makeLink(send: (msg: unknown) => void, close: () => void) {
  let onMessage: ((m: unknown) => void) | null = null;
  let onClose: (() => void) | null = null;
  const queue: unknown[] = [];
  let closed = false;
  let closeNotified = false;
  const notifyClose = () => {
    if (closeNotified) return;
    closeNotified = true;
    onClose?.();
  };
  const link: Link = {
    send: (m) => {
      if (!closed) send(m);
    },
    close: () => {
      if (closed) return;
      closed = true;
      close();
      notifyClose();
    },
    setHandlers: (m, c) => {
      onMessage = m;
      onClose = c;
      for (const q of queue.splice(0)) m(q);
      if (closed) {
        closeNotified = false;
        notifyClose();
      }
    },
  };
  return {
    link,
    receive: (m: unknown) => {
      if (closed) return;
      if (onMessage) onMessage(m);
      else queue.push(m);
    },
    /** 相手側から閉じられた */
    remoteClosed: () => {
      if (closed) return;
      closed = true;
      if (onClose) notifyClose();
    },
  };
}

const TIMEOUT_MS = 15000;

function withTimeout<T>(p: Promise<T>, ms: number, err: () => Error): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(err()), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

// ---------------------------------------------------------------------------
// PeerJS（本番）

const PEER_PREFIX = 'saikorotown-v1-';
const NETWORK_MSG = '通信サーバーにつながりませんでした。電波のよい所でもう一度試してください';

type PeerModule = typeof import('peerjs');
type DataConnection = import('peerjs').DataConnection;

function wrapConn(conn: DataConnection, onClosed?: () => void): Link {
  const l = makeLink(
    (m) => conn.send(m),
    () => {
      conn.close();
      onClosed?.();
    },
  );
  conn.on('data', l.receive);
  conn.on('close', () => {
    l.remoteClosed();
    onClosed?.();
  });
  conn.on('error', () => l.remoteClosed());
  conn.on('iceStateChanged', (s) => {
    if (s === 'failed' || s === 'closed') l.remoteClosed();
  });
  return l.link;
}

export const peerNetwork: Network = {
  async host(code) {
    const { Peer } = (await import('peerjs')) as PeerModule;
    const peer = new Peer(PEER_PREFIX + code, { debug: 0 });
    const ep: HostEndpoint = {
      onLink: () => {},
      close: () => peer.destroy(),
    };
    await withTimeout(
      new Promise<void>((resolve, reject) => {
        peer.on('open', () => resolve());
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id') reject(new NetError('taken', 'この部屋コードは使われています'));
          else reject(new NetError('network', NETWORK_MSG));
        });
      }),
      TIMEOUT_MS,
      () => new NetError('network', NETWORK_MSG),
    ).catch((e) => {
      peer.destroy();
      throw e;
    });
    // 仲介サーバーとの接続が切れても、つながっている友達とは話せる。新しい人が入れるよう、つなぎ直す
    peer.on('disconnected', () => {
      if (!peer.destroyed) peer.reconnect();
    });
    peer.on('connection', (conn) => {
      conn.on('open', () => ep.onLink(wrapConn(conn)));
    });
    return ep;
  },

  async join(code) {
    const { Peer } = (await import('peerjs')) as PeerModule;
    const peer = new Peer({ debug: 0 });
    try {
      return await withTimeout(
        new Promise<Link>((resolve, reject) => {
          peer.on('error', (e) => {
            if (e.type === 'peer-unavailable')
              reject(new NetError('notFound', `部屋 ${code} が見つかりません。番号を確かめてください`));
            else reject(new NetError('network', NETWORK_MSG));
          });
          peer.on('open', () => {
            const conn = peer.connect(PEER_PREFIX + code, { reliable: true, serialization: 'json' });
            conn.on('open', () => resolve(wrapConn(conn, () => peer.destroy())));
          });
        }),
        TIMEOUT_MS,
        () => new NetError('network', NETWORK_MSG),
      );
    } catch (e) {
      peer.destroy();
      throw e;
    }
  },
};

// ---------------------------------------------------------------------------
// BroadcastChannel（開発・自動テスト用）

type LocalMsg =
  | { kind: 'probe'; room: string; from: string }
  | { kind: 'taken'; room: string; to: string }
  | { kind: 'connect'; room: string; from: string }
  | { kind: 'accept'; room: string; to: string }
  | { kind: 'data'; room: string; from: string; to: string; data: unknown }
  | { kind: 'close'; room: string; from: string; to: string };

const CHANNEL = 'saikoro-town:net';
const HOST_END = 'host';
const rid = () => crypto.randomUUID();

export const localNetwork: Network = {
  async host(code) {
    const ch = new BroadcastChannel(CHANNEL);
    const me = rid();
    // 同じコードの部屋がないか確かめる
    const taken = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 150);
      ch.onmessage = (e: MessageEvent<LocalMsg>) => {
        if (e.data.kind === 'taken' && e.data.room === code && e.data.to === me) {
          clearTimeout(t);
          resolve(true);
        }
      };
      ch.postMessage({ kind: 'probe', room: code, from: me } satisfies LocalMsg);
    });
    if (taken) {
      ch.close();
      throw new NetError('taken', 'この部屋コードは使われています');
    }
    const links = new Map<string, ReturnType<typeof makeLink>>();
    const ep: HostEndpoint = {
      onLink: () => {},
      close: () => {
        for (const l of links.values()) l.link.close();
        ch.close();
      },
    };
    const post = (m: LocalMsg) => ch.postMessage(m);
    ch.onmessage = (e: MessageEvent<LocalMsg>) => {
      const m = e.data;
      if (m.room !== code) return;
      if (m.kind === 'probe') post({ kind: 'taken', room: code, to: m.from });
      else if (m.kind === 'connect') {
        const guest = m.from;
        const l = makeLink(
          (data) => post({ kind: 'data', room: code, from: HOST_END, to: guest, data }),
          () => {
            links.delete(guest);
            post({ kind: 'close', room: code, from: HOST_END, to: guest });
          },
        );
        links.set(guest, l);
        post({ kind: 'accept', room: code, to: guest });
        ep.onLink(l.link);
      } else if (m.kind === 'data' && m.to === HOST_END) links.get(m.from)?.receive(m.data);
      else if (m.kind === 'close' && m.to === HOST_END) {
        links.get(m.from)?.remoteClosed();
        links.delete(m.from);
      }
    };
    return ep;
  },

  async join(code) {
    const ch = new BroadcastChannel(CHANNEL);
    const me = rid();
    const post = (m: LocalMsg) => ch.postMessage(m);
    const l = makeLink(
      (data) => post({ kind: 'data', room: code, from: me, to: HOST_END, data }),
      () => {
        post({ kind: 'close', room: code, from: me, to: HOST_END });
        ch.close();
      },
    );
    const ok = await new Promise<boolean>((resolve) => {
      const t = setTimeout(() => resolve(false), 1000);
      ch.onmessage = (e: MessageEvent<LocalMsg>) => {
        const m = e.data;
        if (m.room !== code) return;
        if (m.kind === 'accept' && m.to === me) {
          clearTimeout(t);
          resolve(true);
        } else if (m.kind === 'data' && m.to === me) l.receive(m.data);
        else if (m.kind === 'close' && m.to === me) {
          l.remoteClosed();
          ch.close();
        }
      };
      post({ kind: 'connect', room: code, from: me });
    });
    if (!ok) {
      ch.close();
      throw new NetError('notFound', `部屋 ${code} が見つかりません。番号を確かめてください`);
    }
    return l.link;
  },
};

/** 使う通信方式。開発サーバーで ?net=local のときだけ BroadcastChannel */
export function defaultNetwork(): Network {
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('net') === 'local') return localNetwork;
  return peerNetwork;
}
