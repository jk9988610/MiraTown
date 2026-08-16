import { interpolateWalkwayMove, walkwayMoveDistance } from './walkway.js';
import type { Vec2 } from './types.js';

const ALIGN_EPS = 0.04;
const LANE_EPS = 0.15;

export interface AbreastMemberPlan {
  actorId: string;
  start: Vec2;
  target: Vec2;
  pathPoints?: Vec2[];
}

export interface AbreastGroup {
  members: AbreastMemberPlan[];
  alignAxis: 'x' | 'y' | null;
  alignValue: number;
  phase: 'align' | 'sync';
  alignElapsed: number;
  alignDuration: number;
  syncElapsed: number;
  syncDuration: number;
  speed: number;
  finished: boolean;
  alignedStarts: Vec2[];
}

function axisCoord(p: Vec2, axis: 'x' | 'y'): number {
  return axis === 'x' ? p.x : p.y;
}

function setAxisCoord(p: Vec2, axis: 'x' | 'y', value: number): Vec2 {
  return axis === 'x' ? { x: value, y: p.y } : { x: p.x, y: value };
}

export function createAbreastGroup(members: AbreastMemberPlan[], speed: number): AbreastGroup {
  const dx = members[0].target.x - members[0].start.x;
  const dy = members[0].target.y - members[0].start.y;
  const primaryX = Math.abs(dx) >= Math.abs(dy);
  const travelSign = Math.sign(primaryX ? dx : dy) || 1;

  let alignAxis: 'x' | 'y' | null = primaryX ? 'x' : 'y';
  let alignValue = 0;
  let alignDuration = 0;

  if (alignAxis === 'y') {
    const xSpread =
      Math.max(...members.map((m) => m.start.x)) - Math.min(...members.map((m) => m.start.x));
    if (xSpread > LANE_EPS) {
      alignAxis = null;
    } else {
      const starts = members.map((m) => m.start.y);
      alignValue = travelSign > 0 ? Math.max(...starts) : Math.min(...starts);
    }
  } else {
    const starts = members.map((m) => m.start.x);
    alignValue = travelSign > 0 ? Math.max(...starts) : Math.min(...starts);
  }

  if (alignAxis) {
    for (const m of members) {
      const gap = Math.abs(axisCoord(m.start, alignAxis) - alignValue);
      if (gap > ALIGN_EPS) {
        alignDuration = Math.max(alignDuration, gap / speed);
      }
    }
  }

  const alignedStarts = members.map((m) => {
    if (!alignAxis) return { ...m.start };
    return setAxisCoord(m.start, alignAxis, alignValue);
  });

  let syncDuration = 0;
  for (let i = 0; i < members.length; i++) {
    const m = members[i];
    const dist = m.pathPoints
      ? walkwayMoveDistance(m.pathPoints, alignedStarts[i], m.target)
      : Math.hypot(m.target.x - alignedStarts[i].x, m.target.y - alignedStarts[i].y);
    syncDuration = Math.max(syncDuration, dist / speed);
  }

  return {
    members: members.map((m, i) => ({ ...m, start: { ...m.start } })),
    alignAxis,
    alignValue,
    phase: alignDuration > 0 ? 'align' : 'sync',
    alignElapsed: 0,
    alignDuration,
    syncElapsed: 0,
    syncDuration,
    speed,
    finished: false,
    alignedStarts,
  };
}

export function tickAbreastGroup(
  group: AbreastGroup,
  dt: number,
  setPosition: (actorId: string, pos: Vec2, walking: boolean) => void,
): void {
  if (group.finished) return;

  if (group.phase === 'align' && group.alignAxis) {
    group.alignElapsed += dt;
    const t = Math.min(1, group.alignDuration > 0 ? group.alignElapsed / group.alignDuration : 1);
    const axis = group.alignAxis;

    for (const m of group.members) {
      const from = m.start;
      const gap = Math.abs(axisCoord(from, axis) - group.alignValue);
      if (gap <= ALIGN_EPS) {
        setPosition(m.actorId, { ...from }, false);
      } else {
        const p = { ...from };
        const next = axisCoord(from, axis) + (group.alignValue - axisCoord(from, axis)) * t;
        setPosition(m.actorId, setAxisCoord(from, axis, next), true);
      }
    }

    if (t >= 1) {
      group.phase = 'sync';
      for (let i = 0; i < group.members.length; i++) {
        group.members[i].start = { ...group.alignedStarts[i] };
      }
    }
    return;
  }

  group.syncElapsed += dt;
  const progress = Math.min(1, group.syncDuration > 0 ? group.syncElapsed / group.syncDuration : 1);

  for (let i = 0; i < group.members.length; i++) {
    const m = group.members[i];
    const start = group.alignedStarts[i];
    let pos: Vec2;
    if (m.pathPoints) {
      pos = interpolateWalkwayMove(m.pathPoints, start, m.target, progress);
    } else {
      pos = {
        x: start.x + (m.target.x - start.x) * progress,
        y: start.y + (m.target.y - start.y) * progress,
      };
    }
    setPosition(m.actorId, pos, progress < 1);
  }

  if (progress >= 1) {
    for (const m of group.members) {
      setPosition(m.actorId, m.target, false);
    }
    group.finished = true;
  }
}

/** 座位在人行道中心线上的落脚点 x */
export function benchSeatPathX(benchX: number, benchWidth: number, seat: number): number {
  const offset = seat === 1 ? benchWidth * 0.22 : -benchWidth * 0.22;
  return benchX + offset;
}

export function pickNearestSeat(actorX: number, benchX: number, benchWidth: number): number {
  const west = benchSeatPathX(benchX, benchWidth, 0);
  const east = benchSeatPathX(benchX, benchWidth, 1);
  return Math.abs(actorX - west) <= Math.abs(actorX - east) ? 0 : 1;
}
