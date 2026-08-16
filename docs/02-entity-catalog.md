# L2 — 实体目录

> 版本：0.1.0 · `catalog_version`: `1.0.0` · 依赖：L1

AI 剧本中引用的 `actor`、`prop`、`scene`、`camera preset` **必须来自本目录**。目录以 YAML 维护，程序启动时加载；Linter 用同一份数据校验。

源文件：`catalog/entities.yaml`

---

## 1. 角色（Actors）

锚点均为**脚底中心**（`anchor: foot`）。碰撞盒以锚点为底边中心向上延伸。

| id | display_name | width | height | 可用动画 | tags |
|----|-------------|-------|--------|----------|------|
| `mira` | 米拉 | 0.8 | 1.6 | `idle`, `walk`, `wave`, `sit`, `talk` | 居民, 主角 |
| `old_chen` | 陈伯 | 0.9 | 1.7 | `idle`, `walk`, `nod`, `sit`, `talk` | 居民, 长者 |
| `lily` | 莉莉 | 0.7 | 1.5 | `idle`, `walk`, `jump`, `talk` | 居民, 孩子 |

### 1.1 朝向与动画映射

`facing` 取值：`north | south | east | west`

- `walk` 动画根据 `facing` 选四方向资源
- `idle` / `talk` 等同理
- 无方向动画（`sit`）保持最后朝向

### 1.2 DSL 引用

```
@CAST actor=mira
@ENTER actor=mira at=(10, 5) facing=east
```

`actor` 参数值 = 表中的 `id`（小写蛇形）。

---

## 2. 道具（Props）

| id | display_name | width | height | placeable | 状态 | tags |
|----|-------------|-------|--------|-----------|------|------|
| `bench` | 长椅 | 2.0 | 1.0 | 是 | `empty`, `occupied` | 家具 |
| `umbrella` | 雨伞 | 0.6 | 1.2 | 是 | `closed`, `open` | 手持 |
| `letter` | 信 | 0.2 | 0.15 | 否 | `sealed`, `open` | 剧情 |

### 2.1 道具行为约束

| 道具 | 规则 |
|------|------|
| `bench` | `occupied` 时不可 `@SPAWN_PROP` 到同格；角色 `@SIT` 关联 |
| `umbrella` | `open` 状态显示遮罩层；可由 `@SET_PROP` 切换 |
| `letter` | **只能 `@GIVE`** 给角色；`@SPAWN_PROP prop=letter` 被 Linter 拒绝（`E_PROP_NOT_PLACEABLE`） |

### 2.2 DSL 引用

```
@SPAWN_PROP prop=bench at=(4, 3) state=empty
@SET_PROP prop=umbrella_1 state=open
@GIVE actor=mira prop=letter
```

实例 ID：生成时自动 `prop_id = {type}_{seq}`，如 `bench_1`；剧本可用 `@SPAWN_PROP id=bench_1` 显式命名。

---

## 3. 场景（Scenes）

| id | display_name | 尺寸 (w×h) | 默认镜头 | 环境预设 |
|----|-------------|-----------|----------|----------|
| `plaza` | 中心广场 | 32×24 | `cam_wide` | `day`, `evening`, `night`, `rain` |
| `cafe_interior` | 街角咖啡馆 | 16×12 | `cam_medium` | `warm_light`, `dim` |

### 3.1 环境参数

`@SCENE` 的 `weather` / `lighting` 须为对应场景的合法预设子集：

```
@SCENE id=plaza time=evening weather=rain
@SCENE id=cafe_interior lighting=warm_light
```

| 参数 | 合法值 |
|------|--------|
| `time` | `day`, `evening`, `night`（仅 `plaza`） |
| `weather` | `clear`, `rain`（仅 `plaza`） |
| `lighting` | `warm_light`, `dim`（仅 `cafe_interior`） |

---

## 4. 摄像机预设（Camera Presets）

| id | 说明 | zoom | offset (x,y) | 默认 mode |
|----|------|------|--------------|-----------|
| `cam_wide` | 广场全景 | 0.8 | (0, 0) | fixed |
| `cam_medium` | 中景 | 1.0 | (0, 0.5) | fixed |
| `cam_close` | 近景特写 | 1.5 | (0, 0.8) | fixed |
| `cam_follow` | 跟随主角 | 1.0 | (0, 0.5) | follow |

### 4.1 DSL 引用

```
@CAMERA preset=cam_wide
@CAMERA preset=cam_follow target=mira
@CAMERA preset=cam_close target=old_chen duration=1.5
```

---

## 5. 区域（Zones）

见 L1 §2.4。剧本可引用：

```
@MOVE_TO actor=mira to_zone=plaza_center
@CAMERA preset=cam_medium target_zone=plaza_bench
```

---

## 6. 目录 Schema（摘要）

```yaml
catalog_version: "1.0.0"
actors:
  - id: mira
    display_name: 米拉
    width: 0.8
    height: 1.6
    anchor: foot
    animations: [idle, walk, wave, sit, talk]
    tags: [居民, 主角]
props:
  - id: bench
    # ...
scenes:
  - id: plaza
    # ...
camera_presets:
  - id: cam_wide
    # ...
zones:
  - id: plaza_center
    # ...
```

完整文件见 `catalog/entities.yaml`。

---

## 7. 检索索引

程序为剧本建立以下索引（供 UI 搜索与 AI 约束回传）：

| 索引键 | 来源 |
|--------|------|
| `actor:{id}` | 角色表 |
| `prop:{id}` | 道具表 |
| `scene:{id}` | 场景表 |
| `cam:{id}` | 镜头预设 |
| `zone:{id}` | 区域表 |
| `tag:{name}` | 各实体 tags 字段 |

剧本 front matter 的 `cast` 字段须为 `actor:{id}` 列表的子集。

---

## 8. 目录相关 Linter 规则

| 代码 | 条件 |
|------|------|
| `E_UNKNOWN_ACTOR` | `actor` 不在目录 |
| `E_UNKNOWN_PROP` | `prop` 不在目录 |
| `E_UNKNOWN_SCENE` | `scene` 不在目录 |
| `E_UNKNOWN_PRESET` | `camera preset` 不在目录 |
| `E_INVALID_ANIM` | `@PLAY_ANIM` 的动画不在角色列表 |
| `E_INVALID_PROP_STATE` | 道具 `state` 不在合法状态集 |
| `E_CATALOG_MISMATCH` | 剧本 `catalog_version` 与运行时不一致 |
