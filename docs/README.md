# 米拉小镇（MiraTown）设计文档

## 快速入口

| 你想… | 读这个 |
|--------|--------|
| **一览全貌（含已决事项）** | [`MIRA-TOWN-SPEC.md`](./MIRA-TOWN-SPEC.md) |
| **开启新对话接续上下文** | [`DISCUSSION.md`](./DISCUSSION.md) |
| 查已拍板决策 | [`decisions/`](./decisions/) |
| 查延期议题 | [`open-questions.md`](./open-questions.md) |
| 了解项目边界 | [`00-vision.md`](./00-vision.md) |
| 查坐标/时间/镜头数学 | [`01-world-model.md`](./01-world-model.md) |
| 查角色/道具/场景 ID | [`02-entity-catalog.md`](./02-entity-catalog.md) + [`catalog/entities.yaml`](../catalog/entities.yaml) |
| 写/校验 DSL 指令 | [`03-script-dsl.md`](./03-script-dsl.md) |
| 人行道命名与并行走位 | [`walkway-conventions.md`](./walkway-conventions.md) |
| 写剧本文件 | [`04-script-format.md`](./04-script-format.md) + [`examples/minimal-play.mira`](../examples/minimal-play.mira) |
| 实现引擎逻辑 | [`05-runtime-semantics.md`](./05-runtime-semantics.md) |
| 接 AI API | [`06-ai-api-contract.md`](./06-ai-api-contract.md) |
| 搭项目结构 | [`07-architecture.md`](./07-architecture.md) |
| 查术语 | [`glossary.md`](./glossary.md) |

## 文档层级

```
L0 愿景 → L1 世界 → L2 目录 → L3 DSL → L4 格式
                              ↘ L5 语义 → L6 AI 契约 → L7 架构
         decisions/ADR-001~004（Gate 0–3 已闭合）
```

## 版本

- 设计文档：0.1.1
- DSL：1.0（冻结）
- Catalog：1.0.0（冻结）
- **下一步实现**：S0 无 AI 播放 → S1 Parser/Linter
