/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// `--mode pages` builds for GitHub Pages, served from /daedalus/; dev, build
// and preview otherwise serve from the root. Routing is in the hash, so the
// subpath needs nothing beyond the asset base.
export default defineConfig(({ mode }) => ({
  base: mode === 'pages' ? '/daedalus/' : '/',
  plugins: [react()],
  server: { port: 5701, strictPort: true },
  preview: { port: 6701, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts', 'test/**/*.test.ts'],
  },
}));
