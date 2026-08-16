import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lintScript, parseScript } from '../index.js';
import { loadDefaultCatalog } from '../catalog-node.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = join(here, '../../../../examples/minimal-play.mira');
const source = readFileSync(examplePath, 'utf8');
const catalog = loadDefaultCatalog();
const ast = parseScript(source);
const report = lintScript(ast, catalog);

console.log('Lint minimal-play.mira:', report.passed ? 'PASS' : 'FAIL');
for (const issue of [...report.errors, ...report.warnings]) {
  console.log(`  [${issue.level}] ${issue.code} @L${issue.line}: ${issue.message}`);
}
process.exit(report.passed ? 0 : 1);
