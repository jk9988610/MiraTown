# 米拉小镇（MiraTown）

AI 导演驱动的网页演绎游戏：严格数学空间 + DSL 剧本 + 程序精确执行。

## 文档

完整设计规范见 **[docs/MIRA-TOWN-SPEC.md](docs/MIRA-TOWN-SPEC.md)**（合并版）。

分层文档索引：[docs/README.md](docs/README.md)

## 参考剧本

[examples/minimal-play.mira](examples/minimal-play.mira) — MVP 验收样例（雨夜广场，米拉与陈伯）

## 实体目录

[catalog/entities.yaml](catalog/entities.yaml)

## 开发

```bash
npm install
npm run dev          # 启动 Web（S0 无 AI 播放界面）
npm test -w @miratown/core
```

## 状态

**S0 + S1 已实现**：Parser、Linter、Headless Runtime、Web 校验/播放界面。  
下一步：S3 PixiJS 渲染。

## 三条铁律

1. AI 只写剧本，不写逻辑
2. 一切可检索、可校验
3. 空间是数学对象
