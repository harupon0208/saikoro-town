// オンライン対戦の画面：部屋を作る（ホスト）／部屋に入る（友達）／待合室／通信が切れたとき
import { useState } from 'react';
import { MAX_PLAYERS, MIN_PLAYERS, isRoomCode } from '../net/lobby';
import type { RoomMember } from '../net/protocol';
import type { GameOptions } from '../game/types';
import { Ambience } from './anim/Effects';
import { OptionsPicker, optionsLabel } from './OptionsPicker';

export function inviteUrl(code: string): string {
  return `${location.origin}${location.pathname}?room=${code}`;
}

function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <main className="start online">
      <Ambience count={12} />
      <h1>サイコロタウン</h1>
      <p className="title-ornament">{title}</p>
      {children}
    </main>
  );
}

function Members({ members, count }: { members: RoomMember[]; count: number }) {
  const cpus = Math.max(0, count - members.length);
  return (
    <ul className="members" data-testid="members">
      {members.map((m, i) => (
        <li key={i} className={m.connected ? '' : 'off'}>
          <span className="who">{i === 0 ? '👑' : '🙂'}</span>
          <b>{m.name}</b>
          <span className="tag">{i === 0 ? 'ホスト' : m.connected ? '参加中' : '通信切れ'}</span>
        </li>
      ))}
      {Array.from({ length: cpus }, (_, i) => (
        <li key={`cpu${i}`} className="cpu">
          <span className="who">🤖</span>
          <b>CPU</b>
          <span className="tag">空いた席</span>
        </li>
      ))}
    </ul>
  );
}

/** 部屋コードを大きく見せる＋招待リンク */
function CodeCard({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const url = inviteUrl(code);
  const share = async () => {
    try {
      if (navigator.share) {
        await navigator.share({ title: 'サイコロタウン', text: `部屋コード ${code} で一緒に遊ぼう！`, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // 共有をやめた・コピーできない：リンクは画面に出ているので何もしない
    }
  };
  return (
    <div className="code-card">
      <p>部屋コード</p>
      <p className="room-code" data-testid="room-code">
        {code}
      </p>
      <p className="note">友達に「サイコロタウン」を開いてもらい、この番号を入れてもらいます。</p>
      <button className="share" onClick={share}>
        {copied ? 'コピーしました！' : '招待リンクを送る'}
      </button>
      <p className="invite-url">{url}</p>
    </div>
  );
}

export function HostLobby(props: {
  code: string | null;
  error: string | null;
  members: RoomMember[];
  count: number;
  options: GameOptions;
  name: string;
  onName: (name: string) => void;
  onCount: (n: number) => void;
  onOptions: (o: GameOptions) => void;
  onStart: () => void;
  onCancel: () => void;
}) {
  const { code, error, members, count, options, name, onName, onCount, onOptions, onStart, onCancel } = props;
  const min = Math.max(MIN_PLAYERS, members.length);
  return (
    <Frame title="部屋を作る">
      <section className="panel">
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : !code ? (
          <p className="waiting-text">部屋を用意しています…</p>
        ) : (
          <>
            <CodeCard code={code} />
            <h2>あなたの名前</h2>
            <input
              value={name}
              maxLength={10}
              placeholder="ホスト"
              onChange={(e) => onName(e.target.value)}
              aria-label="あなたの名前"
            />
            <h2>参加者</h2>
            <Members members={members} count={count} />
            <h2>人数</h2>
            <div className="row">
              {[2, 3, 4].map((n) => (
                <button
                  key={n}
                  className={n === count ? 'selected' : ''}
                  disabled={n < min || n > MAX_PLAYERS}
                  onClick={() => onCount(n)}
                >
                  {n}人
                </button>
              ))}
            </div>
            <p className="note">友達で埋まらない席は CPU が入ります。</p>
            <OptionsPicker value={options} onChange={onOptions} />
            <button className="primary big" onClick={onStart}>
              スタート
            </button>
          </>
        )}
        <button className="ghost" onClick={onCancel}>
          {error ? 'もどる' : 'やめる'}
        </button>
      </section>
    </Frame>
  );
}

export function JoinForm(props: {
  initialCode: string;
  name: string;
  busy: boolean;
  error: string | null;
  onJoin: (code: string, name: string) => void;
  onCancel: () => void;
}) {
  const [code, setCode] = useState(props.initialCode);
  const [name, setName] = useState(props.name);
  const ok = isRoomCode(code) && !props.busy;
  return (
    <Frame title="部屋に入る">
      <section className="panel">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (ok) props.onJoin(code, name);
          }}
        >
          <h2>部屋コード（4桁）</h2>
          <input
            className="code-input"
            value={code}
            inputMode="numeric"
            autoComplete="off"
            maxLength={4}
            placeholder="0000"
            aria-label="部屋コード"
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 4))}
          />
          <h2>あなたの名前</h2>
          <input value={name} maxLength={10} onChange={(e) => setName(e.target.value)} aria-label="あなたの名前" />
          {props.error && (
            <p className="error" role="alert">
              {props.error}
            </p>
          )}
          <button className="primary big" type="submit" disabled={!ok}>
            {props.busy ? 'つないでいます…' : '参加する'}
          </button>
        </form>
        <button className="ghost" onClick={props.onCancel}>
          もどる
        </button>
      </section>
    </Frame>
  );
}

export function GuestLobby(props: {
  code: string;
  members: RoomMember[];
  count: number;
  options: GameOptions | null;
  onLeave: () => void;
}) {
  return (
    <Frame title={`部屋 ${props.code}`}>
      <section className="panel">
        <h2>参加者</h2>
        {props.members.length > 0 ? (
          <Members members={props.members} count={props.count} />
        ) : (
          <p className="waiting-text">部屋の様子を受け取っています…</p>
        )}
        {props.options && (
          <p className="room-options" data-testid="room-options">
            バージョン：{optionsLabel(props.options)}
          </p>
        )}
        <p className="waiting-text" data-testid="guest-waiting">
          ホストがスタートするのを待っています
          <span className="dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </p>
        <button className="ghost" onClick={props.onLeave}>
          部屋を出る
        </button>
      </section>
    </Frame>
  );
}

export type ConnIssue = { kind: 'retrying' } | { kind: 'lost' } | { kind: 'closed' };

/** 友達側：ホストとの通信が切れた・部屋が閉じられた */
export function ConnectionOverlay({
  issue,
  onRetry,
  onExit,
}: {
  issue: ConnIssue;
  onRetry: () => void;
  onExit: () => void;
}) {
  // つなぎ直している間は、画面を隠さず上に小さく出す（自動でつながるので待つだけ）
  if (issue.kind === 'retrying')
    return (
      <div className="conn-banner" role="status" aria-label="通信">
        ホストにつなぎ直しています…
      </div>
    );
  return (
    <div className="conn-overlay" role="alertdialog" aria-label="通信">
      <div className="panel">
        {issue.kind === 'lost' && (
          <>
            <p>ホストとの通信が切れました。</p>
            <button className="primary" onClick={onRetry}>
              もう一度つなぐ
            </button>
          </>
        )}
        {issue.kind === 'closed' && <p>ホストが部屋を閉じました。</p>}
        <button className="ghost" onClick={onExit}>
          タイトルへ
        </button>
      </div>
    </div>
  );
}
