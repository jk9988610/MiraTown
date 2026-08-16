# L1 — 世界模型

> 版本：0.1.0 · 依赖：L0

## 1. 坐标系

### 1.1 世界坐标（World Space）

采用**右手笛卡尔平面**，原点位于地图**左下角**：

```
        Y ↑
          |
          |     (x, y)
          |
    ------+------→ X
   (0,0)
```

| 属性 | 规范 |
|------|------|
| 原点 | `(0, 0)` = 地图左下角 |
| X 轴 | 向右为正 |
| Y 轴 | 向上为正 |
| 单位 | **1 wu**（world unit，世界单位） |
| 精度 | 坐标保留 **2 位小数**（`12.50`）；内部用浮点，比较容差 `ε = 0.01` |
| Z 轴 | 仅用于渲染层级（draw order），非空间维度；见 §4 |

### 1.2 屏幕坐标（Screen Space）

渲染时将世界坐标经摄像机变换为像素坐标：

```
screen_x = (world_x - cam_x) * zoom * px_per_wu + viewport_w / 2
screen_y = (world_y - cam_y) * zoom * px_per_wu + viewport_h / 2
```

| 属性 | MVP 默认值 |
|------|-----------|
| `px_per_wu` | 32（1 wu = 32px） |
| 视口 | 1280 × 720 px |
| `zoom` | 1.0（范围 0.5–2.0） |

### 1.3 瓦片坐标（Tile Space，可选索引）

地图底层按瓦片组织，便于碰撞与检索：

```
tile_x = floor(world_x)
tile_y = floor(world_y)
```

瓦片尺寸：**1 wu × 1 wu**（与 world unit 重合）。

## 2. 地图

### 2.1 MVP 地图尺寸

| 场景 ID | 宽 (wu) | 高 (wu) | 说明 |
|---------|---------|---------|------|
| `plaza` | 64 | 48 | 露天广场 |
| `cafe_interior` | 16 | 12 | 咖啡馆内景 |

### 2.2 合法坐标

实体位置 `(x, y)` 须满足：

```
0 ≤ x ≤ map_width - entity_width
0 ≤ y ≤ map_height - entity_height
```

其中 `entity_width/height` 取实体碰撞盒（见 L2）。越界 → Linter 错误 `E_OUT_OF_BOUNDS`。

### 2.3 可走区域

- 每场景维护 `walkable_mask`：瓦片级布尔矩阵。
- `@MOVE_TO` 路径须在可走区域内；不可走 → Runtime 错误 `E_PATH_BLOCKED`。
- MVP：广场全可走；咖啡馆内 `(0,0)–(15,0)` 一行墙不可走。

### 2.4 区域 ID（Zone）

用于剧本检索与镜头预设绑定：

```yaml
zones:
  - id: plaza_center
    scene: plaza
    rect: { x: 10, y: 8, w: 12, h: 8 }
  - id: plaza_bench
    scene: plaza
    rect: { x: 4, y: 3, w: 3, h: 2 }
```

## 3. 时间轴

### 3.1 两层时间

| 层级 | 符号 | 含义 |
|------|------|------|
| **场景时间** `t` | 从 `@SCENE` 开始计时 | 秒，精度 0.01s |
| **全局时间** `T` | 从剧本 `@BEGIN` 起累计 | 跨场景连续，用于回放索引 |

关系：`T = T_scene_start + t`

### 3.2 逻辑帧

| 属性 | 值 |
|------|-----|
| 逻辑 tick | 60 Hz（`Δt = 1/60 s`） |
| 渲染帧 | 跟随 `requestAnimationFrame`，插值基于逻辑状态 |

指令的 `duration` 以**秒**为单位；引擎按 tick 离散推进，末帧对齐。

### 3.3 时序组合语义（概要）

| 结构 | 语义 |
|------|------|
| 顺序（默认） | 子指令完成后执行下一条 |
| `@PARALLEL` | 子指令同时开始，块结束于**最慢**子指令完成 |
| `@WAIT n` | 阻塞 `n` 秒 |
| `@SEQUENCE` | 显式顺序块（等同默认，用于嵌套清晰） |

详细语义见 L5。

## 4. 渲染层级（Z-Order）

数值越大越靠前：

| 层级 | 值 | 内容 |
|------|-----|------|
| `GROUND` | 0 | 地面瓦片 |
| `PROP` | 100 | 道具 |
| `ACTOR` | 200 | 角色（同层按 `y` 排序，大 y 在前） |
| `EFFECT` | 300 | 粒子/特效 |
| `UI` | 1000 | 对话气泡、旁白（屏幕空间） |

## 5. 摄像机模型

### 5.1 摄像机状态

```typescript
interface CameraState {
  x: number;       // 世界坐标中心 X
  y: number;       // 世界坐标中心 Y
  zoom: number;    // 缩放倍率
  mode: 'fixed' | 'follow' | 'pan';
  target?: string; // follow 模式：actor id
}
```

### 5.2 视口

摄像机中心 `(cam_x, cam_y)` 映射到屏幕中心。可见世界范围：

```
visible_w = viewport_w / (zoom * px_per_wu)
visible_h = viewport_h / (zoom * px_per_wu)
```

### 5.3 跟随模式

| 模式 | 行为 |
|------|------|
| `fixed` | 坐标锁定，直到下一条 `@CAMERA` / `@CUT` / `@PAN` |
| `follow` | 每 tick：`cam = lerp(cam, target_pos + offset, k)`，`k = 1 - exp(-5 * Δt)` |
| `pan` | 在 `duration` 内线性插值到目标坐标 |

### 5.4 硬切 vs 软切

| 指令 | 类型 | 说明 |
|------|------|------|
| `@CUT` | 硬切 | 下一帧立即跳转 |
| `@CAMERA` + `duration=0` | 硬切 | 等同 `@CUT` |
| `@CAMERA` + `duration>0` | 软切 | 插值过渡 |
| `@PAN` | 软切 | 仅移动，不改变 zoom |

### 5.5 边界夹紧（Clamp）

摄像机中心夹紧，保证视口不超出地图：

```
cam_x = clamp(cam_x, visible_w/2, map_w - visible_w/2)
cam_y = clamp(cam_y, visible_h/2, map_h - visible_h/2)
```

## 6. 碰撞与占位

- 角色/道具使用**轴对齐矩形（AABB）**碰撞盒。
- 锚点默认在**脚底中心**（见 L2）。
- 两实体 AABB 重叠时，后移动的实体停止（`E_COLLISION` 日志，不崩溃）。
- MVP 不做推挤；后续版本可加。

## 7. 数据示例

```json
{
  "position": { "x": 12.50, "y": 8.00 },
  "facing": "east",
  "t": 3.20,
  "T": 15.70
}
```

```json
{
  "camera": {
    "x": 16.0,
    "y": 12.0,
    "zoom": 1.0,
    "mode": "follow",
    "target": "mira"
  }
}
```

## 8. 与世界模型相关的 Linter 规则

| 代码 | 条件 |
|------|------|
| `E_OUT_OF_BOUNDS` | 坐标或目标点超出地图/碰撞盒 |
| `E_INVALID_FACING` | `facing` 不是 `north|south|east|west` |
| `E_INVALID_ZONE` | `zone` ID 在场景中不存在 |
| `E_NEGATIVE_DURATION` | `duration < 0` |
