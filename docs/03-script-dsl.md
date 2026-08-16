# L3 — 剧本指令语言（DSL）

> 版本：1.0 · `dsl_version`: `1.0` · 依赖：L1, L2

DSL 是 AI 与程序之间的**唯一协议**。AI 必须使用本文定义的指令名词（`@` 前缀）和参数名；不允许自造指令或别名（MVP 阶段）。

---

## 1. 词法

| 规则 | 说明 |
|------|------|
| 指令行 | 以 `@` 开头，一行一条主指令 |
| 标识符 | `[a-z][a-z0-9_]*`，如 `mira`, `plaza_center` |
| 数值 | 十进制浮点，如 `3`, `1.5`, `12.50` |
| 坐标 | `(x, y)` 或 `(x, y, z_order)`，括号内逗号分隔 |
| 字符串 | 双引号 `"..."` 或中文引号「...」（对话块内） |
| 参数 | `key=value`，多个参数空格分隔 |
| 块结束 | `@END` 关闭 `@PARALLEL` / `@SEQUENCE` / `@DIALOGUE` |
| 注释 | 行首 `#` 或 `//`（整行忽略） |
| 编码 | UTF-8 |

---

## 2. 指令总表

| 类别 | 指令 | 阻塞 | MVP |
|------|------|------|-----|
| 剧本 | `@BEGIN` `@END_SCRIPT` | — | ✓ |
| 结构 | `@ACT` `@SCENE` | SCENE 切换阻塞 | ✓ |
| 角色 | `@CAST` `@ENTER` `@EXIT` | ENTER/EXIT 阻塞 | ✓ |
| 移动 | `@MOVE_TO` `@FACE` `@SIT` `@STAND` | MOVE_TO 阻塞 | ✓ |
| 表演 | `@PLAY_ANIM` `@EMOTE` | 视 duration | ✓ |
| 语言 | `@DIALOGUE` `@NARRATION` | DIALOGUE 阻塞至关闭 | ✓ |
| 道具 | `@SPAWN_PROP` `@DESPAWN_PROP` `@SET_PROP` `@GIVE` | SPAWN 瞬时 | ✓ |
| 镜头 | `@CAMERA` `@CUT` `@PAN` | 视 duration | ✓ |
| 时序 | `@WAIT` `@PARALLEL` `@SEQUENCE` | 视子指令 | ✓ |

---

## 3. 指令详细规范

### 3.1 剧本框架

#### `@BEGIN`
剧本起点，须为第一条有效指令（front matter 之后）。

```
@BEGIN title="雨夜的告白"
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 否 | 可与 front matter 冗余校验 |

#### `@END_SCRIPT`
剧本终点，须为最后一条有效指令。

---

### 3.2 结构

#### `@ACT`
划分幕。不切换场景资源，仅作检索与 UI 章节标记。

```
@ACT id=1 title="相遇"
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | int | 是 | 从 1 递增 |
| `title` | string | 否 | 幕标题 |

#### `@SCENE`
切换场景。阻塞至场景加载完成（MVP：瞬时）。

```
@SCENE id=plaza time=evening weather=rain
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | scene_id | 是 | 见 L2 |
| `time` | enum | 否 | `day\|evening\|night` |
| `weather` | enum | 否 | `clear\|rain` |
| `lighting` | enum | 否 | 咖啡馆专用 |

---

### 3.3 角色

#### `@CAST`
声明本幕参演角色（须在 `@ENTER` 之前）。可多次调用，取并集。

```
@CAST actor=mira
@CAST actor=old_chen
```

#### `@ENTER`
角色入场。若已在场 → `E_ACTOR_ALREADY_PRESENT`。

```
@ENTER actor=mira at=(10, 5) facing=east
@ENTER actor=old_chen at_zone=plaza_bench facing=west
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `actor` | actor_id | 是 | |
| `at` | (x,y) | 与 `at_zone` 二选一 | 精确坐标 |
| `at_zone` | zone_id | 与 `at` 二选一 | 区域中心点 |
| `facing` | enum | 是 | `north\|south\|east\|west` |

#### `@EXIT`
角色离场（淡出）。阻塞 `duration`（默认 0.5s）。

```
@EXIT actor=old_chen duration=0.5
```

---

### 3.4 移动

#### `@MOVE_TO`
行走到目标。阻塞至到达或失败。

```
@MOVE_TO actor=mira to=(14, 5) duration=3
@MOVE_TO actor=mira to_zone=plaza_center
@MOVE_TO actor=mira to_actor=old_chen offset=(1, 0)
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `actor` | actor_id | 是 | |
| `to` | (x,y) | 三选一 | 目标坐标 |
| `to_zone` | zone_id | 三选一 | 目标区域中心 |
| `to_actor` | actor_id | 三选一 | 相对另一角色 |
| `offset` | (x,y) | 否 | 配合 `to_actor`，默认 (0,0) |
| `duration` | number | 否 | 秒；省略则按速度计算 |
| `speed` | number | 否 | wu/s，默认 2.0 |

未指定 `duration` 时：`duration = distance / speed`。

#### `@FACE`
转向，不移动。瞬时。

```
@FACE actor=mira facing=west
```

#### `@SIT` / `@STAND`
坐/站。须靠近可坐道具或指定道具。

```
@SIT actor=mira prop=bench_1
@STAND actor=mira
```

---

### 3.5 表演

#### `@PLAY_ANIM`
播放动画一次或循环。

```
@PLAY_ANIM actor=mira anim=wave duration=2 loop=false
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `anim` | anim_id | 是 | 须在角色动画列表 |
| `duration` | number | 否 | 默认动画时长 |
| `loop` | bool | 否 | 默认 false |

#### `@EMOTE`
表情气泡（非语言）。

```
@EMOTE actor=mira type=question duration=1.5
```

| `type` | 说明 |
|--------|------|
| `exclaim` | ！ |
| `question` | ？ |
| `heart` | ♥ |
| `sweat` | 汗 |
| `anger` | 怒 |

---

### 3.6 语言

#### `@DIALOGUE`
角色对话块。块内每行一条台词；阻塞至用户点击或 `auto=true` 超时。

```
@DIALOGUE speaker=mira auto=false
「今晚的雨，好像永远不会停。」
「陈伯，你怎么还在外面？」
@END
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `speaker` | actor_id | 是 | |
| `auto` | bool | 否 | 默认 false |
| `auto_delay` | number | 否 | 每句间隔秒，默认 2.5 |

#### `@NARRATION`
旁白（屏幕顶部文字）。正文写在指令行之后，**直到下一条 `@` 指令**（无需 `@END`）。

```
@NARRATION duration=3
雨点敲打着广场的石板路，路灯在水洼里碎成一片金光。

@SPAWN_PROP prop=bench ...
```

---

### 3.7 道具

#### `@SPAWN_PROP`
生成道具实例。

```
@SPAWN_PROP prop=bench id=bench_1 at=(4, 3) state=empty
```

#### `@DESPAWN_PROP`
移除道具实例。

```
@DESPAWN_PROP id=bench_1
```

#### `@SET_PROP`
切换道具状态。

```
@SET_PROP id=umbrella_1 state=open
```

#### `@GIVE`
将手持类道具交给角色（道具实例须已存在或由引擎隐式创建）。

```
@GIVE actor=mira prop=letter
```

---

### 3.8 镜头

#### `@CAMERA`
切换或过渡镜头。

```
@CAMERA preset=cam_wide
@CAMERA preset=cam_follow target=mira
@CAMERA preset=cam_close target=old_chen duration=1.5
```

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `preset` | cam_id | 是 | |
| `target` | actor_id | 否 | follow/close 时推荐 |
| `target_zone` | zone_id | 否 | 替代 target |
| `duration` | number | 否 | 0=硬切，>0=软切 |

#### `@CUT`
硬切到指定预设（等同 `@CAMERA ... duration=0`）。

```
@CUT preset=cam_medium target=mira
```

#### `@PAN`
平移镜头（不改变 preset/zoom）。

```
@PAN to=(16, 12) duration=2
@PAN target=mira duration=3
```

---

### 3.9 时序

#### `@WAIT`
```
@WAIT 2.5
```

#### `@PARALLEL` / `@SEQUENCE`
```
@PARALLEL
  @MOVE_TO actor=mira to=(12, 5) duration=3
  @PAN target=old_chen duration=3
@END
```

- 嵌套允许；`@PARALLEL` 内可含 `@SEQUENCE`，反之亦然。
- 最大嵌套深度：4（超出 → `E_NEST_TOO_DEEP`）。

---

## 4. 禁止项

1. 指令行内不得出现未加 `@` 的自然语言（台词、旁白除外，须在其块内）。
2. 不得使用目录外 ID。
3. 不得使用科学计数法（`1e3`）。
4. 同一 `@PARALLEL` 块内，同一 `actor` 不得有两条 `@MOVE_TO`（`E_CONFLICTING_MOVE`）。
5. 同一 `@PARALLEL` 块内，同一 `actor` 不得同时有 `@MOVE_TO` 与 `@PLAY_ANIM`（`E_CONFLICTING_ACTION`）。
6. `@DIALOGUE` 块活跃期间，该块的 `speaker` 不得出现在任何 `@MOVE_TO` / `@PLAY_ANIM` 中（`E_SPEAKER_BUSY`）。**非 speaker 不受限**（见 ADR-002）。
7. 不得 `@SPAWN_PROP prop=letter`（`E_PROP_NOT_PLACEABLE`）；`letter` 仅能通过 `@GIVE` 交给角色。

---

## 5. 错误码汇总

| 代码 | 级别 | 说明 |
|------|------|------|
| `E_UNKNOWN_DIRECTIVE` | error | 未识别的 `@` 指令 |
| `E_MISSING_PARAM` | error | 缺少必填参数 |
| `E_UNKNOWN_ACTOR` | error | 角色不在目录 |
| `E_UNKNOWN_PROP` | error | 道具不在目录 |
| `E_UNKNOWN_SCENE` | error | 场景不在目录 |
| `E_OUT_OF_BOUNDS` | error | 坐标越界 |
| `E_CONFLICTING_MOVE` | error | 并行双 `@MOVE_TO` |
| `E_CONFLICTING_ACTION` | error | 并行 `@MOVE_TO` + `@PLAY_ANIM` 同 actor |
| `E_SPEAKER_BUSY` | error | `@DIALOGUE` 说话者同时移动/播动画 |
| `E_PROP_NOT_PLACEABLE` | error | 道具不可放置（如 `letter`） |
| `E_NEST_TOO_DEEP` | error | 嵌套过深 |
| `E_ACTOR_NOT_PRESENT` | error | 角色未入场 |
| `E_ACTOR_ALREADY_PRESENT` | error | 重复入场 |
| `W_UNUSED_CAST` | warn | `@CAST` 声明但未 `@ENTER` |
| `W_LONG_DURATION` | warn | 总时长超出 `max_duration_sec` |

---

## 6. BNF 摘要（EBNF）

```ebnf
script       = front_matter , "@BEGIN" , act , { act } , "@END_SCRIPT" ;
act          = "@ACT" , id , [ title ] , { scene_block } ;
scene_block  = "@SCENE" , scene_id , [ env_params ] , { statement } ;
statement    = directive | block ;
block        = "@PARALLEL" , { statement } , "@END"
             | "@SEQUENCE" , { statement } , "@END"
             | "@DIALOGUE" , speaker , { line } , "@END"
             | "@NARRATION" , duration , { line } ;
directive    = "@" , IDENT , { param } ;
param        = IDENT , "=" , value ;
value        = NUMBER | STRING | coord | bool | IDENT ;
coord        = "(" , NUMBER , "," , NUMBER , [ "," , NUMBER ] , ")" ;
```
