/** 视口与地图常量（与 L1 / 渲染器一致） */
export const VIEW_W = 1280;
export const VIEW_H = 720;
export const PX_PER_WU = 32;

export interface CameraLike {
  x: number;
  y: number;
  zoom: number;
}

/** 可见世界范围（wu） */
export function visibleWorldSize(zoom: number): { w: number; h: number } {
  return {
    w: VIEW_W / (zoom * PX_PER_WU),
    h: VIEW_H / (zoom * PX_PER_WU),
  };
}

/** 夹紧镜头中心，保证视口不超出地图（L1 §5.5） */
export function clampCamera(
  cam: CameraLike,
  mapW: number,
  mapH: number,
): CameraLike {
  const { w: vw, h: vh } = visibleWorldSize(cam.zoom);
  const halfW = vw / 2;
  const halfH = vh / 2;

  if (mapW <= vw) {
    cam.x = mapW / 2;
  } else {
    cam.x = Math.max(halfW, Math.min(mapW - halfW, cam.x));
  }

  if (mapH <= vh) {
    cam.y = mapH / 2;
  } else {
    cam.y = Math.max(halfH, Math.min(mapH - halfH, cam.y));
  }

  return cam;
}
