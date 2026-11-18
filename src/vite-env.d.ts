/// <reference types="vite/client" />

declare module 'virtual:assets' {
  const manifest: {
    /** カードID → public/cards/ のファイル名 */
    cards: Record<string, string>;
    /** 名前（background, logo, dice-1 …）→ public/theme/ のファイル名 */
    theme: Record<string, string>;
  };
  export default manifest;
}
