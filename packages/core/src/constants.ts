/** 默认步行速度（wu/s），未指定 duration 时按路程自动计算 */
export const DEFAULT_WALK_SPEED = 2.0;

/** 双人并行走位间距（wu），以路径中心为基准左右各半 */
export const DUO_WALK_SPACING = 1.0;

/** 持伞侧向偏移（wu），spawn 时固定，禁止中途 SET_PROP 翻转 */
export const UMBRELLA_SIDE_OFFSET = 0.4;

/** 人行道相对路灯脚底的世界 Y 偏移（略低于灯座，朝屏幕近端） */
export const SIDEWALK_BELOW_LAMP_Y = 0.15;
