# 议题追踪

> Gate 0–3 已于 2026-08-16 闭合，详见 [`decisions/`](./decisions/)。  
> 新对话接续见 [`DISCUSSION.md`](./DISCUSSION.md)。

---

## 已关闭（Gate 0 — 协议冻结）

| ID | 结论 | ADR |
|----|------|-----|
| G0-01 | DSL v1.0 最小 22 指令冻结 | [ADR-001](./decisions/ADR-001-gate0-protocol-freeze.md) |
| G0-02 | 坐标系、地图尺寸冻结 | ADR-001 |
| G0-03 | catalog 1.0.0 冻结 | ADR-001 |
| G0-04 | 允许人工编辑剧本后再播放 | ADR-001 |
| NQ-01 | 主要用户：观看者 | ADR-001 |
| NQ-05 | 必须有无 AI 模式 | ADR-001 |

---

## 已关闭（Gate 1 — 运行时语义）

| ID | 结论 | ADR |
|----|------|-----|
| G1-01 | 对话时**非 speaker** 可移动 | [ADR-002](./decisions/ADR-002-gate1-runtime-semantics.md) |
| G1-02 | **speaker** 对话中禁止移动/播动画 | ADR-002 |
| G1-03 | `@NARRATION` 阻塞，可点击跳过 | ADR-002 |
| G1-04 | `letter` 仅 `@GIVE` | ADR-002 |
| G1-05 | 并行禁止双移动、移动+动画同 actor | ADR-002 |
| NQ-03 | 运行时错误：暂停+行号+重播 | ADR-002 |
| NQ-04 | 同一剧本可重复播放 | ADR-002 |
| OQ-02 | → G1-01 | ADR-002 |
| OQ-07 | → G1-04 | ADR-002 |

---

## 已关闭（Gate 2 — 体验交付）

| ID | 结论 | ADR |
|----|------|-----|
| G2-01 | 纯前端 + serverless AI 代理 | [ADR-003](./decisions/ADR-003-gate2-experience-delivery.md) |
| G2-02 | 1280×720 letterbox，无移动端 | ADR-003 |
| G2-03 | PixiJS | ADR-003 |
| G2-04 | `duration_estimate` 为元数据，跳过不改 | ADR-003 |
| G2-05 | 回放仅从头，幕跳转延期 | ADR-003 |
| OQ-03 | → G2-04 | ADR-003 |
| OQ-05 | 仅秒，beat 延期 | ADR-003 |
| OQ-06 | v1 不开放斜向 | ADR-003 |
| OQ-08 | 幕跳转延期 v0.2 | ADR-003 |

---

## 已关闭（Gate 3 — AI 闭环）

| ID | 结论 | ADR |
|----|------|-----|
| G3-01 | AI 默认 mira+old_chen、仅 plaza | [ADR-004](./decisions/ADR-004-gate3-ai-loop.md) |
| G3-02 | Lint 失败 3 次：报告+剧本+手动编辑 | ADR-004 |
| G3-03 | MVP 仅 zh-CN | ADR-004 |
| G3-04 | 表单仅 title/theme/synopsis/tone | ADR-004 |
| NQ-02 | 生成 UI 三阶段文案 | ADR-004 |
| OQ-01 | → G2-01 | ADR-004 |
| OQ-04 | 默认不含 lily | ADR-004 |
| OQ-09 | 多语言延期 | ADR-004 |

---

## 延期（v0.2 及以后）

| ID | 议题 | 目标版本 |
|----|------|----------|
| DEF-01 | `@ACT` 章节跳转 / 快进回放 | v0.2 |
| DEF-02 | beat 时间轴（音乐节拍） | v0.2 |
| DEF-03 | 斜向移动与八方向动画 | v0.2 |
| DEF-04 | 多语言 front matter / i18n | v0.2 |
| DEF-05 | 可视化剧本编辑器 | v0.3 |
| DEF-06 | 用户上传自定义 sprite | v0.3 |
| DEF-07 | 剧本评分 / 点赞 | v0.3 |
| DEF-08 | 语音合成与口型同步 | v0.3 |

---

## 关闭流程（供后续新议题）

1. 在 `decisions/` 新建 `ADR-NNN-*.md`
2. 更新相关 L 文档 + `MIRA-TOWN-SPEC.md`
3. 将条目从「延期」或新议题移入「已关闭」
