export interface Vec2 {
  x: number;
  y: number;
}

export interface FrontMatter {
  title: string;
  theme: string;
  synopsis: string;
  dsl_version: string;
  catalog_version: string;
  cast: string[];
  scenes: string[];
  duration_estimate: number;
  tags?: string[];
  acts?: number;
  tone?: string;
  author?: string;
  language?: string;
}

export type ParamValue = string | number | boolean | Vec2;

export interface DirectiveNode {
  kind: 'directive';
  name: string;
  params: Record<string, ParamValue>;
  line: number;
  raw?: string;
}

export interface BlockNode {
  kind: 'block';
  name: 'DIALOGUE' | 'NARRATION' | 'PARALLEL' | 'SEQUENCE';
  params: Record<string, ParamValue>;
  children: ScriptNode[];
  lines?: string[];
  line: number;
}

export type ScriptNode = DirectiveNode | BlockNode;

export interface ScriptAST {
  frontMatter: FrontMatter;
  body: ScriptNode[];
}

export interface LintIssue {
  code: string;
  level: 'error' | 'warning';
  line: number;
  message: string;
  suggestion?: string;
}

export interface LintReport {
  passed: boolean;
  errors: LintIssue[];
  warnings: LintIssue[];
}

export interface ActorDef {
  id: string;
  display_name: string;
  width: number;
  height: number;
  anchor: string;
  animations: string[];
  tags: string[];
  body_profile?: BodyProfile;
}

export type BodyProfile = 'female' | 'male';

export interface PropDef {
  id: string;
  display_name: string;
  width: number;
  height: number;
  anchor: string;
  placeable: boolean;
  states: string[];
  tags: string[];
}

export interface SceneDef {
  id: string;
  display_name: string;
  width: number;
  height: number;
  default_camera: string;
  env: Record<string, string[]>;
}

export interface CameraPresetDef {
  id: string;
  display_name: string;
  zoom: number;
  offset: { x: number; y: number };
  mode: 'fixed' | 'follow' | 'pan';
}

export interface ZoneDef {
  id: string;
  scene: string;
  rect: { x: number; y: number; w: number; h: number };
}

export interface WalkwayDef {
  id: string;
  scene: string;
  points: Vec2[];
  width: number;
  visible_default: boolean;
}

export interface SceneLayoutDef {
  id: string;
  scene: string;
  walkway_id: string;
  sidewalk_center_y: number;
  sidewalk_width: number;
  lamps: Array<{ id: string; x: number }>;
  bench: { id: string; x: number };
}

export interface Catalog {
  catalog_version: string;
  actors: Map<string, ActorDef>;
  props: Map<string, PropDef>;
  scenes: Map<string, SceneDef>;
  camera_presets: Map<string, CameraPresetDef>;
  zones: Map<string, ZoneDef>;
  walkways: Map<string, WalkwayDef>;
  scene_layouts: Map<string, SceneLayoutDef>;
}

export type IROp =
  | 'BEGIN'
  | 'END_SCRIPT'
  | 'ACT'
  | 'SCENE'
  | 'CAST'
  | 'ENTER'
  | 'EXIT'
  | 'MOVE_TO'
  | 'FACE'
  | 'SIT'
  | 'STAND'
  | 'PLAY_ANIM'
  | 'EMOTE'
  | 'DIALOGUE'
  | 'NARRATION'
  | 'SPAWN_PROP'
  | 'DESPAWN_PROP'
  | 'LAYOUT'
  | 'SET_PROP'
  | 'SET_WALKWAY'
  | 'GIVE'
  | 'CAMERA'
  | 'CUT'
  | 'PAN'
  | 'WAIT'
  | 'PARALLEL'
  | 'SEQUENCE';

export interface IRNode {
  op: IROp;
  params: Record<string, ParamValue>;
  children?: IRNode[];
  lines?: string[];
  line: number;
}

export interface RuntimeEvent {
  T: number;
  type: string;
  line?: number;
  detail: Record<string, unknown>;
}

export interface RuntimeSnapshot {
  T: number;
  t: number;
  sceneId: string | null;
  weather: 'clear' | 'rain';
  actors: Array<{ id: string; x: number; y: number; facing: string; state: string }>;
  props: Array<{
    id: string;
    prop: string;
    x: number;
    y: number;
    state: string;
    attach?: string;
    offsetX?: number;
    offsetY?: number;
  }>;
  camera: { x: number; y: number; zoom: number; mode: string; target?: string };
  mapSize: { w: number; h: number } | null;
  walkways: Array<{ id: string; visible: boolean }>;
  dialogue?: { speaker: string; line: string };
  narration?: string;
  completed: boolean;
  error?: { code: string; line: number; message: string };
}
