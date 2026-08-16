import { propFootY } from './constants.js';
import type { SceneLayoutDef } from './types.js';

export function layoutPropFootY(layout: SceneLayoutDef): number {
  return propFootY(layout.sidewalk_center_y, layout.sidewalk_width);
}
