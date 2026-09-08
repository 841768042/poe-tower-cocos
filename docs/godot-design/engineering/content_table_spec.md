# 配置表、数据字典与内容编译规范

状态：DEMO 权威数据契约。目标是让绝大多数数值、内容关系和关卡组合通过表格控制，同时保持类型安全、可校验和高效运行。

## 1. 总体方案

```text
data/tables/*.csv                       // 装备、掉落、稀有度、怪物词条、效果
resources/config/**/*.tres              // 基础敌人、波次
        ↓
tools/ContentCompiler + .tres 引用校验
        ↓ 校验、归一化、排序、建索引
data/generated/content_catalog.json
data/generated/content_hash.txt
data/generated/content_report.md
        ↓
DefinitionCatalog（纯 C#、不可变）
        ↓
RunFactory 创建运行时快照
```

- 装备基底、装备稀有度、词条、掉落、怪物词条和效果的内容源是 CSV；Release 运行时不直接解析散落 CSV。
- 基础敌人与波次保留 Godot `.tres`。它们只能引用稳定 ID，编译/启动期必须验证这些 ID 可解析；不得复制装备或怪物词条数值到 `.tres`。
- 内容编译器和游戏运行时共享 DTO、枚举和校验规则。
- 生成目录可由 Git 跟踪，CI 必须重新生成并验证无差异。
- 活跃关卡不热更新内容。开发模式重载只影响下一次创建的 Run。
- 表格控制“已有机制类型的参数与组合”；全新的触发、效果或条件类型需要新增 C# 枚举处理器和测试。
- 所有概率、权重、roll 范围和保底条件由内容源提供；C# 不得为掉落、品质、词条或怪物词条保留竞争性的数值常量。

## 2. 文件规范

- 编码：UTF-8；允许 BOM，编译器归一化时移除。
- 格式：RFC 4180 CSV，首行为固定英文列名，逗号分隔，含逗号/换行的文本必须双引号转义。
- 换行：输入接受 CRLF/LF，归一化输出使用 LF。
- 小数：Invariant Culture，点号小数，不允许百分号；`0.2` 表示 20%。
- 布尔：仅 `true`/`false`。
- 空值：空单元格；不得用 `null`、`N/A`、`-`。
- 列表：仅简单 ID 列表允许 `|` 分隔；有额外属性的多值关系必须拆关系表。
- 注释：可选 `notes` 列，仅供作者阅读，不进入运行时哈希；不得依赖注释表达规则。

## 3. ID 与版本

- 定义 ID：小写 snake_case，可带类别前缀，如 `tower_static_needle`。
- 标签 ID：小写点分层，如 `skill.lightning`。
- ID 一经进入存档不得静默改名或复用。
- `content_manifest.csv` 声明 `schema_version`、`content_version`、DEMO 入口地图和起始档。
- 改名通过 `id_aliases.csv` 显式迁移；删除仍可能存在于存档中的 ID 必须提供替代或迁移失败策略。

## 4. 通用类型

| 类型 | 说明 |
|---|---|
| `id` | 稳定字符串 ID |
| `loc_key` | 本地化键，不直接存玩家可见文本 |
| `tag_list` | `|` 分隔标签 ID，编译为位集 |
| `enum` | 必须匹配共享 C# 枚举名，区分大小写 |
| `ticks` | 非负整数逻辑步 |
| `seconds` | 非负小数，编译为 ticks |
| `cell` | 独立 `x`,`y` 整数列，不使用 `"x,y"` 字符串 |
| `definition_ref` | 外键 ID，编译时必须存在且类型匹配 |

## 5. 核心表

### `content_manifest.csv`

| 列 | 类型 | 必填 | 规则 |
|---|---|---|---|
| `schema_version` | int | 是 | 当前从 1 开始 |
| `content_version` | string | 是 | DEMO 使用 `demo_v1` |
| `default_map_id` | map ref | 是 | `map_swamp_demo` |
| `default_profile_id` | profile ref | 是 | 新档模板 |
| `simulation_hz` | int | 是 | DEMO 必须为 30 |

### `id_aliases.csv`

`definition_type, old_id, new_id, min_save_version, notes`。禁止别名环和多跳链；编译器应压平为单跳并报错要求作者修正。

### `tags.csv`

`tag_id, display_name_key, category, notes`。所有表中引用的标签必须先声明；未使用标签为警告。

### `stat_rules.csv`

`stat_id, unit, default_value, min_value, max_value, display_rounding, notes`。

必须覆盖战斗规格中的 Stat。`min/max` 是最终钳制，不代替特殊规则校验。

## 6. 条件与修正表

### `conditions.csv`

用树表达条件，不允许任意表达式：

`condition_root_id, node_id, parent_node_id, node_order, node_type, condition_kind, subject, reference_id, compare_operator, numeric_value, tag_ids`

- `node_type`：`All`、`Any`、`Not`、`Leaf`。
- `Leaf` 必须有 `condition_kind`；组合节点不得携带叶参数。
- 每个 root 恰好一个无 parent 根节点；禁止环；`Not` 恰好一个子节点。
- 支持的 `condition_kind` 以战斗规格为准。

### `modifier_rows.csv`

`modifier_set_id, row_order, stat_id, operation, value_mode, value, roll_scale, priority, condition_root_id, target_scope, target_tag_ids, handler_id`

- `operation`：`Flat`、`Increased`、`More`、`Override`、`Transform`。
- `value_mode`：`Constant` 或 `OwnerRoll`；后者用物品实例词条数值乘 `roll_scale`。
- `target_scope`：`Self`、`Skill`、`AuraTargets`、`RunGlobal`、`EnemyTarget`。
- 同一 set 的 `row_order` 唯一连续，从 0 开始。
- `handler_id` 必须解析到编译期登记的、类型化 C# allowlist。它不是类名、表达式、脚本、反射字符串或路径；任何未登记 handler 为致命错误。
- DOC-LOOT-001 新增的装备、掉落与怪物词条活跃行只允许 `Flat`、`Increased`。`More`、`Override`、`Transform` 可保留为 schema 枚举，但未经已验收 handler 与切片范围批准时必须被该切片校验拒绝；既有战斗系统的已验收行不因此改写。

## 7. 塔、技能与辅助宝石

### `towers.csv`

| 列 | 说明 |
|---|---|
| `tower_id` | 稳定 ID |
| `name_key`,`description_key` | 本地化 |
| `category` | `Elemental/Projectile/Summon/Aura/Totem` |
| `tag_ids` | 塔标签 |
| `base_build_cost` | 非负整数 |
| `footprint_width`,`footprint_height` | DEMO 为 1 |
| `can_rotate` | DEMO false |
| `primary_skill_id` | 技能外键 |
| `base_modifier_set_id` | 可空 |
| `power_curve_id` | 等级曲线 |
| `placement_rule_id` | 地形/区域规则 |
| `presentation_id` | 表现引用 |
| `enabled_in_demo` | bool |

### `tower_power_levels.csv`

`power_curve_id, level, gold_cost, modifier_set_id`。每条曲线必须包含 1–5 级；1级费用为0，后续 DEMO 默认 80/140/220/320。

### `skills.csv`

`skill_id, name_key, tag_ids, trigger_kind, carrier_kind, base_interval_seconds, windup_seconds, range_cells, target_count, target_strategy, requires_line_of_sight, projectile_id, effect_set_id, presentation_id`

### `skill_effects.csv`

`effect_set_id, effect_order, effect_kind, condition_root_id, target_scope, damage_type, base_value, secondary_value, duration_seconds, status_id, ground_effect_id, child_skill_id, modifier_set_id, consume_policy, source_lifetime_policy`

无关列必须为空；内容编译器按 `effect_kind` 校验必填/禁填列。例如 `DealDamage` 要求 `damage_type/base_value`，`CreateGroundEffect` 要求 `ground_effect_id`。

### `projectiles.csv`

`projectile_id, speed_cells_per_second, max_lifetime_seconds, collision_radius_cells, pierce_count, chain_count, presentation_id`。

### `support_gems.csv`

`support_id, name_key, description_key, tag_ids, compatibility_condition_root_id, max_level, behavior_kind, enabled_in_demo`。

### `support_levels.csv`

`support_id, level, install_or_upgrade_cost, modifier_set_id, added_effect_set_id, added_tag_ids, removed_tag_ids`。

同一宝石必须有连续 1–`max_level`。1级费用用于安装；2/3级为升级费用。

### `tower_support_pool.csv`

`tower_id, support_id, display_order, unlock_policy, unlock_condition_id`。

- DEMO 每个启用塔恰好 10 行，`display_order` 为 0–9。
- `unlock_policy` 支持 `Default/Drop/Condition`；DEMO 全部 `Default`。
- 同一塔不能重复宝石；兼容条件必须通过静态验证。

### `placement_rules.csv`

`placement_rule_id, allowed_zone, required_terrain_tags, forbidden_terrain_tags, per_source_limit, global_limit, changes_navigation`。

## 8. 状态、地面和移动

### `statuses.csv`

`status_id, name_key, status_kind, base_duration_seconds, stack_rule, max_stacks, threshold_stat_id, modifier_set_id, control_resilience_group, presentation_id`。

### `ground_effects.csv`

`ground_effect_id, name_key, effect_kind, base_duration_seconds, tick_interval_seconds, base_magnitude, stack_rule, effect_set_id, affects_navigation, presentation_id`。

DEMO `affects_navigation=false`；冰墙属于构造而非地面效果。

### `movement_profiles.csv`

`movement_profile_id, allowed_terrain_tags, ignored_terrain_tags, terrain_cost_modifier_set_id, can_fly, hazard_avoidance_profile_id`。DEMO 只有 `movement_ground`，且不启用 hazard avoidance。

## 9. 地图表

### `terrains.csv`

`terrain_id, name_key, tag_ids, buildable, movement_cost, blocks_projectile, build_cost_multiplier, tower_modifier_set_id, enemy_modifier_set_id, presentation_id`。

### `maps.csv`

`map_id, name_key, biome, battle_width, battle_height, build_width, build_height, global_modifier_set_id, wave_set_id, presentation_id, enabled_in_demo`。

### `map_cells.csv`

`map_id, grid_kind, x, y, terrain_id, cell_role, role_id, presentation_variant`。

- `grid_kind`：`Battle` 或 `Build`。
- `cell_role`：`None/Spawn/Goal`；`role_id` 标识多入口/目标扩展。
- 每张地图每个合法坐标恰好一行，不允许缺格或重复。
- 编译时验证入口到目标可达、建造可用格数量、尺寸和地形引用。

### `terrain_interactions.csv`

`interaction_id, source_effect_id, terrain_tag_id, result_kind, result_effect_id, magnitude_multiplier, duration_multiplier, max_extra_cells, traversal_order`。

DEMO 用于感电地面扩散浅水、冰缓持续延长；跨元素反应行不进入 DEMO。

## 10. 敌人、波次与奖励

### `enemy.csv` 与波次 `.tres`

`enemy.csv` 是基础敌人的唯一权威源，生成 `enemy.json`。字段为：`id, displayName, description, targetPriority, encounterRole, encounterMechanic, targetPriorityDescription, maxHealth, moveSpeedPixelsPerSecond, wallDamage, attacksWallContinuously, wallAttackIntervalSeconds, goldReward, lightningResistance, mechanicIds`。

- `maxHealth`、移速、墙伤、金币、闪电抗性、攻墙语义、目标优先级、基础机制绑定及所有玩家可读敌人文本只能存在于 `enemy.csv`；JSON 仅为确定性生成物。
- `EnemyDefinition .tres` 只能保存稳定 `Id` 和 Godot 表现字段（当前为颜色/半径）。不得写入上述数值、机制 ID 或玩家文本；运行时按 `Id` 严格解析表行，缺失、重复、范围非法、未知/未绑定机制或未知死亡子体均致命失败，不回退编辑器默认值。
- `mechanicIds` 是简单 `|` 分隔的白名单机制 ID；机制公式及参数仍属于 `monster_mechanic.csv`，新机制必须先有受控 C# handler 与测试。
- 波次及生成组继续为 `.tres`，至少含 `wave_set_id`、`wave_index`、`group_id`、`enemy_id`、`rarity`、`control_class`、`monster_affix_ids`、数量、开始时间、间隔与入口 ID。组 ID 唯一、时间非负、入口存在；每波敌人金币合计应在目标曲线 ±5%，Boss 死亡金币可为 0。
- `Rarity` 为 `Normal/Magic/Rare/Unique`，`ControlClass` 为 `Normal/Elite/Boss`，两者正交。首切片正式 `.tres` 投放只允许普通和带 `elite_hardened` 的魔法怪；Rare/Unique 与 `elite_grounded` 只可作为禁用夹具。

### `monster_affixes.csv`

`monster_affix_id, name_key, eligible_rarity, weight, eligibility_condition_root_id, modifier_set_id, effect_set_id, incompatible_group_id, presentation_id, enabled_in_slice`。

编译器验证词条数：普通 0、魔法 1–2、稀有 3–4、Unique 固定专属效果；验证 `elite_hardened` 的 +60% 最大生命、-10% 移速和 `elite_grounded` 的非免疫约束来自关联效果定义，而不是波次资源中的硬编码。

### `loot_table.csv`、`loot_entry.csv` 与 `loot_rule.csv`

- `loot_table`：`id, rollsMin, rollsMax, noDropWeight`。
- `loot_entry`：`lootTableId, entryId, rewardKind, rewardId, weight, quantityMin, quantityMax, enabledInSlice`。
- `loot_rule`：`id, lootTableId, baseEquipmentDropRate, playerIirQualityScale, monsterRarityQuantityWeight, monsterAffixQuantityWeight, monsterRarityQualityWeight, monsterAffixQualityWeight, enabledInSlice`。
- `loot_guarantee`：`id, waveIndex, conditionKind, itemBaseId, rarity, affixId, tierId, fixedRoll, enabledInSlice`。首切片必须以表行表达“第三波、此前无装备、魔法 T9 铜制导能杖、12%”。

`equipment_rarity.qualityUpgradeWeight` 是普通/魔法品质权重的唯一真相源；`loot_rule` 不重复存放品质权重。数量轴只缩放 `loot_table` 选出的掉落尝试次数一次，随后每次尝试按 `loot_entry.quantityMin/quantityMax` 产生其配置的包数量，不得再次乘数量轴。权重必须非负且至少一个可选结果权重大于 0。DOC-LOOT-001 的普通/魔法样例权重为 70%/30%、基础装备掉率 2%；Rare/Unique 正式投放必须为零或被切片开关拒绝。玩家 IIR 只能连接 `playerIirQualityScale`，不得连接数量字段。

## 11. 装备、词条、传奇、通货和天赋

### `item_bases.csv`

`item_base_id, name_key, slot, tag_ids, min_item_level, implicit_modifier_set_id, presentation_id`。

当前垂直切片的等价源表文件为 `equipment.csv`：`id, displayName, slot, tagIds, minItemLevel`。`displayName` 是背包卡片必须使用的本地化基底名；运行时 UI 不得回退显示稳定 ID。

### `equipment_rarities.csv`

`rarity, prefix_max, suffix_max, item_affix_total_min, item_affix_total_max, quality_upgrade_weight, display_label, presentation_id, enabled_in_slice`。

- 层级固定为 `Normal/Magic/Rare/Unique`。`Normal` 的前后缀上限均为 0；`Magic` 均为 1；`Rare` 均为 3；`Unique` 不使用普通随机词条池。
- `Normal`/`Magic` 为本切片正式可生成品质。`Rare`/`Unique` 的行用于结构和视觉夹具，不得被启用的掉落规则产出。

### `affixes.csv`

`affix_id, name_key, affix_type, affix_group_id, allowed_item_tag_ids, forbidden_item_tag_ids, weight, modifier_template_set_id`。

当前垂直切片的实际列为 `id, displayName, effectTextTemplate, kind, minimumValue, maximumValue, affixGroupId, allowedItemTagIds, weight, effectId, enabledInSlice`。`effectTextTemplate` 必须包含 `{0}`，由已存的精确 `rolled_value` 格式化，不能用模糊的“提升”替代数值。

`affix_type`：`Prefix/Suffix/Implicit`。

### `affix_tiers.csv`

`affix_id, tier_id, min_item_level, roll_min, roll_max, weight_multiplier`。范围必须 `min<=max`，层级严格为 T9（最低）至 T1（最高），不得缺级、倒退或复用层级标签。DOC-LOOT-001 必须提供 `affix_lightning_damage` 的 T9 行，范围 8–12；第三波保底的 12 是 `loot_guarantees.csv` 的固定验收值，而非词条表常量。

### `affix_pool_entries.csv`

`pool_id, affix_id, weight_multiplier, condition_root_id`。物品基底通过标签或显式池 ID 获取候选。

### `unique_items.csv`

`unique_item_id, item_base_id, name_key, min_item_level, fixed_modifier_set_id, fixed_effect_set_id, presentation_id`。

当前夹具表 `unique.csv` 使用 `id, displayName, slot, itemBaseId, effectText`；背包显示等级固定为 `U`，不得映射到 T9–T1。

Unique 定义仅为长期结构/视觉夹具；本切片不将其放入新档、掉落池或可执行效果。

### `currencies.csv`

`currency_id, name_key, operation_kind, target_condition_root_id, parameter_set_id, presentation_id`。

本切片不读取、掉落或显示制作通货；该表若保留，只能服务于未启用的长期内容。

### `talents.csv`

`talent_id, name_key, description_key, category, cost_points, modifier_set_id, added_effect_set_id, position_x, position_y, enabled_in_demo`。

### `talent_edges.csv`

`from_talent_id, to_talent_id, edge_kind`。DEMO `edge_kind=Prerequisite`；校验图无环、所有启用节点从起点可达。

## 12. 表现引用

### `presentation_refs.csv`

`presentation_id, scene_path, icon_path, animation_set_id, audio_set_id, fallback_color, notes`。

- 内容表只引用 `presentation_id`，领域核心不读取 Godot 路径。
- 内容编译器验证路径格式；Godot 集成测试验证资源实际存在和可加载。
- 表现缺失在开发构建中使用明确的错误占位并报错；Release 内容编译必须失败。

## 13. 新档模板

### `starting_profiles.csv`

`profile_id, architect_level, starting_item_set_id, unlocked_tower_ids, unlocked_support_ids, starting_talent_ids`。本切片不含 `starting_currency_set_id`。

### `starting_item_instances.csv`

`profile_id, slot, item_base_id, rarity, item_level, identified, affix_set_id`。每个新档恰好六行，分别覆盖六槽；它们必须都是 `Normal`、`ilvl 1`、`identified=true`、空词缀集。`unique_storm_architect_gloves` 与 `unique_marsh_conduit_amulet` 禁止出现在该表。

### `legacy_item_migrations.csv`

`migration_version, legacy_definition_id, target_item_base_id, target_rarity, target_slot, conversion_kind`。转换为实例的稳定 ID 从迁移版本、Profile、槽位和旧 ID 派生，绝不调用随机流。历史 Unique 占位分别映射到 `item_architect_work_gloves`、`item_marsh_charm` 的 `Normal` 实例。

### `definition_sets.csv`

通用集合关系：`set_id, member_kind, member_id, quantity, order`，用于简单定义集合；真实物品必须使用 `starting_item_instances.csv` 或运行时 `ItemInstance`，不得退化为定义 ID 集合。

## 14. 内容编译器

### 阶段

1. 读取清单与 CSV；
2. 语法和类型转换；
3. 枚举和范围校验；
4. ID 唯一性与外键；
5. 图与关系校验；
6. 领域规则校验；
7. 按表名、ID、显式 order 确定性排序；
8. 生成不可变目录 JSON；
9. 对规范化内容计算 SHA-256；
10. 输出人类可读报告。

### 致命错误

- 重复/非法 ID、悬空外键、非法枚举、NaN/Infinity；
- 条件/天赋/别名环；
- 不支持的 `EffectKind` 参数组合；
- DEMO 塔候选辅助宝石不是恰好 10 个；
- 地图缺格、重复格或入口不可达；
- 波次索引缺失、Boss 波不一致；
- 同优先级多个 Override 可能同时命中；
- Release 表现资源引用缺失。
- `.tres` 的怪物、波次、入口、稀有度或怪物词条稳定 ID 悬空，或将词条数值嵌入波次资源；
- 装备稀有度容量不符、T9→T1 缺失/反向、roll 范围或权重非法、词条/基底/槽位不兼容；
- 掉落规则缺失数量或品质轴、玩家 IIR 影响数量、或本切片正式规则可生成 Rare/Unique；
- 第三波教学保底未精确配置为“此前无装备”时的魔法 T9 铜制导能杖/12% roll；
- DOC-LOOT-001 新增的活跃 `More`、`Override`、`Transform` 行没有本切片允许的受控 handler，或任一内容字段尝试表达代码、脚本、反射或公式；
- 新档不是六件普通零词缀实例，或旧定义 ID 迁移缺少确定性映射。

每个致命错误与警告都必须输出 `error_code`、`source_path`、`line`、`column`、`field` 与相关稳定 ID；UI/CI 报告不得只输出“配置无效”。

### 警告

- 未使用定义、标签或表现；
- 波次金币偏离目标 2%–5%；
- 配置修正必然被钳制；
- 条件静态判断恒真/恒假；
- 掉落表存在极低但非零权重。

## 15. 运行时装载

- `ContentCatalogLoader` 验证 `schema_version`、哈希和必需 DEMO ID。
- `DefinitionCatalog` 以只读字典按稳定 ID 索引，并持有编译后标签位集和类型化定义。
- Run 创建时只保存定义引用或必要快照；不得修改目录对象。
- Release 装载失败进入专用错误页，不尝试用默认值静默补齐内容。

## 16. 配置变更验收

- 修改静电针塔积累值只改表并重新编译，无需改 C# 或场景。
- 新增一个使用已有 `DealDamage + CreateGroundEffect` 的塔只需新增/关联表行和表现资源。
- 新增全新“时间倒流”机制因不存在对应 `EffectKind`，编译器必须拒绝，直到实现处理器与测试。
- 删除存档仍引用的定义时，若无别名或迁移，存档装载测试必须失败并给出 ID。

## 17. 共享枚举（精确代码名）

CSV 枚举区分大小写，C# 与生成 JSON 使用以下名称：

```text
TowerCategory: Elemental, Projectile, Summon, Aura, Totem
DamageType: Physical, Fire, Cold, Lightning
Rarity: Normal, Magic, Rare, Unique
EquipmentSlot: Head, Body, Hands, Feet, MainTool, Amulet
ModifierOperation: Flat, Increased, More, Override, Transform
ModifierValueMode: Constant, OwnerRoll
TargetScope: Self, Skill, AuraTargets, RunGlobal, EnemyTarget
TargetStrategy: ClosestToWall, HighestHealth, LowestHealth,
                HighestStatusBuildup, DensestCell
TriggerKind: Interval, ManualConstruction, OnHit, OnKill,
             OnStatusTriggered, AuraContinuous
CarrierKind: Instant, Projectile, Area, Summon, Aura, Construction
EffectKind: DealDamage, AddStatusBuildup, ApplyTimedStatus,
            ConsumeStatus, SpawnProjectile, CreateGroundEffect,
            CreateIceWall, ApplyTaunt, ApplyStunBuildup,
            ModifyNextEffect, SpawnSummon
ConsumePolicy: None, IfPresent, Required
SourceLifetimePolicy: PersistSnapshot, DestroyWithSource, EndOfWave
StatusKind: Shock, Chill, Freeze, Stun, Taunt, Ignite
GroundEffectKind: Burning, Chilled, Electrified
UnlockPolicy: Default, Drop, Condition
GridKind: Battle, Build
CellRole: None, Spawn, Goal
RewardKind: ItemBase, UniqueItem, Currency
CurrencyOperationKind: RerollValues, ReplaceAffix, RespecTalent
```

新增枚举值属于代码和数据格式变更，必须更新编译器、处理器、测试及本文。

## 18. 生成目录格式

顶层 JSON 结构固定：

```text
schemaVersion
contentVersion
contentHash
manifest
tags[]
statRules[]
conditions[]
modifierSets[]
towers[]
skills[]
projectiles[]
supports[]
statuses[]
groundEffects[]
movementProfiles[]
terrains[]
maps[]
enemies[]
monsterAffixes[]
waveSets[]
waveResources[]
lootTables[]
lootRules[]
itemBases[]
equipmentRarities[]
affixes[]
uniqueItems[]
currencies[]
talents[]
presentationRefs[]
startingProfiles[]
```

`contentHash` 不参与自身计算；编译器先生成规范化无哈希负载，计算 SHA-256，再写入字段。数组按稳定 ID 和显式 order 排序。运行时 DTO 使用明确属性，不使用 `Dictionary<string,object>`。
