import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { assetManifest } from './build/assetManifest';

export default defineConfig({
  base: '/saikoro-town/',
  plugins: [react(), assetManifest()],
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
    // CPU 同士で何十ゲームも回すテストがあるので、遅い CI でも切れないよう長めに
    testTimeout: 30_000,
  },
});
