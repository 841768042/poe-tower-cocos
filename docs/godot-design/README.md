# POETower 文档索引

更新时间：2026-08-21
状态：战斗 DEMO 基线 + DOC-LOOT-001 装备掉落垂直切片规格。

本索引区分“现有战斗基线”“当前垂直切片的已确认范围”和“长期完整 DEMO 目标”。文档中出现某项机制，不等于其已经实现；实现状态只能由对应测试、构建记录和任务验收证明。

## 当前可运行入口

- 使用 Godot 4.7.1 Mono 打开代码仓库根目录的 `project.godot`，运行项目进入据点主菜单。
- 主菜单可查看六槽装备、分配 12 节点天赋并进入 9 波沼泽防线。
- 战斗中可建造 6 种塔，进行威力/辅助升级、出售、暂停、2×、手动冰墙，并完成胜利或失败结算。
- PowerShell 全套验证：`./tools/verify-demo.ps1 -GodotPath '<Godot 4.7.1 Mono executable>'`。
- 现有代码的旧存档入口为版本化 JSON `user://profile_v1.json`；DOC-LOOT-001 实现时迁移至主档/backup/tmp、检查点和 pending 契约，详见存档规范。重置入口位于主菜单。
- 上述入口描述的是现有战斗基线。装备掉落、真实实例、恢复和奖励事务必须以 `DOC-LOOT-001` 的验收结果为准，不能从旧“完整 DEMO”叙述推断已实现。

## 权威顺序

发生冲突时按以下顺序处理：

1. `design/demo_scope.md`：当前切片与长期完整 DEMO 的范围边界及验收门槛。
2. `design/loot_inventory_vertical_slice_spec.md`：DOC-LOOT-001 的装备、掉落、怪物词条、背包与恢复唯一细则。
3. `design/systems/`：不与前两项冲突的确定性玩法规则与长期接口。
4. `engineering/`：配置、代码、场景、存档、测试和性能契约。
5. `design/game_vision.md`：长期产品方向。
6. `archive/`：历史讨论，仅用于追溯，不得作为实现依据。

## 文档地图

| 文档 | 责任 | 主要读者 |
|---|---|---|
| [产品愿景](design/game_vision.md) | 长期体验、设计支柱、范围边界 | 全员 |
| [DEMO 范围](design/demo_scope.md) | 唯一可交付范围、内容预算、验收 | 设计、开发、测试 |
| [DEMO 体验与交互策划](design/demo_experience_plan.md) | 完整玩家流程、HUD 状态、建造模式、塔上 TIPS 与交互验收 | 设计、UI、开发、测试 |
| [核心五分钟救援切片](design/core_minute_rescue_plan.md) | 三塔三波试玩验证记录（已完成）；正常六塔九波入口已恢复 | 设计、开发、测试 |
| [战斗反馈与数值可读性计划](design/combat_feedback_readability_plan.md) | 受击、感电、死亡收益反馈与塔/升级/辅助的具体数值展示 | 设计、UI、开发、测试 |
| [DEMO 内容目录](design/demo_content_catalog.md) | 塔、宝石、敌人、波次、词条、天赋基线 | 内容、数值、开发 |
| [装备掉落垂直切片](design/loot_inventory_vertical_slice_spec.md) | DOC-LOOT-001 的真实实例、掉落、特殊怪、背包、恢复和 Q53 验收 | 内容、元系统、开发、测试 |
| [核心循环与局内规则](design/systems/run_and_build_rules.md) | 状态机、建造、金币、波次、胜负 | 核心玩法开发 |
| [战斗、技能与修正](design/systems/combat_skill_modifier_spec.md) | 固定结算顺序、伤害、状态、标签、辅助宝石 | 战斗开发、数值设计 |
| [网格、寻路与地形](design/systems/grid_navigation_terrain_spec.md) | 网格、流场、冰墙、地面效果、地图 | 地图与导航开发 |
| [装备、掉落与长期成长](design/systems/equipment_loot_progression_spec.md) | 长期扩展接口；本切片以装备掉落垂直切片为准 | 元成长开发 |
| [配置表规范](engineering/content_table_spec.md) | CSV 源表、数据字典、编译与校验 | 工具、内容、核心开发 |
| [Godot/C# 架构](engineering/godot_csharp_architecture.md) | 程序集、目录、场景、运行时数据流 | 客户端开发 |
| [存档规范](engineering/save_persistence_spec.md) | DTO、版本、原子写入、胜负事务 | 平台与元系统开发 |
| [测试与性能](engineering/test_performance_spec.md) | 自动测试、烟测、预算、完成定义 | 开发、测试 |
| [开发交接](engineering/demo_development_handoff.md) | 里程碑、依赖、实现顺序、验收清单 | 制作与开发 |

## 状态词

- **已确认**：必须实现，变更需同步影响分析。
- **DEMO 默认**：为消除歧义而确定的当前实现，后续可通过正式变更调整。
- **扩展接口**：本次不产出内容，但架构和数据格式必须允许未来加入。
- **范围外**：本次不得实现，除非先修改 `demo_scope.md`。
- **长期完整 DEMO**：方向或后续内容目标，不是当前切片的实现声明或验收依据。

## 变更规则

1. 玩法方向先改系统规格，再改配置表和工程文档。
2. 新配置字段必须同时更新数据字典、校验器和至少一个测试样例。
3. 新机制类型必须说明是否能由已有 `EffectKind`/`ModifierOperation` 表达；不能表达时先新增受控 C# 处理器、allowlist、校验与测试。配置不得执行任意代码。
4. 存档字段变更必须提高 `save_version` 并提供迁移或明确拒绝策略。
5. 所有可调常量进入配置或集中运行参数，不散落在 Node 脚本中。
6. 涉及物品、掉落、怪物词条或战斗恢复的改动，先更新 `loot_inventory_vertical_slice_spec.md`，再同步内容、存档、配置、测试和交接文档。
