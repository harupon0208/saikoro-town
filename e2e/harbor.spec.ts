import { expect, test } from '@playwright/test';
import { createGame } from '../src/game/state';
import type { GameState } from '../src/game/types';
import { myBar, open, phase } from './helpers';

/** 港の拡張（全種類の市場）の2人戦。あなたが先手 */
function harborState(edit: (s: GameState) => void): GameState {
  const s = createGame(
    {
      seats: [
        { name: 'あなた', isHuman: true },
        { name: 'ハル', isHuman: false },
      ],
      options: { expansions: ['harbor'], market: 'all' },
    },
    () => 0.5,
  );
  s.players.sort((a) => (a.isHuman ? -1 : 1));
  s.players.forEach((p, id) => (p.id = id));
  s.current = 0;
  s.log = [{ turn: 1, text: 'テスト用の状態' }];
  edit(s);
  return s;
}

test.describe('港の拡張', () => {
  test('開始画面で「港の拡張」を選ぶと、ランドマーク6つ・市場10種類で始まる', async ({ page }) => {
    await open(page, { speed: 'none' });
    await page.getByRole('radio', { name: '⚓ 港の拡張' }).click();
    // 市場は「10種類だけ」が初期値
    await expect(page.getByRole('radio', { name: '10種類だけ' })).toHaveAttribute('aria-checked', 'true');
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.getByTestId('table')).toBeVisible();

    // ランドマークは安い順：港・駅・モール・遊園地・電波塔・空港
    const order = await myBar(page).locator('.lm-tile').evaluateAll((els) => els.map((e) => e.getAttribute('data-landmark')));
    expect(order).toEqual(['harbor', 'station', 'mall', 'park', 'tower', 'airport']);
    await expect(page.locator('.market .card')).toHaveCount(10);
    await expect(page.getByTestId('deck-count')).toContainText('山札');
  });

  test('開始画面の「ルールを見る」で、港の拡張の説明ページが開く（サイトに置いてあるページ）', async ({ page, context }) => {
    await open(page, { speed: 'none' });
    await page.getByRole('radio', { name: '⚓ 港の拡張' }).click();
    const [rules] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: 'ルールを見る' }).click()]);
    await expect(rules).toHaveTitle('港の拡張ルール｜サイコロタウン');
    await expect(rules.getByRole('heading', { name: '⚓ 港の拡張' })).toBeVisible();
    // 色でしぼりこめる
    await rules.getByRole('button', { name: '⚓ 港が必要' }).click();
    await expect(rules.locator('#card-list .card:visible')).toHaveCount(3);
    // 横にはみ出さない
    const overflow = await rules.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('基本を選んだときは今までどおり（ランドマーク4つ・市場15種類）', async ({ page }) => {
    await open(page, { speed: 'none' });
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(myBar(page).locator('.lm-tile')).toHaveCount(4);
    await expect(page.locator('.market .card')).toHaveCount(15);
    await expect(page.getByTestId('deck-count')).toHaveCount(0);
  });

  test('港：合計10以上なら「+2」を選べて、12として収入が出る', async ({ page }) => {
    const save = harborState((s) => {
      s.players[0].landmarks.station = true;
      s.players[0].landmarks.harbor = true;
      s.players[0].cards.market = 1; // 青果市場 11–12
    });
    await open(page, { speed: 'none', fixedRandom: 0.7, save }); // サイコロは 5
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '2個振る' }).click();
    await expect(page.getByTestId('dice-total')).toContainText('10');
    await expect(phase(page)).toContainText('港');
    await expect(page.getByRole('button', { name: '10のまま' })).toBeVisible();
    await page.getByRole('button', { name: '+2して12にする' }).click();
    await expect(page.getByTestId('dice-total')).toContainText('12');
    await expect(page.getByTestId('dice-total')).toContainText('⚓+2');
    await expect(myBar(page).locator('.coins-wrap')).toHaveText('5'); // 3 + 青果市場（麦畑1 × 2）
  });

  test('空港：何も建てなかったら10コイン（演出つき）', async ({ page }) => {
    const save = harborState((s) => {
      s.players[0].landmarks.airport = true;
    });
    await open(page, { speed: 'normal', fixedRandom: 0.99, save }); // サイコロは 6 → 何も発動しない
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    await page.getByRole('button', { name: '何も買わない' }).click({ timeout: 8000 });
    await expect(page.getByTestId('caption')).toHaveText('あなたの空港：+10コイン', { timeout: 8000 });
    await expect(page.getByTestId('coins-0')).toContainText('13', { timeout: 8000 });
  });

  test('10種類の市場：売り切れて補充されたら、何が並んだか一言と「NEW」で分かる', async ({ page }) => {
    const save = harborState((s) => {
      s.options = { expansions: ['harbor'], market: 'ten' };
      for (const id of Object.keys(s.supply) as (keyof typeof s.supply)[]) s.supply[id] = 0;
      for (const id of ['wheat', 'ranch', 'bakery', 'cafe', 'convenience', 'forest', 'cheese', 'furniture', 'mine', 'apple'] as const)
        s.supply[id] = 2;
      s.supply.wheat = 1;
      s.deck = ['ranch', 'sushi', 'tuna'];
      s.phase = 'build';
      s.dice = [6];
    });
    await open(page, { speed: 'normal', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.getByTestId('fresh-sushi')).toHaveCount(0);
    await page.locator('.market [data-card="wheat"]').click();
    await page.getByRole('button', { name: /建てる/ }).click();

    await expect(page.getByTestId('caption')).toHaveText('市場に「寿司屋」が並んだ！', { timeout: 8000 });
    await expect(page.getByTestId('fresh-sushi')).toHaveText('NEW');
    await expect(page.getByTestId('fresh-ranch')).toHaveText('補充');
    // 相手の番が終わって、自分の次の番になっても残っている
    await expect(page.getByRole('button', { name: '1個振る' })).toBeVisible({ timeout: 20000 });
    await expect(page.getByTestId('fresh-sushi')).toHaveText('NEW');
    await expect(page.getByTestId('deck-count')).toContainText('山札 1枚');
  });

  test('拡張のカードは市場に出て、詳しい説明が見られる', async ({ page }) => {
    const save = harborState(() => {});
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.locator('.market [data-card="sushi"]').click();
    await expect(page.getByRole('dialog')).toContainText('港があれば、振った人から3コイン');
  });
});
