import { expect, test } from '@playwright/test';
import { makeState, myBar, open, phase } from './helpers';

const SEATS = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
  { name: 'ミナト', isHuman: false },
  { name: 'ソラ', isHuman: false },
];

test.describe('市場の残り枚数', () => {
  test('カードに残り枚数が出て、建てると1枚減る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.getByTestId('stock-ranch')).toHaveText('残り6');
    await expect(page.getByTestId('stock-tv')).toHaveText('残り4'); // 紫は人数ぶん
    await page.locator('.market [data-card="ranch"]').click();
    await page.getByRole('button', { name: '1c で建てる' }).click();
    // CPU の番になっても市場は見えている
    await expect(page.getByTestId('stock-ranch')).toHaveText('残り5');
  });

  test('残り2枚以下は目立つ色、0枚は「売り切れ」', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.supply.mine = 0;
      s.supply.cafe = 2;
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.getByTestId('stock-mine')).toHaveText('売り切れ');
    await expect(page.getByTestId('stock-mine')).toHaveClass(/out/);
    await expect(page.getByTestId('stock-cafe')).toHaveClass(/low/);
    await expect(page.getByTestId('stock-wheat')).not.toHaveClass(/low|out/);
  });
});

test.describe('サイコロ', () => {
  test('立体のサイコロが投げ込まれて、出た目で止まる', async ({ page }) => {
    const save = makeState(SEATS, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.75, save }); // サイコロは 5
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    const die = page.locator('.die');
    await expect(die).toHaveClass(/rolling/);
    expect(await die.evaluate((e) => getComputedStyle(e).animationName)).toBe('throw');
    await expect(die.locator('.face')).toHaveCount(6);
    await expect(die).not.toHaveClass(/rolling/);
    await expect(die).toHaveAttribute('data-value', '5');
    await expect(page.getByTestId('dice-total')).toHaveText('5');
    // 止まったあと、5 の面が手前（画面の中心に一番近い面）を向いている
    const front = await die.evaluate((d) => {
      const faces = [...d.querySelectorAll('.face')] as HTMLElement[];
      // 手前を向いている面は、大きさがほぼ元のまま（横から見える面はつぶれている）
      return faces
        .map((f) => ({ n: f.className.match(/f(\d)/)![1], w: f.getBoundingClientRect().width }))
        .sort((a, b) => b.w - a.w)[0].n;
    });
    expect(front).toBe('5');
  });

  test('サイコロが止まったら、次へ進む前に合計を読む間がある', async ({ page }) => {
    const save = makeState(SEATS, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.75, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    // サイコロのコマがまだ続いている（rolling）うちに、合計がはっきり見えている
    const seen = await page.waitForFunction(
      () => {
        const die = document.querySelector('.die');
        const pop = document.querySelector('.total-pop');
        if (!die?.classList.contains('rolling') || !pop) return false;
        return getComputedStyle(pop).opacity === '1' ? pop.textContent : false;
      },
      null,
      { polling: 'raf', timeout: 5000 },
    );
    expect(await seen.jsonValue()).toBe('5');
  });

  test('2個振りのゾロ目には「ゾロ目」の札が出る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.players[0].landmarks.station = true;
    });
    await open(page, { speed: 'none', fixedRandom: 0.2, save }); // 2 と 2
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '2個振る' }).click();
    await expect(page.getByTestId('dice-total')).toContainText('4');
    await expect(page.getByTestId('dice-total')).toContainText('ゾロ目');
  });
});

test.describe('演出', () => {
  test('ランドマーク完成でお祝いの演出が出る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.players[0].coins = 4;
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'normal', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await myBar(page).locator('[data-landmark="station"]').click();
    await page.getByRole('button', { name: '4c で建てる' }).click();
    const burst = page.locator('.landmark-burst');
    await expect(burst).toBeVisible();
    await expect(burst).toContainText('駅');
    await expect(burst).toContainText('あなたが完成！');
    await expect(burst).toBeHidden({ timeout: 4000 });
  });

  test('建てたカードが市場から飛んでいき、コインが届くと輪が広がる', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'normal', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.locator('.market [data-card="wheat"]').click();
    await page.getByRole('button', { name: '1c で建てる' }).click();
    await expect(page.locator('.fly-card-face')).toBeAttached();
    await expect(page.locator('.fly-card-face .card-emoji')).toHaveText('🌾');
    await expect(page.locator('.fly-coin-face').first()).toBeAttached();
  });

  test('自分の番が来ると金色の帯が出る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = 3; // ソラ（CPU）の番から
    });
    await open(page, { speed: 'normal', fixedRandom: 0.75, save, cpuDelay: 50 });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.locator('.banner.mine')).toContainText('あなたの番！', { timeout: 15_000 });
    await expect(phase(page)).toContainText('サイコロ');
  });

  test('CPU の手番でも、発動したカードの絵が持ち主の上に出る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = 1; // ハル（CPU）の番。サイコロは 2 → ハルのパン屋が発動
    });
    await open(page, { speed: 'normal', fixedRandom: 0.2, save, cpuDelay: 50 });
    await page.getByRole('button', { name: '続きから' }).click();
    const bubble = page.getByTestId('trigger-bubble').first();
    await bubble.waitFor({ state: 'attached', timeout: 10_000 });
    expect(await bubble.locator('.card-emoji').textContent()).toBe('🍞');
    // 収入の行にもカードの絵が出る
    await expect(page.locator('.dice-result li .card-emoji').first()).toHaveText('🍞');
  });

  test('再生中は、いま何が起きているかがサイコロ欄に出る', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = 1; // ハル（CPU）の番
    });
    await open(page, { speed: 'normal', fixedRandom: 0.2, save, cpuDelay: 50 });
    await page.getByRole('button', { name: '続きから' }).click();
    const caption = page.getByTestId('caption');
    await caption.filter({ hasText: 'ハルがサイコロを振った' }).waitFor({ timeout: 10_000 });
    await caption.filter({ hasText: 'ハルのパン屋が発動！' }).waitFor({ timeout: 10_000 });
  });

  test('CPU が考えている間は「考え中」と点が跳ね、サイコロが揺れる', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = 1; // ハル（CPU）の番
    });
    await open(page, { speed: 'normal', save, cpuDelay: null });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.getByTestId('thinking')).toContainText('ハルが考え中');
    await expect(page.locator('.dice-panel.thinking')).toBeVisible();
    expect(await page.locator('.dots i').first().evaluate((e) => getComputedStyle(e).animationName)).toBe('dot-hop');
  });

  test('CPU は建てる前に、市場のカードを指し示す', async ({ page }) => {
    const save = makeState(SEATS, (s) => {
      s.current = 1; // ハル（CPU）の建設フェーズ。3コインでは施設しか建てられない
      s.phase = 'build';
      s.dice = [5];
      s.players[1].coins = 3;
    });
    await open(page, { speed: 'normal', save, cpuDelay: null });
    await page.getByRole('button', { name: '続きから' }).click();
    const pick = page.getByTestId('cpu-pick');
    await pick.waitFor({ timeout: 10_000 });
    await expect(pick).toHaveText('ハルが選んだ！');
    await expect(page.locator('.card.cpu-pick')).toHaveCount(1);
    await expect(page.getByTestId('caption')).toContainText('を建てる！');
    // そのあと実際に建てて、指し示しは消える
    await expect(page.locator('.card.cpu-pick')).toHaveCount(0, { timeout: 5000 });
  });

  test('設定「なし」では飾りの動きも止まる', async ({ page }) => {
    const save = makeState(SEATS, () => {});
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    const btn = page.getByRole('button', { name: '1個振る' });
    expect(await btn.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
  });
});
