import { useCallback, useState } from 'react';

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyButton({ text, label = '复制', className = '' }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback for older WebViews (e.g. some Termux browsers)
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [text]);

  return (
    <button type="button" className={`copy-btn ${className}`} onClick={() => void copy()}>
      {copied ? '已复制' : label}
    </button>
  );
}

export function formatLintReport(
  passed: boolean,
  errors: Array<{ code: string; line: number; message: string; level?: string }>,
  warnings: Array<{ code: string; line: number; message: string }>,
): string {
  const lines = [`校验 ${passed ? '✓ 通过' : '✗ 失败'}`];
  for (const issue of errors) {
    lines.push(`${issue.code} L${issue.line}: ${issue.message}`);
  }
  for (const issue of warnings) {
    lines.push(`${issue.code} L${issue.line}: ${issue.message}`);
  }
  return lines.join('\n');
}

export function formatEvents(events: Array<{ T: number; type: string; detail: Record<string, unknown> }>): string {
  return dedupeEvents(events)
    .map((ev) => {
      const count = ev.count > 1 ? ` ×${ev.count}` : '';
      return `T=${ev.T.toFixed(2)} ${ev.type}${count} ${JSON.stringify(ev.detail)}`;
    })
    .join('\n');
}

export interface DisplayEvent {
  T: number;
  type: string;
  detail: Record<string, unknown>;
  count: number;
}

/** 合并连续相同类型与内容的事件，避免旁白等阻塞指令刷屏 */
export function dedupeEvents(
  events: Array<{ T: number; type: string; detail: Record<string, unknown> }>,
): DisplayEvent[] {
  const result: DisplayEvent[] = [];
  for (const ev of events) {
    const last = result[result.length - 1];
    const key = `${ev.type}:${JSON.stringify(ev.detail)}`;
    const lastKey = last ? `${last.type}:${JSON.stringify(last.detail)}` : '';
    if (last && key === lastKey) {
      last.count++;
    } else {
      result.push({ T: ev.T, type: ev.type, detail: ev.detail, count: 1 });
    }
  }
  return result;
}
