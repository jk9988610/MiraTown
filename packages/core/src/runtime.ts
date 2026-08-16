import { getZoneCenter } from './catalog.js';
import type { Catalog } from './types.js';
import type { IRNode, ParamValue, RuntimeEvent, RuntimeSnapshot, Vec2 } from './types.js';

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
}

interface CameraState {
  x: number;
  y: number;
  zoom: number;
  mode: string;
  target?: string;
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
  private actors = new Map<string, ActorState>();
  private props = new Map<string, PropState>();
  private camera: CameraState = { x: 16, y: 12, zoom: 1, mode: 'fixed' };
  private queue: ActiveCoroutine[] = [];
  private events: RuntimeEvent[] = [];
  private completed = false;
  private error?: RuntimeSnapshot['error'];
  private dialogue?: { speaker: string; line: string };
  private narration?: string;
  private ir: IRNode | null = null;

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
    this.actors.clear();
    this.props.clear();
    this.camera = { x: 16, y: 12, zoom: 1, mode: 'fixed' };
    this.queue = [];
    this.events = [];
    this.completed = false;
    this.error = undefined;
    this.dialogue = undefined;
    this.narration = undefined;
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

  private snapshot(): RuntimeSnapshot {
    return {
      T: this.T,
      t: this.t,
      sceneId: this.sceneId,
      actors: [...this.actors.values()],
      props: [...this.props.values()],
      camera: { ...this.camera },
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
    }
  }

  private runParallel(co: ActiveCoroutine, dt: number): void {
    if (!co.meta?.started) {
      co.meta = { started: true, children: nodeChildren(co).map((child) => ({
        node: child,
        childIndex: 0,
        elapsed: 0,
        duration: 0,
        blocking: true,
        done: false,
      })) };
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
    if (co.elapsed === dt) {
      this.executeStart(node);
      co.duration = this.estimateDuration(node);
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
      this.log('narration', { text: this.narration }, node.line);
      if (co.elapsed >= duration) {
        this.narration = undefined;
        co.done = true;
      }
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
      const duration = co.duration || 1;
      const progress = Math.min(1, co.elapsed / duration);
      const start = (co.meta?.start as Vec2) ?? { x: actor.x, y: actor.y };
      actor.x = start.x + (target.x - start.x) * progress;
      actor.y = start.y + (target.y - start.y) * progress;
      actor.state = progress < 1 ? 'WALKING' : 'IDLE';
      if (progress >= 1) {
        actor.x = target.x;
        actor.y = target.y;
        actor.state = 'IDLE';
        co.done = true;
      }
      return;
    }

    if (co.elapsed >= co.duration) {
      co.done = true;
    }
  }

  private executeStart(node: IRNode): void {
    switch (node.op) {
      case 'SCENE': {
        this.sceneId = asString(node.params.id) ?? null;
        this.t = 0;
        this.log('scene_change', { scene: this.sceneId }, node.line);
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
        const at = asVec2(node.params.at) ?? { x: 0, y: 0 };
        this.props.set(id, {
          id,
          prop: asString(node.params.prop) ?? '',
          x: at.x,
          y: at.y,
          state: asString(node.params.state) ?? 'empty',
        });
        this.log('prop_spawn', { id }, node.line);
        break;
      }
      case 'SET_PROP': {
        const id = asString(node.params.id);
        const prop = id ? this.props.get(id) : undefined;
        if (prop) {
          prop.state = asString(node.params.state) ?? prop.state;
          this.log('prop_set', { id, state: prop.state }, node.line);
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
          const target = asString(node.params.target);
          if (target) {
            this.camera.target = target;
            const actor = this.actors.get(target);
            if (actor) {
              this.camera.x = actor.x + preset.offset.x;
              this.camera.y = actor.y + preset.offset.y;
            }
          }
          this.log('camera_change', { preset: presetId, target }, node.line);
        }
        break;
      }
      case 'FACE': {
        const actorId = asString(node.params.actor);
        const actor = actorId ? this.actors.get(actorId) : undefined;
        if (actor) actor.facing = asString(node.params.facing) ?? actor.facing;
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
        if (actor) {
          const target = this.resolveMoveTarget(node.params);
          if (target) {
            const co = this.queue.find((q) => q.node === node);
            if (co) co.meta = { start: { x: actor.x, y: actor.y } };
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
        return 0.3;
      case 'EXIT':
        return asNumber(node.params.duration, 0.5);
      case 'WAIT':
        return asNumber(node.params.duration, 0);
      case 'MOVE_TO':
        return asNumber(node.params.duration, 2);
      case 'EMOTE':
        return asNumber(node.params.duration, 1.5);
      case 'PLAY_ANIM':
        return asNumber(node.params.duration, 1);
      case 'CAMERA':
      case 'PAN':
        return asNumber(node.params.duration, 0);
      case 'SCENE':
        return 0.1;
      case 'NARRATION':
        return asNumber(node.params.duration, 3);
      case 'DIALOGUE':
        return 0;
      default:
        return 0;
    }
  }

  private resolveMoveTarget(params: Record<string, ParamValue>): Vec2 | null {
    const to = asVec2(params.to);
    if (to) return to;
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
}

function nodeChildren(co: ActiveCoroutine): IRNode[] {
  return co.node.children ?? [];
}
