import { compileScript } from './compiler.js';
import { loadEmbeddedCatalog } from './catalog.js';
import { lintScript } from './linter.js';
import { parseScript, ParseError } from './parser.js';
import { Runtime } from './runtime.js';
import type { RuntimeEvent } from './types.js';

export * from './types.js';
export * from './catalog.js';
export * from './parser.js';
export * from './linter.js';
export * from './compiler.js';
export * from './runtime.js';

export function processScript(source: string) {
  const catalog = loadEmbeddedCatalog();
  const ast = parseScript(source);
  const lint = lintScript(ast, catalog);
  if (!lint.passed) {
    return { ast, lint, catalog, ir: null, events: [] as RuntimeEvent[], finalSnapshot: null };
  }
  const ir = compileScript(ast);
  const runtime = new Runtime(catalog);
  runtime.load(ir);
  const finalSnapshot = runtime.runToCompletion();
  return {
    ast,
    lint,
    catalog,
    ir,
    events: runtime.getEvents(),
    finalSnapshot,
  };
}
