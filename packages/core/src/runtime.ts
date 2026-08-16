import { clampCamera } from './camera.js';
import { getZoneCenter } from './catalog.js';
import { DEFAULT_WALK_SPEED, DUO_WALK_SPACING } from './constants.js';
import { layoutPropFootY } from './layout.js';
import type { Catalog } from './types.js';
import type { IRNode, ParamValue, RuntimeEvent, RuntimeSnapshot, Vec2 } from './types.js';
import {
  closestPointOnWalkway,
  duoWalkPositions,
  interpolateWalkwayMove,
  resolveWalkwayTarget,
  walkwayMoveDistance,
} from './walkway.js';

const TICK = 1 / 60;

interface ActorState {
  id: string;
  x: number;
  y: number;
  facing: string;
  state: string;
}

interface PropState {
  id: string;
  prop: string;
  x: number;
  y: number;
  state: string;
  attach?: string;
  offsetX: number;
  offsetY: number;
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
  mode: string;
  target?: string;
  offsetX: number;
  offsetY: number;
}

interface ActiveCoroutine {
  node: IRNode;
  childIndex: number;
  elapsed: number;
  duration: number;
  blocking: boolean;
  done: boolean;
  meta?: Record<string, unknown>;
}

function asString(v: ParamValue | undefined): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asNumber(v: ParamValue | undefined, fallback = 0): number {
  return typeof v === 'number' ? v : fallback;
}

function asBool(v: ParamValue | undefined, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

function asVec2(v: ParamValue | undefined): Vec2 | undefined {
  if (v && typeof v === 'object' && 'x' in v) return v as Vec2;
  return undefined;
}

export class Runtime {
  private T = 0;
  private t = 0;
  private sceneId: string | null = null;
  private weather: 'clear' | 'rain' = 'clear';
  private actors = new Map<string, ActorState>();
  private props = new Map<string, PropState>();
  private camera: CameraState = { x: 32, y: 24, zoom: 1, mode: 'fixed', offsetX: 0, offsetY: 0 };
  private queue: ActiveCoroutine[] = [];
  private events: RuntimeEvent[] = [];
  private completed = false;
  private error?: RuntimeSnapshot['error'];
  private dialogue?: { speaker: string; line: string };
  private narration?: string;
  private ir: IRNode | null = null;
  private activeMoveActors = new Set<string>();
  private walkwayVisibility = new Map<string, boolean>();

  constructor(
    private readonly catalog: Catalog,
    private readonly interactive = false,
  ) {}

  load(ir: IRNode): void {
    this.reset();
    this.ir = ir;
    this.enqueue(ir);
  }

  reset(): void {
    this.T = 0;
    this.t = 0;
    this.sceneId = null;
    this.weather = 'clear';
    this.actors.clear();
    this.props.clear();
    this.camera = { x: 32, y: 24, zoom: 1, mode: 'fixed', offsetX: 0, offsetY: 0 };
    this.queue = [];
    this.events = [];
    this.completed = false;
    this.error = undefined;
    this.dialogue = undefined;
    this.narration = undefined;
    this.activeMoveActors.clear();
    this.walkwayVisibility.clear();
  }

  tick(dt = TICK): RuntimeSnapshot {
    if (this.completed || this.error) {
      return this.snapshot();
    }

    const coroutines = [...this.queue];
    this.queue = [];

    for (const co of coroutines) {
      if (co.done) continue;
      this.stepCoroutine(co, dt);
      if (!co.done) this.queue.push(co);
    }

    this.updateAttachedProps();

    this.updateFollowCamera(dt);
    this.clampCameraToMap();

    if (this.queue.length === 0 && !this.completed) {
      this.completed = true;
      this.log('script_complete', {});
    }

    this.T += dt;
    if (this.sceneId) this.t += dt;
    return this.snapshot();
  }

  runToCompletion(maxSteps = 20000): RuntimeSnapshot {
    let snapshot = this.snapshot();
    for (let i = 0; i < maxSteps; i++) {
      snapshot = this.tick();
      if (snapshot.completed || snapshot.error) break;
    }
    return snapshot;
  }

  getEvents(): RuntimeEvent[] {
    return [...this.events];
  }

  /** 快进到首个角色入场并定位镜头，避免首帧画面不在 NPC 身上 */
  primeToFirstActor(maxSteps = 300): RuntimeSnapshot {
    for (let i = 0; i < maxSteps; i++) {
      if (this.actors.size > 0) {
        this.snapCameraToActors();
        return this.snapshot();
      }
      if (this.completed || this.error) break;
      this.tick(TICK);
    }
    return this.snapshot();
  }

  private snapshot(): RuntimeSnapshot {
    const scene = this.sceneId ? this.catalog.scenes.get(this.sceneId) : null;
    return {
      T: this.T,
      t: this.t,
      sceneId: this.sceneId,
      weather: this.weather,
      actors: [...this.actors.values()],
      props: [...this.props.values()].map((p) => ({
        id: p.id,
        prop: p.prop,
        x: p.x,
        y: p.y,
        state: p.state,
        ...(p.attach
          ? { attach: p.attach, offsetX: p.offsetX, offsetY: p.offsetY }
          : {}),
      })),
      camera: { ...this.camera },
      mapSize: scene ? { w: scene.width, h: scene.height } : null,
      walkways: this.sceneWalkwaysSnapshot(),
      dialogue: this.dialogue,
      narration: this.narration,
      completed: this.completed,
      error: this.error,
    };
  }

  private log(type: string, detail: Record<string, unknown>, line?: number): void {
    this.events.push({ T: this.T, type, line, detail });
  }

  private enqueue(node: IRNode): void {
    this.queue.push({
      node,
      childIndex: 0,
      elapsed: 0,
      duration: 0,
      blocking: true,
      done: false,
    });
  }

  private fail(code: string, line: number, message: string): void {
    this.error = { code, line, message };
    this.log('runtime_error', { code, message }, line);
  }

  private stepCoroutine(co: ActiveCoroutine, dt: number): void {
    const { node } = co;
    co.elapsed += dt;

    switch (node.op) {
      case 'SEQUENCE':
        this.runSequence(co, dt);
        return;
      case 'PARALLEL':
        this.runParallel(co, dt);
        return;
      default:
        this.runLeaf(co, dt);
        return;
    }
  }

  private runSequence(co: ActiveCoroutine, dt: number): void {
    const children = nodeChildren(co);
    for (let chain = 0; chain < 64; chain++) {
      if (!co.meta?.activeChild) {
        if (co.childIndex >= children.length) {
          co.done = true;
          return;
        }
        co.meta = {
          activeChild: {
            node: children[co.childIndex],
            childIndex: 0,
            elapsed: 0,
            duration: 0,
            blocking: true,
            done: false,
          } as ActiveCoroutine,
        };
      }

      const childCo = co.meta.activeChild as ActiveCoroutine;
      this.stepCoroutine(childCo, dt);
      if (!childCo.done) return;

      co.childIndex++;
      co.meta = {};
      if (co.childIndex >= children.length) {
        co.done = true;
        return;
      }
    }
  }

  private runParallel(co: ActiveCoroutine, dt: number): void {
    if (!co.meta?.started) {
      const children = nodeChildren(co).map((child) => ({
        node: child,
        childIndex: 0,
        elapsed: 0,
        duration: 0,
        blocking: true,
        done: false,
      })) as ActiveCoroutine[];

      const moveChildren = children.filter((c) => c.node.op === 'MOVE_TO');
      const syncArrival =
        moveChildren.length > 1 &&
        moveChildren.every((c) => c.node.params.duo_center !== undefined);
      if (syncArrival) {
        let maxDur = 0;
        const moveStarts = new Map<ActiveCoroutine, { start: Vec2; target: Vec2 }>();
        for (const child of moveChildren) {
          const actorId = asString(child.node.params.actor);
          const actor = actorId ? this.actors.get(actorId) : undefined;
          const target = this.resolveMoveTarget(child.node.params);
          if (actor && target) {
            const start = { x: actor.x, y: actor.y };
            moveStarts.set(child, { start, target });
            maxDur = Math.max(maxDur, this.computeMoveDuration(child.node, start, target));
          }
        }
        for (const child of moveChildren) {
          const st = moveStarts.get(child);
          if (st) child.meta = { start: st.start, parallelDuration: maxDur };
        }
      }

      co.meta = { started: true, children };
    }
    const children = co.meta.children as ActiveCoroutine[];
    let allDone = true;
    for (const child of children) {
      if (!child.done) {
        this.stepCoroutine(child, dt);
        if (!child.done) allDone = false;
      }
    }
    co.done = allDone;
  }

  private runLeaf(co: ActiveCoroutine, dt: number): void {
    if (co.done) return;
    const node = co.node;
    if (!co.meta?.started) {
      co.meta = { ...co.meta, started: true };
      this.executeStart(node, co);
      if (co.duration === 0) {
        co.duration = this.estimateDuration(node);
      }
    }

    if (node.op === 'DIALOGUE') {
      const auto = asBool(node.params.auto, false) || !this.interactive;
      const autoDelay = asNumber(node.params.auto_delay, 2.5);
      const lineIndex = (co.meta?.lineIndex as number) ?? 0;
      const lineElapsed = (co.meta?.lineElapsed as number) ?? 0;
      const lines = node.lines ?? [];

      if (lineIndex === 0 && lineElapsed === 0 && co.elapsed <= dt) {
        // first frame for this dialogue block
      }

      if (lineIndex < lines.length) {
        const speaker = asString(node.params.speaker) ?? '';
        if (lineElapsed === 0) {
          this.dialogue = { speaker, line: lines[lineIndex] };
          this.log('dialogue_line', { speaker, line: lines[lineIndex] }, node.line);
        }
        const nextElapsed = lineElapsed + dt;
        if (auto && nextElapsed >= autoDelay) {
          co.meta = { lineIndex: lineIndex + 1, lineElapsed: 0 };
          if (lineIndex + 1 >= lines.length) {
            this.dialogue = undefined;
            co.done = true;
          }
        } else if (!auto) {
          co.meta = { lineIndex, lineElapsed: nextElapsed };
        } else {
          co.meta = { lineIndex, lineElapsed: nextElapsed };
        }
        return;
      }
      this.dialogue = undefined;
      co.done = true;
      return;
    }

    if (node.op === 'NARRATION') {
      const duration = asNumber(node.params.duration, 3);
      this.narration = (node.lines ?? []).join('');
      if (!co.meta?.logged) {
        this.log('narration', { text: this.narration }, node.line);
        co.meta = { ...co.meta, logged: true };
      }
      if (co.elapsed >= duration) {
        this.narration = undefined;
        co.done = true;
      }
      return;
    }

    if (node.op === 'PAN' || (node.op === 'CAMERA' && asNumber(node.params.duration, 0) > 0)) {
      const duration = co.duration || asNumber(node.params.duration, 2);
      if (!co.meta?.camStart) {
        const end =
          node.op === 'PAN'
            ? this.resolvePanTarget(node.params)
            : this.resolveCameraTarget(node.params);
        co.meta = {
          camStart: { x: this.camera.x, y: this.camera.y },
          camEnd: end,
        };
        co.duration = duration;
      }
      const end = co.meta.camEnd as Vec2 | null;
      if (!end) {
        co.done = true;
        return;
      }
      const start = co.meta.camStart as Vec2;
      const progress = Math.min(1, co.elapsed / duration);
      this.camera.x = start.x + (end.x - start.x) * progress;
      this.camera.y = start.y + (end.y - start.y) * progress;
      this.camera.mode = node.op === 'PAN' ? 'pan' : this.camera.mode;
      if (progress >= 1) co.done = true;
      return;
    }

    if (node.op === 'MOVE_TO') {
      const actorId = asString(node.params.actor);
      const actor = actorId ? this.actors.get(actorId) : undefined;
      const target = this.resolveMoveTarget(node.params);
      if (!actor || !target) {
        this.fail('E_PATH_BLOCKED', node.line, '移动目标无效');
        co.done = true;
        return;
      }
      const pathId = this.movePathId(node.params);
      const walkway = pathId ? this.catalog.walkways.get(pathId) : undefined;
      if (actorId && !co.meta?.moveRegistered) {
        this.activeMoveActors.add(actorId);
        const startPos = (co.meta?.start as Vec2) ?? { x: actor.x, y: actor.y };
        co.meta = { ...co.meta, moveRegistered: true, start: startPos, pathId };
        this.applyMoveFacing(actor, startPos, target);
      }
      const duration = co.duration || 1;
      const progress = Math.min(1, co.elapsed / duration);
      const start = (co.meta?.start as Vec2) ?? { x: actor.x, y: actor.y };
      if (walkway) {
        const pos = interpolateWalkwayMove(walkway.points, start, target, progress);
        actor.x = pos.x;
        actor.y = pos.y;
      } else {
        actor.x = start.x + (target.x - start.x) * progress;
        actor.y = start.y + (target.y - start.y) * progress;
      }
      actor.state = progress < 1 ? 'WALKING' : 'IDLE';
      if (progress >= 1) {
        actor.x = target.x;
        actor.y = target.y;
        actor.state = 'IDLE';
        if (actorId) this.activeMoveActors.delete(actorId);
        co.done = true;
      }
      return;
    }

    if (co.elapsed >= co.duration) {
      co.done = true;
    }
  }

  private executeStart(node: IRNode, co?: ActiveCoroutine): void {
    switch (node.op) {
      case 'SCENE': {
        this.sceneId = asString(node.params.id) ?? null;
        const weather = asString(node.params.weather);
        this.weather = weather === 'rain' ? 'rain' : 'clear';
        this.t = 0;
        this.initWalkwayVisibility();
        this.log('scene_change', { scene: this.sceneId, weather: this.weather }, node.line);
        break;
      }
      case 'ENTER': {
        const actorId = asString(node.params.actor)!;
        const at = asVec2(node.params.at);
        const zoneId = asString(node.params.at_zone);
        let pos = at ?? { x: 0, y: 0 };
        if (zoneId) {
          const zone = this.catalog.zones.get(zoneId);
          if (zone) pos = getZoneCenter(zone);
        }
        this.actors.set(actorId, {
          id: actorId,
          x: pos.x,
          y: pos.y,
          facing: asString(node.params.facing) ?? 'south',
          state: 'IDLE',
        });
        this.log('actor_enter', { actor: actorId, pos }, node.line);
        this.enableFollowAfterEnter(actorId);
        this.snapCameraToActors();
        break;
      }
      case 'EXIT': {
        const actorId = asString(node.params.actor)!;
        this.actors.delete(actorId);
        this.log('actor_exit', { actor: actorId }, node.line);
        break;
      }
      case 'SPAWN_PROP': {
        const id = asString(node.params.id) ?? `${asString(node.params.prop)}_${this.props.size + 1}`;
        const attach = asString(node.params.attach);
        const offset = asVec2(node.params.offset) ?? { x: 0, y: 0 };
        let pos = asVec2(node.params.at) ?? { x: 0, y: 0 };
        if (attach) {
          const holder = this.actors.get(attach);
          if (holder) {
            pos = { x: holder.x + offset.x, y: holder.y + offset.y };
          }
        }
        this.props.set(id, {
          id,
          prop: asString(node.params.prop) ?? '',
          x: pos.x,
          y: pos.y,
          state: asString(node.params.state) ?? 'empty',
          attach,
          offsetX: offset.x,
          offsetY: offset.y,
        });
        this.syncAttachedPropPosition(id);
        this.log('prop_spawn', { id, attach }, node.line);
        break;
      }
      case 'LAYOUT': {
        const layoutId = asString(node.params.id);
        const layout = layoutId ? this.catalog.scene_layouts.get(layoutId) : undefined;
        if (!layout) break;
        const footY = layoutPropFootY(layout);
        const lampState = asString(node.params.lamp_state) ?? 'on';
        const benchState = asString(node.params.bench_state) ?? 'empty';
        for (const lamp of layout.lamps) {
          this.props.set(lamp.id, {
            id: lamp.id,
            prop: 'lamp_post',
            x: lamp.x,
            y: footY,
            state: lampState,
            offsetX: 0,
            offsetY: 0,
          });
        }
        this.props.set(layout.bench.id, {
          id: layout.bench.id,
          prop: 'bench',
          x: layout.bench.x,
          y: footY,
          state: benchState,
          offsetX: 0,
          offsetY: 0,
        });
        this.log('layout_spawn', { layout: layoutId, footY }, node.line);
        break;
      }
      case 'SET_PROP': {
        const id = asString(node.params.id);
        const prop = id ? this.props.get(id) : undefined;
        if (prop) {
          const state = asString(node.params.state);
          if (state) prop.state = state;
          const offset = asVec2(node.params.offset);
          if (offset && id) {
            prop.offsetX = offset.x;
            prop.offsetY = offset.y;
            this.syncAttachedPropPosition(id);
          }
          this.log('prop_set', { id, state: prop.state, offset }, node.line);
        }
        break;
      }
      case 'SET_WALKWAY': {
        const id = asString(node.params.id);
        if (id) {
          this.walkwayVisibility.set(id, asBool(node.params.visible, true));
          this.log('walkway_set', { id, visible: this.walkwayVisibility.get(id) }, node.line);
        }
        break;
      }
      case 'CAMERA':
      case 'CUT': {
        const presetId = asString(node.params.preset);
        const preset = presetId ? this.catalog.camera_presets.get(presetId) : undefined;
        if (preset) {
          this.camera.zoom = preset.zoom;
          this.camera.mode = preset.mode;
          this.camera.offsetX = preset.offset.x;
          this.camera.offsetY = preset.offset.y;
          const target = asString(node.params.target);
          const targetZone = asString(node.params.target_zone);
          if (target) this.camera.target = target;
          const duration = asNumber(node.params.duration, 0);
          if (duration === 0) {
            this.applyCameraTarget(target, targetZone);
          }
          this.log('camera_change', { preset: presetId, target, targetZone }, node.line);
        }
        break;
      }
      case 'FACE': {
        const actorId = asString(node.params.actor);
        const actor = actorId ? this.actors.get(actorId) : undefined;
        if (actor && actor.state !== 'SITTING') {
          actor.facing = asString(node.params.facing) ?? actor.facing;
        }
        break;
      }
      case 'SIT': {
        const actorId = asString(node.params.actor);
        const actor = actorId ? this.actors.get(actorId) : undefined;
        const benchId = asString(node.params.bench);
        const seat = asNumber(node.params.seat, 0);
        if (actor) {
          if (benchId) {
            const bench = this.props.get(benchId);
            const benchDef = this.catalog.props.get('bench');
            if (bench && benchDef) {
              const seatOffset = seat === 1 ? benchDef.width * 0.22 : -benchDef.width * 0.22;
              actor.x = bench.x + seatOffset;
              actor.y = bench.y + 0.12;
              bench.state = 'occupied';
            }
          }
          actor.state = 'SITTING';
          actor.facing = 'south';
          this.log('sit', { actor: actorId, bench: benchId, seat }, node.line);
        }
        break;
      }
      case 'STAND': {
        const actorId = asString(node.params.actor);
        const actor = actorId ? this.actors.get(actorId) : undefined;
        if (actor) {
          actor.state = 'IDLE';
          this.log('stand', { actor: actorId }, node.line);
        }
        break;
      }
      case 'EMOTE':
      case 'PLAY_ANIM':
        this.log(node.op.toLowerCase(), { ...node.params }, node.line);
        break;
      case 'END_SCRIPT':
        this.completed = true;
        this.log('script_complete', {}, node.line);
        break;
      case 'MOVE_TO': {
        const actorId = asString(node.params.actor);
        const actor = actorId ? this.actors.get(actorId) : undefined;
        if (actor && co) {
          const target = this.resolveMoveTarget(node.params);
          if (target) {
            const start = (co.meta?.start as Vec2) ?? { x: actor.x, y: actor.y };
            co.meta = { ...co.meta, start };
            const synced = co.meta?.parallelDuration as number | undefined;
            co.duration = synced ?? this.computeMoveDuration(node, start, target);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  private estimateDuration(node: IRNode): number {
    switch (node.op) {
      case 'ENTER':
        return 0;
      case 'EXIT':
        return asNumber(node.params.duration, 0.5);
      case 'WAIT':
        return asNumber(node.params.duration, 0);
      case 'MOVE_TO':
        return asNumber(node.params.duration, 3);
      case 'EMOTE':
      case 'PLAY_ANIM':
      case 'SIT':
      case 'STAND':
        return asNumber(node.params.duration, node.op === 'SIT' || node.op === 'STAND' ? 0.4 : 1.5);
      case 'CAMERA':
      case 'PAN':
        return asNumber(node.params.duration, node.op === 'PAN' ? 2 : 0);
      case 'SCENE':
        return 0;
      case 'NARRATION':
        return asNumber(node.params.duration, 3);
      case 'DIALOGUE':
        return 0;
      default:
        return 0;
    }
  }

  private initWalkwayVisibility(): void {
    this.walkwayVisibility.clear();
    if (!this.sceneId) return;
    for (const [id, def] of this.catalog.walkways) {
      if (def.scene === this.sceneId) {
        this.walkwayVisibility.set(id, def.visible_default);
      }
    }
  }

  private sceneWalkwaysSnapshot(): Array<{ id: string; visible: boolean }> {
    if (!this.sceneId) return [];
    const items: Array<{ id: string; visible: boolean }> = [];
    for (const [id, def] of this.catalog.walkways) {
      if (def.scene !== this.sceneId) continue;
      items.push({
        id,
        visible: this.walkwayVisibility.get(id) ?? def.visible_default,
      });
    }
    return items;
  }

  private movePathId(params: Record<string, ParamValue>): string | undefined {
    return asString(params.to_path) ?? asString(params.on_path);
  }

  private resolveMoveTarget(params: Record<string, ParamValue>): Vec2 | null {
    const walkwayId = asString(params.to_path);
    if (walkwayId) {
      const walkway = this.catalog.walkways.get(walkwayId);
      if (!walkway) return null;
      const duoCenter = params.duo_center !== undefined ? asNumber(params.duo_center) : undefined;
      const duoSide = asString(params.duo_side);
      if (duoCenter !== undefined && duoSide) {
        const positions = duoWalkPositions(walkway, duoCenter, DUO_WALK_SPACING);
        return duoSide === 'left' ? positions.left : positions.right;
      }
      return resolveWalkwayTarget(walkway, {
        at: params.at !== undefined ? asNumber(params.at) : undefined,
        x: params.x !== undefined ? asNumber(params.x) : undefined,
        y: params.y !== undefined ? asNumber(params.y) : undefined,
      });
    }

    const to = asVec2(params.to);
    if (to) {
      const onPath = asString(params.on_path);
      if (onPath) {
        const walkway = this.catalog.walkways.get(onPath);
        if (walkway) return closestPointOnWalkway(walkway.points, to);
      }
      return to;
    }
    const zoneId = asString(params.to_zone);
    if (zoneId) {
      const zone = this.catalog.zones.get(zoneId);
      if (zone) return getZoneCenter(zone);
    }
    const toActor = asString(params.to_actor);
    if (toActor) {
      const actor = this.actors.get(toActor);
      const offset = asVec2(params.offset) ?? { x: 0, y: 0 };
      if (actor) return { x: actor.x + offset.x, y: actor.y + offset.y };
    }
    return null;
  }

  private resolvePanTarget(params: Record<string, ParamValue>): Vec2 | null {
    const to = asVec2(params.to);
    if (to) return to;
    const target = asString(params.target);
    if (target) {
      const actor = this.actors.get(target);
      if (actor) return { x: actor.x + this.camera.offsetX, y: actor.y + this.camera.offsetY };
    }
    return null;
  }

  private resolveCameraTarget(params: Record<string, ParamValue>): Vec2 | null {
    const target = asString(params.target);
    const targetZone = asString(params.target_zone);
    if (target) {
      const actor = this.actors.get(target);
      if (actor) return { x: actor.x + this.camera.offsetX, y: actor.y + this.camera.offsetY };
    }
    if (targetZone) {
      const zone = this.catalog.zones.get(targetZone);
      if (zone) return getZoneCenter(zone);
    }
    return null;
  }

  private applyCameraTarget(target?: string, targetZone?: string): void {
    const pos = this.resolveCameraTarget({
      ...(target ? { target } : {}),
      ...(targetZone ? { target_zone: targetZone } : {}),
    });
    if (pos) {
      this.camera.x = pos.x;
      this.camera.y = pos.y;
    }
  }

  private computeMoveDuration(node: IRNode, start: Vec2, target: Vec2): number {
    if (node.params.duration !== undefined) {
      return asNumber(node.params.duration);
    }
    const speed = asNumber(node.params.speed, DEFAULT_WALK_SPEED);
    const pathId = this.movePathId(node.params);
    const walkway = pathId ? this.catalog.walkways.get(pathId) : undefined;
    const dist = walkway
      ? walkwayMoveDistance(walkway.points, start, target)
      : Math.hypot(target.x - start.x, target.y - start.y);
    return Math.max(1.5, dist / speed);
  }

  private applyMoveFacing(actor: ActorState, start: Vec2, target: Vec2): void {
    const dx = target.x - start.x;
    const dy = target.y - start.y;
    const eps = 0.04;
    // 摄像机在 +Z（屏幕方向）：朝 -Y（屏幕近端）为正面 south，朝 +Y 为背面 north
    if (Math.abs(dx) < eps && Math.abs(dy) > eps) {
      actor.facing = dy < 0 ? 'south' : 'north';
      return;
    }
    if (Math.abs(dx) >= eps) {
      actor.facing = dx > 0 ? 'east' : 'west';
    }
  }

  private syncAttachedPropPosition(id: string): void {
    const prop = this.props.get(id);
    if (!prop?.attach) return;
    const holder = this.actors.get(prop.attach);
    if (!holder) return;
    prop.x = holder.x + prop.offsetX;
    prop.y = holder.y + prop.offsetY;
  }

  private updateAttachedProps(): void {
    for (const prop of this.props.values()) {
      if (!prop.attach) continue;
      const holder = this.actors.get(prop.attach);
      if (!holder) continue;
      prop.x = holder.x + prop.offsetX;
      prop.y = holder.y + prop.offsetY;
    }
  }

  private updateFollowCamera(dt: number): void {
    const shouldFollow = this.camera.mode === 'follow' || this.activeMoveActors.size > 0;
    if (!shouldFollow) return;

    const k = 1 - Math.exp(-5 * dt);
    let tx: number;
    let ty: number;

    if (this.activeMoveActors.size > 0) {
      const moving = [...this.activeMoveActors]
        .map((id) => this.actors.get(id))
        .filter((a): a is ActorState => !!a);
      if (moving.length === 0) return;
      tx = moving.reduce((s, a) => s + a.x, 0) / moving.length;
      ty = moving.reduce((s, a) => s + a.y, 0) / moving.length;
    } else if (this.camera.target) {
      const actor = this.actors.get(this.camera.target);
      if (!actor) return;
      tx = actor.x;
      ty = actor.y;
    } else {
      const actors = [...this.actors.values()];
      if (actors.length === 0) return;
      tx = actors.reduce((s, a) => s + a.x, 0) / actors.length;
      ty = actors.reduce((s, a) => s + a.y, 0) / actors.length;
    }

    tx += this.camera.offsetX;
    ty += this.camera.offsetY;
    this.camera.x += (tx - this.camera.x) * k;
    this.camera.y += (ty - this.camera.y) * k;
  }

  /** 角色入场后立刻对准当前在场角色（转场后的首次定位，非镜头平移） */
  private snapCameraToActors(): void {
    const actors = [...this.actors.values()];
    if (actors.length === 0) return;
    const cx = actors.reduce((s, a) => s + a.x, 0) / actors.length;
    const cy = actors.reduce((s, a) => s + a.y, 0) / actors.length;
    this.camera.x = cx + this.camera.offsetX;
    this.camera.y = cy + this.camera.offsetY;
  }

  private enableFollowAfterEnter(actorId: string): void {
    this.camera.mode = 'follow';
    this.camera.target = this.actors.size === 1 ? actorId : undefined;
  }

  private clampCameraToMap(): void {
    if (!this.sceneId) return;
    const scene = this.catalog.scenes.get(this.sceneId);
    if (!scene) return;
    clampCamera(this.camera, scene.width, scene.height);
  }
}

function nodeChildren(co: ActiveCoroutine): IRNode[] {
  return co.node.children ?? [];
}
