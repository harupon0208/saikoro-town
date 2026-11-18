// 効果音をブラウザの Web Audio でその場で作って鳴らす（音声ファイルは使わない）。
// ブラウザは「最初に画面を触るまで音を出さない」決まりなので、最初のタップで音の準備をする。
import type { Cue, SoundName } from './cues';

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;
let enabled = true;
let volume = 0.7;

/** 開発中の自動テスト用：鳴らした音の名前を記録する */
declare global {
  interface Window {
    __sfxLog?: string[];
  }
}

function ensure(): Ctx | null {
  if (ctx) return ctx;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = volume;
  // 鳴りすぎて割れないように軽く抑える
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

/** 無音の WAV（0.5秒）。<audio> で流し続けて、iPhone の「消音モード」でも効果音が出るようにする */
function silentWavUrl(): string {
  const rate = 8000;
  const len = rate / 2;
  const buf = new Uint8Array(44 + len);
  const v = new DataView(buf.buffer);
  const str = (o: number, t: string) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  v.setUint32(4, 36 + len, true);
  str(8, 'WAVE');
  str(12, 'fmt ');
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // モノラル
  v.setUint32(24, rate, true);
  v.setUint32(28, rate, true);
  v.setUint16(32, 1, true);
  v.setUint16(34, 8, true);
  str(36, 'data');
  v.setUint32(40, len, true);
  buf.fill(128, 44); // 8bit の無音
  let bin = '';
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return `data:audio/wav;base64,${btoa(bin)}`;
}

let keepAlive: HTMLAudioElement | null = null;

/** iPhone / iPad（iPad は Mac のふりをするので、タッチできるかで見分ける） */
const IS_IOS =
  typeof navigator !== 'undefined' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

/**
 * 最初のタップ・キー操作で音を使えるようにする（1回だけ呼べばよい）。
 * スマホ向けの対策：
 * - iPhone は「指を離したとき（touchend / pointerup / click）」でないと音の許可が出ないので、それらでも準備する
 * - 準備のときに無音を1回鳴らす（古い iPhone はこれで音が出るようになる）
 * - iPhone の消音モード（横のスイッチ）では Web Audio の音が消えるので、無音の <audio> を流し続けて
 *   「音楽再生」の扱いにする。対応していれば navigator.audioSession も「再生」にする
 * - 別のアプリから戻ったときなどに止まった音も、次のタップで再開する
 */
export function installUnlock(): () => void {
  const unlock = () => {
    const c = ensure();
    if (!c) return;
    const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (session && enabled) {
      try {
        session.type = 'playback';
      } catch {
        // 対応していない
      }
    }
    if (c.state !== 'running') {
      void c.resume().catch(() => {});
      const b = c.createBufferSource();
      b.buffer = c.createBuffer(1, 1, 22050);
      b.connect(c.destination);
      b.start(0);
    }
    if (IS_IOS && enabled && !document.hidden) {
      if (!keepAlive) {
        keepAlive = new Audio(silentWavUrl());
        keepAlive.loop = true;
        keepAlive.setAttribute('playsinline', '');
        keepAlive.preload = 'auto';
      }
      if (keepAlive.paused) void keepAlive.play().catch(() => {});
    }
  };
  // 画面を離れたら無音の再生も止める（ロック画面に再生中と出ないように）
  const onVisibility = () => {
    if (document.hidden) keepAlive?.pause();
  };
  const events = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'];
  events.forEach((e) => window.addEventListener(e, unlock, true));
  document.addEventListener('visibilitychange', onVisibility);
  return () => {
    events.forEach((e) => window.removeEventListener(e, unlock, true));
    document.removeEventListener('visibilitychange', onVisibility);
  };
}

export function setSound(on: boolean, vol: number): void {
  enabled = on;
  volume = vol;
  if (!on) keepAlive?.pause();
  if (master && ctx) master.gain.setTargetAtTime(on ? vol : 0, ctx.currentTime, 0.02);
}

// ---------------------------------------------------------------------------
// 音の部品

/** 音程つきの音。ピンと鳴って余韻が消える */
function tone(
  c: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  { type = 'sine', dur = 0.3, gain = 0.3, attack = 0.005, slideTo }: {
    type?: OscillatorType;
    dur?: number;
    gain?: number;
    attack?: number;
    slideTo?: number;
  } = {},
): AudioScheduledSourceNode {
  const o = c.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
  return o;
}

/** ざっという音（帯域を絞ったノイズ） */
function hiss(
  c: Ctx,
  out: AudioNode,
  t: number,
  { dur = 0.05, freq = 2000, q = 1, gain = 0.3, sweepTo }: {
    dur?: number;
    freq?: number;
    q?: number;
    gain?: number;
    sweepTo?: number;
  } = {},
): AudioScheduledSourceNode {
  const src = c.createBufferSource();
  src.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.05);
  return src;
}

/** コインの「チャリン」：金属っぽい倍音を重ねる */
function coinChime(c: Ctx, out: AudioNode, t: number, base: number, gain: number) {
  const pitch = base * (1 + (Math.random() - 0.5) * 0.04);
  tone(c, out, t, pitch, { type: 'sine', dur: 0.35, gain });
  tone(c, out, t, pitch * 1.5, { type: 'sine', dur: 0.22, gain: gain * 0.5 });
  tone(c, out, t, pitch * 2.76, { type: 'sine', dur: 0.12, gain: gain * 0.25 });
  hiss(c, out, t, { dur: 0.02, freq: 7000, q: 2, gain: gain * 0.4 });
}

const NOTE = (n: number) => 440 * Math.pow(2, (n - 69) / 12); // MIDI 番号 → 周波数
const C5 = 72;

// ---------------------------------------------------------------------------
// 効果音それぞれ

function synth(name: SoundName, c: Ctx, out: AudioNode, t: number, dur = 0): AudioScheduledSourceNode[] {
  const nodes: AudioScheduledSourceNode[] = [];
  switch (name) {
    case 'click':
      nodes.push(tone(c, out, t, 1300, { type: 'triangle', dur: 0.05, gain: 0.12, slideTo: 900 }));
      break;
    case 'pick':
      nodes.push(tone(c, out, t, NOTE(C5 + 7), { type: 'triangle', dur: 0.12, gain: 0.16 }));
      nodes.push(tone(c, out, t + 0.1, NOTE(C5 + 12), { type: 'triangle', dur: 0.2, gain: 0.16 }));
      break;
    case 'roll': {
      // サイコロが卓の上で何度もぶつかる「カラカラ」。だんだん間があいて弱くなる
      const len = Math.max(dur / 1000, 0.2);
      let s = 0.02;
      let k = 0;
      while (s < len) {
        const p = s / len;
        nodes.push(hiss(c, out, t + s, { dur: 0.035, freq: 2400 + Math.random() * 2200, q: 3, gain: 0.32 * (1 - p * 0.6) }));
        nodes.push(tone(c, out, t + s, 520 + Math.random() * 400, { type: 'triangle', dur: 0.04, gain: 0.07 * (1 - p * 0.6) }));
        s += 0.035 + p * p * 0.16 + Math.random() * 0.03;
        if (++k > 60) break;
      }
      break;
    }
    case 'land':
      // コトン、と止まる
      nodes.push(tone(c, out, t, 190, { type: 'sine', dur: 0.16, gain: 0.45, slideTo: 110 }));
      nodes.push(hiss(c, out, t, { dur: 0.05, freq: 1800, q: 1.5, gain: 0.35 }));
      break;
    case 'trigger':
      // 木琴のようなポン
      nodes.push(tone(c, out, t, NOTE(C5 + 7), { type: 'sine', dur: 0.4, gain: 0.25 }));
      nodes.push(tone(c, out, t, NOTE(C5 + 19), { type: 'sine', dur: 0.15, gain: 0.08 }));
      break;
    case 'coin':
      coinChime(c, out, t, 1650, 0.22);
      break;
    case 'pay':
      coinChime(c, out, t, 1250, 0.18);
      coinChime(c, out, t + 0.07, 1050, 0.14);
      break;
    case 'build':
      // トン（木を置く）＋キラン
      nodes.push(tone(c, out, t, 150, { type: 'sine', dur: 0.18, gain: 0.5, slideTo: 90 }));
      nodes.push(hiss(c, out, t, { dur: 0.06, freq: 900, q: 2, gain: 0.3 }));
      nodes.push(tone(c, out, t + 0.08, NOTE(C5 + 16), { type: 'triangle', dur: 0.35, gain: 0.14 }));
      nodes.push(tone(c, out, t + 0.16, NOTE(C5 + 24), { type: 'sine', dur: 0.45, gain: 0.12 }));
      break;
    case 'landmark': {
      // 上がっていく和音＋最後にきらきら
      const notes = [0, 4, 7, 12, 16];
      notes.forEach((n, i) => {
        nodes.push(tone(c, out, t + i * 0.11, NOTE(C5 + n), { type: 'triangle', dur: 0.5, gain: 0.2 }));
        nodes.push(tone(c, out, t + i * 0.11, NOTE(C5 + n + 12), { type: 'sine', dur: 0.3, gain: 0.06 }));
      });
      [0, 4, 7, 12].forEach((n) =>
        nodes.push(tone(c, out, t + 0.6, NOTE(C5 + n), { type: 'triangle', dur: 1.4, gain: 0.14, attack: 0.02 })),
      );
      for (let i = 0; i < 8; i++) {
        nodes.push(tone(c, out, t + 0.65 + i * 0.07, NOTE(C5 + 24 + ((i * 5) % 12)), { type: 'sine', dur: 0.2, gain: 0.05 }));
      }
      break;
    }
    case 'swap':
      nodes.push(hiss(c, out, t, { dur: 0.35, freq: 500, q: 0.8, gain: 0.25, sweepTo: 3500 }));
      nodes.push(hiss(c, out, t + 0.3, { dur: 0.35, freq: 3500, q: 0.8, gain: 0.2, sweepTo: 500 }));
      break;
    case 'turn':
      nodes.push(tone(c, out, t, NOTE(C5 + 4), { type: 'sine', dur: 0.35, gain: 0.12 }));
      nodes.push(tone(c, out, t + 0.12, NOTE(C5 + 9), { type: 'sine', dur: 0.45, gain: 0.12 }));
      break;
    case 'myTurn':
      [0, 7, 12].forEach((n, i) =>
        nodes.push(tone(c, out, t + i * 0.1, NOTE(C5 + n), { type: 'triangle', dur: 0.5, gain: 0.2 })),
      );
      nodes.push(tone(c, out, t + 0.3, NOTE(C5 + 24), { type: 'sine', dur: 0.6, gain: 0.06 }));
      break;
    case 'extraTurn':
      for (let i = 0; i < 6; i++) {
        nodes.push(tone(c, out, t + i * 0.05, NOTE(C5 + [0, 2, 4, 7, 9, 12][i]), { type: 'triangle', dur: 0.2, gain: 0.16 }));
      }
      break;
    case 'win': {
      // ファンファーレ：タ・タ・タ・ターン
      const seq: [number, number, number][] = [
        [0, 0, 0.16],
        [0.16, 4, 0.16],
        [0.32, 7, 0.16],
        [0.48, 12, 0.9],
      ];
      for (const [at, n, d] of seq) {
        nodes.push(tone(c, out, t + at, NOTE(C5 + n), { type: 'sawtooth', dur: d + 0.1, gain: 0.08 }));
        nodes.push(tone(c, out, t + at, NOTE(C5 + n), { type: 'triangle', dur: d + 0.15, gain: 0.18 }));
      }
      [0, 4, 7, 12, 16].forEach((n) =>
        nodes.push(tone(c, out, t + 0.48, NOTE(C5 - 12 + n), { type: 'triangle', dur: 1.6, gain: 0.1, attack: 0.03 })),
      );
      break;
    }
  }
  return nodes;
}

/**
 * 効果音をまとめて予約する。返り値を呼ぶと、まだ鳴っていない音と鳴っている途中の長い音を止める
 * （再生中に画面をタップして演出を飛ばしたとき用）。
 */
export function playCues(cues: Cue[]): () => void {
  if (import.meta.env.DEV) {
    window.__sfxLog = window.__sfxLog ?? [];
  }
  if (!enabled || cues.length === 0) return () => {};
  const timers: ReturnType<typeof setTimeout>[] = [];
  const nodes: AudioScheduledSourceNode[] = [];
  for (const cue of cues) {
    const fire = () => {
      if (import.meta.env.DEV) window.__sfxLog?.push(cue.name);
      const c = ensure();
      if (!c || !master) return;
      // 止まっていたら再開を頼んでから予約する（iPhone の 'interrupted' からも戻す）
      if (c.state !== 'running') void c.resume().catch(() => {});
      nodes.push(...synth(cue.name, c, master, c.currentTime + 0.01, cue.dur));
    };
    if (cue.at <= 0) fire();
    else timers.push(setTimeout(fire, cue.at));
  }
  return () => {
    timers.forEach(clearTimeout);
    const now = ctx?.currentTime ?? 0;
    for (const n of nodes) {
      try {
        n.stop(now + 0.03);
      } catch {
        // もう止まっている
      }
    }
  };
}

export function playSound(name: SoundName): void {
  playCues([{ name, at: 0 }]);
}
