import { Application, Container, Graphics } from 'pixi.js';
import { clampCamera, PX_PER_WU, VIEW_H, VIEW_W } from '@miratown/core';
import type { RuntimeSnapshot } from '@miratown/core';

/** 实体尺寸（与 catalog/entities.yaml 一致），锚点均为脚底中心 */
const SIZES = {
  mira: { w: 0.8, h: 1.6 },
  old_chen: { w: 0.9, h: 1.7 },
  lily: { w: 0.7, h: 1.5 },
  bench: { w: 3.0, h: 1.0 },
  umbrella: { w: 4.5, h: 2.5 },
  lamp_post: { w: 0.4, h: 3.5 },
  letter: { w: 0.2, h: 0.15 },
} as const;

const ACTOR_COLORS: Record<string, number> = {
  mira: 0x5b9cff,
  old_chen: 0x9aa5b1,
  lily: 0xff8fcb,
};

const ACTOR_HAIR: Record<string, number> = {
  mira: 0x2c3a6e,
  old_chen: 0xb0a69c,
  lily: 0xc94e82,
};

const FEMALE_ACTORS = new Set(['mira', 'lily']);

const SKIN = 0xffe0bd;
const SKIN_SHADOW = 0xe8c9a8;

type Facing = 'north' | 'south' | 'east' | 'west';

/** 摄像机在 +Z（屏幕方向）；角色朝南（-Y）为正面，朝北（+Y）为背面 */
const VIEW_FRONT: Facing = 'south';
const VIEW_BACK: Facing = 'north';

interface TorsoWidths {
  chest: number;
  waist: number;
  hip: number;
}

function torsoWidths(baseW: number, female: boolean): TorsoWidths {
  return female
    ? { chest: baseW * 1.16, waist: baseW * 0.44, hip: baseW * 1.32 }
    : { chest: baseW * 1.06, waist: baseW * 0.96, hip: baseW * 1.2 };
}

function drawFrontTorso(
  g: Graphics,
  cx: number,
  top: number,
  height: number,
  widths: TorsoWidths,
  color: number,
): void {
  const yTop = top + height * 0.04;
  const yChest = top + height * 0.22;
  const yWaist = top + height * 0.54;
  const yHip = top + height * 0.78;
  const yBot = top + height;

  g.moveTo(cx - widths.chest * 0.82, yChest);
  g.bezierCurveTo(cx - widths.chest, yTop, cx - widths.chest * 0.35, yTop, cx, yTop);
  g.bezierCurveTo(cx + widths.chest * 0.35, yTop, cx + widths.chest, yTop, cx + widths.chest * 0.82, yChest);
  g.bezierCurveTo(cx + widths.chest, yChest + height * 0.1, cx + widths.waist * 0.95, yWaist, cx + widths.hip, yHip);
  g.quadraticCurveTo(cx + widths.hip * 0.98, yBot, cx, yBot);
  g.quadraticCurveTo(cx - widths.hip * 0.98, yBot, cx - widths.hip, yHip);
  g.bezierCurveTo(cx - widths.waist * 0.95, yWaist, cx - widths.chest, yChest + height * 0.1, cx - widths.chest * 0.82, yChest);
  g.closePath();
  g.fill(color);
}

function drawBackTorso(
  g: Graphics,
  cx: number,
  top: number,
  height: number,
  widths: TorsoWidths,
  color: number,
): void {
  const yTop = top + height * 0.04;
  const yChest = top + height * 0.22;
  const yWaist = top + height * 0.54;
  const yHip = top + height * 0.78;
  const yBot = top + height;

  g.moveTo(cx - widths.chest * 0.78, yChest);
  g.bezierCurveTo(cx - widths.chest * 0.95, yTop, cx - widths.chest * 0.3, yTop, cx, yTop);
  g.bezierCurveTo(cx + widths.chest * 0.3, yTop, cx + widths.chest * 0.95, yTop, cx + widths.chest * 0.78, yChest);
  g.bezierCurveTo(cx + widths.chest * 0.92, yChest + height * 0.12, cx + widths.waist * 1.04, yWaist, cx + widths.hip * 0.98, yHip);
  g.quadraticCurveTo(cx + widths.hip * 0.92, yBot, cx, yBot);
  g.quadraticCurveTo(cx - widths.hip * 0.92, yBot, cx - widths.hip * 0.98, yHip);
  g.bezierCurveTo(cx - widths.waist * 1.04, yWaist, cx - widths.chest * 0.92, yChest + height * 0.12, cx - widths.chest * 0.78, yChest);
  g.closePath();
  g.fill(color);
}

function drawSideTorso(
  g: Graphics,
  cx: number,
  top: number,
  height: number,
  widths: TorsoWidths,
  color: number,
  dir: 1 | -1,
): void {
  const yTop = top + height * 0.04;
  const yChest = top + height * 0.24;
  const yWaist = top + height * 0.54;
  const yHip = top + height * 0.78;
  const yBot = top + height;
  const front = (w: number) => cx + dir * w * 0.42;
  const back = (w: number) => cx - dir * w * 0.3;

  g.moveTo(back(widths.chest), yTop);
  g.bezierCurveTo(back(widths.chest * 0.7), yTop, front(widths.chest * 0.5), yChest - height * 0.04, front(widths.chest), yChest);
  g.bezierCurveTo(front(widths.chest), yChest + height * 0.06, front(widths.waist * 0.55), yWaist, back(widths.waist * 0.7), yWaist);
  g.bezierCurveTo(back(widths.hip * 0.85), yHip, back(widths.hip), yBot, cx - dir * widths.hip * 0.12, yBot);
  g.lineTo(back(widths.hip * 0.9), yHip);
  g.bezierCurveTo(back(widths.waist * 0.75), yWaist, back(widths.chest * 0.85), yChest, back(widths.chest), yTop);
  g.closePath();
  g.fill(color);
}

interface ActorPose {
  cx: number;
  groundY: number;
  bodyTop: number;
  bodyBottom: number;
  bodyH: number;
  headCy: number;
  headR: number;
  chestY: number;
  baseW: number;
}

function normalizeFacing(facing: string): Facing {
  if (facing === 'north' || facing === 'south' || facing === 'east' || facing === 'west') {
    return facing;
  }
  return 'south';
}

const LAMP_NEAR_WU = 1.2;

/** 脚底 Y 越小越靠前（覆盖 Y 更大者）；升序绘制，返回值越大越靠前 */
function depthSortKey(footY: number, bias = 0): number {
  return -footY + bias;
}

function footRect(
  mapH: number,
  cx: number,
  groundY: number,
  widthWu: number,
  heightWu: number,
) {
  return {
    left: (cx - widthWu / 2) * PX_PER_WU,
    top: (mapH - groundY - heightWu) * PX_PER_WU,
    width: widthWu * PX_PER_WU,
    height: heightWu * PX_PER_WU,
    centerX: cx * PX_PER_WU,
    groundY: (mapH - groundY) * PX_PER_WU,
  };
}

interface DepthItem {
  id: string;
  sortY: number;
  draw: (g: Graphics) => void;
}

export class MiraStage {
  private app: Application | null = null;
  private mountGeneration = 0;
  private mounted = false;
  private world = new Container();
  private groundLayer = new Container();
  private puddleLayer = new Container();
  private depthLayer = new Container();
  private rainLayer = new Container();
  private depthGfx = new Map<string, Graphics>();
  private overlayEl: HTMLElement | null = null;
  private weather: 'clear' | 'rain' = 'clear';
  private mapW = 64;
  private mapH = 48;
  private lastSceneId: string | null = null;

  async mount(container: HTMLElement, overlay: HTMLElement): Promise<void> {
    const generation = ++this.mountGeneration;
    this.overlayEl = overlay;
    this.world = new Container();
    this.groundLayer = new Container();
    this.puddleLayer = new Container();
    this.depthLayer = new Container();
    this.rainLayer = new Container();
    this.depthGfx.clear();
    const app = new Application();
    await app.init({
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: 0x1a2332,
      antialias: true,
      resolution: 1,
      autoDensity: false,
    });

    if (generation !== this.mountGeneration) {
      app.destroy(true, { children: true });
      return;
    }

    this.app = app;
    this.mounted = true;

    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.aspectRatio = '16 / 9';
    container.replaceChildren(canvas);

    this.world.addChild(this.groundLayer);
    this.world.addChild(this.puddleLayer);
    this.world.addChild(this.depthLayer);
    app.stage.addChild(this.world);
    app.stage.addChild(this.rainLayer);

    this.drawGround();
  }

  get ready(): boolean {
    return this.mounted && this.app !== null;
  }

  destroy(): void {
    this.mountGeneration += 1;
    this.mounted = false;
    this.depthGfx.clear();
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.overlayEl = null;
  }

  update(snapshot: RuntimeSnapshot): void {
    if (!this.app) return;

    if (snapshot.mapSize) {
      if (snapshot.mapSize.w !== this.mapW || snapshot.mapSize.h !== this.mapH) {
        this.mapW = snapshot.mapSize.w;
        this.mapH = snapshot.mapSize.h;
        this.drawGround();
      }
    }

    if (snapshot.sceneId !== this.lastSceneId) {
      this.lastSceneId = snapshot.sceneId;
    }
    this.weather = snapshot.weather ?? 'clear';

    this.drawRainPuddles(snapshot);
    this.drawLampGlows(snapshot);
    this.drawDepthSorted(snapshot);
    this.applyCamera(snapshot);
    this.drawRain();
    this.updateOverlay(snapshot);
  }

  private drawGround(): void {
    this.groundLayer.removeChildren();
    const g = new Graphics();
    const pad = 4;
    const totalW = (this.mapW + pad * 2) * PX_PER_WU;
    const totalH = (this.mapH + pad * 2) * PX_PER_WU;
    g.rect(-pad * PX_PER_WU, -pad * PX_PER_WU, totalW, totalH);
    g.fill(0x1a2830);

    for (let tx = 0; tx < this.mapW; tx++) {
      for (let ty = 0; ty < this.mapH; ty++) {
        const wx = tx + 0.5;
        const wy = this.mapH - ty - 0.5;
        const r = footRect(this.mapH, wx, wy, 1, 1);
        const checker = (tx + ty) % 2 === 0;
        g.rect(r.left, r.top, r.width, r.height);
        g.fill(checker ? 0x2d4a3e : 0x264038);
      }
    }
    this.groundLayer.addChild(g);
  }

  private drawRainPuddles(snapshot: RuntimeSnapshot): void {
    this.puddleLayer.removeChildren();
    if (this.weather !== 'rain') return;

    const lamps = snapshot.props.filter((p) => p.prop === 'lamp_post' && p.state === 'on');
    if (lamps.length === 0) return;

    const g = new Graphics();
    for (const lamp of lamps) {
      const base = footRect(this.mapH, lamp.x, lamp.y, 0.01, 0.01);
      const puddleX = base.centerX + 6;
      const puddleY = base.groundY + 3;
      const puddleRx = PX_PER_WU * 0.85;
      const puddleRy = PX_PER_WU * 0.32;

      g.ellipse(puddleX, puddleY, puddleRx, puddleRy);
      g.fill({ color: 0x1a2838, alpha: 0.82 });
      g.ellipse(puddleX - 8, puddleY - 2, puddleRx * 0.35, puddleRy * 0.45);
      g.fill({ color: 0xffc860, alpha: 0.55 });
      g.ellipse(puddleX + 5, puddleY + 1, puddleRx * 0.22, puddleRy * 0.35);
      g.fill({ color: 0xfff0c0, alpha: 0.4 });
    }
    this.puddleLayer.addChild(g);
  }

  private drawLampGlows(snapshot: RuntimeSnapshot): void {
    const g = new Graphics();
    let hasGlow = false;
    for (const prop of snapshot.props) {
      if (prop.prop !== 'lamp_post' || prop.state !== 'on') continue;
      hasGlow = true;
      const base = footRect(this.mapH, prop.x, prop.y, 0.01, 0.01);
      const glowR = PX_PER_WU * 3.2;
      g.circle(base.centerX, base.groundY, glowR);
      g.fill({ color: 0xffd27f, alpha: 0.16 });
      g.circle(base.centerX, base.groundY, glowR * 0.55);
      g.fill({ color: 0xffe8a8, alpha: 0.12 });
    }
    if (hasGlow) {
      this.puddleLayer.addChild(g);
    }
  }

  private nearestLampDist(
    x: number,
    y: number,
    lamps: Array<{ x: number; y: number }>,
  ): number {
    let min = Infinity;
    for (const lamp of lamps) {
      min = Math.min(min, Math.hypot(x - lamp.x, y - lamp.y));
    }
    return min;
  }

  private drawDepthSorted(snapshot: RuntimeSnapshot): void {
    const lamps = snapshot.props
      .filter((p) => p.prop === 'lamp_post')
      .map((p) => ({ x: p.x, y: p.y }));
    const actorById = new Map(snapshot.actors.map((a) => [a.id, a]));
    const items: DepthItem[] = [];

    for (const prop of snapshot.props) {
      if (prop.prop === 'lamp_post') {
        const nearActor = snapshot.actors.some(
          (a) => Math.hypot(a.x - prop.x, a.y - prop.y) < LAMP_NEAR_WU,
        );
        items.push({
          id: `prop:${prop.id}`,
          sortY: depthSortKey(prop.y, nearActor ? -0.1 : 0),
          draw: (g) => this.drawLampPole(g, prop.x, prop.y, prop.state === 'on'),
        });
        continue;
      }

      if (prop.prop === 'bench') {
        items.push({
          id: `prop:${prop.id}`,
          sortY: depthSortKey(prop.y, -0.12),
          draw: (g) => this.drawBench(g, prop.x, prop.y),
        });
        continue;
      }

      if (prop.prop === 'umbrella') {
        const holder = prop.attach ? actorById.get(prop.attach) : undefined;
        const footY = holder?.y ?? prop.y;
        let holderBias = 0;
        if (holder?.state === 'SITTING') holderBias += 0.15;
        if (holder && lamps.length > 0 && this.nearestLampDist(holder.x, holder.y, lamps) < LAMP_NEAR_WU) {
          holderBias += 0.1;
        }
        const holderFacing = holder ? normalizeFacing(holder.facing) : VIEW_FRONT;
        const umbrellaBias =
          holderFacing === VIEW_BACK ? holderBias - 0.22 : holderBias + 0.18;
        items.push({
          id: `prop:${prop.id}`,
          sortY: depthSortKey(footY, umbrellaBias),
          draw: (g) => this.drawUmbrella(g, prop, snapshot),
        });
      }
    }

    for (const actor of snapshot.actors) {
      const lampDist = lamps.length > 0 ? this.nearestLampDist(actor.x, actor.y, lamps) : Infinity;
      let bias = 0;
      if (actor.state === 'SITTING') bias += 0.15;
      if (lampDist < LAMP_NEAR_WU) bias += 0.1;

      items.push({
        id: `actor:${actor.id}`,
        sortY: depthSortKey(actor.y, bias),
        draw: (g) => this.drawActor(g, actor),
      });
    }

    items.sort((a, b) => a.sortY - b.sortY);

    const seen = new Set<string>();
    this.depthLayer.removeChildren();
    for (const item of items) {
      seen.add(item.id);
      let gfx = this.depthGfx.get(item.id);
      if (!gfx) {
        gfx = new Graphics();
        this.depthGfx.set(item.id, gfx);
      }
      gfx.clear();
      item.draw(gfx);
      this.depthLayer.addChild(gfx);
    }

    for (const [id, gfx] of this.depthGfx) {
      if (!seen.has(id)) {
        gfx.destroy();
        this.depthGfx.delete(id);
      }
    }
  }

  private drawBench(g: Graphics, x: number, y: number): void {
    const size = SIZES.bench;
    const r = footRect(this.mapH, x, y, size.w, size.h);
    g.roundRect(r.left, r.top, r.width, r.height, 4);
    g.fill(0x8b5a2b);
    g.roundRect(r.left + 4, r.top + 4, r.width / 2 - 8, r.height - 8, 3);
    g.fill(0x9a6a3a);
    g.roundRect(r.left + r.width / 2 + 4, r.top + 4, r.width / 2 - 8, r.height - 8, 3);
    g.fill(0x9a6a3a);
  }

  private drawLampPole(g: Graphics, x: number, y: number, lit: boolean): void {
    const size = SIZES.lamp_post;
    const base = footRect(this.mapH, x, y, size.w, size.h);
    g.rect(base.centerX - 3, base.groundY - base.height, 6, base.height);
    g.fill(0x3a4555);
    const headY = base.groundY - base.height + 8;
    g.roundRect(base.centerX - 10, headY - 6, 20, 12, 3);
    g.fill(lit ? 0xffe9b0 : 0x556677);
    if (lit) {
      g.circle(base.centerX, headY, 14);
      g.fill({ color: 0xfff2c8, alpha: 0.55 });
    }
  }

  private actorPose(
    actor: { id: string; x: number; y: number; state: string },
    size: { w: number; h: number },
  ): ActorPose {
    const sitting = actor.state === 'SITTING';
    const heightWu = sitting ? size.h * 0.62 : size.h;
    const r = footRect(this.mapH, actor.x, actor.y, size.w, heightWu);
    const bodyBottom = sitting ? r.groundY - PX_PER_WU * 0.26 : r.groundY - PX_PER_WU * 0.06;
    const bodyH = r.height * (sitting ? 0.46 : 0.5);
    const bodyTop = bodyBottom - bodyH;
    const headR = r.width * 0.28;
    const headCy = bodyTop - headR * 0.82;
    const chestY = bodyTop + bodyH * 0.34;
    return {
      cx: r.centerX,
      groundY: r.groundY,
      bodyTop,
      bodyBottom,
      bodyH,
      headCy,
      headR,
      chestY,
      baseW: r.width * 0.44,
    };
  }

  private drawUmbrella(
    g: Graphics,
    prop: {
      x: number;
      y: number;
      state: string;
      attach?: string;
      offsetX?: number;
      offsetY?: number;
    },
    snapshot: RuntimeSnapshot,
  ): void {
    const size = SIZES.umbrella;
    const holder = prop.attach
      ? snapshot.actors.find((a) => a.id === prop.attach)
      : undefined;
    const holderSize = holder
      ? (SIZES[holder.id as keyof typeof SIZES] ?? { w: 0.8, h: 1.6 })
      : { w: 0.8, h: 1.6 };

    let poleX: number;
    let chestY: number;
    let headTopY: number;

    if (holder) {
      const pose = this.actorPose(holder, holderSize);
      poleX = pose.cx;
      chestY = pose.chestY;
      headTopY = pose.headCy - pose.headR;
    } else {
      const base = footRect(this.mapH, prop.x, prop.y, 0.01, 0.01);
      poleX = base.centerX;
      chestY = base.groundY - holderSize.h * PX_PER_WU * 0.68;
      headTopY = base.groundY - holderSize.h * PX_PER_WU;
    }

    const sidePx = (prop.offsetX ?? 0) * PX_PER_WU;
    const poleXDraw = poleX + sidePx * 0.25;
    const canopyCx = poleX + sidePx;
    const poleTop = headTopY - PX_PER_WU * 0.2;
    const canopyR = (size.w * PX_PER_WU) / 2;

    g.moveTo(poleXDraw, chestY);
    g.lineTo(poleXDraw, poleTop);
    g.stroke({ width: 4, color: 0x555555 });
    if (prop.state === 'open') {
      g.arc(canopyCx, poleTop, canopyR, Math.PI, 0);
      g.fill({ color: 0xcc3333, alpha: 0.92 });
      g.arc(canopyCx, poleTop, canopyR, Math.PI, 0);
      g.stroke({ width: 3, color: 0x992222 });
    }
  }

  private drawActorBody(
    g: Graphics,
    pose: ActorPose,
    facing: Facing,
    bodyColor: number,
    female: boolean,
  ): void {
    const { cx, bodyTop, bodyH, baseW } = pose;
    const widths = torsoWidths(baseW, female);

    if (facing === VIEW_FRONT) {
      drawFrontTorso(g, cx, bodyTop, bodyH, widths, bodyColor);
      g.ellipse(cx, bodyTop + bodyH * 0.1, widths.chest * 0.55, bodyH * 0.07);
      g.fill({ color: SKIN, alpha: 0.4 });
      return;
    }

    if (facing === VIEW_BACK) {
      drawBackTorso(g, cx, bodyTop, bodyH, widths, this.shade(bodyColor, 0.9));
      return;
    }

    const dir: 1 | -1 = facing === 'east' ? 1 : -1;
    drawSideTorso(g, cx, bodyTop, bodyH, widths, bodyColor, dir);
  }

  private shade(color: number, factor: number): number {
    const r = Math.min(255, ((color >> 16) & 0xff) * factor);
    const gv = Math.min(255, ((color >> 8) & 0xff) * factor);
    const b = Math.min(255, (color & 0xff) * factor);
    return (r << 16) | (gv << 8) | b;
  }

  private drawActorHair(
    g: Graphics,
    cx: number,
    headCy: number,
    headR: number,
    facing: Facing,
    hairColor: number,
    sitting: boolean,
  ): void {
    const hr = headR * (sitting ? 0.92 : 1);

    if (facing === VIEW_BACK) {
      g.circle(cx, headCy - hr * 0.05, hr * 1.02);
      g.fill(hairColor);
      g.ellipse(cx, headCy + hr * 0.38, hr * 0.68, hr * 0.26);
      g.fill(SKIN_SHADOW);
      return;
    }

    if (facing === VIEW_FRONT) {
      g.circle(cx, headCy, hr);
      g.fill(SKIN);
      g.arc(cx, headCy - hr * 0.12, hr * 1.02, Math.PI, 0);
      g.fill(hairColor);
      g.ellipse(cx - hr * 0.58, headCy - hr * 0.06, hr * 0.26, hr * 0.4);
      g.fill(hairColor);
      g.ellipse(cx + hr * 0.58, headCy - hr * 0.06, hr * 0.26, hr * 0.4);
      g.fill(hairColor);
      g.circle(cx - hr * 0.28, headCy + hr * 0.1, hr * 0.1);
      g.fill(0x2a2520);
      g.circle(cx + hr * 0.28, headCy + hr * 0.1, hr * 0.1);
      g.fill(0x2a2520);
      g.ellipse(cx, headCy + hr * 0.36, hr * 0.13, hr * 0.06);
      g.fill(SKIN_SHADOW);
      return;
    }

    const east = facing === 'east';
    const dir: 1 | -1 = east ? 1 : -1;
    const faceX = cx + dir * hr * 0.2;
    const backX = cx - dir * hr * 0.2;

    g.ellipse(backX, headCy, hr * 0.76, hr * 0.94);
    g.fill(hairColor);
    g.ellipse(faceX, headCy + hr * 0.04, hr * 0.6, hr * 0.8);
    g.fill(SKIN);
    g.ellipse(backX - dir * hr * 0.06, headCy - hr * 0.16, hr * 0.4, hr * 0.36);
    g.fill(hairColor);
    g.circle(faceX + dir * hr * 0.1, headCy + hr * 0.02, hr * 0.09);
    g.fill(0x2a2520);
    g.ellipse(faceX + dir * hr * 0.4, headCy + hr * 0.06, hr * 0.11, hr * 0.07);
    g.fill(SKIN_SHADOW);
  }

  private drawActor(
    g: Graphics,
    actor: { id: string; x: number; y: number; facing: string; state: string },
  ): void {
    const size = SIZES[actor.id as keyof typeof SIZES] ?? { w: 0.8, h: 1.6 };
    const sitting = actor.state === 'SITTING';
    const facing = sitting ? VIEW_FRONT : normalizeFacing(actor.facing);
    const pose = this.actorPose(actor, size);
    const bodyColor = ACTOR_COLORS[actor.id] ?? 0xffffff;
    const hairColor = ACTOR_HAIR[actor.id] ?? 0x3a3a3a;
    const female = FEMALE_ACTORS.has(actor.id);

    this.drawActorBody(g, pose, facing, bodyColor, female);
    this.drawActorHair(g, pose.cx, pose.headCy, pose.headR, facing, hairColor, sitting);
  }

  private applyCamera(snapshot: RuntimeSnapshot): void {
    const zoom = snapshot.camera.zoom || 1;
    const cam = { ...snapshot.camera };
    if (snapshot.mapSize) {
      clampCamera(cam, snapshot.mapSize.w, snapshot.mapSize.h);
    }
    const pivot = footRect(this.mapH, cam.x, cam.y, 0.01, 0.01);
    this.world.pivot.set(pivot.centerX, pivot.groundY);
    this.world.position.set(VIEW_W / 2, VIEW_H / 2);
    this.world.scale.set(zoom);
  }

  private drawRain(): void {
    this.rainLayer.removeChildren();
    if (this.weather !== 'rain') return;

    const g = new Graphics();
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * VIEW_W;
      const y = Math.random() * VIEW_H;
      g.moveTo(x, y);
      g.lineTo(x - 4, y + 12);
    }
    g.stroke({ width: 1, color: 0x88aaff, alpha: 0.45 });
    this.rainLayer.addChild(g);
  }

  private updateOverlay(snapshot: RuntimeSnapshot): void {
    if (!this.overlayEl) return;
    if (snapshot.dialogue) {
      const speaker = snapshot.dialogue.speaker
        ? `<span class="subtitle-speaker">${snapshot.dialogue.speaker}</span>`
        : '';
      this.overlayEl.innerHTML = `
        <div class="subtitle">
          ${speaker}
          <p class="subtitle-line">${snapshot.dialogue.line}</p>
        </div>`;
      this.overlayEl.style.display = 'flex';
    } else if (snapshot.narration) {
      this.overlayEl.innerHTML = `
        <div class="subtitle subtitle-narration">
          <p class="subtitle-line">${snapshot.narration}</p>
        </div>`;
      this.overlayEl.style.display = 'flex';
    } else if (snapshot.error) {
      this.overlayEl.innerHTML = `<div class="runtime-error">${snapshot.error.message} (L${snapshot.error.line})</div>`;
      this.overlayEl.style.display = 'flex';
    } else {
      this.overlayEl.innerHTML = '';
      this.overlayEl.style.display = 'none';
    }
  }
}
