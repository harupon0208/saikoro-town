import { type BrowserContext, type Page, expect, test } from '@playwright/test';
import { SETTINGS_KEY } from '../src/ui/settings';

// オンライン対戦：同じブラウザの2つのタブを「ホスト」と「友達」にして、BroadcastChannel でつなぐ（?net=local）。
// ホストの乱数を 0 に固定する → 部屋コードは 0000、席は友達が先、サイコロは毎回 1。

async function openTab(context: BrowserContext, opts: { fixedRandom?: number; query?: string } = {}) {
  const page = await context.newPage();
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(
    ({ settingsKey, fixedRandom }) => {
      if (!sessionStorage.getItem('e2e-init')) {
        sessionStorage.setItem('e2e-init', '1');
        localStorage.setItem(settingsKey, JSON.stringify({ speed: 'fast', sound: false }));
        localStorage.removeItem('saikoro-town:name');
      }
      if (fixedRandom !== undefined) Math.random = () => fixedRandom;
    },
    { settingsKey: SETTINGS_KEY, fixedRandom: opts.fixedRandom },
  );
  await page.goto(`./?net=local&cpuDelay=0${opts.query ?? ''}`);
  return { page, errors };
}

async function createRoom(host: Page, name = 'ホスト') {
  await host.getByRole('button', { name: '部屋を作る' }).click();
  await expect(host.getByTestId('room-code')).toHaveText('0000');
  await host.getByLabel('あなたの名前').fill(name);
}

async function joinRoom(guest: Page, name: string, code = '0000') {
  await guest.getByRole('button', { name: '部屋に入る' }).click();
  await guest.getByLabel('部屋コード').fill(code);
  await guest.getByLabel('あなたの名前').fill(name);
  await guest.getByRole('button', { name: '参加する' }).click();
}

/** ホストと友達1人の2人戦を始める（友達が先手） */
async function startTwo(context: BrowserContext) {
  const host = await openTab(context, { fixedRandom: 0 });
  const guest = await openTab(context);
  await createRoom(host.page);
  await joinRoom(guest.page, 'アキ');
  await expect(host.page.getByTestId('members')).toContainText('アキ');
  await expect(guest.page.getByTestId('guest-waiting')).toBeVisible();
  await host.page.getByRole('button', { name: '2人' }).click();
  await host.page.getByRole('button', { name: 'スタート' }).click();
  await expect(host.page.getByTestId('table')).toBeVisible();
  await expect(guest.page.getByTestId('table')).toBeVisible();
  return { host, guest };
}

test.describe('オンライン対戦', () => {
  test('部屋を作って友達が入り、それぞれの画面で交互に遊べる', async ({ context }) => {
    const { host, guest } = await startTwo(context);
    const h = host.page;
    const g = guest.page;

    // 友達の番：友達の画面だけ操作できる
    await expect(g.getByRole('button', { name: '1個振る' })).toBeVisible();
    await expect(h.getByRole('button', { name: '1個振る' })).toHaveCount(0);
    await expect(h.locator('.dice-panel')).toContainText('アキの番');
    // 自分の席が下に出る
    await expect(g.locator('.my-bar')).toHaveAttribute('aria-label', /アキ/);
    await expect(h.locator('.my-bar')).toHaveAttribute('aria-label', /ホスト/);

    // 友達が振る → 両方の画面に出目と収入が出る（1 → 麦畑で +1）
    await g.getByRole('button', { name: '1個振る' }).click();
    await expect(g.getByTestId('dice-total')).toHaveText('1');
    await expect(h.getByTestId('dice-total')).toHaveText('1');
    await expect(g.getByRole('button', { name: '何も買わない' })).toBeVisible();
    await expect(h.getByTestId('phase')).toHaveText(/建設/);

    // 友達が建てる：市場の麦畑 → 建てる
    await g.locator('.market .card', { hasText: '麦畑' }).first().click();
    await g.getByRole('button', { name: /建てる/ }).click();

    // ホストの番になる
    await expect(h.getByRole('button', { name: '1個振る' })).toBeVisible();
    await expect(g.locator('.dice-panel')).toContainText('ホストの番');
    await expect(h.getByTestId('phase')).toHaveText(/ターン 2/);
    await expect(g.getByTestId('phase')).toHaveText(/ターン 2/);
    // 友達の麦畑はホストの画面でも2枚
    await expect(h.locator('.rivals, .rival-strip').first()).toBeVisible();
    await h.getByRole('button', { name: '1個振る' }).click();
    await expect(g.getByTestId('dice-total')).toHaveText('1');
    await h.getByRole('button', { name: '何も買わない' }).click();
    await expect(g.getByRole('button', { name: '1個振る' })).toBeVisible();

    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
  });

  test('空いた席は CPU。CPU の番はホストが進め、友達の画面にも出る', async ({ context }) => {
    const host = await openTab(context, { fixedRandom: 0 });
    const guest = await openTab(context);
    await createRoom(host.page);
    await joinRoom(guest.page, 'アキ');
    await expect(host.page.getByTestId('members')).toContainText('アキ');
    await host.page.getByRole('button', { name: '3人' }).click();
    await expect(guest.page.getByTestId('members')).toContainText('CPU');
    await host.page.getByRole('button', { name: 'スタート' }).click();
    const g = guest.page;
    await expect(g.getByTestId('table')).toBeVisible();
    // 席順（乱数0）：CPU（ハル）→ ホスト → アキ … ではなく、シャッフル結果に従って進む。
    // どの順でも、友達の番が来るまでに CPU が自動で動く
    await expect(g.getByRole('button', { name: '1個振る' })).toBeVisible({ timeout: 20000 });
    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
  });

  test('友達が再読み込みしても、部屋コードで入り直せば自分の席に戻れる', async ({ context }) => {
    const { host, guest } = await startTwo(context);
    const h = host.page;
    const g = guest.page;
    await expect(g.getByRole('button', { name: '1個振る' })).toBeVisible();

    await g.reload();
    // ホスト側：通信切れの表示と、待っている表示
    await expect(h.getByText('通信切れ').first()).toBeVisible();
    await expect(h.getByTestId('waiting-offline')).toContainText('アキの通信が切れています');

    await joinRoom(g, 'アキ');
    await expect(g.getByTestId('table')).toBeVisible();
    await expect(g.locator('.my-bar')).toHaveAttribute('aria-label', /アキ/);
    await expect(g.getByRole('button', { name: '1個振る' })).toBeVisible();
    await expect(h.getByText('通信切れ')).toHaveCount(0);
    await g.getByRole('button', { name: '1個振る' }).click();
    await expect(h.getByTestId('dice-total')).toHaveText('1');
  });

  test('始まった部屋には新しい人は入れない', async ({ context }) => {
    await startTwo(context);
    const late = await openTab(context);
    await joinRoom(late.page, 'ベン');
    await expect(late.page.getByRole('alert')).toHaveText('このゲームはもう始まっています');
  });

  test('ない部屋コードはエラーになる', async ({ context }) => {
    const guest = await openTab(context);
    await joinRoom(guest.page, 'アキ', '9876');
    await expect(guest.page.getByRole('alert')).toContainText('部屋 9876 が見つかりません');
  });

  test('ホストが部屋を出たら、友達に知らせてタイトルへ戻れる', async ({ context }) => {
    const { host, guest } = await startTwo(context);
    const h = host.page;
    await h.getByRole('button', { name: '設定' }).click();
    h.once('dialog', (d) => d.accept());
    await h.getByRole('button', { name: '部屋を出る' }).click();
    await expect(h.getByRole('button', { name: '部屋を作る' })).toBeVisible();

    const g = guest.page;
    await expect(g.getByText('ホストが部屋を閉じました')).toBeVisible();
    await g.getByRole('button', { name: 'タイトルへ' }).click();
    await expect(g.getByRole('button', { name: '部屋に入る' })).toBeVisible();
  });

  test('ホストが選んだバージョン（港の拡張）が友達にも伝わり、そのルールで始まる', async ({ context }) => {
    const host = await openTab(context, { fixedRandom: 0 });
    const guest = await openTab(context);
    const h = host.page;
    const g = guest.page;
    await createRoom(h);
    await joinRoom(g, 'アキ');
    await expect(h.getByTestId('members')).toContainText('アキ');
    await h.getByRole('radio', { name: '⚓ 港の拡張' }).click();
    await expect(g.getByTestId('room-options')).toHaveText('バージョン：港の拡張・市場10種類');
    await h.getByRole('radio', { name: '全種類' }).click();
    await expect(g.getByTestId('room-options')).toHaveText('バージョン：港の拡張・市場全種類');
    await h.getByRole('button', { name: '2人' }).click();
    await h.getByRole('button', { name: 'スタート' }).click();
    await expect(g.locator('.my-bar [data-landmark="airport"]')).toBeVisible();
    await expect(h.locator('.my-bar [data-landmark="harbor"]')).toBeVisible();
    await expect(g.locator('.market [data-card="sushi"]')).toBeVisible();
    expect(host.errors).toEqual([]);
    expect(guest.errors).toEqual([]);
  });

  test('招待リンクで開くと部屋コードが入っている', async ({ context }) => {
    const guest = await openTab(context, { query: '&room=4321' });
    await expect(guest.page.getByLabel('部屋コード')).toHaveValue('4321');
    await expect(guest.page).not.toHaveURL(/room=/);
  });
});
