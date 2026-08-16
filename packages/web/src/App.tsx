import { useCallback, useEffect, useMemo, useState } from 'react';
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

const EXAMPLE_URL = `${import.meta.env.BASE_URL}examples/minimal-play.mira`;

type Stage = 'idle' | 'linting' | 'playing' | 'done' | 'error';

export function App() {
  const [source, setSource] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const [lintReport, setLintReport] = useState<LintReport | null>(null);
  const [events, setEvents] = useState<RuntimeEvent[]>([]);
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const catalog = useMemo(() => loadEmbeddedCatalog(), []);

  const loadExample = useCallback(async () => {
    const res = await fetch(EXAMPLE_URL);
    const text = await res.text();
    setSource(text);
    setLintReport(null);
    setEvents([]);
    setSnapshot(null);
    setParseError(null);
    setStage('idle');
  }, []);

  useEffect(() => {
    void loadExample();
  }, [loadExample]);

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
    const ast = runLint();
    if (!ast) return;

    setStage('playing');
    const ir = compileScript(ast);
    const runtime = new Runtime(catalog);
    runtime.load(ir);
    const finalSnapshot = runtime.runToCompletion();
    const collected = runtime.getEvents();

    setEvents(collected);
    setSnapshot(finalSnapshot);
    setStage(finalSnapshot.error ? 'error' : 'done');
  }, [runLint, catalog]);

  return (
    <div className="app">
      <header>
        <h1>米拉小镇 MiraTown</h1>
        <p className="subtitle">S0 无 AI 模式 · 粘贴或加载剧本 → 校验 → Headless 演绎</p>
        <div className="actions">
          <button type="button" onClick={() => void loadExample()}>加载示例剧本</button>
          <button type="button" onClick={runLint}>校验</button>
          <button type="button" className="primary" onClick={runPlay}>播放（Headless）</button>
        </div>
      </header>

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
          <h2>状态</h2>
          <div className={`status status-${stage}`}>
            {stage === 'idle' && '就绪'}
            {stage === 'linting' && '正在校验…'}
            {stage === 'playing' && '正在排演…'}
            {stage === 'done' && '演绎完成'}
            {stage === 'error' && '出错'}
          </div>

          {parseError && <pre className="error-box">{parseError}</pre>}

          {lintReport && (
            <div className="lint">
              <h3>校验 {lintReport.passed ? '✓ 通过' : '✗ 失败'}</h3>
              {[...lintReport.errors, ...lintReport.warnings].map((issue, i) => (
                <div key={i} className={issue.level}>
                  <code>{issue.code}</code> L{issue.line}: {issue.message}
                </div>
              ))}
              {lintReport.passed && lintReport.errors.length === 0 && lintReport.warnings.length === 0 && (
                <p className="ok">无错误</p>
              )}
            </div>
          )}

          {snapshot && (
            <div className="snapshot">
              <h3>最终快照</h3>
              <pre>{JSON.stringify(snapshot, null, 2)}</pre>
            </div>
          )}
        </section>
      </div>

      <section className="events">
        <h2>事件日志 ({events.length})</h2>
        <div className="event-list">
          {events.map((ev, i) => (
            <div key={i} className="event">
              <span className="t">T={ev.T.toFixed(2)}</span>
              <span className="type">{ev.type}</span>
              <span className="detail">{JSON.stringify(ev.detail)}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
