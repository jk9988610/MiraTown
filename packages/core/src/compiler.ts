import { isBlock, isDirective } from './parser.js';
import type { IRNode, ScriptAST, ScriptNode } from './types.js';

function directiveToIR(node: Extract<ScriptNode, { kind: 'directive' }>): IRNode {
  return {
    op: node.name as IRNode['op'],
    params: { ...node.params },
    line: node.line,
  };
}

function nodeToIR(node: ScriptNode): IRNode {
  if (isDirective(node)) {
    return directiveToIR(node);
  }

  return {
    op: node.name,
    params: { ...node.params },
    children: node.children.map(nodeToIR),
    lines: node.lines ? [...node.lines] : undefined,
    line: node.line,
  };
}

export function compileScript(ast: ScriptAST): IRNode {
  return {
    op: 'SEQUENCE',
    params: {},
    children: ast.body.map(nodeToIR),
    line: 1,
  };
}
