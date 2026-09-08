# 游戏内容配置体系

运行时分表入口为 `ConfigManager.Instance`；`GameContentRegistry.Config` 是为现有业务
组件保留的强类型聚合视图。设计人员只编辑
`resources/config/csv/` 中的 CSV；`resources/config/data/` 下的 JSON 是脚本生成的
运行时数据，不应手工修改。业务组件不得维护同类数值副本；Godot 场景只保留节点
引用、资源引用和测试场景专用覆盖开关。

修改 CSV 后在仓库根目录运行：

```powershell
.\tools\config\convert-csv-to-json.ps1
```

## 配置域

- `economy`：初始资源、出售比例、威力升级曲线、辅助安装/升级曲线。
- `grid`、`map`、`swamp_routes`：网格、地图关系、道路格与移动代价。
- `iceWall`：冷却、持续时间和全局上限。
- `status`：感电、冻结、眩晕、嘲讽和最低移速规则。
- `ground`：地面效果伤害、脉冲、浅水联动、容量和显示参数。
- `presentation`、`atlas`：图集、索引与动画参数。
- `ui_*`：静态文案、动态模板、错误、阶段名、塔职责和波次提示。
- `support`、`support_effect`：辅助关系/说明，以及按辅助、效果、等级建立的复合索引。
- `talent`、`talent_modifier`：天赋/前置，以及天赋修正复合索引。
- `affixes`、`equipment`、`uniques`、`currencies`：局外内容定义。

道路几何保存在 `resources/config/csv/swamp_routes.csv`，路径 ID、顺序、格坐标和移动
代价均由表定义；转换后由 `data/swamp_routes.json` 提供给运行时。正式波次通过入口
索引接入导航，不再依赖旧的 Path Resource。

## 扩展规则

1. ID 一经进入存档不得改名；显示文案可以任意调整。
2. 威力最高等级由 `powerUpgradeCosts.Length + 1` 推导。
3. 辅助槽上限由 `supportInstallCosts.Length` 推导；辅助最高等级由
   `supportUpgradeCosts.Length + 1` 推导。
4. `support_effect.csv` 中同一个辅助/效果必须覆盖每个辅助等级。
5. 新增塔时必须同时增加图集映射与其辅助关系；新增天赋前置必须引用已存在 ID。
6. 配置加载时会做完整性校验并计算 SHA-256 内容哈希，快照据此记录内容版本。
7. 表头用 `字段:类型:key` 声明索引。允许多个 Key，生成器按 Key 顺序输出嵌套 object；
   运行时用 `ConfigTable<T>.Get(key1, key2, ...)` 查询，不需要遍历整张表。
8. 每张 CSV 第二行是字段中文说明行，不参与生成。除字面字段 `id` 外，所有字段都必须
   填写中文说明；转换器会强制校验这项契约。

测试场景若需要自定义小地图，可将 `NavigationGridController.UseGlobalMapConfig` 设为
`false`；正式场景保持 `true`，确保地图主表是唯一来源。
