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
    expect(snapshot.actors.length).toBe(2);
  });
});

describe('narration logging', () => {
  const catalog = loadDefaultCatalog();

  it('logs narration only once per block', () => {
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
@NARRATION duration=2
测试旁白只记一次。
@END_SCRIPT`;
    const ast = parseScript(source);
    const ir = compileScript(ast);
    const runtime = new Runtime(catalog);
    runtime.load(ir);
    runtime.runToCompletion();
    const narrationEvents = runtime.getEvents().filter((e) => e.type === 'narration');
    expect(narrationEvents).toHaveLength(1);
    expect(narrationEvents[0].detail.text).toBe('测试旁白只记一次。');
  });
});

describe('simple-walk.mira', () => {
  const catalog = loadDefaultCatalog();
  const simplePath = join(here, '../../../examples/simple-walk.mira');
  const simpleSource = readFileSync(simplePath, 'utf8');

  it('passes linter and runs', () => {
    const ast = parseScript(simpleSource);
    const report = lintScript(ast, catalog);
    expect(report.passed, JSON.stringify(report.errors)).toBe(true);
    const runtime = new Runtime(catalog);
    runtime.load(compileScript(ast));
    const snapshot = runtime.runToCompletion();
    expect(snapshot.error).toBeUndefined();
    expect(snapshot.completed).toBe(true);
  });
});

describe('movement and props', () => {
  const catalog = loadDefaultCatalog();

  it('computes move duration from speed when duration omitted', () => {
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
@ENTER actor=mira at=(10, 8)
@MOVE_TO actor=mira to=(16, 8)
@END_SCRIPT`;
    const ast = parseScript(source);
    const runtime = new Runtime(catalog);
    runtime.load(compileScript(ast));
    const events: number[] = [];
    for (let i = 0; i < 600; i++) {
      const snap = runtime.tick();
      if (snap.actors[0]?.state === 'WALKING') events.push(snap.T);
      if (snap.completed) break;
    }
    const walkTime = events.length / 60;
    expect(walkTime).toBeGreaterThan(2);
    expect(walkTime).toBeLessThan(4.5);
  });

  it('attaches prop to actor and follows movement', () => {
    const source = `---
title: t
theme: x
synopsis: 一二三四五六七八九十十一十二十三十四十五
dsl_version: "1.0"
catalog_version: "1.0.0"
cast: [old_chen]
scenes: [plaza]
duration_estimate: 30
---
@BEGIN
@SCENE id=plaza
@ENTER actor=old_chen at=(10, 5)
@SPAWN_PROP prop=umbrella id=u1 attach=old_chen offset=(0.4, 0) state=open
@MOVE_TO actor=old_chen to=(16, 5)
@END_SCRIPT`;
    const ast = parseScript(source);
    const runtime = new Runtime(catalog);
    runtime.load(compileScript(ast));
    const snapshot = runtime.runToCompletion();
    const umbrella = snapshot.props.find((p) => p.id === 'u1');
    const chen = snapshot.actors.find((a) => a.id === 'old_chen');
    expect(umbrella?.attach).toBe('old_chen');
    expect(umbrella?.offsetX).toBeCloseTo(0.4);
    expect(umbrella?.x).toBeCloseTo((chen?.x ?? 0) + 0.4, 1);
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

  it('warns when MOVE_TO has both speed and duration', () => {
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
@ENTER actor=mira at=(10, 8)
@MOVE_TO actor=mira to=(12, 8) speed=2 duration=3
@END_SCRIPT`;
    const ast = parseScript(source);
    const report = lintScript(ast, catalog);
    expect(report.warnings.some((e) => e.code === 'W_SPEED_DURATION_CONFLICT')).toBe(true);
  });
});

describe('walkways', () => {
  const catalog = loadDefaultCatalog();

  it('moves actor along walkway path', () => {
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
@ENTER actor=mira at=(10, 5.85)
@MOVE_TO actor=mira to_path=plaza_rain_path x=21
@END_SCRIPT`;
    const ast = parseScript(source);
    const runtime = new Runtime(catalog);
    runtime.load(compileScript(ast));
    const snapshot = runtime.runToCompletion();
    const mira = snapshot.actors.find((a) => a.id === 'mira');
    expect(mira?.x).toBeCloseTo(21, 1);
    expect(mira?.y).toBeCloseTo(5.85, 2);
  });

  it('toggles walkway visibility via SET_WALKWAY', () => {
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
@SET_WALKWAY id=plaza_rain_path visible=false
@END_SCRIPT`;
    const ast = parseScript(source);
    const runtime = new Runtime(catalog);
    runtime.load(compileScript(ast));
    const snapshot = runtime.runToCompletion();
    const path = snapshot.walkways.find((w) => w.id === 'plaza_rain_path');
    expect(path?.visible).toBe(false);
  });
});
