# 讨论备忘（供新对话接续）

> 本项目由用户与 AI 结对完成；无多人评审流程。本文档供**开启新 Cursor 对话**时快速恢复上下文。

## 当前状态

- **阶段**：设计规范 0.1.0 已闭合 Gate 0–3，待开始 **S1 Parser**
- **主规范**：[`MIRA-TOWN-SPEC.md`](./MIRA-TOWN-SPEC.md)
- **已拍板决策**：[`decisions/ADR-001`](./decisions/ADR-001-gate0-protocol-freeze.md) ~ [`ADR-004`](./decisions/ADR-004-gate3-ai-loop.md)
- **未决**：见 [`open-questions.md`](./open-questions.md)「延期」节

## 新对话建议开场

把下面一段贴给 AI，可跳过重复讨论：

```
项目：米拉小镇 MiraTown。请先读 docs/MIRA-TOWN-SPEC.md 和 docs/decisions/。
当前任务：[填具体任务，如「实现 S1 Parser」]。
已冻结：DSL 1.0、catalog 1.0.0、PixiJS、纯前端+serverless AI。
```

## 轻量讨论约定

1. **争议用示例验证**：改 `examples/minimal-play.mira` 正反例，再改 L3/L5
2. **决策落 ADR**：新决定写 `docs/decisions/ADR-NNN-*.md`，同步改分层文档 + 合并规范
3. **默认采纳**：若用户未反对 AI 推荐方案，视为同意并直接落文档
4. **延期须标注版本**：如 `Deferred → v0.2`，不写无限期「待决」

## 决策门与实现顺序

```
Gate 0 ✓ → S1 Parser/Linter
Gate 1 ✓ → S2 Runtime
Gate 2 ✓ → S3 渲染
S4 完整演绎 minimal-play
Gate 3 ✓ → S5 AI 闭环
S6 剧本库
```

## 核心已决事项（速查）

| 主题 | 结论 |
|------|------|
| AI 边界 | 只写 DSL，程序执行 |
| 无 AI 模式 | 必须，可播示例/粘贴剧本 |
| 对话并行 | 非 speaker 可移动；speaker 禁止 |
| 部署 | 纯前端 + serverless AI 代理 |
| 渲染 | PixiJS，1280×720 letterbox |
| AI 默认 | 2 人（mira+old_chen）、仅 plaza |
| letter | 只能 `@GIVE` |

## 文档维护顺序

改设计时：**ADR → 分层 L 文档 → `MIRA-TOWN-SPEC.md` → `catalog/entities.yaml`（若涉实体）**
