# L4 — 剧本文件格式

> 版本：0.1.0 · 依赖：L3

剧本是 **YAML Front Matter + DSL 正文** 的纯文本文件，扩展名 `.mira`。

---

## 1. 文件结构

```
┌─────────────────────────────────┐
│  YAML Front Matter (元数据)      │  ← 检索、AI 输入回显、版本绑定
├─────────────────────────────────┤
│  DSL 正文                        │  ← @BEGIN ... @END_SCRIPT
│    @ACT / @SCENE / 指令...       │
└─────────────────────────────────┘
```

---

## 2. Front Matter 字段

```yaml
---
# === 必填 ===
title: 雨夜的告白
theme: 温情
synopsis: |
  雨夜广场，米拉偶遇陈伯，一把伞拉近了两个孤独的灵魂。

# === 版本绑定 ===
dsl_version: "1.0"
catalog_version: "1.0.0"

# === 检索字段 ===
tags: [爱情, 小镇, 雨夜]
cast: [mira, old_chen]
scenes: [plaza]
acts: 2
duration_estimate: 90

# === 可选 ===
tone: 治愈
author: ai
created_at: 2026-08-16T00:00:00Z
language: zh-CN
---
```

### 2.1 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `title` | string | 是 | 剧本名称 |
| `theme` | string | 是 | 主题关键词 |
| `synopsis` | string | 是 | 简介，≥ 20 字 |
| `dsl_version` | semver | 是 | 须与 L3 一致 |
| `catalog_version` | semver | 是 | 须与 L2 一致 |
| `tags` | string[] | 否 | 自由标签，供搜索 |
| `cast` | actor_id[] | 是 | 参演角色，须 ⊆ 目录 |
| `scenes` | scene_id[] | 是 | 使用场景 |
| `acts` | int | 否 | 幕数，可与正文 `@ACT` 校验 |
| `duration_estimate` | number | 是 | 预估秒数（**元数据**，与用户实际观看时长无关；跳过对话不修改此值） |
| `tone` | string | 否 | 基调：治愈/悬疑/喜剧… |
| `author` | string | 否 | `ai` 或用户名 |
| `created_at` | ISO8601 | 否 | 创建时间 |
| `language` | string | 否 | 默认 `zh-CN` |

### 2.2 Front Matter 与正文一致性

Linter 校验：

- `cast` 中每个角色须在正文 `@CAST` 或 `@ENTER` 中出现
- `scenes` 中每个场景须在 `@SCENE` 中出现
- `acts` 若填写，须等于 `@ACT` 数量
- `title` 须与 `@BEGIN title=` 一致（若后者存在）

---

## 3. 正文结构

```
@BEGIN title="雨夜的告白"

@ACT id=1 title="雨夜广场"

@SCENE id=plaza time=evening weather=rain

@CAST actor=mira
@CAST actor=old_chen

@NARRATION duration=3
雨点敲打着广场的石板路，路灯在水洼里碎成一片金光。

@SPAWN_PROP prop=bench id=bench_1 at=(4, 3) state=empty
@SPAWN_PROP prop=umbrella id=umbrella_1 at=(20, 6) state=closed

@ENTER actor=mira at=(8, 5) facing=east
@CAMERA preset=cam_wide
@CUT preset=cam_follow target=mira

@DIALOGUE speaker=mira auto=true auto_delay=2.5
「今晚的雨，好像永远不会停。」
@END

@PARALLEL
  @MOVE_TO actor=old_chen to=(12, 5) duration=4
  @PAN target=old_chen duration=4
@END

@FACE actor=mira facing=west
@EMOTE actor=mira type=question duration=1.5

@DIALOGUE speaker=old_chen
「年轻人，伞借你一半。」
@END

@SET_PROP id=umbrella_1 state=open
@PLAY_ANIM actor=old_chen anim=nod duration=1

@CAMERA preset=cam_close target=mira duration=1.5

@DIALOGUE speaker=mira
「谢谢您，陈伯。」
@END

@ACT id=2 title="伞下"

@WAIT 1

@PARALLEL
  @MOVE_TO actor=mira to_actor=old_chen offset=(1, 0) duration=2
  @CAMERA preset=cam_medium target_zone=plaza_center duration=2
@END

@NARRATION duration=4
两把伞在雨中合成一个温暖的圆，广场的灯光忽然变得柔和起来。

@EXIT actor=old_chen duration=1
@EXIT actor=mira duration=1

@END_SCRIPT
```

---

## 4. 检索索引

程序解析后建立倒排索引：

| 索引 | 键示例 | 用途 |
|------|--------|------|
| 剧本 | `title`, `theme`, `tags` | 库搜索 |
| 角色出场 | `cast:mira` | 「米拉参演的剧本」 |
| 场景 | `scene:plaza` | 场景复用统计 |
| 指令 | `directive:CAMERA` | 调试 / 分析 |
| 幕 | `act:1` | 章节跳转 |
| 时间 | `T@15.7` | 回放定位 |

### 4.1 文件 ID

```
script_id = slugify(title) + "-" + hash(front_matter)[:8]
例：yu-ye-de-gao-bai-a3f2c1d8
```

---

## 5. 命名与存储

| 规则 | 示例 |
|------|------|
| 文件名 | `{script_id}.mira` 或用户自定义 + `.mira` |
| 目录 | `scripts/` 库存；`examples/` 样例 |
| 单行最大长度 | 512 字符 |
| 文件最大体积 | 64 KB（MVP） |

---

## 6. 版本迁移

当 `dsl_version` 升级时：

1. Linter 对旧版剧本报 `W_DEPRECATED_DSL`
2. 提供 `migrate` 工具（后置）做自动改写
3. 主版本不兼容时，旧剧本须重写或迁移后才可播放

---

## 7. 完整样例

见 `examples/minimal-play.mira`（本仓库 MVP 参考剧本）。
