/** 默认步行速度（wu/s），未指定 duration 时按路程自动计算 */
export const DEFAULT_WALK_SPEED = 2.0;

/** 双人并行走位间距（wu），以路径中心为基准左右各半 */
export const DUO_WALK_SPACING = 1.0;

/** 持伞侧向偏移（wu），spawn 时固定，禁止中途 SET_PROP 翻转 */
export const UMBRELLA_SIDE_OFFSET = 0.4;

/** 人行道宽度（wu） */
export const SIDEWALK_WIDTH = 1.2;

/** 世界 Y 更大 = 人行道顶缘（北侧）；更小 = 底缘（南侧，朝摄像机） */
export function sidewalkTopY(centerY: number, width = SIDEWALK_WIDTH): number {
  return centerY + width / 2;
}

export function sidewalkBottomY(centerY: number, width = SIDEWALK_WIDTH): number {
  return centerY - width / 2;
}

/** 路灯/长椅脚底：紧贴人行道顶缘（y 较大一侧） */
export function propFootY(sidewalkCenterY: number, width = SIDEWALK_WIDTH): number {
  return sidewalkTopY(sidewalkCenterY, width);
}

/** @deprecated 使用 propFootY */
export const PLAZA_RAIN_WALK_CENTER_Y = 5.85;
export const PLAZA_MAIN_WALK_CENTER_Y = 25.85;
