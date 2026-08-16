# 术语表（Glossary）

| 术语 | 英文 | 定义 |
|------|------|------|
| 米拉小镇 | MiraTown | 本项目的世界与游戏名称 |
| 导演 | Director | AI 角色：编写 DSL 剧本，不控制运行时 |
| 舞台机械师 | Stage Mechanic | 程序角色：解析、校验、精确执行演绎 |
| DSL | Domain-Specific Language | 剧本指令语言，`@` 前缀指令 |
| wu | world unit | 世界坐标单位，1 wu = 32 px |
| 目录 | Catalog | `entities.yaml`，所有可引用实体定义 |
| 剧本 | Script | `.mira` 文件，front matter + DSL 正文 |
| 幕 | Act | `@ACT` 划分的章节，不一定换场景 |
| 场次 / 场景 | Scene | `@SCENE` 切换的地图空间 |
| 区域 | Zone | 场景内命名矩形，用于 `@MOVE_TO to_zone` |
| 实例 | Instance | 运行时 `@ENTER` / `@SPAWN_PROP` 创建的对象 |
| 预设 | Preset | 摄像机模板，如 `cam_wide` |
| IR | Intermediate Representation | 编译后指令树，Runtime 输入 |
| Linter | — | 静态校验器，输出 errors/warnings |
| 阻塞指令 | Blocking | 完成前不执行同层后续指令 |
| 硬切 / 软切 | Cut / Transition | 镜头瞬间跳转 vs 插值过渡 |
| Front Matter | — | YAML 元数据头，供检索与版本绑定 |
| Event Log | — | 运行时事件流，供回放 |
| catalog_version | — | 实体目录版本号 |
| dsl_version | — | DSL 协议版本号 |

### 朝向（facing）

| 值 | 方向 |
|----|------|
| `north` | Y 正方向（上） |
| `south` | Y 负方向（下） |
| `east` | X 正方向（右） |
| `west` | X 负方向（左） |

### 角色状态

| 状态 | 说明 |
|------|------|
| `IDLE` | 站立待机 |
| `WALKING` | 执行 `@MOVE_TO` |
| `ACTING` | 执行 `@PLAY_ANIM` |
| `SITTING` | 坐在道具上 |
| `TALKING` | `@DIALOGUE` 进行中 |
