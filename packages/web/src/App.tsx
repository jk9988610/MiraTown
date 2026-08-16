import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ParseError,
  compileScript,
  lintScript,
  loadEmbeddedCatalog,
  parseScript,
  Runtime,
  type LintReport,
  type RuntimeEvent,
  type RuntimeSnapshot,
} from '@miratown/core';
import { StageView } from './components/StageView';
import { CopyButton, dedupeEvents, formatEvents, formatLintReport } from './components/CopyButton';
import simpleWalkExample from './examples/simple-walk.mira?raw';
import duoWalkExample from './examples/duo-walk.mira?raw';
import minimalPlayExample from './examples/minimal-play.mira?raw';

type Stage = 'idle' | 'linting' | 'playing' | 'done' | 'error';
type ExampleId = 'simple' | 'duo' | 'full';

const EXAMPLES: Record<ExampleId, { label: string; source: string }> = {
  simple: { label: '入门：单人行走', source: simpleWalkExample },
  duo: { label: '入门：双人同行', source: duoWalkExample },
  full: { label: '完整：雨夜告白', source: minimalPlayExample },
};

export function App() {
  const [source, setSource] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [lintReport, setLintReport] = useState<LintReport | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [exampleId, setExampleId] = useState<ExampleId>('simple');
  const runtimeRef = useRef<Runtime | null>(null);
  const rafRef = useRef<number>(0);

  const catalog = useMemo(() => loadEmbeddedCatalog(), []);

  const loadExample = useCallback((id: ExampleId = exampleId) => {
    setSource(EXAMPLES[id].source);
    setExampleId(id);
    setLintReport(null);
    setEvents([]);
    setSnapshot(null);
    setParseError(null);
    setStage('idle');
  }, [exampleId]);

  useEffect(() => {
    setSource(EXAMPLES.simple.source);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const runLint = useCallback(() => {
    setStage('linting');
    setParseError(null);
    try {
      const ast = parseScript(source);
      const report = lintScript(ast, catalog);
      setLintReport(report);
      setStage(report.passed ? 'idle' : 'error');
      return report.passed ? ast : null;
    } catch (e) {
      const msg = e instanceof ParseError ? `L${e.line}: ${e.message}` : String(e);
      setParseError(msg);
      setStage('error');
      return null;
    }
  }, [source, catalog]);

  const runPlay = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const ast = runLint();
    if (!ast) return;

    setStage('playing');
    setEvents([]);
    const ir = compileScript(ast);
    const runtime = new Runtime(catalog);
    runtime.load(ir);
    runtimeRef.current = runtime;
    const primed = runtime.primeToFirstActor();
    setSnapshot({ ...primed, actors: [...primed.actors], props: [...primed.props] });

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      const snap = runtime.tick(dt);
      setSnapshot({ ...snap, actors: [...snap.actors], props: [...snap.props] });
      if (!snap.completed && !snap.error) {
        rafRef.current = requestAnimationFrame(loop);
      } else {
        setEvents(runtime.getEvents());
        setStage(snap.error ? 'error' : 'done');
        runtimeRef.current = null;
      }
    };
    rafRef.current = requestAnimationFrame(loop);
  }, [runLint, catalog]);

  const lintCopyText = lintReport
    ? formatLintReport(lintReport.passed, lintReport.errors, lintReport.warnings)
    : '';

  const debugCopyText = [
    `状态: ${stage}`,
    parseError ? `解析错误: ${parseError}` : '',
    lintCopyText,
    snapshot?.error
      ? `运行时错误: ${snapshot.error.code} L${snapshot.error.line}: ${snapshot.error.message}`
      : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const displayEvents = useMemo(() => dedupeEvents(events), [events]);

  return (
    <div className="app">
      <header>
        <h1>米拉小镇 MiraTown</h1>
        <p className="subtitle">加载剧本 → 校验 → PixiJS 演绎（1280×720）</p>
        <div className="actions">
          {(Object.entries(EXAMPLES) as [ExampleId, { label: string }][]).map(([id, ex]) => (
            <button
              key={id}
              type="button"
              className={exampleId === id ? 'active-example' : ''}
              onClick={() => loadExample(id)}
            >
              {ex.label}
            </button>
          ))}
          <button type="button" onClick={runLint}>校验</button>
          <button type="button" className="primary" onClick={runPlay}>播放</button>
        </div>
      </header>

      <section className="player-section">
        <h2>演绎舞台</h2>
        <StageView snapshot={snapshot} />
      </section>

      <div className="grid">
        <section>
          <h2>剧本文本 (.mira)</h2>
          <textarea
            value={source}
            onChange={(e) => setSource(e.target.value)}
            spellCheck={false}
          />
        </section>

        <section>
          <div className="section-head">
            <h2>状态</h2>
            {(parseError || lintReport || snapshot?.error) && (
              <CopyButton text={debugCopyText} label="复制调试信息" />
            )}
          </div>
          <div className={`status status-${stage}`}>
            {stage === 'idle' && '就绪'}
            {stage === 'linting' && '正在校验…'}
            {stage === 'playing' && '正在排演…'}
            {stage === 'done' && '演绎完成'}
            {stage === 'error' && '出错'}
          </div>

          {parseError && (
            <div className="debug-block">
              <div className="debug-block-head">
                <span>解析错误</span>
                <CopyButton text={parseError} />
              </div>
              <pre className="error-box">{parseError}</pre>
            </div>
          )}

          {lintReport && (
            <div className="lint debug-block">
              <div className="debug-block-head">
                <h3>校验 {lintReport.passed ? '✓ 通过' : '✗ 失败'}</h3>
                <CopyButton text={lintCopyText} label="复制校验结果" />
              </div>
              {[...lintReport.errors, ...lintReport.warnings].map((issue, i) => (
                <div key={i} className={issue.level}>
                  <code>{issue.code}</code> L{issue.line}: {issue.message}
                </div>
              ))}
            </div>
          )}

          {snapshot?.error && (
            <div className="debug-block">
              <div className="debug-block-head">
                <span>运行时错误</span>
                <CopyButton
                  text={`${snapshot.error.code} L${snapshot.error.line}: ${snapshot.error.message}`}
                />
              </div>
              <pre className="error-box">
                {snapshot.error.code} L{snapshot.error.line}: {snapshot.error.message}
              </pre>
            </div>
          )}
        </section>
      </div>

      <section className="events">
        <div className="section-head">
          <h2>事件日志 ({displayEvents.length}{events.length !== displayEvents.length ? ` / ${events.length} 原始` : ''})</h2>
          {events.length > 0 && <CopyButton text={formatEvents(events)} label="复制日志" />}
        </div>
        <p className="events-hint">仅供调试：记录场景切换、角色进出、对话句等关键节点，连续重复已折叠。</p>
        <div className="event-list">
          {displayEvents.map((ev, i) => (
            <div key={i} className="event">
              <span className="t">T={ev.T.toFixed(2)}</span>
              <span className="type">
                {ev.type}
                {ev.count > 1 && <span className="event-count"> ×{ev.count}</span>}
              </span>
              <span className="detail">{JSON.stringify(ev.detail)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
