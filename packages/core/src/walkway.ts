import type { Vec2, WalkwayDef } from './types.js';

function segmentLength(a: Vec2, b: Vec2): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

export function walkwayTotalLength(points: Vec2[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    total += segmentLength(points[i - 1], points[i]);
  }
  return total;
}

/** t ∈ [0,1] 按弧长取人行道中心线上的点 */
export function pointAtWalkwayFraction(points: Vec2[], t: number): Vec2 {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return { ...points[0] };
  const clamped = Math.max(0, Math.min(1, t));
  const total = walkwayTotalLength(points);
  if (total <= 1e-6) return { ...points[0] };

  let target = clamped * total;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = segmentLength(a, b);
    if (target <= len) {
      const u = len > 0 ? target / len : 0;
      return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
    }
    target -= len;
  }
  return { ...points[points.length - 1] };
}

/** 将世界坐标投影到人行道折线，返回最近点 */
export function closestPointOnWalkway(points: Vec2[], p: Vec2): Vec2 {
  if (points.length === 0) return { ...p };
  if (points.length === 1) return { ...points[0] };

  let best = { ...points[0] };
  let bestDist = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const u = lenSq > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.y - a.y) * aby) / lenSq)) : 0;
    const candidate = { x: a.x + abx * u, y: a.y + aby * u };
    const dist = Math.hypot(p.x - candidate.x, p.y - candidate.y);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

/** 点在人行道折线上的弧长比例 t ∈ [0,1] */
export function walkwayFractionAtPoint(points: Vec2[], p: Vec2): number {
  const total = walkwayTotalLength(points);
  if (total <= 1e-6 || points.length < 2) return 0;

  const projected = closestPointOnWalkway(points, p);
  let walked = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const abx = b.x - a.x;
    const aby = b.y - a.y;
    const lenSq = abx * abx + aby * aby;
    const u = lenSq > 0 ? Math.max(0, Math.min(1, ((projected.x - a.x) * abx + (projected.y - a.y) * aby) / lenSq)) : 0;
    const onSeg = Math.hypot(projected.x - (a.x + abx * u), projected.y - (a.y + aby * u)) < 1e-4;
    if (onSeg) {
      walked += segmentLength(a, b) * u;
      return walked / total;
    }
    walked += segmentLength(a, b);
  }
  return 1;
}

export function distanceToWalkway(points: Vec2[], p: Vec2): number {
  const closest = closestPointOnWalkway(points, p);
  return Math.hypot(p.x - closest.x, p.y - closest.y);
}

const ON_PATH_EPS = 0.08;

/** 路径移动距离：离道时按直线，在道上时按弧长 */
export function walkwayMoveDistance(points: Vec2[], start: Vec2, target: Vec2): number {
  const startOn = distanceToWalkway(points, start) <= ON_PATH_EPS;
  const targetOn = distanceToWalkway(points, target) <= ON_PATH_EPS;
  if (startOn && targetOn) {
    const total = walkwayTotalLength(points);
    const startT = walkwayFractionAtPoint(points, start);
    const endT = walkwayFractionAtPoint(points, target);
    return Math.abs(endT - startT) * total;
  }
  return Math.hypot(target.x - start.x, target.y - start.y);
}

/** 路径移动插值：离道时直线走过去，在道上时沿弧长行走 */
export function interpolateWalkwayMove(
  points: Vec2[],
  start: Vec2,
  target: Vec2,
  progress: number,
): Vec2 {
  const startOn = distanceToWalkway(points, start) <= ON_PATH_EPS;
  const targetOn = distanceToWalkway(points, target) <= ON_PATH_EPS;
  if (startOn && targetOn) {
    const startT = walkwayFractionAtPoint(points, start);
    const endT = walkwayFractionAtPoint(points, target);
    const t = startT + (endT - startT) * progress;
    return pointAtWalkwayFraction(points, t);
  }
  return {
    x: start.x + (target.x - start.x) * progress,
    y: start.y + (target.y - start.y) * progress,
  };
}

export function resolveWalkwayTarget(
  walkway: WalkwayDef,
  params: { at?: number; x?: number; y?: number },
): Vec2 | null {
  if (params.at !== undefined) {
    return pointAtWalkwayFraction(walkway.points, params.at);
  }
  if (params.x !== undefined) {
    const xs = walkway.points.map((pt) => pt.x);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const x = Math.max(minX, Math.min(maxX, params.x));
    return closestPointOnWalkway(walkway.points, { x, y: params.y ?? walkway.points[0].y });
  }
  if (params.y !== undefined) {
    const ys = walkway.points.map((pt) => pt.y);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const y = Math.max(minY, Math.min(maxY, params.y));
    return closestPointOnWalkway(walkway.points, { x: params.x ?? walkway.points[0].x, y });
  }
  return pointAtWalkwayFraction(walkway.points, 0.5);
}

/** 双人并行走位：以路径中心为基准，左右各半间距 */
export function duoWalkPositions(
  walkway: WalkwayDef,
  centerAt: number,
  spacing = 1.0,
): { left: Vec2; right: Vec2 } {
  const center = pointAtWalkwayFraction(walkway.points, centerAt);
  const half = spacing / 2;
  return {
    left: closestPointOnWalkway(walkway.points, { x: center.x - half, y: center.y }),
    right: closestPointOnWalkway(walkway.points, { x: center.x + half, y: center.y }),
  };
}
