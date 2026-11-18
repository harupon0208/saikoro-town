import { expect, test } from '@playwright/test';

// 本物の PeerJS（インターネット経由）でつながるかの確認。ネットにつながっているときだけ手で動かす：
//   ONLINE_REAL=1 npx playwright test e2e/online-real.spec.ts --project=desktop
test.skip(!process.env.ONLINE_REAL, 'ONLINE_REAL=1 のときだけ');

test('別々のブラウザ（別の端末のつもり）で、本物の通信で部屋に入って遊べる', async ({ browser }) => {
  test.setTimeout(90_000);
  const hostCtx = await browser.newContext();
  const guestCtx = await browser.newContext();
  const h = await hostCtx.newPage();
  const g = await guestCtx.newPage();
  for (const p of [h, g]) {
    await p.addInitScript(() => {
      localStorage.setItem('saikoro-town:settings', JSON.stringify({ speed: 'fast', sound: false }));
    });
  }
  await h.goto('./');
  await h.getByRole('button', { name: '部屋を作る' }).click();
  const code = (await h.getByTestId('room-code').textContent({ timeout: 20000 }))!.trim();
  expect(code).toMatch(/^\d{4}$/);

  await g.goto(`./?room=${code}`);
  await g.getByLabel('あなたの名前').fill('アキ');
  await g.getByRole('button', { name: '参加する' }).click();
  await expect(h.getByTestId('members')).toContainText('アキ', { timeout: 30000 });
  await h.getByRole('button', { name: '2人' }).click();
  await h.getByRole('button', { name: 'スタート' }).click();
  await expect(g.getByTestId('table')).toBeVisible({ timeout: 15000 });

  // 先手の人が振って、何も買わずに終える → もう一人の番になる
  const hostFirst = await h.getByRole('button', { name: '1個振る' }).isVisible().catch(() => false);
  const [first, second] = hostFirst ? [h, g] : [g, h];
  await first.getByRole('button', { name: '1個振る' }).click({ timeout: 15000 });
  const total = first.getByTestId('dice-total');
  await expect(total).toHaveText(/^\d/);
  await expect(second.getByTestId('dice-total')).toHaveText((await total.textContent())!.trim());
  await first.getByRole('button', { name: '何も買わない' }).click();
  await expect(second.getByRole('button', { name: '1個振る' })).toBeVisible({ timeout: 15000 });

  await hostCtx.close();
  await guestCtx.close();
});
