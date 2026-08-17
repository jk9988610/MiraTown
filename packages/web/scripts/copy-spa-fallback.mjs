import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(import.meta.dirname, '../dist');
const index = join(dist, 'index.html');
const fallback = join(dist, '404.html');

if (!existsSync(index)) {
  console.error('copy-spa-fallback: dist/index.html not found');
  process.exit(1);
}

copyFileSync(index, fallback);
console.log('copy-spa-fallback: wrote dist/404.html for GitHub Pages SPA routing');
