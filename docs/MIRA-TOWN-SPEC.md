# 米拉小镇（MiraTown）设计规范 — 合并版

> **版本** 0.1.0 · **DSL** 1.0 · **Catalog** 1.0.0 · **状态** 草案  
> 本文档由 L0–L7 分层文档合并而成，作为单页参考。细节以各层文件为准。

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
9. [一致性检查清单](#9-一致性检查清单)

---

## 1. 愿景与边界

**米拉小镇** 是一款网页演绎游戏：用户向 AI 提供剧本封面，AI 按 DSL 输出剧本，程序在数学规范化的二维世界中驱动居民、道具与摄像机完成演绎。

### 三条铁律

| # | 原则 |
|---|------|
| 1 | **AI 只写剧本** — 路径、碰撞、动画、镜头插值由引擎实现 |
| 2 | **一切可检索、可校验** — 固定结构，可索引角色/场次/指令 |
| 3 | **空间是数学对象** — 坐标、尺寸、时间均为数值 |

### MVP 验收

- 输入：`title` + `theme` + `synopsis`（≥20 字）
- 输出：通过 `dsl_version: 1.0` Linter 的 `.mira` 剧本
- 规模：≥2 角色、1 场景、≥1 次镜头切换
- 时长：30–120 秒
- 可播放：Web 端完整演绎

### 排除项

AI 不调 API、不生成代码、指令行不含自然语言、无实时改逻辑、无多人在线。

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
| `plaza` | 32×24 |
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
| `umbrella` | 雨伞 | 0.6×1.2 | closed, open |
| `letter` | 信 | 0.2×0.15 | sealed, open |

### 场景

| id | 名 | 尺寸 | 环境 |
|----|-----|------|------|
| `plaza` | 中心广场 | 32×24 | time, weather |
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
- 同 `@PARALLEL` 块内同一 actor 两条 `@MOVE_TO`

### 主要错误码

`E_UNKNOWN_DIRECTIVE` · `E_OUT_OF_BOUNDS` · `E_UNKNOWN_ACTOR` · `E_CONFLICTING_MOVE` · `E_ACTOR_NOT_PRESENT`

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
duration_estimate: 90
```

### 检索 ID

`script_id = slugify(title) + "-" + hash(front_matter)[:8]`

### 参考样例

[`examples/minimal-play.mira`](../examples/minimal-play.mira) — 2 角色、2 幕、广场雨夜、镜头切换、并行移动。

→ 详见 [`04-script-format.md`](./04-script-format.md)

---

## 6. 运行时语义

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

### Request 核心字段

```json
{
  "script_meta": { "title", "theme", "synopsis", "max_duration_sec" },
  "constraints": {
    "dsl_version": "1.0",
    "catalog_version": "1.0.0",
    "allowed_actors": ["mira", "old_chen"],
    "allowed_scenes": ["plaza"]
  }
}
```

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
| **renderer** | PixiJS/Phaser + Camera |
| **web** | React 封面表单 + 播放器 |
| **AI Generator** | Prompt + 重试循环 |

### MVP 切片

| 切片 | 交付 |
|------|------|
| S1 | Parser + Linter 通过 minimal-play |
| S2 | Headless Runtime + 事件日志 |
| S3 | 渲染：广场 + 2 角色 + 跟随镜头 |
| S4 | 完整播放 minimal-play |
| S5 | AI 封面 → 演绎闭环 |
| S6 | 剧本库搜索与回放 |

### 仓库结构

```
catalog/  docs/  examples/  packages/{core,renderer,web}/  prompts/
```

→ 详见 [`07-architecture.md`](./07-architecture.md)

---

## 9. 一致性检查清单

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
| 未决问题 | [`open-questions.md`](./open-questions.md) |
| 文档索引 | [`README.md`](./README.md) |
