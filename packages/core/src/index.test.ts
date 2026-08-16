import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compileScript, lintScript, parseScript, Runtime } from './index.js';
import { loadDefaultCatalog } from './catalog-node.js';

const here = dirname(fileURLToPath(import.meta.url));
const examplePath = join(here, '../../../examples/minimal-play.mira');
const exampleSource = readFileSync(examplePath, 'utf8');

describe('minimal-play.mira', () => {
  const catalog = loadDefaultCatalog();

  it('parses front matter and body', () => {
    const ast = parseScript(exampleSource);
    expect(ast.frontMatter.title).toBe('雨夜的告白');
    expect(ast.body.length).toBeGreaterThan(5);
  });

  it('passes linter', () => {
    const ast = parseScript(exampleSource);
    const report = lintScript(ast, catalog);
    expect(report.passed, JSON.stringify(report.errors)).toBe(true);
  });

  it('runs headless to completion', () => {
    const ast = parseScript(exampleSource);
    const ir = compileScript(ast);
    const runtime = new Runtime(catalog);
    runtime.load(ir);
    const snapshot = runtime.runToCompletion();
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.completed).toBe(true);
    expect(snapshot.actors.length).toBe(0);
  });
});

describe('linter rules', () => {
  const catalog = loadDefaultCatalog();

  it('rejects letter spawn', () => {
    const source = `---
title: t
theme: x
synopsis: 一二三四五六七八九十十一十二十三十四十五
dsl_version: "1.0"
catalog_version: "1.0.0"
cast: [mira]
scenes: [plaza]
duration_estimate: 30
---
@BEGIN
@SCENE id=plaza
@SPAWN_PROP prop=letter at=(1,1)
@END_SCRIPT`;
    const ast = parseScript(source);
    const report = lintScript(ast, catalog);
    expect(report.errors.some((e) => e.code === 'E_PROP_NOT_PLACEABLE')).toBe(true);
  });
});
