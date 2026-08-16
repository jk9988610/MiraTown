/** 角色与路灯距离小于此值时触发近灯深度特例（wu） */
export const LAMP_NEAR_WU = 1.2;

export const DEPTH_BIAS = {
  bench: -0.12,
  lampNearActor: -0.1,
  actorSitting: 0.15,
  actorNearLamp: 0.1,
  umbrellaFront: 0.18,
  umbrellaBack: -0.22,
} as const;

/** 脚底 Y 越小越靠前；升序绘制，返回值越大越靠前 */
export function depthSortKey(footY: number, bias = 0): number {
  return -footY + bias;
}
