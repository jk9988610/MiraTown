/** 默认步行速度（wu/s），未指定 duration 时按路程自动计算 */
export const DEFAULT_WALK_SPEED = 2.0;

/** 双人并行走位间距（wu），以路径中心为基准左右各半 */
export const DUO_WALK_SPACING = 1.0;

/** 持伞侧向偏移（wu），spawn 时固定，禁止中途 SET_PROP 翻转 */
export const UMBRELLA_SIDE_OFFSET = 0.4;

/** 人行道宽度（wu） */
export const SIDEWALK_WIDTH = 1.2;

/** 道具脚底 Y：紧贴人行道顶缘（朝屏幕近端一侧），行人在 centerY 中心线行走 */
export function propFootY(sidewalkCenterY: number, width = SIDEWALK_WIDTH): number {
  return sidewalkCenterY - width / 2;
}

/** 雨夜广场人行道中心线 Y */
export const PLAZA_RAIN_WALK_CENTER_Y = 5.85;

/** 主广场人行道中心线 Y */
export const PLAZA_MAIN_WALK_CENTER_Y = 25.85;
