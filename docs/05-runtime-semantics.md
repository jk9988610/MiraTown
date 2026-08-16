# L5 — 运行时执行语义

> 版本：0.1.0 · 依赖：L1, L2, L3

本文定义每条 DSL 指令在引擎中的**精确行为**。AI 无需阅读；开发与 Linter 实现须与本文一一对应。

---

## 1. 运行时状态机

### 1.1 全局状态

```typescript
interface RuntimeState {
  T: number;                    // 全局时间
  t: number;                    // 当前场景时间
  scene_id: string | null;
  actors: Map<string, ActorInstance>;
  props: Map<string, PropInstance>;
  camera: CameraState;
  scheduler: SchedulerQueue;
}
```

### 1.2 角色实例状态

```
                    ┌─────────┐
         @ENTER ──→ │  IDLE   │←── @STAND
                    └────┬────┘
                         │ @MOVE_TO
                    ┌────▼────┐
                    │ WALKING │
                    └────┬────┘
                         │ 到达
                    ┌────▼────┐
                    │  IDLE   │
                    └────┬────┘
           @PLAY_ANIM ──→│ ACTING  │──→ 完成 → IDLE
           @SIT ────────→│ SITTING │
           @DIALOGUE ──→│ TALKING │──→ @END / 点击 → IDLE
```

| 状态 | 可接受指令 |
|------|-----------|
| `IDLE` | 全部 |
| `WALKING` | `@FACE`（打断移动）, `@EXIT`（打断） |
| `ACTING` | `@EXIT`（打断） |
| `SITTING` | `@STAND`, `@DIALOGUE`, `@EXIT` |
| `TALKING` | 无（阻塞中） |

**打断规则**：新 `@MOVE_TO` 打断 `WALKING`；`@PLAY_ANIM` 打断 `ACTING`。

---

## 2. 调度器（Scheduler）

### 2.1 执行模型

- 剧本编译为**指令树**（IR），根为顺序节点。
- 调度器维护**活动协程栈**；每 tick 推进所有活动协程。
- **阻塞指令**注册完成回调；**非阻塞指令**同一 tick 完成。

### 2.2 `@PARALLEL` 语义

```
开始时间：所有子节点 t_start = t_current
结束时间：t_end = max(child.t_end)
父节点阻塞至 t_end
```

### 2.3 `@SEQUENCE` 语义

子节点严格顺序；`t_start(i+1) = t_end(i)`。

### 2.4 冲突检测（编译期）

同一 `@PARALLEL` 块内：
- 同一 `actor` 两条 `@MOVE_TO` → `E_CONFLICTING_MOVE`
- 同一 `actor` 同时 `@MOVE_TO` 与 `@PLAY_ANIM` → `E_CONFLICTING_ACTION`
- `@DIALOGUE` 的 `speaker` 出现在并行 `@MOVE_TO`/`@PLAY_ANIM` 中 → `E_SPEAKER_BUSY`

---

## 3. 指令执行表

| 指令 | 前置条件 | 执行步骤 | 阻塞 | 默认 duration |
|------|----------|----------|------|---------------|
| `@BEGIN` | — | 初始化 `T=0`, 清空实例 | 否 | — |
| `@END_SCRIPT` | — | 标记结束，触发 `onComplete` | 否 | — |
| `@ACT` | — | 更新 UI 章节标记 | 否 | — |
| `@SCENE` | scene 在目录 | 卸载旧场景→加载新场景→`t=0`→累加 `T_scene_start` | 是（0.1s 过渡） | 0.1s |
| `@CAST` | actor 在目录 | 记录参演集合 | 否 | — |
| `@ENTER` | 未在场；坐标合法 | 创建实例→淡入 | 是 | 0.3s |
| `@EXIT` | 已在场 | 淡出→销毁实例 | 是 | 0.5s |
| `@MOVE_TO` | 已在场；目标合法 | 寻路→`WALKING`→播放 walk 动画 | 是 | distance/2.0 |
| `@FACE` | 已在场 | 设 facing，停 walk | 否 | 0 |
| `@SIT` | 已在场；近 bench | 状态→`SITTING`；bench→`occupied` | 是 | 0.5s |
| `@STAND` | 在坐 | 状态→`IDLE`；释放 bench | 是 | 0.3s |
| `@PLAY_ANIM` | 已在场；anim 合法 | 状态→`ACTING`→播完恢复 | 视参数 | 动画资源时长 |
| `@EMOTE` | 已在场 | 显示表情 UI | 是 | 1.5s |
| `@DIALOGUE` | 已在场 | 状态→`TALKING`→逐句展示 | 是 | 句数×auto_delay |
| `@NARRATION` | — | 顶部旁白 UI | 是 | 参数 duration |
| `@SPAWN_PROP` | 坐标合法 | 创建 prop 实例 | 否 | 0 |
| `@DESPAWN_PROP` | 实例存在 | 销毁 | 否 | 0 |
| `@SET_PROP` | 实例存在；state 合法 | 切换状态与视觉 | 否 | 0 |
| `@GIVE` | actor 在场 | 道具挂到 actor 手持槽 | 否 | 0 |
| `@CAMERA` | preset 合法 | 按 duration 插值或硬切 | 视 duration | 0 |
| `@CUT` | 同 `@CAMERA` | duration=0 | 否 | 0 |
| `@PAN` | — | cam mode→pan，插值到目标 | 是 | 2.0s |
| `@WAIT` | — | 空转 | 是 | 参数值 |
| `@PARALLEL` | — | 并行子节点 | 是 | max(children) |
| `@SEQUENCE` | — | 顺序子节点 | 是 | sum(children) |

---

## 4. 移动语义详解

### 4.1 寻路

- 算法：A* on tile grid（1 wu 粒度）
- 斜向：MVP 不允许，仅四方向
- 速度：默认 2.0 wu/s；`@MOVE_TO` 指定 `duration` 时反算速度

### 4.2 到达判定

```
distance(current, target) < ε (0.05 wu) → 到达，snap 到目标，状态→IDLE
```

### 4.3 路径阻塞

目标不可达 → Runtime 错误 `E_PATH_BLOCKED`，演绎**暂停**（见 §11）。

---

## 5. 摄像机语义详解

### 5.1 `@CAMERA preset=cam_follow target=mira`

1. 设 `camera.mode = follow`
2. 设 `camera.target = mira`
3. 若 `duration > 0`：zoom/offset 在 duration 内 lerp 到 preset 值
4. 若 `duration = 0`：立即应用

### 5.2 Follow 每 tick

```python
target_pos = actor.position + preset.offset
camera.x = lerp(camera.x, target_pos.x, 1 - exp(-5 * dt))
camera.y = lerp(camera.y, target_pos.y, 1 - exp(-5 * dt))
camera = clamp_to_map(camera)
```

### 5.3 `@PAN to=(16, 12) duration=2`

- `mode = pan`（不改变 follow target 记忆）
- 线性插值：`cam(t) = cam_start + (cam_end - cam_start) * (t_elapsed / duration)`

---

## 6. 对话语义

### 6.1 并行规则（ADR-002）

- `@DIALOGUE` 块活跃期间：**非 `speaker`** 的 actor 可正常执行 `@MOVE_TO`、`@PAN` 等（常见于 `@PARALLEL`）。
- **`speaker` 禁止**在同一 `@DIALOGUE` 块活跃期间出现在 `@MOVE_TO` / `@PLAY_ANIM` 中（Linter：`E_SPEAKER_BUSY`）。
- `minimal-play.mira` 中 mira 对话时 old_chen 走向她是**合法**模式。

### 6.2 `@DIALOGUE auto=false`

- 每句等待用户点击「下一句」
- 说话者播放 `talk` 动画；其他角色默认 `idle`（若在移动则保持 walk）
- 气泡位置：说话者头顶屏幕投影 + offset

### 6.3 `@DIALOGUE auto=true auto_delay=2.5`

- 每句展示 `auto_delay` 秒后自动跳下一句
- 用户点击可提前跳下一句

### 6.4 `@NARRATION`

- **阻塞**调度：旁白展示期间不推进其他指令
- 用户点击可提前结束旁白
- 与 `@DIALOGUE` 不可并行（同一 `@SEQUENCE` 内顺序执行）

---

## 7. 道具语义

### 7.1 `@SPAWN_PROP`

- 碰撞盒立即生效
- 同位置已有 prop → `E_PROP_COLLISION`

### 7.2 `@SIT actor=mira prop=bench_1`

- 角色坐标 snap 到 bench 交互点 `(bench.x + 0.5, bench.y + 0.3)`
- bench 状态→`occupied`；角色不可 `@MOVE_TO` 直至 `@STAND`

---

## 8. 编译管线（IR）

```
.mira 文本
  → Lexer / Parser（AST）
  → Linter（静态检查）
  → Compiler（IR 指令树）
  → Runtime（Scheduler 执行）
  → Event Log（可回放）
```

### 8.1 IR 节点示例

```json
{
  "op": "PARALLEL",
  "children": [
    { "op": "MOVE_TO", "actor": "mira", "to": [12, 5], "duration": 3 },
    { "op": "PAN", "target": "old_chen", "duration": 3 }
  ]
}
```

---

## 9. 事件日志（回放）

每 tick 记录关键事件供回放：

```json
{
  "T": 15.7,
  "type": "actor_move",
  "actor": "mira",
  "pos": [11.2, 5.0],
  "facing": "east"
}
```

| type | 触发 |
|------|------|
| `scene_change` | `@SCENE` |
| `actor_enter/exit` | `@ENTER` / `@EXIT` |
| `actor_move` | 每 tick（可降采样） |
| `dialogue_line` | 每句台词 |
| `camera_change` | `@CAMERA` / `@CUT` / `@PAN` |
| `prop_spawn/despawn` | 道具生命周期 |

---

## 11. 运行时错误 UX（ADR-002）

| 错误类型 | 行为 |
|----------|------|
| `E_PATH_BLOCKED` 等 Runtime 错误 | 暂停演绎；红色错误条 + DSL 行号 + 说明 |
| 用户操作 | 「从头重播」：`Runtime.reset()` → 重新 `load(IR)`；**不自动续播** |

MVP **不支持** `@ACT` 章节跳转；仅完整从头播放。

---

## 12. 与 L3 一致性检查

- [x] 每条 L3 指令在本表有对应行
- [x] 所有 `duration` 默认值已定义
- [x] 状态机覆盖所有阻塞指令
- [x] 错误码 `E_PATH_BLOCKED`, `E_PROP_COLLISION` 已定义
