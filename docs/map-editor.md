# 米拉小镇地图编辑器

地图（建筑占位、车道、人行道、固定物件）由你在 **地图编辑器** 中绘制；剧本只引用地图里已有的内容，不再用 `@SPAWN_PROP at=`、`@LAYOUT`、`@SPAWN_WALKWAY` 摆放场景。

## 打开编辑器

开发环境：

```bash
npm run dev
```

浏览器访问 **`/editor`**。播放页 `/` 顶部有「地图编辑器」链接。

## 绘制规范

| 项目 | 说明 |
|------|------|
| 坐标 | 与游戏一致：`x` 向东增大，`y` **向北**增大（画面上方向为北） |
| 人行道 | 仅 **水平或竖直直线**；每条道有 `id`，供剧本 `@MOVE_TO walkway=...` |
| 物件 | 从道具库选类型，点击放置；`id` 自动生成，可在侧栏修改 |
| 场景 | 默认 `street`；室内二级场景（如 `shop_interior`）可切换后分别绘制 |
| 建筑 / 车道 | 用 **建筑占位**、**车道** 等类型标出范围，便于对齐与写剧本 |

网格默认 **1 世界单位 = 1 格**，可开关吸附。

## 导出与融入项目

1. 画完后点击 **「导出 YAML」**，得到 `miratown-map-export.yaml`。
2. 将文件发给助手（或自行合并）：把其中的 `walkways`、`map_objects`（以及需要的 `scenes` 列表）写入仓库根目录 **`catalog/entities.yaml`** 对应字段。
3. 运行 `npm run sync:catalog` 同步到 `packages/web` 与 `packages/core` 的副本。
4. 再编写 `.mira` 剧本：使用 `@SCENE`、`@MOVE_TO walkway=...`、`@SET_PROP id=...` 等，**不要**在剧本里生成地图实体。

## 剧本模板

见 `examples/template.mira`。当前仓库已清空旧示例剧本，仅保留空白模板。

## Catalog 字段

- `walkways`：人行道线段（`id`, `scene`, `x1`, `y1`, `x2`, `y2`）
- `map_objects`：地图固定物件（`id`, `scene`, `prop`, `x`, `y`, `state?`）
- `scene_layouts` / `zones`：可选，仍由地图数据维护，剧本不 `@LAYOUT` 生成
