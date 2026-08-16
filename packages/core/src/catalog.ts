import { parse as parseYaml } from 'yaml';
import type {
  ActorDef,
  CameraPresetDef,
  Catalog,
  PropDef,
  SceneDef,
  ZoneDef,
} from './types.js';

interface RawCatalog {
  catalog_version: string;
  actors: ActorDef[];
  props: PropDef[];
  scenes: SceneDef[];
  camera_presets: CameraPresetDef[];
  zones: ZoneDef[];
}

function toMap<T extends { id: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.id, item]));
}

export function loadCatalogFromObject(raw: RawCatalog): Catalog {
  return {
    catalog_version: raw.catalog_version,
    actors: toMap(raw.actors),
    props: toMap(raw.props),
    scenes: toMap(raw.scenes),
    camera_presets: toMap(raw.camera_presets),
    zones: toMap(raw.zones),
  };
}

export function loadCatalogFromYaml(yamlText: string): Catalog {
  const raw = parseYaml(yamlText) as RawCatalog;
  return loadCatalogFromObject(raw);
}

export const DEFAULT_CATALOG_YAML = `catalog_version: "1.0.0"

actors:
  - id: mira
    display_name: 米拉
    width: 0.8
    height: 1.6
    anchor: foot
    animations: [idle, walk, wave, sit, talk]
    tags: [居民, 主角]
  - id: old_chen
    display_name: 陈伯
    width: 0.9
    height: 1.7
    anchor: foot
    animations: [idle, walk, nod, sit, talk]
    tags: [居民, 长者]
  - id: lily
    display_name: 莉莉
    width: 0.7
    height: 1.5
    anchor: foot
    animations: [idle, walk, jump, talk]
    tags: [居民, 孩子]

props:
  - id: bench
    display_name: 长椅
    width: 2.0
    height: 1.0
    anchor: foot
    placeable: true
    states: [empty, occupied]
    tags: [家具]
  - id: umbrella
    display_name: 雨伞
    width: 2.0
    height: 1.8
    anchor: foot
    placeable: true
    states: [closed, open]
    tags: [手持]
  - id: letter
    display_name: 信
    width: 0.2
    height: 0.15
    anchor: center
    placeable: false
    states: [sealed, open]
    tags: [剧情]

scenes:
  - id: plaza
    display_name: 中心广场
    width: 64
    height: 48
    default_camera: cam_wide
    env:
      time: [day, evening, night]
      weather: [clear, rain]
  - id: cafe_interior
    display_name: 街角咖啡馆
    width: 16
    height: 12
    default_camera: cam_medium
    env:
      lighting: [warm_light, dim]

camera_presets:
  - id: cam_wide
    display_name: 广场全景
    zoom: 1.0
    offset: { x: 0, y: 0 }
    mode: fixed
  - id: cam_medium
    display_name: 中景
    zoom: 1.0
    offset: { x: 0, y: 0.5 }
    mode: fixed
  - id: cam_close
    display_name: 近景特写
    zoom: 1.0
    offset: { x: 0, y: 0.8 }
    mode: fixed
  - id: cam_follow
    display_name: 跟随主角
    zoom: 1.0
    offset: { x: 0, y: 0.5 }
    mode: follow

zones:
  - id: plaza_center
    scene: plaza
    rect: { x: 26, y: 20, w: 12, h: 8 }
  - id: plaza_bench
    scene: plaza
    rect: { x: 8, y: 6, w: 3, h: 2 }
`;

export function loadEmbeddedCatalog(): Catalog {
  return loadCatalogFromYaml(DEFAULT_CATALOG_YAML);
}

export function getZoneCenter(zone: ZoneDef): { x: number; y: number } {
  return {
    x: zone.rect.x + zone.rect.w / 2,
    y: zone.rect.y + zone.rect.h / 2,
  };
}
