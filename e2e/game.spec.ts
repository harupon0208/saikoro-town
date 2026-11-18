import { expect, test } from '@playwright/test';
import { SAVE_KEY } from '../src/game/save';
import { makeState, myBar, open, phase, start } from './helpers';

const HUMAN_VS_3 = [
  { name: 'あなた', isHuman: true },
  { name: 'ハル', isHuman: false },
  { name: 'ミナト', isHuman: false },
  { name: 'ソラ', isHuman: false },
];

test.describe('通しで遊ぶ', () => {
  test('CPU 3人を相手に最後まで遊べて、勝者が出る', async ({ page }) => {
    test.setTimeout(180_000);
    const { errors } = await open(page, { speed: 'none', seed: 42 });
    await start(page);

    const gameOver = page.getByRole('heading', { name: /の勝ち！/ });
    for (let i = 0; i < 2000; i++) {
      if (await gameOver.isVisible()) break;
      const two = page.getByRole('button', { name: '2個振る' });
      const one = page.getByRole('button', { name: '1個振る' });
      const keep = page.getByRole('button', { name: 'この目で進む' });
      const none = page.getByRole('button', { name: '何も買わない' });
      const tvChoice = page.locator('.sheet .choice-list .btn').first();
      const skipSwap = page.getByRole('button', { name: '交換しない' });

      if (await two.isVisible()) await two.click();
      else if (await one.isVisible()) await one.click();
      else if (await keep.isVisible()) await keep.click();
      else if (await skipSwap.isVisible()) await skipSwap.click();
      else if (await page.getByRole('heading', { name: 'テレビ局' }).isVisible()) await tvChoice.click();
      else if (await none.isVisible()) {
        // 買えるランドマークがあれば建てる。なければ何も買わない
        const lm = myBar(page).locator('.lm-tile.buyable').first();
        if (await lm.isVisible()) {
          await lm.click();
          await page.getByRole('button', { name: /c で建てる/ }).click();
        } else {
          await none.click();
        }
      } else {
        await page.waitForTimeout(20); // CPU の番
      }
    }

    await expect(gameOver).toBeVisible();
    // 勝者はランドマークを4つ持っている
    const rows = page.locator('.gameover li');
    await expect(rows).toHaveCount(4);
    await expect(rows.first().locator('.lm-dots span.on')).toHaveCount(4);
    // 終わったら保存は消える
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBeNull();
    // 「新しいゲーム」で開始画面へ
    await page.getByRole('button', { name: '新しいゲーム' }).click();
    await expect(page.getByRole('button', { name: 'スタート' })).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('人間2人だと手番の最初に「〇〇さんの番です」が出る', async ({ page }) => {
    await open(page, { speed: 'none', seed: 3 });
    await start(page, [
      { name: 'アオ', isHuman: true },
      { name: 'ベニ', isHuman: true },
    ]);
    const handoff = page.getByText(/さんの番です/);
    await expect(handoff).toBeVisible();
    const who = (await handoff.textContent())!.replace('さんの番です', '');
    await handoff.click();
    await expect(handoff).toBeHidden();
    await page.getByRole('button', { name: '1個振る' }).click();
    await page.getByRole('button', { name: '何も買わない' }).click();
    // 次の人の番でまた出る
    await expect(page.getByText(/さんの番です/)).toBeVisible();
    await expect(page.getByText(/さんの番です/)).not.toHaveText(`${who}さんの番です`);
  });
});

test.describe('途中保存', () => {
  test('再読み込みすると「続きから」で同じ状態に戻る', async ({ page }) => {
    await open(page, { speed: 'none', fixedRandom: 0.2 }); // サイコロは毎回 2
    await start(page);
    // あなたの番が来るまで待つ（CPU が先のこともある）
    await expect(page.getByRole('button', { name: '1個振る' })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(phase(page)).toContainText('建設');
    const coins = await myBar(page).locator('.coins-wrap').textContent();
    const turn = await phase(page).textContent();

    await page.reload();
    await expect(page.getByText('前回のゲームが保存されています。')).toBeVisible();
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(phase(page)).toHaveText(turn!);
    await expect(myBar(page).locator('.coins-wrap')).toHaveText(coins!);
    await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible();
  });

  test('「新しく始める」は確認してから保存を消す', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'none', save });
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: '新しく始める' }).click();
    await expect(page.getByRole('button', { name: '続きから' })).toBeVisible(); // キャンセルしたら残る

    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: '新しく始める' }).click();
    await expect(page.getByRole('button', { name: 'スタート' })).toBeVisible();
    expect(await page.evaluate((k) => localStorage.getItem(k), SAVE_KEY)).toBeNull();
  });
});

test.describe('建設', () => {
  test('カードをタップして詳細から建てると、自分の街に増えてコインが減る', async ({ page, isMobile }) => {
    const save = makeState(HUMAN_VS_3, (s) => {
      s.players[0].coins = 5;
    });
    await open(page, { speed: 'none', fixedRandom: 0.75, save }); // サイコロは 5（収入なし）
    await page.getByRole('button', { name: '続きから' }).click();

    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(phase(page)).toContainText('建設');
    await page.locator('.market [data-card="ranch"]').click();
    await expect(page.getByRole('dialog')).toContainText('牧場');
    await page.getByRole('button', { name: '1c で建てる' }).click();
    await expect(page.getByRole('dialog')).toBeHidden();

    if (isMobile) await page.getByRole('button', { name: '自分の街' }).click();
    await expect(page.locator('.town [data-card="ranch"]')).toContainText('×1');
    await expect(myBar(page).locator('.coins-wrap')).toHaveText('4');
  });

  test('お金が足りないカードは薄く表示され、詳細では理由が出て押せない', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, (s) => {
      s.players[0].coins = 2;
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    const mine = page.locator('.market [data-card="mine"]');
    await expect(mine).toHaveClass(/dim/);
    await expect(page.locator('.market [data-card="wheat"]')).not.toHaveClass(/dim/);
    await mine.click();
    const btn = page.getByRole('dialog').getByRole('button', { name: /コインが足りません/ });
    await expect(btn).toBeDisabled();
  });

  test('ランドマークを建てると金色になる', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, (s) => {
      s.players[0].coins = 4;
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'normal', save });
    await page.getByRole('button', { name: '続きから' }).click();
    const station = myBar(page).locator('[data-landmark="station"]');
    await expect(station).toHaveClass(/buyable/);
    await station.click();
    await page.getByRole('button', { name: '4c で建てる' }).click();
    await expect(station).toHaveClass(/built/);
    await expect(station).toContainText('完成');
  });
});

test.describe('紫カード', () => {
  test('テレビ局：相手を選ぶと5コインもらえる → ビジネスセンター：3ステップで交換できる', async ({
    page,
    isMobile,
  }) => {
    const save = makeState(
      [
        { name: 'あなた', isHuman: true },
        { name: 'ハル', isHuman: false },
        { name: 'ミナト', isHuman: false },
      ],
      (s) => {
        s.players[0].cards.tv = 1;
        s.players[0].cards.business = 1;
        s.players[1].coins = 9;
        s.players[2].cards.mine = 1;
      },
    );
    await open(page, { speed: 'none', fixedRandom: 0.9, save }); // サイコロは 6
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();

    // テレビ局
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name: 'テレビ局' })).toBeVisible();
    await sheet.getByRole('button', { name: /ハル/ }).click();
    await expect(myBar(page).locator('.coins-wrap')).toHaveText('8'); // 3 + 5

    // ビジネスセンター
    await expect(sheet.getByRole('heading', { name: 'ビジネスセンター（1/3）' })).toBeVisible();
    await sheet.getByRole('button', { name: 'ミナト' }).click();
    await expect(sheet.getByRole('heading', { name: 'ビジネスセンター（2/3）' })).toBeVisible();
    // 「戻る」で1つ前に戻れる
    await sheet.getByRole('button', { name: '戻る' }).click();
    await expect(sheet.getByRole('heading', { name: 'ビジネスセンター（1/3）' })).toBeVisible();
    await sheet.getByRole('button', { name: 'ミナト' }).click();
    await sheet.getByRole('button', { name: /麦畑/ }).click();
    await expect(sheet.getByRole('heading', { name: 'ビジネスセンター（3/3）' })).toBeVisible();
    await sheet.getByRole('button', { name: /鉱山/ }).click();
    await sheet.getByRole('button', { name: '交換する' }).click();
    await expect(sheet).toBeHidden();
    await expect(phase(page)).toContainText('建設');

    if (isMobile) await page.getByRole('button', { name: '自分の街' }).click();
    await expect(page.locator('.town [data-card="mine"]')).toBeVisible();
    await expect(page.locator('.town [data-card="wheat"]')).toHaveCount(0);
  });
});

test.describe('アニメーション', () => {
  test('サイコロが転がっている間は操作できず、終わると次の操作が出る', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.2, save }); // サイコロは 2 → パン屋 +1
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();

    await expect(page.locator('.die.rolling')).toHaveCount(1);
    await expect(page.getByRole('button', { name: '何も買わない' })).toHaveCount(0);
    // 収入のコマで「+1」が出る
    // 一瞬しか出ないので、毎フレーム確かめる waitFor で待つ
    const popup = myBar(page).locator('.popup');
    await popup.waitFor({ state: 'attached' });
    expect(await popup.textContent()).toBe('+1');
    await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible();
    await expect(page.locator('.die.rolling')).toHaveCount(0);
    await expect(page.locator('.die')).toHaveAttribute('data-value', '2');
    await expect(myBar(page).locator('.coins-wrap')).toHaveText('4');
  });

  test('再生中に画面をタップすると、その演出を飛ばせる', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.2, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(page.locator('.die.rolling')).toHaveCount(1);
    const t0 = Date.now();
    await page.getByTestId('table').click({ position: { x: 5, y: 200 } });
    await expect(page.locator('.die.rolling')).toHaveCount(0, { timeout: 300 });
    expect(Date.now() - t0).toBeLessThan(700); // 0.8秒待たずに止まった
  });

  test('CPU の手番の帯と、コインが飛ぶ演出が出る', async ({ page }) => {
    await open(page, { speed: 'normal', seed: 7, cpuDelay: 100 });
    await start(page);
    // 自分が先手なら1手番すませて、CPU の番まで進める
    let sawBanner = false;
    let sawCoin = false;
    for (let i = 0; i < 400 && !(sawBanner && sawCoin); i++) {
      sawBanner ||= (await page.locator('.banner').count()) > 0;
      sawCoin ||= (await page.locator('.fly-coin').count()) > 0;
      for (const name of ['1個振る', '何も買わない']) {
        const b = page.getByRole('button', { name });
        if (await b.isVisible()) await b.click();
      }
      await page.waitForTimeout(50);
    }
    expect(sawBanner).toBe(true);
    expect(sawCoin).toBe(true);
  });

  test('設定で「なし」にすると、サイコロはすぐ止まる。設定は再読み込み後も残る', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.2, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '設定' }).click();
    await page.getByRole('radio', { name: 'なし' }).click();
    await page.getByRole('button', { name: '閉じる' }).click();

    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(page.locator('.die.rolling')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible({ timeout: 300 });

    await page.reload();
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '設定' }).click();
    await expect(page.getByRole('radio', { name: 'なし' })).toHaveAttribute('aria-checked', 'true');
  });

  test('「視差効果を減らす」がオンなら、サイコロは揺れず、コインは飛ばない', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'normal', fixedRandom: 0.2, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: '1個振る' }).click();
    // 再生はする（目が出るまでのコマはある）が、動きは止めている
    const die = page.locator('.die.rolling');
    await expect(die).toHaveCount(1);
    expect(await die.evaluate((e) => getComputedStyle(e).animationName)).toBe('none');
    await expect(page.getByRole('button', { name: '何も買わない' })).toBeVisible();
    // コインが飛ぶ層・紙吹雪・キラキラは display:none になる（一瞬で消えるので、CSS の効き方で確かめる）
    const hidden = await page.evaluate(() =>
      ['fly-layer', 'confetti', 'sparkles', 'coin-ring'].map((cls) => {
        const el = document.createElement('div');
        el.className = cls;
        document.body.appendChild(el);
        const d = getComputedStyle(el).display;
        el.remove();
        return d;
      }),
    );
    expect(hidden).toEqual(['none', 'none', 'none', 'none']);
    await expect(myBar(page).locator('.coins-wrap')).toHaveText('4');
  });
});

test.describe('見た目', () => {
  test('カード絵：画像がないカードは絵文字を出し、カードの高さはそろっている', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, (s) => {
      s.phase = 'build';
      s.dice = [5];
    });
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    await expect(page.locator('.market [data-card="wheat"] .card-emoji')).toHaveText('🌾');
    const heights = await page
      .locator('.market .card')
      .evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().height)));
    expect(heights).toHaveLength(15);
    expect(new Set(heights).size).toBe(1);
  });
});

test.describe('スマホ', () => {
  test.beforeEach(({ isMobile }) => test.skip(!isMobile, 'スマホのレイアウトだけ'));

  test('横にはみ出さず、下のタブで切り替えられる', async ({ page }) => {
    await open(page, { speed: 'none', seed: 1, cpuDelay: 600 });
    await start(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    const tabs = page.getByRole('navigation', { name: 'タブ' });
    await tabs.getByRole('button', { name: '自分の街' }).click();
    await expect(page.getByRole('region', { name: 'あなたの街' })).toBeVisible();
    await tabs.getByRole('button', { name: '相手' }).click();
    await expect(page.getByRole('region', { name: '相手' })).toBeVisible();
    await tabs.getByRole('button', { name: 'ログ' }).click();
    await expect(page.getByRole('list', { name: 'ログ' })).toBeVisible();
    await tabs.getByRole('button', { name: '市場' }).click();
    await expect(page.getByRole('region', { name: '市場' })).toBeVisible();
  });

  test('建設フェーズになると自動で市場タブが開く', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'none', fixedRandom: 0.75, save });
    await page.getByRole('button', { name: '続きから' }).click();
    await page.getByRole('button', { name: 'ログ' }).click();
    await expect(page.getByRole('region', { name: '市場' })).toHaveCount(0);
    await page.getByRole('button', { name: '1個振る' }).click();
    await expect(page.getByRole('region', { name: '市場' })).toBeVisible();
  });

  test('ボタンとタブは高さ 44px 以上', async ({ page }) => {
    const save = makeState(HUMAN_VS_3, () => {});
    await open(page, { speed: 'none', save });
    await page.getByRole('button', { name: '続きから' }).click();
    const small = await page
      .locator('.btn, .tabbar button, .lm-tile, .icon-btn')
      .evaluateAll((els) =>
        els
          .filter((e) => (e as HTMLElement).offsetParent !== null)
          .map((e) => [e.textContent, e.getBoundingClientRect().height] as const)
          .filter(([, h]) => h < 44),
      );
    expect(small).toEqual([]);
  });
});
