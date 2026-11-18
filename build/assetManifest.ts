// public/cards と public/theme に置かれた画像の一覧を、仮想モジュール 'virtual:assets' として渡す Vite プラグイン。
// 画像があるかどうかをビルド時に知っておくことで、ない画像を読みに行って 404 を出さずに済む。
import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

export const IMAGE_EXTS = ['.png', '.webp', '.svg', '.jpg', '.jpeg'];
const VIRTUAL_ID = 'virtual:assets';
const RESOLVED_ID = '\0' + VIRTUAL_ID;

export interface AssetManifest {
  /** 名前（拡張子なし）→ ファイル名。例: { wheat: 'wheat.png' } */
  cards: Record<string, string>;
  theme: Record<string, string>;
}

/** フォルダの画像を「名前 → ファイル名」にする。同じ名前が複数あれば IMAGE_EXTS の順で優先 */
export function scanImages(dir: string): Record<string, string> {
  let files: string[];
  try {
    files = fs.readdirSync(dir);
  } catch {
    return {};
  }
  const result: Record<string, string> = {};
  for (const ext of IMAGE_EXTS) {
    for (const file of files) {
      if (path.extname(file).toLowerCase() !== ext) continue;
      const name = path.basename(file, path.extname(file));
      if (!(name in result)) result[name] = file;
    }
  }
  return result;
}

export function buildManifest(publicDir: string): AssetManifest {
  return {
    cards: scanImages(path.join(publicDir, 'cards')),
    theme: scanImages(path.join(publicDir, 'theme')),
  };
}

export function assetManifest(): Plugin {
  let publicDir = 'public';
  return {
    name: 'saikoro-asset-manifest',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : undefined;
    },
    load(id) {
      if (id !== RESOLVED_ID) return undefined;
      return `export default ${JSON.stringify(buildManifest(publicDir))};`;
    },
    configureServer(server) {
      // 開発中に画像を足したり消したりしたら、一覧を作り直して再読み込みする
      const onChange = (file: string) => {
        const rel = path.relative(publicDir, file);
        if (!/^(cards|theme)[\\/]/.test(rel)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      server.watcher.add(publicDir);
      server.watcher.on('add', onChange);
      server.watcher.on('unlink', onChange);
    },
  };
}
