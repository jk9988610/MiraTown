import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
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
