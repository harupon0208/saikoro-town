import { type Page, expect } from '@playwright/test';
import { SAVE_KEY, serialize } from '../src/game/save';
import { createGame } from '../src/game/state';
import type { GameState, SeatConfig } from '../src/game/types';
import type { Speed } from '../src/ui/anim/timeline';
import { SETTINGS_KEY } from '../src/ui/settings';

export interface OpenOptions {
  speed?: Speed;
  /** CPU の間（ミリ秒）。開発サーバーだけで効く。null なら本番と同じ間（建てるカードを指し示す演出も出る） */
  cpuDelay?: number | null;
  /** Math.random を決まった並びにする（サイコロや席順を固定） */
  seed?: number;
  /** Math.random をずっと同じ値にする（例: 0.2 → サイコロは毎回 2） */
  fixedRandom?: number;
  /** 最初から入れておく保存データ */
  save?: GameState;
}

/** ページを開く。設定・乱数・保存データはページの読み込み前に仕込む */
export async function open(page: Page, opts: OpenOptions = {}) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.addInitScript(
    ({ settingsKey, saveKey, speed, seed, fixedRandom, save }) => {
      // 再読み込みしたときに保存を上書きしないよう、最初の1回だけ仕込む
      if (!sessionStorage.getItem('e2e-init')) {
        sessionStorage.setItem('e2e-init', '1');
        localStorage.clear();
        if (speed) localStorage.setItem(settingsKey, JSON.stringify({ speed }));
        if (save) localStorage.setItem(saveKey, save);
      }
      if (fixedRandom !== undefined) {
        Math.random = () => fixedRandom;
      } else if (seed !== undefined) {
        let a = seed >>> 0;
        Math.random = () => {
          a = (a + 0x6d2b79f5) >>> 0;
          let t = a;
          t = Math.imul(t ^ (t >>> 15), t | 1);
          t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
          return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
      }
    },
    {
      settingsKey: SETTINGS_KEY,
      saveKey: SAVE_KEY,
      speed: opts.speed,
      seed: opts.seed,
      fixedRandom: opts.fixedRandom,
      save: opts.save ? serialize(opts.save) : undefined,
    },
  );

  await page.goto(opts.cpuDelay === null ? './' : `./?cpuDelay=${opts.cpuDelay ?? 0}`);
  return { errors };
}

/** 開始画面で人数と席を決めてスタート */
export async function start(page: Page, seats?: SeatConfig[]) {
  if (seats) {
    await page.getByRole('button', { name: `${seats.length}人` }).click();
    for (let i = 0; i < seats.length; i++) {
      await page.getByLabel(`席${i + 1}の名前`).fill(seats[i].name);
      const row = page.locator('.seat').nth(i);
      await row.getByRole('button', { name: seats[i].isHuman ? '人間' : 'CPU' }).click();
    }
  }
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.getByTestId('table')).toBeVisible();
}

/** 保存データ用の状態をつくる（席の並びは指定どおりに固定） */
export function makeState(seats: SeatConfig[], edit: (s: GameState) => void): GameState {
  const s = createGame({ seats }, () => 0.5);
  // createGame は席をシャッフルするので、指定どおりに並べ直す
  s.players.sort((a, b) => seats.findIndex((x) => x.name === a.name) - seats.findIndex((x) => x.name === b.name));
  s.players.forEach((p, id) => (p.id = id));
  s.log = [{ turn: 1, text: 'テスト用の状態' }];
  edit(s);
  return s;
}

export const phase = (page: Page) => page.getByTestId('phase');
export const myBar = (page: Page) => page.locator('.my-bar');
