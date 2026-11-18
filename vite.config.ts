import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { assetManifest } from './build/assetManifest';

export default defineConfig({
  base: '/saikoro-town/',
  plugins: [react(), assetManifest()],
  test: {
    include: ['src/**/*.test.ts', 'build/**/*.test.ts'],
  },
});
