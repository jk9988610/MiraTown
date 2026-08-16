import { parse as parseYaml } from 'yaml';
import type {
  BlockNode,
  DirectiveNode,
  FrontMatter,
  ParamValue,
  ScriptAST,
  ScriptNode,
  Vec2,
} from './types.js';

const MVP_DIRECTIVES = new Set([
  'BEGIN',
  'END_SCRIPT',
  'ACT',
  'SCENE',
  'CAST',
  'ENTER',
  'EXIT',
  'MOVE_TO',
  'FACE',
  'SIT',
  'STAND',
  'PLAY_ANIM',
  'EMOTE',
  'DIALOGUE',
  'NARRATION',
  'SPAWN_PROP',
  'DESPAWN_PROP',
  'LAYOUT',
  'SET_PROP',
  'SPAWN_WALKWAY',
  'SET_WALKWAY',
  'GIVE',
  'CAMERA',
  'CUT',
  'PAN',
  'WAIT',
  'PARALLEL',
  'SEQUENCE',
  'END',
]);

const BLOCK_STARTERS = new Set(['DIALOGUE', 'NARRATION', 'PARALLEL', 'SEQUENCE']);

export class ParseError extends Error {
  constructor(
    message: string,
    readonly line: number,
  ) {
    super(message);
    this.name = 'ParseError';
  }
}

function splitFrontMatter(source: string): { frontMatterText: string; body: string; bodyStartLine: number } {
  const trimmed = source.replace(/^\uFEFF/, '');
  if (!trimmed.startsWith('---')) {
    throw new ParseError('剧本必须以 YAML front matter（---）开头', 1);
  }
  const end = trimmed.indexOf('\n---', 3);
  if (end === -1) {
    throw new ParseError('front matter 未闭合（缺少 ---）', 1);
  }
  const frontMatterText = trimmed.slice(4, end).trim();
  const body = trimmed.slice(end + 4).trim();
  const bodyStartLine = trimmed.slice(0, end + 4).split('\n').length;
  return { frontMatterText, body, bodyStartLine };
}

function parseFrontMatter(text: string): FrontMatter {
  const raw = parseYaml(text) as Partial<FrontMatter>;
  return {
    title: String(raw.title ?? ''),
    theme: String(raw.theme ?? ''),
    synopsis: String(raw.synopsis ?? '').trim(),
    dsl_version: String(raw.dsl_version ?? ''),
    catalog_version: String(raw.catalog_version ?? ''),
    cast: Array.isArray(raw.cast) ? raw.cast.map(String) : [],
    scenes: Array.isArray(raw.scenes) ? raw.scenes.map(String) : [],
    duration_estimate: Number(raw.duration_estimate ?? 0),
    tags: Array.isArray(raw.tags) ? raw.tags.map(String) : undefined,
    acts: raw.acts !== undefined ? Number(raw.acts) : undefined,
    tone: raw.tone ? String(raw.tone) : undefined,
    author: raw.author ? String(raw.author) : undefined,
    language: raw.language ? String(raw.language) : undefined,
  };
}

function parseCoord(text: string): Vec2 {
  const match = text.match(/^\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)$/);
  if (!match) {
    throw new Error(`无效坐标: ${text}`);
  }
  return { x: Number(match[1]), y: Number(match[2]) };
}

function parseScalar(token: string): ParamValue {
  if (token.startsWith('(')) {
    return parseCoord(token);
  }
  if (token === 'true') return true;
  if (token === 'false') return false;
  if (/^-?\d+(?:\.\d+)?$/.test(token)) return Number(token);
  return token;
}

function parseParams(rest: string): Record<string, ParamValue> {
  const params: Record<string, ParamValue> = {};
  if (!rest.trim()) return params;

  const tokens: string[] = [];
  let current = '';
  let inQuote = false;
  let parenDepth = 0;

  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (ch === '"') {
      inQuote = !inQuote;
      current += ch;
      continue;
    }
    if (!inQuote) {
      if (ch === '(') parenDepth++;
      if (ch === ')') parenDepth--;
    }
    if (!inQuote && parenDepth === 0 && /\s/.test(ch)) {
      if (current) tokens.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current) tokens.push(current);

  for (const token of tokens) {
    const eq = token.indexOf('=');
    if (eq === -1) continue;
    const key = token.slice(0, eq);
    let valueText = token.slice(eq + 1);
    if (valueText.startsWith('"') && valueText.endsWith('"')) {
      params[key] = valueText.slice(1, -1);
      continue;
    }
    params[key] = parseScalar(valueText);
  }
  return params;
}

function parseDirective(line: string, lineNo: number): DirectiveNode {
  const trimmed = line.trim();
  if (!trimmed.startsWith('@')) {
    throw new ParseError(`无效指令行: ${line}`, lineNo);
  }

  if (trimmed.startsWith('@WAIT')) {
    const rest = trimmed.slice(5).trim();
    return {
      kind: 'directive',
      name: 'WAIT',
      params: { duration: Number(rest) },
      line: lineNo,
      raw: trimmed,
    };
  }

  const match = trimmed.match(/^@([A-Z_]+)(?:\s+(.*))?$/);
  if (!match) {
    throw new ParseError(`无法解析指令: ${line}`, lineNo);
  }
  const name = match[1];
  const params = parseParams(match[2] ?? '');
  return { kind: 'directive', name, params, line: lineNo, raw: trimmed };
}

function parseNodes(lines: string[], startIndex: number, startLineNo: number): { nodes: ScriptNode[]; nextIndex: number } {
  const nodes: ScriptNode[] = [];
  let i = startIndex;

  while (i < lines.length) {
    const raw = lines[i];
    const lineNo = startLineNo + i;
    const trimmed = raw.trim();

    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) {
      i++;
      continue;
    }

    if (trimmed === '@END') {
      return { nodes, nextIndex: i + 1 };
    }

    if (!trimmed.startsWith('@')) {
      throw new ParseError(`意外文本行（应在块内或指令行）: ${raw}`, lineNo);
    }

    const directive = parseDirective(trimmed, lineNo);
    if (directive.name === 'END') {
      return { nodes, nextIndex: i + 1 };
    }

    if (BLOCK_STARTERS.has(directive.name)) {
      const blockName = directive.name as BlockNode['name'];
      if (blockName === 'NARRATION') {
        const contentLines: string[] = [];
        i++;
        while (i < lines.length) {
          const content = lines[i].trim();
          if (!content) {
            i++;
            continue;
          }
          if (content.startsWith('@')) break;
          contentLines.push(lines[i].trim());
          i++;
        }
        nodes.push({
          kind: 'block',
          name: 'NARRATION',
          params: directive.params,
          children: [],
          lines: contentLines,
          line: lineNo,
        });
        continue;
      }

      if (blockName === 'DIALOGUE') {
        const contentLines: string[] = [];
        i++;
        while (i < lines.length) {
          const content = lines[i].trim();
          if (content === '@END') break;
          if (content.startsWith('@')) {
            throw new ParseError('@DIALOGUE 块内不允许嵌套指令', startLineNo + i);
          }
          contentLines.push(content.replace(/^[「『]|['"]|[」』]$/g, '').trim());
          i++;
        }
        if (i >= lines.length || lines[i].trim() !== '@END') {
          throw new ParseError('@DIALOGUE 块未闭合', lineNo);
        }
        nodes.push({
          kind: 'block',
          name: 'DIALOGUE',
          params: directive.params,
          children: [],
          lines: contentLines,
          line: lineNo,
        });
        i++;
        continue;
      }

      i++;
      const child = parseNodes(lines, i, startLineNo);
      i = child.nextIndex;
      nodes.push({
        kind: 'block',
        name: blockName,
        params: directive.params,
        children: child.nodes,
        line: lineNo,
      });
      continue;
    }

    if (!MVP_DIRECTIVES.has(directive.name)) {
      throw new ParseError(`未知指令 @${directive.name}`, lineNo);
    }

    nodes.push(directive);
    i++;
  }

  return { nodes, nextIndex: i };
}

export function parseScript(source: string): ScriptAST {
  const { frontMatterText, body, bodyStartLine } = splitFrontMatter(source);
  const frontMatter = parseFrontMatter(frontMatterText);
  const lines = body.split('\n');
  const { nodes } = parseNodes(lines, 0, bodyStartLine);

  return { frontMatter, body: nodes };
}

export function isDirective(node: ScriptNode): node is DirectiveNode {
  return node.kind === 'directive';
}

export function isBlock(node: ScriptNode): node is BlockNode {
  return node.kind === 'block';
}
