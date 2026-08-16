import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const isPages = process.env.GITHUB_PAGES === 'true';

export default defineConfig({
  base: isPages ? '/MiraTown/' : '/',
  plugins: [react()],
  resolve: {
    alias: {
      '@miratown/core': resolve(__dirname, '../core/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    fs: { allow: ['../..'] },
  },
});
