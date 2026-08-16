import { getZoneCenter } from './catalog.js';
import { resolveWalkwayTarget } from './walkway.js';
import { isBlock, isDirective } from './parser.js';
import type {
  BlockNode,
  Catalog,
  DirectiveNode,
  LintIssue,
  LintReport,
  ParamValue,
  ScriptAST,
  ScriptNode,
  Vec2,
} from './types.js';

const EXPECTED_DSL = '1.0';
const EXPECTED_CATALOG = '1.0.0';

interface LintContext {
  sceneId: string | null;
  sceneSize: { width: number; height: number } | null;
  presentActors: Set<string>;
  castActors: Set<string>;
  enteredActors: Set<string>;
  actCount: number;
  sceneIds: Set<string>;
  spawnedProps: Map<string, { propType: string; attach?: string }>;
  issues: LintIssue[];
}

function pushIssue(
  ctx: LintContext,
  issue: Omit<LintIssue, 'level'> & { level?: LintIssue['level'] },
): void {
  ctx.issues.push({ level: issue.level ?? 'error', ...issue });
}

function asString(value: ParamValue | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: ParamValue | undefined): number | undefined {
  return typeof value === 'number' ? value : undefined;
}

function asVec2(value: ParamValue | undefined): Vec2 | undefined {
  if (value && typeof value === 'object' && 'x' in value && 'y' in value) {
    return value as Vec2;
  }
  return undefined;
}

function entitySize(
  catalog: Catalog,
  kind: 'actor' | 'prop',
  id: string,
): { width: number; height: number } | null {
  if (kind === 'actor') {
    const actor = catalog.actors.get(id);
    return actor ? { width: actor.width, height: actor.height } : null;
  }
  const prop = catalog.props.get(id);
  return prop ? { width: prop.width, height: prop.height } : null;
}

function checkBounds(
  ctx: LintContext,
  catalog: Catalog,
  pos: Vec2,
  kind: 'actor' | 'prop',
  id: string,
  line: number,
): void {
  if (!ctx.sceneSize) return;
  const size = entitySize(catalog, kind, id);
  if (!size) return;
  const maxX = ctx.sceneSize.width - size.width;
  const maxY = ctx.sceneSize.height - size.height;
  if (pos.x < 0 || pos.y < 0 || pos.x > maxX + 0.01 || pos.y > maxY + 0.01) {
    pushIssue(ctx, {
      code: 'E_OUT_OF_BOUNDS',
      line,
      message: `坐标 (${pos.x}, ${pos.y}) 超出场景 ${ctx.sceneId} 合法范围`,
      suggestion: `x∈[0, ${maxX.toFixed(2)}], y∈[0, ${maxY.toFixed(2)}]（考虑 ${id} 碰撞盒）`,
    });
  }
}

function resolveTargetPos(
  catalog: Catalog,
  ctx: LintContext,
  params: Record<string, ParamValue>,
  actorSizes: Map<string, { width: number; height: number }>,
): Vec2 | null {
  const walkwayId = asString(params.to_path);
  if (walkwayId) {
    const walkway = catalog.walkways.get(walkwayId);
    if (!walkway) return null;
    return resolveWalkwayTarget(walkway, {
      at: params.at !== undefined ? asNumber(params.at) : undefined,
      x: params.x !== undefined ? asNumber(params.x) : undefined,
      y: params.y !== undefined ? asNumber(params.y) : undefined,
    });
  }
  const to = asVec2(params.to);
  if (to) return to;
  const zoneId = asString(params.to_zone);
  if (zoneId) {
    const zone = catalog.zones.get(zoneId);
    if (!zone) return null;
    return getZoneCenter(zone);
  }
  const toActor = asString(params.to_actor);
  if (toActor) {
    const offset = asVec2(params.offset) ?? { x: 0, y: 0 };
    return { x: 10 + offset.x, y: 5 + offset.y };
  }
  return null;
}

function collectParallelActions(block: BlockNode): Array<{ actor?: string; op: string; line: number; speaker?: string }> {
  const actions: Array<{ actor?: string; op: string; line: number; speaker?: string }> = [];

  function walk(nodes: ScriptNode[]): void {
    for (const node of nodes) {
      if (isDirective(node)) {
        if (['MOVE_TO', 'PLAY_ANIM', 'FACE', 'ENTER', 'EXIT'].includes(node.name)) {
          actions.push({ actor: asString(node.params.actor), op: node.name, line: node.line });
        }
        return;
      }
      if (node.name === 'DIALOGUE') {
        actions.push({ op: 'DIALOGUE', line: node.line, speaker: asString(node.params.speaker) });
        return;
      }
      if (node.name === 'PARALLEL' || node.name === 'SEQUENCE') {
        walk(node.children);
      }
    }
  }

  walk(block.children);
  return actions;
}

function lintDirective(catalog: Catalog, ctx: LintContext, node: DirectiveNode): void {
  const { name, params, line } = node;

  if (![
    'BEGIN', 'END_SCRIPT', 'ACT', 'SCENE', 'CAST', 'ENTER', 'EXIT', 'MOVE_TO', 'FACE',
    'SIT', 'STAND', 'PLAY_ANIM', 'EMOTE', 'SPAWN_PROP', 'DESPAWN_PROP', 'SET_PROP',
    'SET_WALKWAY', 'GIVE', 'CAMERA', 'CUT', 'PAN', 'WAIT',
  ].includes(name)) {
    pushIssue(ctx, { code: 'E_UNKNOWN_DIRECTIVE', line, message: `未知指令 @${name}` });
    return;
  }

  switch (name) {
    case 'SCENE': {
      const sceneId = asString(params.id);
      if (!sceneId) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SCENE 缺少 id' });
        break;
      }
      const scene = catalog.scenes.get(sceneId);
      if (!scene) {
        pushIssue(ctx, { code: 'E_UNKNOWN_SCENE', line, message: `未知场景 ${sceneId}` });
        break;
      }
      ctx.sceneId = sceneId;
      ctx.sceneSize = { width: scene.width, height: scene.height };
      ctx.sceneIds.add(sceneId);
      break;
    }
    case 'ACT':
      ctx.actCount++;
      break;
    case 'CAST': {
      const actor = asString(params.actor);
      if (!actor) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@CAST 缺少 actor' });
        break;
      }
      if (!catalog.actors.has(actor)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_ACTOR', line, message: `未知角色 ${actor}` });
      } else {
        ctx.castActors.add(actor);
      }
      break;
    }
    case 'ENTER': {
      const actor = asString(params.actor);
      if (!actor) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@ENTER 缺少 actor' });
        break;
      }
      if (!catalog.actors.has(actor)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_ACTOR', line, message: `未知角色 ${actor}` });
        break;
      }
      if (ctx.presentActors.has(actor)) {
        pushIssue(ctx, { code: 'E_ACTOR_ALREADY_PRESENT', line, message: `角色 ${actor} 已在场` });
      }
      const at = asVec2(params.at);
      const zoneId = asString(params.at_zone);
      if (at) {
        checkBounds(ctx, catalog, at, 'actor', actor, line);
      } else if (zoneId) {
        const zone = catalog.zones.get(zoneId);
        if (!zone) {
          pushIssue(ctx, { code: 'E_INVALID_ZONE', line, message: `未知区域 ${zoneId}` });
        } else if (ctx.sceneId && zone.scene !== ctx.sceneId) {
          pushIssue(ctx, { code: 'E_INVALID_ZONE', line, message: `区域 ${zoneId} 不属于当前场景` });
        }
      } else {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@ENTER 需要 at 或 at_zone' });
      }
      const facing = asString(params.facing);
      if (!facing || !['north', 'south', 'east', 'west'].includes(facing)) {
        pushIssue(ctx, { code: 'E_INVALID_FACING', line, message: 'facing 须为 north|south|east|west' });
      }
      ctx.presentActors.add(actor);
      ctx.enteredActors.add(actor);
      break;
    }
    case 'EXIT': {
      const actor = asString(params.actor);
      if (!actor) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@EXIT 缺少 actor' });
        break;
      }
      if (!ctx.presentActors.has(actor)) {
        pushIssue(ctx, { code: 'E_ACTOR_NOT_PRESENT', line, message: `角色 ${actor} 未在场` });
      } else {
        ctx.presentActors.delete(actor);
      }
      break;
    }
    case 'MOVE_TO': {
      const actor = asString(params.actor);
      if (!actor) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@MOVE_TO 缺少 actor' });
        break;
      }
      if (!ctx.presentActors.has(actor)) {
        pushIssue(ctx, { code: 'E_ACTOR_NOT_PRESENT', line, message: `角色 ${actor} 未在场` });
      }
      const walkwayId = asString(params.to_path);
      if (walkwayId && !catalog.walkways.has(walkwayId)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_WALKWAY', line, message: `未知人行道 ${walkwayId}` });
      }
      const onPath = asString(params.on_path);
      if (onPath && !catalog.walkways.has(onPath)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_WALKWAY', line, message: `未知人行道 ${onPath}` });
      }
      const target = resolveTargetPos(catalog, ctx, params, new Map());
      if (target) {
        checkBounds(ctx, catalog, target, 'actor', actor, line);
      } else if (!walkwayId && !asVec2(params.to) && !asString(params.to_zone) && !asString(params.to_actor)) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@MOVE_TO 需要 to、to_path、to_zone 或 to_actor' });
      }
      const duration = asNumber(params.duration);
      if (duration !== undefined && duration < 0) {
        pushIssue(ctx, { code: 'E_NEGATIVE_DURATION', line, message: 'duration 不能为负' });
      }
      if (params.duration !== undefined && params.speed !== undefined) {
        pushIssue(ctx, {
          code: 'W_SPEED_DURATION_CONFLICT',
          level: 'warning',
          line,
          message: '@MOVE_TO 同时指定 speed 与 duration，运行时将忽略 speed',
          suggestion: '删除 speed 或 duration 之一',
        });
      }
      break;
    }
    case 'PLAY_ANIM': {
      const actor = asString(params.actor);
      const anim = asString(params.anim);
      if (!actor || !anim) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@PLAY_ANIM 缺少 actor 或 anim' });
        break;
      }
      const def = catalog.actors.get(actor);
      if (def && !def.animations.includes(anim)) {
        pushIssue(ctx, { code: 'E_INVALID_ANIM', line, message: `角色 ${actor} 不支持动画 ${anim}` });
      }
      break;
    }
    case 'SPAWN_PROP': {
      const prop = asString(params.prop);
      if (!prop) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SPAWN_PROP 缺少 prop' });
        break;
      }
      const def = catalog.props.get(prop);
      if (!def) {
        pushIssue(ctx, { code: 'E_UNKNOWN_PROP', line, message: `未知道具 ${prop}` });
        break;
      }
      if (!def.placeable || prop === 'letter') {
        pushIssue(ctx, { code: 'E_PROP_NOT_PLACEABLE', line, message: `道具 ${prop} 不可放置` });
      }
      const at = asVec2(params.at);
      const attach = asString(params.attach);
      if (!at && !attach) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SPAWN_PROP 需要 at 或 attach' });
      }
      if (attach && !ctx.castActors.has(attach)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_ACTOR', line, message: `附着目标角色 ${attach} 未登记` });
      }
      if (at) {
        checkBounds(ctx, catalog, at, 'prop', prop, line);
      }
      const state = asString(params.state);
      if (state && !def.states.includes(state)) {
        pushIssue(ctx, { code: 'E_INVALID_PROP_STATE', line, message: `道具 ${prop} 无效状态 ${state}` });
      }
      const propId = asString(params.id) ?? `${prop}_${ctx.spawnedProps.size + 1}`;
      ctx.spawnedProps.set(propId, { propType: prop, attach: attach ?? undefined });
      break;
    }
    case 'SET_PROP': {
      const id = asString(params.id);
      if (!id) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SET_PROP 缺少 id' });
        break;
      }
      const spawned = ctx.spawnedProps.get(id);
      if (!spawned) {
        pushIssue(ctx, {
          code: 'W_UNKNOWN_PROP_INSTANCE',
          level: 'warning',
          line,
          message: `@SET_PROP 引用的道具实例 ${id} 未在本脚本中 spawn`,
        });
      }
      const offset = asVec2(params.offset);
      if (offset && spawned && !spawned.attach) {
        pushIssue(ctx, {
          code: 'W_SET_PROP_OFFSET_NO_ATTACH',
          level: 'warning',
          line,
          message: `@SET_PROP offset 用于未 attach 的道具 ${id}，偏移不会改变持伞侧等行为`,
          suggestion: 'attach 道具应固定 spawn offset，避免中途翻转',
        });
      }
      break;
    }
    case 'SET_WALKWAY': {
      const id = asString(params.id);
      if (!id) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SET_WALKWAY 缺少 id' });
        break;
      }
      if (!catalog.walkways.has(id)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_WALKWAY', line, message: `未知人行道 ${id}` });
      }
      if (params.visible === undefined) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: '@SET_WALKWAY 需要 visible=true|false' });
      }
      break;
    }
    case 'CAMERA':
    case 'CUT': {
      const preset = asString(params.preset);
      if (!preset) {
        pushIssue(ctx, { code: 'E_MISSING_PARAM', line, message: `@${name} 缺少 preset` });
      } else if (!catalog.camera_presets.has(preset)) {
        pushIssue(ctx, { code: 'E_UNKNOWN_PRESET', line, message: `未知镜头预设 ${preset}` });
      }
      break;
    }
    case 'WAIT': {
      const duration = asNumber(params.duration);
      if (duration === undefined || duration < 0) {
        pushIssue(ctx, { code: 'E_NEGATIVE_DURATION', line, message: '@WAIT 需要非负 duration' });
      }
      break;
    }
    default:
      break;
  }
}

function lintBlock(catalog: Catalog, ctx: LintContext, node: BlockNode, depth: number): void {
  if (depth > 4) {
    pushIssue(ctx, { code: 'E_NEST_TOO_DEEP', line: node.line, message: '块嵌套深度超过 4' });
    return;
  }

  if (node.name === 'PARALLEL') {
    const actions = collectParallelActions(node);
    const moveCount = new Map<string, number>();
    const animActors = new Set<string>();
    const speakers = new Set<string>();

    for (const action of actions) {
      if (action.op === 'DIALOGUE' && action.speaker) {
        speakers.add(action.speaker);
      }
      if (action.op === 'MOVE_TO' && action.actor) {
        moveCount.set(action.actor, (moveCount.get(action.actor) ?? 0) + 1);
      }
      if (action.op === 'PLAY_ANIM' && action.actor) {
        animActors.add(action.actor);
      }
    }

    for (const [actor, count] of moveCount) {
      if (count > 1) {
        pushIssue(ctx, {
          code: 'E_CONFLICTING_MOVE',
          line: node.line,
          message: `@PARALLEL 内角色 ${actor} 有多条 @MOVE_TO`,
        });
      }
      if (animActors.has(actor)) {
        pushIssue(ctx, {
          code: 'E_CONFLICTING_ACTION',
          line: node.line,
          message: `@PARALLEL 内角色 ${actor} 同时 @MOVE_TO 与 @PLAY_ANIM`,
        });
      }
    }

    for (const speaker of speakers) {
      for (const action of actions) {
        if (
          action.actor === speaker &&
          (action.op === 'MOVE_TO' || action.op === 'PLAY_ANIM')
        ) {
          pushIssue(ctx, {
            code: 'E_SPEAKER_BUSY',
            line: action.line,
            message: `说话者 ${speaker} 在 @DIALOGUE 并行期间不得移动或播动画`,
          });
        }
      }
    }
  }

  if (node.name === 'DIALOGUE') {
    const speaker = asString(node.params.speaker);
    if (!speaker) {
      pushIssue(ctx, { code: 'E_MISSING_PARAM', line: node.line, message: '@DIALOGUE 缺少 speaker' });
    } else if (!catalog.actors.has(speaker)) {
      pushIssue(ctx, { code: 'E_UNKNOWN_ACTOR', line: node.line, message: `未知角色 ${speaker}` });
    } else if (!ctx.presentActors.has(speaker)) {
      pushIssue(ctx, { code: 'E_ACTOR_NOT_PRESENT', line: node.line, message: `说话者 ${speaker} 未在场` });
    }
  }

  for (const child of node.children) {
    lintNode(catalog, ctx, child, depth + 1);
  }
}

function lintNode(catalog: Catalog, ctx: LintContext, node: ScriptNode, depth = 0): void {
  if (isDirective(node)) {
    lintDirective(catalog, ctx, node);
    return;
  }
  lintBlock(catalog, ctx, node, depth);
}

function lintFrontMatter(ast: ScriptAST, ctx: LintContext): void {
  const fm = ast.frontMatter;
  if (!fm.title) pushIssue(ctx, { code: 'E_MISSING_PARAM', line: 1, message: 'front matter 缺少 title' });
  if (!fm.theme) pushIssue(ctx, { code: 'E_MISSING_PARAM', line: 1, message: 'front matter 缺少 theme' });
  if (!fm.synopsis || fm.synopsis.length < 20) {
    pushIssue(ctx, { code: 'E_MISSING_PARAM', line: 1, message: 'synopsis 至少 20 字' });
  }
  if (fm.dsl_version !== EXPECTED_DSL) {
    pushIssue(ctx, {
      code: 'E_CATALOG_MISMATCH',
      line: 1,
      message: `dsl_version 须为 ${EXPECTED_DSL}，当前 ${fm.dsl_version}`,
    });
  }
  if (fm.catalog_version !== EXPECTED_CATALOG) {
    pushIssue(ctx, {
      code: 'E_CATALOG_MISMATCH',
      line: 1,
      message: `catalog_version 须为 ${EXPECTED_CATALOG}，当前 ${fm.catalog_version}`,
    });
  }
  if (fm.acts !== undefined && fm.acts !== ctx.actCount) {
    pushIssue(ctx, {
      code: 'E_MISSING_PARAM',
      line: 1,
      message: `front matter acts=${fm.acts} 与正文 @ACT 数量 ${ctx.actCount} 不一致`,
      level: 'warning',
    });
  }
  for (const actor of fm.cast) {
    if (!ctx.enteredActors.has(actor)) {
      pushIssue(ctx, {
        code: 'W_UNUSED_CAST',
        line: 1,
        message: `cast 中 ${actor} 未在正文中 @ENTER`,
        level: 'warning',
      });
    }
  }
  for (const scene of fm.scenes) {
    if (!ctx.sceneIds.has(scene)) {
      pushIssue(ctx, {
        code: 'E_UNKNOWN_SCENE',
        line: 1,
        message: `front matter scenes 中 ${scene} 未在正文 @SCENE 出现`,
      });
    }
  }
}

export function lintScript(ast: ScriptAST, catalog: Catalog): LintReport {
  const ctx: LintContext = {
    sceneId: null,
    sceneSize: null,
    presentActors: new Set(),
    castActors: new Set(),
    enteredActors: new Set(),
    actCount: 0,
    sceneIds: new Set(),
    spawnedProps: new Map(),
    issues: [],
  };

  let hasBegin = false;
  let hasEnd = false;

  for (const node of ast.body) {
    if (isDirective(node)) {
      if (node.name === 'BEGIN') hasBegin = true;
      if (node.name === 'END_SCRIPT') hasEnd = true;
    }
    lintNode(catalog, ctx, node);
  }

  if (!hasBegin) {
    pushIssue(ctx, { code: 'E_MISSING_PARAM', line: 1, message: '缺少 @BEGIN' });
  }
  if (!hasEnd) {
    pushIssue(ctx, { code: 'E_MISSING_PARAM', line: 1, message: '缺少 @END_SCRIPT' });
  }

  lintFrontMatter(ast, ctx);

  const errors = ctx.issues.filter((i) => i.level === 'error');
  const warnings = ctx.issues.filter((i) => i.level === 'warning');
  return { passed: errors.length === 0, errors, warnings };
}
