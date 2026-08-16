# ADR-003: Gate 2 — 体验与交付冻结

> 状态：已采纳 · 日期：2026-08-16 · 决策门：Gate 2（阻塞 S3）

## 背景

渲染与部署选型、视口策略、元数据语义须在搭前端前确定。

## 决策

| ID | 议题 | 结论 |
|----|------|------|
| G2-01 | 部署形态 | **纯前端** + serverless AI 代理（隐藏 API Key）；剧本存 **localStorage** |
| G2-02 | 视口 | **固定 1280×720** 画布，外层 letterbox；**不做移动端** |
| G2-03 | 渲染引擎 | **PixiJS**（2D 精灵 + 相机变换） |
| G2-04 | `duration_estimate` | **剧本元数据**，标注预估时长；用户跳过对话**不修改**此字段 |
| G2-05 | 回放 | MVP **仅从头播放**；`@ACT` 章节跳转延期至 v0.2 |
| OQ-05 | beat 时间 | **仅秒**；beat 延期 |
| OQ-06 | 斜向移动 | **v1 禁止**；四方向寻路 |
| OQ-08 | 幕跳转 | **延期** v0.2 |

## 后果

- 无后端数据库依赖；剧本库基于 localStorage + 内存索引
- Renderer 包依赖 `@pixi/react` 或 pixi.js v8
- 播放器仅「播放 / 重播」按钮

## 变更文档

- `07-architecture.md` §2、§7
- `01-world-model.md` §1.2 视口（确认为固定值）
- `04-script-format.md` `duration_estimate` 说明
