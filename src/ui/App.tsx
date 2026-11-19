import { useCallback, useEffect, useRef, useState } from 'react';
import { chooseCpuAction } from '../game/ai';
import { applyAction, isValidAction } from '../game/engine';
import { clearSave, getDefaultStorage, loadGame, saveGame } from '../game/save';
import { createGame } from '../game/state';
import type { Action, FacilityId, GameConfig, GameEvent, GameOptions, GameState, LandmarkId } from '../game/types';
import { HOST_ID, isRoomCode, seatOf, seatsFor } from '../net/lobby';
import type { RoomMember } from '../net/protocol';
import { GuestRoom, type GuestHandlers, HostRoom, getClientId } from '../net/room';
import { defaultNetwork } from '../net/transport';
import { type Step, accumulateRollEvents, buildSteps, viewAt } from './anim/timeline';
import { GameScreen } from './GameScreen';
import { type ConnIssue, ConnectionOverlay, GuestLobby, HostLobby, JoinForm } from './Online';
import { type Settings, cpuDelayMs, cpuPickMs, effectiveSpeed, loadSettings, saveSettings } from './settings';
import { CPU_NAMES, StartScreen } from './StartScreen';
import { LAND_AT } from './components/Die';
import { cuesForEvents, cuesForStep } from './sound/cues';
import { installUnlock, playCues, playSound, setSound } from './sound/synth';
import { useMediaQuery } from './useMediaQuery';

const storage = getDefaultStorage();
const rng = Math.random;
const network = defaultNetwork();
const clientId = getClientId();
const NAME_KEY = 'saikoro-town:name';

/** 開発中の自動テスト用：?cpuDelay=0 で CPU の間を変えられる（本番ビルドでは無効） */
const DEV_CPU_DELAY = (() => {
  if (!import.meta.env.DEV) return null;
  const v = new URLSearchParams(location.search).get('cpuDelay');
  return v === null ? null : Number(v);
})();

/** 招待リンク（?room=1234）で開いたときの部屋コード */
const INVITED_CODE = (() => {
  const v = new URLSearchParams(location.search).get('room');
  return v && isRoomCode(v) ? v : null;
})();

/** 友達側：通信が切れたとき、自動でつなぎ直し続ける時間 */
const RECONNECT_FOR_MS = 120_000;

/** CPU が建てようとしているカード（建てる前に指し示す） */
export interface CpuPick {
  playerId: number;
  id: FacilityId | LandmarkId;
}

interface Playback {
  from: GameState;
  to: GameState;
  steps: Step[];
  index: number;
  /** コマごとに変わる番号（ポップアップなどの key 用） */
  serial: number;
}

type Screen =
  | { kind: 'start' }
  | { kind: 'game' }
  | { kind: 'hostLobby'; error: string | null }
  | { kind: 'join'; code: string; busy: boolean; error: string | null }
  | { kind: 'guestLobby'; members: RoomMember[]; count: number; options: GameOptions | null };

type Online =
  | { role: 'host'; room: HostRoom }
  | { role: 'guest'; room: GuestRoom | null; code: string; name: string };

function loadName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? '';
  } catch {
    return '';
  }
}
function storeName(name: string) {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // 何もしない
  }
}

export function App() {
  const [saved, setSaved] = useState<GameState | null>(() => loadGame(storage));
  const [screen, setScreen] = useState<Screen>(() =>
    INVITED_CODE ? { kind: 'join', code: INVITED_CODE, busy: false, error: null } : { kind: 'start' },
  );
  /** 画面に出している状態（再生が終わったところ） */
  const [shown, setShownState] = useState<GameState | null>(null);
  const [rollEvents, setRollEvents] = useState<GameEvent[]>([]);
  const [playback, setPlaybackState] = useState<Playback | null>(null);
  const [cpuPick, setCpuPick] = useState<CpuPick | null>(null);
  const [settings, setSettingsState] = useState<Settings>(() => loadSettings(storage));
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const speed = effectiveSpeed(settings.speed, reducedMotion);

  // --- オンライン ---
  const [online, setOnlineState] = useState<Online | null>(null);
  const [offline, setOffline] = useState<number[]>([]);
  const [connIssue, setConnIssue] = useState<ConnIssue | null>(null);
  const connIssueRef = useRef(connIssue);
  connIssueRef.current = connIssue;
  const [name, setName] = useState(loadName);
  const [, setRoomTick] = useState(0);
  const onlineRef = useRef<Online | null>(null);
  const setOnline = (o: Online | null) => {
    onlineRef.current = o;
    setOnlineState(o);
  };

  // コールバックの中から最新の値を読むための ref
  /** 正しい最新の状態（ホスト・1台で遊ぶとき：applyAction の結果。友達：ホストから届いた状態） */
  const authRef = useRef<GameState | null>(null);
  const shownRef = useRef<GameState | null>(null);
  const playbackRef = useRef<Playback | null>(null);
  /** 再生待ちの状態（再生中に次の状態が届いたとき） */
  const queueRef = useRef<{ to: GameState; events: GameEvent[] }[]>([]);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const serialRef = useRef(0);
  /** オンラインでの自分の席 */
  const mineRef = useRef<number | undefined>(undefined);
  /** 友達側：操作を送って、返事（新しい状態）を待っている */
  const sentRef = useRef(false);

  const show = (s: GameState | null) => {
    shownRef.current = s;
    setShownState(s);
  };
  const setPlayback = (p: Playback | null) => {
    playbackRef.current = p;
    setPlaybackState(p);
  };

  /** 1つの変化を見せ始める。アニメーションが始まったら true */
  const startPresent = (to: GameState, events: GameEvent[]): boolean => {
    const from = shownRef.current;
    show(to);
    const steps = from ? buildSteps(events, speedRef.current) : [];
    if (steps.length === 0) {
      if (events.length > 0) playCues(cuesForEvents(events, to, mineRef.current));
      setRollEvents((prev) => accumulateRollEvents(prev, events));
      return false;
    }
    setPlayback({ from: from!, to, steps, index: 0, serial: ++serialRef.current });
    setRollEvents((prev) => accumulateRollEvents(prev, steps[0].events));
    return true;
  };
  const drain = () => {
    while (queueRef.current.length > 0) {
      const next = queueRef.current.shift()!;
      if (startPresent(next.to, next.events)) return;
    }
  };
  /** 変化を見せる（再生中なら、終わってから順に） */
  const present = (to: GameState, events: GameEvent[]) => {
    queueRef.current.push({ to, events });
    if (!playbackRef.current) drain();
  };

  /** 新しいゲームを画面に出す */
  const begin = (s: GameState) => {
    setPlayback(null);
    queueRef.current = [];
    setRollEvents([]);
    setCpuPick(null);
    authRef.current = s;
    show(s);
    setScreen({ kind: 'game' });
  };

  /** 操作を適用する（1台で遊ぶとき・ホスト） */
  const apply = (action: Action) => {
    const cur = authRef.current!;
    const { state: next, events } = applyAction(cur, action, rng);
    authRef.current = next;
    const o = onlineRef.current;
    if (o?.role === 'host') o.room.publish(next, events);
    else if (!o) {
      // 状態はすぐ確定して保存する（再生中に閉じても保存は正しい）
      if (next.phase === 'gameOver') clearSave(storage);
      else saveGame(storage, next);
    }
    present(next, events);
  };

  const dispatch = useCallback((action: Action) => {
    const cur = authRef.current;
    // 再生中は操作を受け付けない
    if (!cur || playbackRef.current || !isValidAction(cur, action)) return;
    const o = onlineRef.current;
    if (o?.role === 'guest') {
      if (sentRef.current || !o.room) return;
      sentRef.current = true;
      o.room.sendAction(action);
      return;
    }
    apply(action);
  }, []);

  /** 次のコマへ（画面タップで飛ばすときも使う） */
  const advance = useCallback(() => {
    const p = playbackRef.current;
    if (!p) return;
    const index = p.index + 1;
    if (index >= p.steps.length) {
      setPlayback(null);
      drain();
    } else {
      setPlayback({ ...p, index, serial: ++serialRef.current });
      setRollEvents((prev) => accumulateRollEvents(prev, p.steps[index].events));
    }
  }, []);

  useEffect(() => {
    if (!playback) return;
    const t = setTimeout(advance, playback.steps[playback.index].ms);
    return () => clearTimeout(t);
  }, [playback, advance]);

  // --- 効果音 ---
  // 最初のタップで音を使えるようにする／設定を反映する
  useEffect(() => installUnlock(), []);
  useEffect(() => setSound(settings.sound, settings.volume), [settings.sound, settings.volume]);
  // コマが始まったら、そのコマの音を予約する（自然に次のコマへ進むときは余韻を切らない）
  const stopSounds = useRef<() => void>(() => {});
  const serial = playback?.serial;
  useEffect(() => {
    const p = playbackRef.current;
    if (!p) return;
    stopSounds.current = playCues(cuesForStep(p.steps[p.index], p.to, LAND_AT, mineRef.current));
  }, [serial]);
  // 演出を飛ばしたら、まだ鳴っていない音も止める
  const skip = useCallback(() => {
    stopSounds.current();
    advance();
  }, [advance]);
  // ボタンを押したときの小さな音
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if ((e.target as Element | null)?.closest?.('button:not(:disabled)')) playSound('click');
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);
  useEffect(() => {
    if (cpuPick) playSound('pick');
    // ホストは、CPU が指し示しているカードを友達にも見せる
    const o = onlineRef.current;
    if (o?.role === 'host') o.room.sendPick(cpuPick);
  }, [cpuPick]);

  // CPU の手番は、再生が終わってから少し間を置いて進める（保存から再開したときも途中から続く）
  // 建てるカードを決めたら、少しのあいだ市場のそのカードを指し示してから建てる。
  // オンラインでは CPU を動かすのはホストだけ
  const guest = online?.role === 'guest';
  useEffect(() => {
    const cpuTurn = (s: GameState | null) =>
      !!s && s.phase !== 'gameOver' && !s.players[s.current].isHuman;
    if (guest || playback || !cpuTurn(authRef.current)) return;
    let t2: ReturnType<typeof setTimeout> | undefined;
    const t = setTimeout(() => {
      const cur = authRef.current;
      if (playbackRef.current || !cpuTurn(cur)) return;
      const action = chooseCpuAction(cur!);
      const pickMs = cpuPickMs(speed);
      if (action.type === 'BUILD' && action.id && pickMs > 0 && DEV_CPU_DELAY === null) {
        setCpuPick({ playerId: action.playerId, id: action.id });
        t2 = setTimeout(() => {
          setCpuPick(null);
          dispatch(action);
        }, pickMs);
      } else {
        dispatch(action);
      }
    }, DEV_CPU_DELAY ?? cpuDelayMs(speed));
    return () => {
      clearTimeout(t);
      clearTimeout(t2);
      setCpuPick(null);
    };
  }, [shown, playback, speed, dispatch, guest]);

  const changeSettings = (s: Settings) => {
    setSettingsState(s);
    saveSettings(storage, s);
  };

  const startNew = (config: GameConfig) => {
    clearSave(storage);
    const s = createGame(config, rng);
    saveGame(storage, s);
    setSaved(null);
    begin(s);
  };

  const toTitle = () => {
    stopSounds.current();
    setPlayback(null);
    queueRef.current = [];
    authRef.current = null;
    mineRef.current = undefined;
    show(null);
    setCpuPick(null);
    setOffline([]);
    setConnIssue(null);
    setSaved(loadGame(storage));
    setScreen({ kind: 'start' });
  };

  /** オンラインの部屋から抜けて、タイトルへ */
  const leaveOnline = () => {
    roomToken.current++;
    const o = onlineRef.current;
    if (o?.role === 'host') o.room.close();
    if (o?.role === 'guest') o.room?.leave();
    setOnline(null);
    toTitle();
  };

  // ページを閉じたら部屋も閉じる（友達に知らせる）
  useEffect(() => {
    const onHide = (e: PageTransitionEvent) => {
      if (e.persisted) return;
      const o = onlineRef.current;
      if (o?.role === 'host') o.room.close();
      if (o?.role === 'guest') o.room?.leave();
    };
    window.addEventListener('pagehide', onHide);
    return () => window.removeEventListener('pagehide', onHide);
  }, []);

  // 画面に戻ってきたら：待ち時間を数え直してすぐ確認する。友達側で切れたままなら、つなぎ直す
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const o = onlineRef.current;
      if (o?.role === 'host') o.room.wake();
      if (o?.role === 'guest') {
        if (o.room) o.room.wake();
        else if (connIssueRef.current?.kind === 'lost') void reconnectRef.current(o.code);
      }
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('pageshow', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('pageshow', onVisible);
    };
  }, []);

  // 招待リンクの ?room= は、読んだら URL から消す（戻ったときに何度も開かないように）
  useEffect(() => {
    if (!INVITED_CODE) return;
    const url = new URL(location.href);
    url.searchParams.delete('room');
    history.replaceState(null, '', url);
  }, []);

  // --- ホスト ---
  /** 部屋を用意している途中で「やめる」を押したら、できあがった部屋は閉じる */
  const roomToken = useRef(0);
  const createRoom = async () => {
    const token = ++roomToken.current;
    setScreen({ kind: 'hostLobby', error: null });
    try {
      const room = await HostRoom.open(network, name.trim() || 'ホスト', rng, isValidAction);
      if (token !== roomToken.current) {
        room.close();
        return;
      }
      room.onChange = () => {
        setRoomTick((t) => t + 1);
        setOffline(room.offline());
      };
      room.onAction = (action) => {
        const cur = authRef.current;
        if (cur && isValidAction(cur, action)) apply(action);
      };
      setOnline({ role: 'host', room });
    } catch (e) {
      if (token !== roomToken.current) return;
      setScreen({ kind: 'hostLobby', error: e instanceof Error ? e.message : String(e) });
    }
  };

  const startOnline = () => {
    const o = onlineRef.current;
    if (o?.role !== 'host') return;
    const opts = o.room.options;
    const s = createGame(
      {
        seats: seatsFor(o.room.members, o.room.count, CPU_NAMES),
        ...(opts.expansions.length > 0 ? { options: opts } : {}),
      },
      rng,
    );
    mineRef.current = seatOf(s, HOST_ID);
    o.room.start(s);
    begin(s);
  };

  // --- 友達 ---
  const guestHandlers = (code: string): GuestHandlers => ({
    onRoom: (members, count, options) => setScreen({ kind: 'guestLobby', members, count, options }),
    onState: (state, events, off) => {
      setOffline(off);
      setCpuPick(null);
      sentRef.current = false;
      const first = authRef.current === null;
      authRef.current = state;
      mineRef.current = seatOf(state, clientId);
      if (first) begin(state);
      else present(state, events);
    },
    onPresence: setOffline,
    onPick: (pick) => {
      if (!playbackRef.current) setCpuPick(pick);
    },
    onReject: (reason) => {
      setOnline(null);
      authRef.current = null;
      show(null);
      setScreen({ kind: 'join', code, busy: false, error: reason });
    },
    onClosed: () => {
      if (onlineRef.current?.role === 'guest') onlineRef.current.room = null;
      setConnIssue({ kind: 'closed' });
    },
    onLost: () => {
      if (onlineRef.current?.role === 'guest') onlineRef.current.room = null;
      void reconnect(code);
    },
  });

  const joinRoom = async (code: string, guestName: string) => {
    storeName(guestName);
    setName(guestName);
    setScreen({ kind: 'join', code, busy: true, error: null });
    try {
      const room = await GuestRoom.join(network, code, clientId, guestName, guestHandlers(code));
      setOnline({ role: 'guest', room, code, name: guestName });
      setScreen((s) => (s.kind === 'join' ? { kind: 'guestLobby', members: [], count: 0, options: null } : s));
    } catch (e) {
      setScreen({ kind: 'join', code, busy: false, error: e instanceof Error ? e.message : String(e) });
    }
  };

  /**
   * 友達側：ホストとの通信が切れたら、つながるまで自動でつなぎ直す（2分まで。だめなら「もう一度つなぐ」）。
   * ホストのスマホが少し眠っていただけなら、起きたところでつながる
   */
  const reconnecting = useRef(false);
  const reconnect = async (code: string) => {
    if (reconnecting.current) return;
    reconnecting.current = true;
    setConnIssue({ kind: 'retrying' });
    const until = Date.now() + RECONNECT_FOR_MS;
    try {
      while (Date.now() < until) {
        const o = onlineRef.current;
        if (o?.role !== 'guest') return;
        try {
          const room = await GuestRoom.join(network, code, clientId, o.name, guestHandlers(code));
          if (onlineRef.current !== o) {
            room.leave();
            return;
          }
          o.room = room;
          sentRef.current = false;
          setConnIssue(null);
          return;
        } catch {
          await new Promise((r) => setTimeout(r, 2000));
        }
      }
      if (onlineRef.current?.role === 'guest') setConnIssue({ kind: 'lost' });
    } finally {
      reconnecting.current = false;
    }
  };
  const reconnectRef = useRef(reconnect);
  reconnectRef.current = reconnect;

  // ---------------------------------------------------------------------------

  const overlay = connIssue && online?.role === 'guest' && (
    <ConnectionOverlay issue={connIssue} onRetry={() => void reconnect(online.code)} onExit={leaveOnline} />
  );

  if (screen.kind === 'hostLobby') {
    const room = online?.role === 'host' ? online.room : null;
    return (
      <HostLobby
        code={room?.code ?? null}
        error={screen.error}
        members={room?.members ?? []}
        count={room?.count ?? 4}
        options={room?.options ?? { expansions: [], market: 'all' }}
        onOptions={(o) => room?.setOptions(o)}
        name={name}
        onName={(n) => {
          storeName(n);
          setName(n);
          room?.setHostName(n.trim() || 'ホスト');
        }}
        onCount={(n) => room?.setCount(n)}
        onStart={startOnline}
        onCancel={leaveOnline}
      />
    );
  }

  if (screen.kind === 'join') {
    return (
      <JoinForm
        key={screen.error ?? ''}
        initialCode={screen.code}
        name={name}
        busy={screen.busy}
        error={screen.error}
        onJoin={(code, n) => void joinRoom(code, n)}
        onCancel={leaveOnline}
      />
    );
  }

  if (screen.kind === 'guestLobby' && online?.role === 'guest') {
    return (
      <>
        <GuestLobby
          code={online.code}
          members={screen.members}
          count={screen.count}
          options={screen.options}
          onLeave={leaveOnline}
        />
        {overlay}
      </>
    );
  }

  if (screen.kind !== 'game' || !shown) {
    return (
      <StartScreen
        hasSave={saved !== null}
        onContinue={() => saved && begin(saved)}
        onDiscardSave={() => {
          clearSave(storage);
          setSaved(null);
        }}
        onStart={startNew}
        onHostRoom={() => void createRoom()}
        onJoinRoom={() => setScreen({ kind: 'join', code: '', busy: false, error: null })}
      />
    );
  }

  const view = playback ? viewAt(playback.from, playback.to, playback.steps, playback.index) : shown;
  const step = playback ? playback.steps[playback.index] : null;

  return (
    <>
      <GameScreen
        game={view}
        step={step}
        stepKey={playback ? playback.serial : 0}
        speed={speed}
        rollEvents={rollEvents}
        cpuPick={cpuPick}
        dispatch={dispatch}
        onSkip={skip}
        settings={settings}
        onSettings={changeSettings}
        onExit={online ? leaveOnline : toTitle}
        viewerId={online ? mineRef.current : undefined}
        offline={offline}
        onLeaveRoom={online ? leaveOnline : undefined}
      />
      {overlay}
    </>
  );
}
