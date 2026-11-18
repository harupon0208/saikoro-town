import manifest from 'virtual:assets';

const base = import.meta.env.BASE_URL;

/** カード絵の URL。画像がなければ undefined（そのときは絵文字を出す） */
export function cardImageUrl(id: string): string | undefined {
  const file = manifest.cards[id];
  return file ? `${base}cards/${file}` : undefined;
}

/** テーマ画像（background / logo / dice-1〜6）の URL */
export function themeImageUrl(name: string): string | undefined {
  const file = manifest.theme[name];
  return file ? `${base}theme/${file}` : undefined;
}
