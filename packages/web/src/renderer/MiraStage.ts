import { Application, Container, Graphics } from 'pixi.js';
import { clampCamera, PX_PER_WU, VIEW_H, VIEW_W } from '@miratown/core';
import type { RuntimeSnapshot } from '@miratown/core';

/** 实体尺寸（与 catalog/entities.yaml 一致），锚点均为脚底中心 */
const SIZES = {
  mira: { w: 0.8, h: 1.6 },
  old_chen: { w: 0.9, h: 1.7 },
  lily: { w: 0.7, h: 1.5 },
  bench: { w: 2.0, h: 1.0 },
  umbrella: { w: 2.0, h: 1.8 },
  letter: { w: 0.2, h: 0.15 },
} as const;

const ACTOR_COLORS: Record<string, number> = {
  mira: 0x5b9cff,
  old_chen: 0x9aa5b1,
  lily: 0xff8fcb,
};

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

export class MiraStage {
  private app: Application | null = null;
  private world = new Container();
  private groundLayer = new Container();
  private propLayer = new Container();
  private actorLayer = new Container();
  private rainLayer = new Container();
  private actorGfx = new Map<string, Graphics>();
  private propGfx = new Map<string, Graphics>();
  private overlayEl: HTMLElement | null = null;
  private weather: 'clear' | 'rain' = 'clear';
  private mapW = 64;
  private mapH = 48;
  private lastSceneId: string | null = null;

  async mount(container: HTMLElement, overlay: HTMLElement): Promise<void> {
    this.overlayEl = overlay;
    this.app = new Application();
    await this.app.init({
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: 0x1a2332,
      antialias: true,
      resolution: 1,
      autoDensity: false,
    });

    const canvas = this.app.canvas as HTMLCanvasElement;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    canvas.style.aspectRatio = '16 / 9';
    container.replaceChildren(canvas);

    this.world.addChild(this.groundLayer);
    this.world.addChild(this.propLayer);
    this.world.addChild(this.actorLayer);
    this.app.stage.addChild(this.world);
    this.app.stage.addChild(this.rainLayer);

    this.drawGround();
  }

  destroy(): void {
    this.actorGfx.clear();
    this.propGfx.clear();
    this.app?.destroy(true, { children: true });
    this.app = null;
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
      this.weather = snapshot.sceneId === 'plaza' ? 'rain' : 'clear';
    }

    this.drawActors(snapshot);
    this.drawProps(snapshot);
    this.applyCamera(snapshot);
    this.drawRain();
    this.updateOverlay(snapshot);
  }

  private drawGround(): void {
    this.groundLayer.removeChildren();
    const g = new Graphics();

    // 地图外缘填充（防止镜头边缘露底色）
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

    const plaza = new Graphics();
    const cx = this.mapW / 2;
    const cy = this.mapH / 2;
    const center = footRect(this.mapH, cx, cy, 0.1, 0.1);
    plaza.circle(center.centerX, center.groundY - 40, Math.min(this.mapW, this.mapH) * PX_PER_WU * 0.35);
    plaza.fill({ color: 0x3a5a4a, alpha: 0.35 });
    this.groundLayer.addChild(plaza);
  }

  private drawActors(snapshot: RuntimeSnapshot): void {
    const seen = new Set<string>();
    for (const actor of snapshot.actors) {
      seen.add(actor.id);
      let g = this.actorGfx.get(actor.id);
      if (!g) {
        g = new Graphics();
        this.actorGfx.set(actor.id, g);
        this.actorLayer.addChild(g);
      }
      g.clear();
      const size = SIZES[actor.id as keyof typeof SIZES] ?? { w: 0.8, h: 1.6 };
      const r = footRect(this.mapH, actor.x, actor.y, size.w, size.h);
      const color = ACTOR_COLORS[actor.id] ?? 0xffffff;
      g.roundRect(r.left, r.top, r.width, r.height, 6);
      g.fill(color);
      g.circle(r.centerX, r.top + 10, 8);
      g.fill(0xffe0bd);
    }

    for (const [id, g] of this.actorGfx) {
      if (!seen.has(id)) {
        g.destroy();
        this.actorGfx.delete(id);
      }
    }
  }

  private drawProps(snapshot: RuntimeSnapshot): void {
    const seen = new Set<string>();
    for (const prop of snapshot.props) {
      seen.add(prop.id);
      let g = this.propGfx.get(prop.id);
      if (!g) {
        g = new Graphics();
        this.propGfx.set(prop.id, g);
        this.propLayer.addChild(g);
      }
      g.clear();
      const size = SIZES[prop.prop as keyof typeof SIZES] ?? { w: 0.5, h: 0.5 };
      const r = footRect(this.mapH, prop.x, prop.y, size.w, size.h);

      if (prop.prop === 'bench') {
        g.roundRect(r.left, r.top, r.width, r.height, 4);
        g.fill(0x8b5a2b);
      } else if (prop.prop === 'umbrella') {
        const poleTop = r.groundY - r.height * 0.75;
        g.moveTo(r.centerX, r.groundY);
        g.lineTo(r.centerX, poleTop);
        g.stroke({ width: 4, color: 0x555555 });
        if (prop.state === 'open') {
          const canopyR = size.w * PX_PER_WU * 0.48;
          g.arc(r.centerX, poleTop, canopyR, Math.PI, 0);
          g.fill({ color: 0xcc3333, alpha: 0.9 });
          g.arc(r.centerX, poleTop, canopyR, Math.PI, 0);
          g.stroke({ width: 2, color: 0x992222 });
        } else {
          g.moveTo(r.centerX - 8, poleTop);
          g.lineTo(r.centerX + 8, poleTop - 6);
          g.stroke({ width: 3, color: 0x666666 });
        }
      } else {
        g.rect(r.left, r.top, r.width, r.height);
        g.fill(0xf5e6c8);
      }
    }

    for (const [id, g] of this.propGfx) {
      if (!seen.has(id)) {
        g.destroy();
        this.propGfx.delete(id);
      }
    }
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
      this.overlayEl.innerHTML = `
        <div class="bubble">
          <strong>${snapshot.dialogue.speaker}</strong>
          <p>${snapshot.dialogue.line}</p>
        </div>`;
      this.overlayEl.style.display = 'flex';
    } else if (snapshot.narration) {
      this.overlayEl.innerHTML = `<div class="narration">${snapshot.narration}</div>`;
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
