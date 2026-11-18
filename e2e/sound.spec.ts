import { expect, test, type Page } from '@playwright/test';
import { makeState, open } from './helpers';

const SEATS = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
];

/** 開発サーバーでは、鳴らした効果音の名前が window.__sfxLog に残る */
const sfx = (page: Page) => page.evaluate(() => window.__sfxLog ?? []);

test.describe('効果音', () => {
  test('最初からオンで、サイコロ・収入・建設などで音が鳴る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = s.players.findIndex((p) => p.isHuman);
    });
    await open(page, { speed: 'normal', fixedRandom: 0, save }); // サイコロは 1 → 麦畑
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect.poll(() => sfx(page), { timeout: 8000 }).toEqual(
      expect.arrayContaining(['click', 'roll', 'land', 'trigger', 'coin']),
    );
    // 転がる音 → 止まる音 → カード → コイン の順
    const log = await sfx(page);
    expect(log.indexOf('roll')).toBeLessThan(log.indexOf('land'));
    expect(log.indexOf('land')).toBeLessThan(log.indexOf('trigger'));
    expect(log.indexOf('trigger')).toBeLessThan(log.indexOf('coin'));
  });

  test('アニメーション「なし」でも、まとめて音が鳴る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = s.players.findIndex((p) => p.isHuman);
    });
    await open(page, { speed: 'none', fixedRandom: 0, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect.poll(() => sfx(page)).toEqual(expect.arrayContaining(['land', 'coin']));
  });

  test('設定でオフにすると鳴らない。設定は再読み込み後も残る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = s.players.findIndex((p) => p.isHuman);
    });
    await open(page, { speed: 'normal', fixedRandom: 0, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.getByRole('slider', { name: '音量' })).toBeEnabled();
    await page.getByRole('radiogroup', { name: '効果音' }).getByRole('radio', { name: 'オフ' }).click();
    await expect(page.getByRole('slider', { name: '音量' })).toBeDisabled();
    await page.keyboard.press('Escape');
    await page.reload();
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(page.getByTestId('dice-total')).toHaveText('1', { timeout: 8000 });
    await page.waitForTimeout(1500);
    expect(await sfx(page)).toEqual([]);
    // 再生が終わってから設定を開く（再生中のタップは演出を飛ばすだけ）
    await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible({ timeout: 8000 });
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.getByRole('radiogroup', { name: '効果音' }).getByRole('radio', { name: 'オフ' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });
});
