import { expect, test } from '@playwright/test';
import { makeState, open } from './helpers';

const SEATS = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
];

test('出目表：目ごとに動くカード・持っている人・確率が見られ、今の目が目立つ', async ({ page, isMobile }) => {
  const save = makeState(SEATS, (s) => {
    s.current = 0;
    s.players[1].cards.cafe = 2;
  });
  await open(page, { speed: 'none', fixedRandom: 0.4, save }); // サイコロは 3
  await page.getByRole('button', { name: '続きから' }).click();
  await page.getByRole('button', { name: '1個振る' }).click();
  await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible();

  // スマホは下のタブ、PCは右上の欄の切り替え
  if (isMobile) await page.getByRole('navigation', { name: 'タブ' }).getByRole('button', { name: '出目表' }).click();
  else await page.getByRole('tab', { name: '出目表' }).click();

  const row3 = page.getByTestId('roll-3');
  await expect(row3).toContainText('カフェ');
  await expect(row3).toContainText('ハル×2');
  await expect(row3).toContainText('パン屋');
  await expect(row3).toContainText('あなた×1');
  await expect(row3).toContainText('1個 17%');
  await expect(row3).toContainText('2個 6%');
  await expect(page.getByTestId('roll-1')).toContainText('麦畑');
  await expect(page.getByTestId('roll-12')).toBeVisible();
  await expect(page.getByTestId('roll-13')).toHaveCount(0); // 基本セットに 13 はない
  // 今出ている目（3）の行が目立つ
  await expect(row3).toHaveClass(/now/);

  // カードをタップすると詳しい説明
  await row3.getByRole('button', { name: /カフェ/ }).click();
  await expect(page.getByRole('dialog')).toContainText('振った人から1コイン');
});
