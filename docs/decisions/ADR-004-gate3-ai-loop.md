# ADR-004: Gate 3 — AI 闭环冻结

> 状态：已采纳 · 日期：2026-08-16 · 决策门：Gate 3（阻塞 S5）

## 背景

AI 生成流程的默认约束、失败 UX、用户输入范围须在接入 LLM 前确定。

## 决策

| ID | 议题 | 结论 |
|----|------|------|
| G3-01 | AI 默认 constraints | `allowed_actors: [mira, old_chen]`、`allowed_scenes: [plaza]`、`min_actors: 2`、`max_actors: 2`；**默认不含 lily** |
| G3-02 | Lint 失败 3 次后 | 展示 **lint 报告** + **最后一版剧本** + **「手动编辑」** 入口；不静默失败 |
| G3-03 | 输出语言 | MVP **仅 zh-CN**；front matter 不加 i18n 字段 |
| G3-04 | 用户可配置项 | 封面表单仅：**title、theme、synopsis、tone**；constraints 由系统写死 |
| NQ-02 | 生成中 UI | 三阶段文案：「AI 正在编写剧本…」→「正在校验剧本…」→「即将开演…」 |
| OQ-01 | 架构 | 采纳 **纯前端 + serverless 代理**（与 G2-01 一致） |
| OQ-04 | lily 默认 cast | **不纳入** AI 默认生成 |
| OQ-09 | 多语言 | **延期**；MVP zh-CN only |

## 后果

- `prompts/director-system.md` 仅注入 mira/old_chen + plaza
- L6 Request 示例更新为 MVP 默认 constraints
- 表单 UI 四字段；高级约束不对用户暴露

## 变更文档

- `06-ai-api-contract.md` §2、§3、§4
- `00-vision.md` MVP 验收（可含无 AI 路径）
