# ADR-002: Gate 1 — 运行时语义冻结

> 状态：已采纳 · 日期：2026-08-16 · 决策门：Gate 1（阻塞 S2）

## 背景

Runtime 状态机与 Linter 并行规则须在 headless 实现前无歧义，否则 AI 剧本与引擎行为不一致。

## 决策

| ID | 议题 | 结论 |
|----|------|------|
| G1-01 | 对话时其他角色能否移动 | **允许**：`@DIALOGUE` 活跃期间，非 `speaker` 的 actor 可执行 `@MOVE_TO` 等（含 `@PARALLEL`） |
| G1-02 | 说话者能否在对话中移动 | **禁止**：`speaker` 在对应 `@DIALOGUE` 块活跃期间不得 `@MOVE_TO` / `@PLAY_ANIM` → `E_SPEAKER_BUSY` |
| G1-03 | `@NARRATION` 是否阻塞 | **阻塞**：展示期间暂停调度，用户点击可提前结束 |
| G1-04 | `letter` 放置规则 | **仅 `@GIVE`**：禁止 `@SPAWN_PROP prop=letter` → `E_PROP_NOT_PLACEABLE` |
| G1-05 | `@PARALLEL` 同 actor 冲突 | 禁止：双 `@MOVE_TO`；`@MOVE_TO` + `@PLAY_ANIM` 同 actor → `E_CONFLICTING_ACTION` |
| NQ-03 | 运行时错误 UX | **暂停演绎** + 红色错误条 + DSL 行号；不自动续播，用户可「从头重播」 |
| NQ-04 | 重复播放 | **允许**：每次 `Runtime.reset()` 后从头演绎 |

## 后果

- `minimal-play.mira` 中 mira 对话时 old_chen `@MOVE_TO` 为合法模式
- Linter 新增 `E_SPEAKER_BUSY`、`E_CONFLICTING_ACTION`、`E_PROP_NOT_PLACEABLE`
- L5 对话节须区分 speaker / 非 speaker 行为

## 变更文档

- `03-script-dsl.md` §4 禁止项、§5 错误码
- `05-runtime-semantics.md` §6 对话、§11 错误 UX
- `02-entity-catalog.md` §2.1 letter 规则
