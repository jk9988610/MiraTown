import { Application, Container, Graphics } from 'pixi.js';
import { clampCamera, PX_PER_WU, VIEW_H, VIEW_W } from '@miratown/core';
import type { RuntimeSnapshot } from '@miratown/core';

/** 实体尺寸（与 catalog/entities.yaml 一致），锚点均为脚底中心 */
const SIZES = {
  mira: { w: 0.8, h: 1.6 },
  old_chen: { w: 0.9, h: 1.7 },
  lily: { w: 0.7, h: 1.5 },
  bench: { w: 2.0, h: 1.0 },
  umbrella: { w: 4.5, h: 2.5 },
  lamp_post: { w: 0.4, h: 3.5 },
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
  private puddleLayer = new Container();
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
    this.world.addChild(this.puddleLayer);
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
    }
    this.weather = snapshot.weather ?? 'clear';

    this.drawRainPuddles(snapshot);
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

    // 广场地面微纹理（不再用无来源的居中光斑）
  }

  /** 路灯照射范围内的水洼（暖色反光） */
  private drawRainPuddles(snapshot: RuntimeSnapshot): void {
    this.puddleLayer.removeChildren();
    if (this.weather !== 'rain') return;

    const lamps = snapshot.props.filter((p) => p.prop === 'lamp_post' && p.state === 'on');
    if (lamps.length === 0) return;

    const g = new Graphics();
    const LAMP_GLOW_WU = 3.2;

    for (const lamp of lamps) {
      const base = footRect(this.mapH, lamp.x, lamp.y, 0.01, 0.01);
      // 水洼紧贴灯柱脚下、在光晕半径内
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

      // 第二片小水洼，仍在光晕内
      const puddle2X = base.centerX - 14;
      const puddle2Y = base.groundY + 5;
      if (LAMP_GLOW_WU * PX_PER_WU > 14) {
        g.ellipse(puddle2X, puddle2Y, puddleRx * 0.55, puddleRy * 0.7);
        g.fill({ color: 0x1a2838, alpha: 0.7 });
        g.ellipse(puddle2X + 4, puddle2Y - 1, puddleRx * 0.2, puddleRy * 0.3);
        g.fill({ color: 0xffd070, alpha: 0.45 });
      }
    }
    this.puddleLayer.addChild(g);
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
      } else if (prop.prop === 'lamp_post') {
        const lit = prop.state === 'on';
        const base = footRect(this.mapH, prop.x, prop.y, 0.01, 0.01);
        if (lit) {
          const glowR = PX_PER_WU * 3.2;
          g.circle(base.centerX, base.groundY, glowR);
          g.fill({ color: 0xffd27f, alpha: 0.16 });
          g.circle(base.centerX, base.groundY, glowR * 0.55);
          g.fill({ color: 0xffe8a8, alpha: 0.12 });
        }
        g.rect(base.centerX - 3, base.groundY - r.height, 6, r.height);
        g.fill(0x3a4555);
        const headY = base.groundY - r.height + 8;
        g.roundRect(base.centerX - 10, headY - 6, 20, 12, 3);
        g.fill(lit ? 0xffe9b0 : 0x556677);
        if (lit) {
          g.circle(base.centerX, headY, 14);
          g.fill({ color: 0xfff2c8, alpha: 0.55 });
        }
      } else if (prop.prop === 'umbrella') {
        const poleTop = r.groundY - r.height * 0.88;
        g.moveTo(r.centerX, r.groundY);
        g.lineTo(r.centerX, poleTop);
        g.stroke({ width: 5, color: 0x555555 });
        if (prop.state === 'open') {
          const canopyR = (size.w * PX_PER_WU) / 2;
          g.arc(r.centerX, poleTop, canopyR, Math.PI, 0);
          g.fill({ color: 0xcc3333, alpha: 0.92 });
          g.arc(r.centerX, poleTop, canopyR, Math.PI, 0);
          g.stroke({ width: 3, color: 0x992222 });
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
