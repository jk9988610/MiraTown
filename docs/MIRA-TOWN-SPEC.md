# 米拉小镇（MiraTown）设计规范 — 合并版

> **版本** 0.1.1 · **DSL** 1.0 · **Catalog** 1.0.0 · **状态** Gate 0–3 已闭合  
> 本文档由 L0–L7 + ADR 决策合并而成。细节以各层文件为准。

---

## 目录

1. [愿景与边界](#1-愿景与边界)
2. [世界模型](#2-世界模型)
3. [实体目录](#3-实体目录)
4. [DSL 指令语言](#4-dsl-指令语言)
5. [剧本文件格式](#5-剧本文件格式)
6. [运行时语义](#6-运行时语义)
7. [AI 接口契约](#7-ai-接口契约)
8. [技术架构与 MVP](#8-技术架构与-mvp)
9. [已拍板决策（Gate 0–3）](#9-已拍板决策gate-03)
10. [一致性检查清单](#10-一致性检查清单)

---

## 1. 愿景与边界

**米拉小镇** 是一款网页演绎游戏：用户向 AI 提供剧本封面，AI 按 DSL 输出剧本，程序在数学规范化的二维世界中驱动居民、道具与摄像机完成演绎。

### 三条铁律

| # | 原则 |
|---|------|
| 1 | **AI 只写剧本** — 路径、碰撞、动画、镜头插值由引擎实现 |
| 2 | **一切可检索、可校验** — 固定结构，可索引角色/场次/指令 |
| 3 | **空间是数学对象** — 坐标、尺寸、时间均为数值 |

### 主要用户与路径

- **观看者为主**：填封面 → 看戏
- **无 AI 模式**（必需）：加载 `examples/minimal-play.mira` 或粘贴剧本 → lint → play
- **人工编辑**：AI 生成后可改 `.mira` 文本再播放

### MVP 验收

- 输入：`title` + `theme` + `synopsis`（≥20 字）
- 输出：通过 `dsl_version: 1.0` Linter 的 `.mira` 剧本
- 规模：≥2 角色、1 场景、≥1 次镜头切换
- 时长：30–120 秒
- 可播放：Web 端完整演绎

### 排除项

AI 不调 API、不生成代码、指令行不含自然语言、播放中不可改逻辑（播放前可编辑剧本）、无多人在线、无移动端。

→ 详见 [`00-vision.md`](./00-vision.md)

---

## 2. 世界模型

### 坐标系

```
        Y ↑
          |
    ------+------→ X
   (0,0) 左下角
```

| 属性 | 值 |
|------|-----|
| 单位 | 1 wu（world unit） |
| 精度 | 2 位小数，ε = 0.01 |
| 渲染 | 1 wu = 32 px |
| 视口 | 1280×720 |

### 时间

| 层级 | 符号 | 说明 |
|------|------|------|
| 场景时间 | `t` | `@SCENE` 起计时（秒） |
| 全局时间 | `T` | 剧本起累计，用于回放 |

逻辑 tick：60 Hz。`@PARALLEL` 结束于最慢子指令完成。

### 地图（MVP）

| 场景 | 尺寸 (wu) |
|------|-----------|
| `plaza` | 64×48 |
| `cafe_interior` | 16×12 |

### 摄像机

```typescript
{ x, y, zoom, mode: 'fixed'|'follow'|'pan', target? }
```

- **Follow**：`lerp(cam, target+offset, 1-exp(-5·Δt))`，夹紧不越界
- **硬切**：`@CUT` 或 `duration=0`
- **软切**：`duration>0` 插值

### Z 层级

`GROUND(0) < PROP(100) < ACTOR(200) < EFFECT(300) < UI(1000)`

→ 详见 [`01-world-model.md`](./01-world-model.md)

---

## 3. 实体目录

源文件：[`catalog/entities.yaml`](../catalog/entities.yaml)

### 角色

| id | 名 | 尺寸 (w×h) | 动画 |
|----|-----|-----------|------|
| `mira` | 米拉 | 0.8×1.6 | idle, walk, wave, sit, talk |
| `old_chen` | 陈伯 | 0.9×1.7 | idle, walk, nod, sit, talk |
| `lily` | 莉莉 | 0.7×1.5 | idle, walk, jump, talk |

锚点：脚底中心。`facing`: north/south/east/west。

### 道具

| id | 名 | 尺寸 | 状态 |
|----|-----|------|------|
| `bench` | 长椅 | 2.0×1.0 | empty, occupied |
| `umbrella` | 雨伞 | 2.0×1.8 | closed, open |
| `letter` | 信 | 0.2×0.15 | sealed, open — **仅 `@GIVE`，不可 `@SPAWN_PROP`** |

### 场景

| id | 名 | 尺寸 | 环境 |
|----|-----|------|------|
| `plaza` | 中心广场 | 64×48 | time, weather |
| `cafe_interior` | 咖啡馆 | 16×12 | lighting |

### 镜头预设

| id | zoom | mode |
|----|------|------|
| `cam_wide` | 0.8 | fixed |
| `cam_medium` | 1.0 | fixed |
| `cam_close` | 1.5 | fixed |
| `cam_follow` | 1.0 | follow |

### 区域

- `plaza_center` — 广场中部 (10,8,12,8)
- `plaza_bench` — 长椅区 (4,3,3,2)

→ 详见 [`02-entity-catalog.md`](./02-entity-catalog.md)

---

## 4. DSL 指令语言

`dsl_version: 1.0`。指令以 `@` 开头；标识符 `[a-z][a-z0-9_]*`；坐标 `(x, y)`。

### 指令速查

| 类别 | 指令 | 说明 |
|------|------|------|
| 框架 | `@BEGIN` `@END_SCRIPT` | 剧本起止 |
| 结构 | `@ACT` `@SCENE` | 幕 / 场景切换 |
| 角色 | `@CAST` `@ENTER` `@EXIT` | 声明 / 入退场 |
| 移动 | `@MOVE_TO` `@FACE` `@SIT` `@STAND` | 行走 / 转向 / 坐站 |
| 表演 | `@PLAY_ANIM` `@EMOTE` | 动画 / 表情 |
| 语言 | `@DIALOGUE` `@NARRATION` | 对话块 / 旁白 |
| 道具 | `@SPAWN_PROP` `@DESPAWN_PROP` `@SET_PROP` `@GIVE` | 道具生命周期 |
| 镜头 | `@CAMERA` `@CUT` `@PAN` | 切换 / 硬切 / 平移 |
| 时序 | `@WAIT` `@PARALLEL` `@SEQUENCE` `@END` | 等待 / 并行 / 顺序 |

### 关键参数示例

```
@ENTER actor=mira at=(10, 5) facing=east
@MOVE_TO actor=mira to_zone=plaza_center duration=3
@DIALOGUE speaker=mira auto=false
「台词」
@END
@CAMERA preset=cam_follow target=mira duration=1.5
@PARALLEL
  @MOVE_TO actor=mira to=(12, 5) duration=3
  @PAN target=old_chen duration=3
@END
```

### 禁止项

- 指令行内自然语言（台词/旁白须在块内）
- 目录外 ID
- 同 `@PARALLEL` 块内同一 actor 两条 `@MOVE_TO`（`E_CONFLICTING_MOVE`）
- 同 `@PARALLEL` 块内同一 actor `@MOVE_TO` + `@PLAY_ANIM`（`E_CONFLICTING_ACTION`）
- `@DIALOGUE` 的 **speaker** 在块活跃期间移动/播动画（`E_SPEAKER_BUSY`）；**非 speaker 允许**
- `@SPAWN_PROP prop=letter`（`E_PROP_NOT_PLACEABLE`）

### 主要错误码

`E_UNKNOWN_DIRECTIVE` · `E_OUT_OF_BOUNDS` · `E_CONFLICTING_MOVE` · `E_CONFLICTING_ACTION` · `E_SPEAKER_BUSY` · `E_PROP_NOT_PLACEABLE`

→ 详见 [`03-script-dsl.md`](./03-script-dsl.md)

---

## 5. 剧本文件格式

扩展名 `.mira` = **YAML Front Matter** + **DSL 正文**。

### Front Matter（必填）

```yaml
title: 雨夜的告白
theme: 温情
synopsis: |
  简介，至少 20 字……
dsl_version: "1.0"
catalog_version: "1.0.0"
cast: [mira, old_chen]
scenes: [plaza]
duration_estimate: 90  # 元数据；用户跳过对话不修改
```

### 检索 ID

`script_id = slugify(title) + "-" + hash(front_matter)[:8]`

### 参考样例

[`examples/minimal-play.mira`](../examples/minimal-play.mira) — 2 角色、2 幕、广场雨夜、镜头切换、并行移动。

→ 详见 [`04-script-format.md`](./04-script-format.md)

---

## 6. 运行时语义

### 对话并行（ADR-002）

- `@DIALOGUE` 期间：**非 speaker** 可 `@MOVE_TO`（如配角走向说话者）
- **speaker** 禁止同时移动/播动画
- `@NARRATION` 阻塞，可点击跳过

### 错误与重播

- Runtime 错误 → 暂停 + 红条 + DSL 行号；「从头重播」
- MVP 无 `@ACT` 跳转

### 角色状态机

`IDLE ↔ WALKING / ACTING / SITTING / TALKING`

- `@MOVE_TO` 打断 `WALKING`；`@EXIT` 可打断多数状态
- `@DIALOGUE` 阻塞至用户点击或 auto 超时

### 关键默认值

| 指令 | 默认 duration |
|------|---------------|
| `@MOVE_TO` | distance / 2.0 wu/s |
| `@ENTER` | 0.3s |
| `@EXIT` | 0.5s |
| `@PAN` | 2.0s |
| `@EMOTE` | 1.5s |

### 寻路

A* on 1 wu 瓦片网格，四方向，不可走区域拒绝（`E_PATH_BLOCKED`）。

### 编译管线

```
.mira → Parser(AST) → Linter → Compiler(IR) → Runtime → EventLog → Renderer
```

→ 详见 [`05-runtime-semantics.md`](./05-runtime-semantics.md)

---

## 7. AI 接口契约

### 流程

```
用户封面 → AI 生成 .mira → Linter → (失败则带错误重试 ≤3) → compile → play
```

### 用户输入（MVP）

封面表单仅四字段：**title / theme / synopsis / tone**

### Request 默认 constraints

```json
{
  "allowed_actors": ["mira", "old_chen"],
  "allowed_scenes": ["plaza"],
  "min_actors": 2, "max_actors": 2
}
```

### Lint 失败 3 次

展示错误报告 + 最后一版剧本 + 「手动编辑」入口

### 生成 UI 文案

「AI 正在编写剧本…」→「正在校验剧本…」→「即将开演…」

### Prompt 组成

角色定义 + DSL 摘要 + catalog 列表 + minimal 示例 + Request JSON → 仅输出 `` ```mira `` 块。

### 检索 API

`GET /api/v1/scripts?q=&cast=&scene=&theme=`

→ 详见 [`06-ai-api-contract.md`](./06-ai-api-contract.md)

---

## 8. 技术架构与 MVP

### 模块

| 模块 | 职责 |
|------|------|
| **core** | Parser, Linter, Compiler, Runtime |
| **renderer** | **PixiJS** + Camera |
| **web** | React：封面四字段 + 剧本文本编辑 + 播放器 |
| **存储** | localStorage |
| **AI** | serverless 代理 |

### MVP 切片

| 切片 | 交付 |
|------|------|
| **S0** | 无 AI：示例/粘贴剧本 → lint → play |
| S1 | Parser + Linter 通过 minimal-play |
| S2 | Headless Runtime + 事件日志 |
| S3 | PixiJS：广场 + 2 角色 + 跟随镜头（1280×720） |
| S4 | 完整播放 minimal-play |
| S5 | AI 封面四字段 → 演绎闭环 |
| S6 | localStorage 剧本库 |

### 仓库结构

```
catalog/  docs/  examples/  packages/{core,renderer,web}/  prompts/
```

→ 详见 [`07-architecture.md`](./07-architecture.md)

---

## 9. 已拍板决策（Gate 0–3）

| Gate | 关键结论 | ADR |
|------|----------|-----|
| 0 | DSL/catalog/坐标冻结；无 AI 模式；可人工编辑剧本 | [ADR-001](./decisions/ADR-001-gate0-protocol-freeze.md) |
| 1 | 对话时非 speaker 可动；letter 仅 GIVE；错误暂停+重播 | [ADR-002](./decisions/ADR-002-gate1-runtime-semantics.md) |
| 2 | 纯前端+serverless；PixiJS；1280×720；仅从头回放 | [ADR-003](./decisions/ADR-003-gate2-experience-delivery.md) |
| 3 | AI 默认 2 人 plaza；lint 失败可手改；zh-CN only | [ADR-004](./decisions/ADR-004-gate3-ai-loop.md) |

**延期 v0.2+**：幕跳转、beat 时间、斜向移动、i18n、可视化编辑器、语音

→ 详见 [`open-questions.md`](./open-questions.md) · 新对话接续 [`DISCUSSION.md`](./DISCUSSION.md)

---

## 10. 一致性检查清单

每次修改文档或 catalog 后确认：

- [ ] L3 每条指令在 L5 有执行定义
- [ ] L3/L4 引用的 ID 均在 L2 / `entities.yaml`
- [ ] L4 坐标示例不超出 L1 地图边界
- [ ] L6 `dsl_version` / `catalog_version` 与 L3/L2 一致
- [ ] `minimal-play.mira` 可通过全部 P0 Linter 规则
- [ ] 合并版（本文）与各层文档无矛盾

---

## 附录

| 文档 | 路径 |
|------|------|
| 术语表 | [`glossary.md`](./glossary.md) |
| 议题追踪 | [`open-questions.md`](./open-questions.md) |
| 新对话接续 | [`DISCUSSION.md`](./DISCUSSION.md) |
| 决策记录 | [`decisions/`](./decisions/) |
| 文档索引 | [`README.md`](./README.md) |
