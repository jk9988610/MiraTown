import { stringify as stringifyYaml } from 'yaml';
import type { MapObjectDef, SceneDef, WalkwayDef } from './types.js';

export const MAP_EXPORT_VERSION = '1.0';

export interface MapExportDocument {
  export_version: string;
  catalog_version: string;
  exported_at: string;
  note: string;
  scenes: SceneDef[];
  walkways: WalkwayDef[];
  map_objects: MapObjectDef[];
}

export function buildMapExportDocument(input: {
  catalog_version: string;
  scenes: SceneDef[];
  walkways: WalkwayDef[];
  map_objects: MapObjectDef[];
}): MapExportDocument {
  return {
    export_version: MAP_EXPORT_VERSION,
    catalog_version: input.catalog_version,
    exported_at: new Date().toISOString(),
    note: 'MiraTown 地图导出。将 walkways 与 map_objects 合并进 catalog/entities.yaml，或由开发者协助融入项目。',
    scenes: input.scenes,
    walkways: input.walkways,
    map_objects: input.map_objects,
  };
}

export function serializeMapExport(doc: MapExportDocument): string {
  const header = `# MiraTown Map Export v${doc.export_version}
# exported_at: ${doc.exported_at}
# 用法：将下方 YAML 中的 walkways / map_objects 合并到 catalog/entities.yaml
# 剧本只引用地图已有内容，不使用 @SPAWN_PROP / @LAYOUT / @SPAWN_WALKWAY

`;
  return header + stringifyYaml(doc, { lineWidth: 0 });
}

/** 人行道必须为水平或竖直直线 */
export function validateStraightWalkway(points: { x: number; y: number }[]): string | null {
  if (points.length !== 2) return '人行道须为两点直线';
  const [a, b] = points;
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  if (dx < 0.01 && dy < 0.01) return '人行道长度不能为 0';
  if (dx > 0.01 && dy > 0.01) return '人行道必须为水平或竖直直线';
  return null;
}

export function snapStraightEndpoint(
  from: { x: number; y: number },
  to: { x: number; y: number },
): { x: number; y: number } {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  if (dx >= dy) {
    return { x: to.x, y: from.y };
  }
  return { x: from.x, y: to.y };
}

export function snapWorldCoord(value: number, step = 0.05): number {
  return Math.round(value / step) * step;
}
