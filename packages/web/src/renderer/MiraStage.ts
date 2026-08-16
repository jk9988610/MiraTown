import { Application, Container, Graphics } from 'pixi.js';
import type { RuntimeSnapshot } from '@miratown/core';

const PX_PER_WU = 32;
const MAP_W = 32;
const MAP_H = 24;
const VIEW_W = 1280;
const VIEW_H = 720;

const ACTOR_COLORS: Record<string, number> = {
  mira: 0x5b9cff,
  old_chen: 0x9aa5b1,
  lily: 0xff8fcb,
};

const PROP_COLORS: Record<string, number> = {
  bench: 0x8b5a2b,
  umbrella: 0xcc3333,
  letter: 0xf5e6c8,
};

function worldToScreen(x: number, y: number): { x: number; y: number } {
  return {
    x: x * PX_PER_WU,
    y: (MAP_H - y) * PX_PER_WU,
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
  private rainDrops: Graphics[] = [];

  async mount(container: HTMLElement, overlay: HTMLElement): Promise<void> {
    this.overlayEl = overlay;
    this.app = new Application();
    await this.app.init({
      width: VIEW_W,
      height: VIEW_H,
      backgroundColor: 0x1a2332,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
    });

    container.replaceChildren(this.app.canvas);

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
    this.rainDrops = [];
    this.app?.destroy(true, { children: true });
    this.app = null;
  }

  update(snapshot: RuntimeSnapshot): void {
    if (!this.app) return;

    if (snapshot.sceneId === 'plaza') {
      this.weather = 'rain';
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
    for (let tx = 0; tx < MAP_W; tx++) {
      for (let ty = 0; ty < MAP_H; ty++) {
        const wx = tx;
        const wy = MAP_H - 1 - ty;
        const p = worldToScreen(wx + 0.5, wy + 0.5);
        const checker = (tx + ty) % 2 === 0;
        g.rect(p.x - PX_PER_WU / 2, p.y - PX_PER_WU / 2, PX_PER_WU, PX_PER_WU);
        g.fill(checker ? 0x2d4a3e : 0x264038);
      }
    }
    this.groundLayer.addChild(g);

    const plaza = new Graphics();
    const center = worldToScreen(16, 12);
    plaza.circle(center.x, center.y, 120);
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
      const color = ACTOR_COLORS[actor.id] ?? 0xffffff;
      const w = (actor.id === 'old_chen' ? 0.9 : 0.8) * PX_PER_WU;
      const h = (actor.id === 'old_chen' ? 1.7 : 1.6) * PX_PER_WU;
      const foot = worldToScreen(actor.x, actor.y);
      g.roundRect(foot.x - w / 2, foot.y - h, w, h, 6);
      g.fill(color);
      g.circle(foot.x, foot.y - h + 10, 8);
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
      const color = PROP_COLORS[prop.prop] ?? 0xaaaaaa;
      const foot = worldToScreen(prop.x, prop.y);
      if (prop.prop === 'bench') {
        g.roundRect(foot.x - PX_PER_WU, foot.y - PX_PER_WU * 0.4, PX_PER_WU * 2, PX_PER_WU * 0.5, 4);
        g.fill(color);
      } else if (prop.prop === 'umbrella') {
        const open = prop.state === 'open';
        g.moveTo(foot.x, foot.y);
        g.lineTo(foot.x, foot.y - 40);
        g.stroke({ width: 3, color: 0x666666 });
        if (open) {
          g.arc(foot.x, foot.y - 40, 22, Math.PI, 0);
          g.fill({ color: 0xcc3333, alpha: 0.85 });
        }
      } else {
        g.rect(foot.x - 8, foot.y - 8, 16, 12);
        g.fill(color);
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
    const cam = worldToScreen(snapshot.camera.x, snapshot.camera.y);
    this.world.scale.set(zoom);
    this.world.x = VIEW_W / 2 - cam.x * zoom;
    this.world.y = VIEW_H / 2 - cam.y * zoom;
  }

  private drawRain(): void {
    this.rainLayer.removeChildren();
    if (this.weather !== 'rain') return;

    const g = new Graphics();
    for (let i = 0; i < 80; i++) {
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
