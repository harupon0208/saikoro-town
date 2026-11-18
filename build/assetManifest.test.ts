import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildManifest, scanImages } from './assetManifest';

let tmp: string;
function makeDir(files: Record<string, string[]>): string {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saikoro-assets-'));
  for (const [sub, names] of Object.entries(files)) {
    fs.mkdirSync(path.join(tmp, sub), { recursive: true });
    for (const n of names) fs.writeFileSync(path.join(tmp, sub, n), '');
  }
  return tmp;
}
afterEach(() => tmp && fs.rmSync(tmp, { recursive: true, force: true }));

describe('画像の一覧', () => {
  it('画像だけを拾い、拡張子なしの名前で引ける', () => {
    const dir = makeDir({ cards: ['wheat.png', 'ranch.svg', '.gitkeep', 'memo.txt'] });
    expect(scanImages(path.join(dir, 'cards'))).toEqual({ wheat: 'wheat.png', ranch: 'ranch.svg' });
  });

  it('同じ名前が複数あれば png → webp → svg の順で優先', () => {
    const dir = makeDir({ cards: ['wheat.svg', 'wheat.webp', 'wheat.png'] });
    expect(scanImages(path.join(dir, 'cards')).wheat).toBe('wheat.png');
  });

  it('大文字の拡張子も拾う', () => {
    const dir = makeDir({ cards: ['mine.PNG'] });
    expect(scanImages(path.join(dir, 'cards'))).toEqual({ mine: 'mine.PNG' });
  });

  it('フォルダがなくてもエラーにならず空になる', () => {
    const dir = makeDir({});
    expect(buildManifest(dir)).toEqual({ cards: {}, theme: {} });
  });

  it('cards と theme を別々に集める', () => {
    const dir = makeDir({ cards: ['tv.webp'], theme: ['logo.png', 'dice-1.svg'] });
    expect(buildManifest(dir)).toEqual({
      cards: { tv: 'tv.webp' },
      theme: { logo: 'logo.png', 'dice-1': 'dice-1.svg' },
    });
  });
});
