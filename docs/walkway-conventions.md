# 人行道规范（Walkway Conventions）

> 版本：0.1.0 · 依赖：L2 目录、L3 DSL、L5 运行时

人行道是场景的**路网底层**。剧本作者只写「谁走到哪」，几何拓扑由 catalog 维护。

---

## 1. 职责分层

| 层 | 内容 | 存放位置 |
|----|------|----------|
| **拓扑** | 能走哪里、多宽、如何拐弯、左右分道 | `catalog/entities.yaml` → `walkways` |
| **布景** | 路灯、长椅相对道的位置 | `scene_layouts` + `@LAYOUT` |
| **剧情** | 谁、何时、走到哪个锚点 | 剧本 `@MOVE_TO` + `@PARALLEL` |

`@SCENE` 进入场景时，运行时自动加载该场景在 catalog 中的全部人行道，**无需**在剧本里 `@SPAWN_WALKWAY`。

`@SPAWN_WALKWAY` 保留给：临时改道、测试、或尚未入库的新路网。若 id 与 catalog 重复，linter 会给出 `W_CATALOG_WALKWAY` 警告。

---

## 2. 坐标约定

- **y 更大 = 北侧 / 人行道顶缘**（画面上方、远离摄像机）
- **y 更小 = 南侧 / 底缘**（画面下方、朝摄像机）
- 路灯、长椅脚底 → 道顶缘（`propFootY`）
- 店门、家门（建筑在道北侧时）→ 建筑南墙脚底，贴在道顶缘一侧

---

## 3. 命名规范

```
{scene}_{variant}_{role}_{segment}
```

| 后缀 | 含义 | 示例 |
|------|------|------|
| `_path` | 单人/居中主道 | `plaza_rain_path` |
| `_lane_left` | 并肩左道 | `plaza_rain_lane_left` |
| `_lane_right` | 并肩右道 | `plaza_rain_lane_right` |
| `_aisle` | 室内通道 | `shop_interior_aisle` |

规则：

- 左右道**成对**定义，中心线间距与 `DUO_WALK_SPACING`（1.0 wu）匹配
- 全场景默认 `width: 1.2`（`SIDEWALK_WIDTH`），室内窄道可用 `1.0`
- **拐弯做进同一条 lane**，不要用额外的 `_north_` / `_west_` 短道拼接（避免角色折回）

---

## 4. catalog 定义格式

```yaml
walkways:
  - id: plaza_rain_lane_left
    scene: plaza
    points:
      - { x: 10, y: 5.55 }
      - { x: 19.5, y: 10 }
    width: 1.2
    visible_default: true
```

| 字段 | 说明 |
|------|------|
| `id` | 全局唯一，与 `@MOVE_TO to_path=` 一致 |
| `scene` | 所属场景；仅在该 `@SCENE` 下激活 |
| `points` | 折线顶点（当前为两点线段；多点折线预留） |
| `width` | 人行道宽度（wu） |
| `visible_default` | 进场时是否渲染；可用 `@SET_WALKWAY` 覆盖 |

---

## 5. 路口拓扑（不折回）

```
❌ 错误：东西道走到 x=24，再用独立北道从 x=19.5 折回北上

✅ 正确：lane 从起点经路口直达北路终点
  plaza_rain_lane_left:  (10, 5.55) → (19.5, 10)
  plaza_rain_lane_right: (10, 6.15) → (20.5, 10)
  rain_west_lane_left:   (19.5, 10) → (5, 10)    # 在 y=10 接续
```

---

## 6. 并行从 A 到 B：剧本模板

### 并肩同行（推荐）

```mira
@PARALLEL
  @MOVE_TO actor=mira     to_path=plaza_rain_lane_left  x=20
  @MOVE_TO actor=old_chen to_path=plaza_rain_lane_right x=20
@END
```

- 两人 `to_path` **必须不同**（左右道）
- 目标用**同一语义坐标**（都 `x=20` 或都 `y=10`）
- `@PARALLEL` 内 ≥2 个 `@MOVE_TO` 时，引擎自动 **abreast**（横向对齐、同时到达）

### 过路口继续走

```mira
@PARALLEL
  @MOVE_TO actor=mira     to_path=plaza_rain_lane_left  y=10
  @MOVE_TO actor=old_chen to_path=plaza_rain_lane_right y=10
@END
```

### 切换路段（如转入西路）

```mira
@PARALLEL
  @MOVE_TO actor=mira     to_path=rain_west_lane_left  x=15.5
  @MOVE_TO actor=old_chen to_path=rain_west_lane_right x=15.5
@END
```

### 各走各的（不同步并肩）

```mira
@PARALLEL
  @MOVE_TO actor=mira     to_path=rain_west_lane_left  x=14.2
  @MOVE_TO actor=old_chen to_path=rain_west_lane_right x=14.8
@END
```

### 同路径双人（备选）

仅当场景只有一条中心道、无左右分道时：

```mira
@MOVE_TO actor=mira     to_path=plaza_main_path duo_center=0.5 duo_side=left
@MOVE_TO actor=old_chen to_path=plaza_main_path duo_center=0.5 duo_side=right
```

---

## 7. 参考样例

完整应用见 [`examples/minimal-play.mira`](../examples/minimal-play.mira)：

- 路网全部在 [`catalog/entities.yaml`](../catalog/entities.yaml) `walkways` 段
- 剧本仅含 `@MOVE_TO to_path=...` 与 `@PARALLEL` 编组

---

## 8. 与寻路的演进关系

| 今天 | 未来 |
|------|------|
| catalog `walkways` 手画边 | nav mesh / 图自动生成 |
| `to_path` + `x`/`y`/`at` | `to_zone` / `to_node` |
| `@PARALLEL` + 双 `to_path` | `formation=abreast` 编组策略 |

剧本层的**意图**（谁、编组、目的地）保持稳定；底层可从「手写人行道」换成「图搜索」而不改作者心智。
