# DEMO 内容与数值目录

状态：战斗内容基线与 DOC-LOOT-001 内容输入。装备、掉落、怪物稀有度和恢复的当前切片范围以 [装备掉落垂直切片规格](loot_inventory_vertical_slice_spec.md) 为准；本文件中标为“长期完整 DEMO”的条目不是已实现或本切片必交内容。

所有数值均必须通过配置调整，初次实现不得自行换掉角色职责、范围开关或随机权重。

## 1. 塔基线

| ID | 名称 | 类别 | 成本 | 间隔 | 角色 |
|---|---|---|---:|---:|---|
| `tower_static_needle` | 静电针塔 | Elemental | 80 | 0.5秒 | 施加感电 |
| `tower_arc` | 电弧塔 | Elemental | 100 | 1.2秒 | 连锁清杂、利用感电 |
| `tower_thunderstorm` | 雷暴塔 | Elemental | 120 | 3.0秒 | 消费感电、爆发、铺地 |
| `tower_voltage_aura` | 电势光环塔 | Aura | 140 | 持续 | 强化范围内电系塔 |
| `tower_frost_barrier` | 冰障塔 | Elemental | 130 | 18秒构造冷却 | 冰墙改路、冰缓地面 |
| `tower_taunt_totem` | 嘲讽图腾塔 | Totem | 120 | 6秒脉冲 | 持续时间嘲讽 |

威力等级统一 1–5，费用 0/80/140/220/320。具体每级 modifier 由各塔曲线表定义，默认每级基础伤害 `Increased +20%`；非伤害塔分别提高光环效果、冰缓强度或嘲讽范围 10%。

## 2. 电系基础技能

- 静电针：基础伤害 2 闪电；感电积累 12；射程 3.5格；策略 `HighestStatusBuildup`，过滤已感电目标后优先积累高者。
- 电弧：基础伤害 8 闪电；射程 4格；连锁3；每次跳跃伤害 `More -10%`；目标已感电或处于感电地面时本次连锁 +1。
- 雷暴：基础伤害 25 闪电；半径1.25格；消费感电时 `More +50%`；创建4秒感电地面。
- 电势光环：半径2.25格；电系塔感电积累 `Increased +15%`、释放速度 `Increased +8%`；同名不叠加。
- 冰墙：每塔冷却18秒、持续6秒、每塔1段、全场2段；不额外收费。
- 冰缓脉冲：每8秒在目标格创建5秒冰缓地面，半径0格。
- 嘲讽脉冲：每6秒作用半径1.5格；持续时间按敌人等级规则。

## 3. 辅助宝石等级规则

下表数值写作“1/2/3级”。每种塔候选关系恰好10个；同一宝石可跨塔复用。

### 静电针塔候选

| ID | 效果 |
|---|---|
| `support_rapid_cycle` | 释放速度 +15/22/30%，伤害 More -10% |
| `support_deep_conduction` | 感电积累 +25/35/45%，射程 -15% |
| `support_twin_target` | 目标数 +1，单目标感电积累 More -25/-20/-15% |
| `support_unshocked_tracking` | 强制优先未感电目标；对其积累 +10/15/20% |
| `support_long_range` | 射程 +15/22/30%，伤害 More -8% |
| `support_stunning_spark` | 每次命中增加 3/5/7 眩晕积累，间隔 +10% |
| `support_wet_conductor` | 对潮湿目标感电积累 +20/30/40% |
| `support_focused_needle` | 伤害 +20/30/40%，目标数锁定1，积累 -10% |
| `support_aftershock` | 命中感电目标时对同格另一目标造成20/30/40%伤害，不增加感电 |
| `support_ground_pin` | 每第8/7/6次命中在目标格生成2秒感电地面；伤害 More -15% |

### 电弧塔候选

| ID | 效果 |
|---|---|
| `support_extra_chain` | 连锁 +1；每跳衰减额外5/4/3% |
| `support_return_arc` | 末跳返回首目标造成20/30/40%伤害，不重复积累 |
| `support_shock_seeker` | 对感电目标伤害 +20/30/40% |
| `support_water_conduction` | 浅水/潮湿目标间连锁距离 +25/40/55% |
| `support_arc_speed` | 释放速度 +12/18/25%，伤害 More -8% |
| `support_first_strike` | 首个目标伤害 +30/45/60%，后续跳跃伤害 -10% |
| `support_equalized_arc` | 移除跳跃衰减；基础伤害 More -20/-17/-14% |
| `support_arc_stun` | 每跳增加4/6/8眩晕积累，连锁 -1 |
| `support_ground_jump` | 感电地面上的目标不计入一次连锁上限，每次释放最多额外1/1/2跳 |
| `support_arc_spread` | 优先选择未命中目标；对已命中过的目标伤害 More -30/-25/-20% |

### 雷暴塔候选

| ID | 效果 |
|---|---|
| `support_wide_storm` | 半径 +20/30/40%，伤害 More -12% |
| `support_lingering_field` | 感电地面持续 +25/40/60% |
| `support_conserve_shock` | 不再消费感电；失去消费 More 增伤；对感电目标伤害 +10/15/20% |
| `support_thunder_stun` | 眩晕积累 +20/30/40，释放间隔 +15% |
| `support_fast_storm` | 释放速度 +15/22/30%，伤害 More -15% |
| `support_concentrated_storm` | 半径 -25%，伤害 More +25/35/45% |
| `support_wet_storm` | 对潮湿目标伤害 +20/30/40% |
| `support_delayed_thunder` | 前摇 +0.5秒，伤害 More +30/40/50% |
| `support_field_pulse` | 感电地面每2秒造成原技能8/12/16%伤害 |
| `support_chain_lightning_strike` | 消费感电后向1/2/3个邻近目标造成25%伤害，不消费其状态 |

### 电势光环塔候选

| ID | 效果 |
|---|---|
| `support_aura_radius` | 半径 +15/25/35%，效果 More -8% |
| `support_aura_focus` | 半径 -20%，效果 More +20/30/40% |
| `support_aura_speed` | 受益塔释放速度额外 +4/6/8% |
| `support_aura_buildup` | 受益塔感电积累额外 +10/15/20% |
| `support_aura_ground` | 受益塔生成地面持续 +10/20/30% |
| `support_aura_adjacent` | 与光环塔四向相邻的塔额外获得8/12/16%效果 |
| `support_aura_wet` | 处于软土或相邻浅水的光环效果 +10/15/20% |
| `support_aura_cost` | 建造费 -10/15/20%，光环效果 More -10% |
| `support_aura_chain` | 电弧塔基础连锁 +1；其他受益值 More -15% |
| `support_aura_single_school` | 只影响闪电标签塔，效果 More +15/25/35% |

### 冰障塔候选

| ID | 效果 |
|---|---|
| `support_wall_duration` | 冰墙持续 +20/35/50% |
| `support_wall_cooldown` | 冷却恢复 +15/22/30%，墙持续 More -10% |
| `support_chilled_ground_duration` | 冰缓地面持续 +20/35/50% |
| `support_chilled_ground_slow` | 冰缓强度 +5/8/10个百分点，持续 -20% |
| `support_wall_chill` | 冰墙相邻格持续产生10/15/20%冰缓 |
| `support_wall_shatter` | 到期时造成10/15/20冷伤，不增加冻结积累 |
| `support_water_freeze_buildup` | 浅水冰缓地面每秒增加4/6/8冻结积累 |
| `support_barrier_range` | 冰墙可指定距离 +1/1/2格 |
| `support_barrier_aura` | 冰障塔周围友塔控制积累 +8/12/16% |
| `support_short_wall` | 冰墙持续 More -35%，冷却恢复 +35/50/65% |

### 嘲讽图腾塔候选

| ID | 效果 |
|---|---|
| `support_taunt_radius` | 半径 +15/25/35% |
| `support_taunt_duration` | 嘲讽持续 +15/25/35%，脉冲间隔 +10% |
| `support_taunt_pulse` | 脉冲速度 +15/22/30%，持续 More -10% |
| `support_taunt_slow` | 嘲讽期间额外减速5/8/10% |
| `support_taunt_stun` | 首次嘲讽增加8/12/16眩晕积累 |
| `support_taunt_wet` | 潮湿目标嘲讽持续 +15/25/35% |
| `support_totem_duration` | 图腾部署持续 +20/35/50% |
| `support_totem_redeploy` | 重新部署冷却 +15/22/30%，脉冲间隔 +10% |
| `support_taunt_exposure` | 被嘲讽目标承受闪电伤害 +5/8/10%，普通感电承伤不与其相加，取高 |
| `support_control_aura` | 图腾周围敌人受到的冻结/眩晕积累 +8/12/16% |

## 4. 敌人、稀有度与怪物词条

基础敌人是 `.tres` 资源；其稳定 `enemy_id`、`Rarity`、`ControlClass` 和怪物词条引用必须经加载/内容校验。`Rarity` 与 `ControlClass` 正交：

| `Rarity` | 词条数 | 战场呈现 |
|---|---:|---|
| `Normal` | 0 | 基础呈现 |
| `Magic` | 1–2 | 蓝色 + 轮廓/边框/角标 |
| `Rare` | 3–4 | 黄色 + 轮廓/边框/角标 |
| `Unique` | 固定专属效果 | 暗金色 + 轮廓/边框/角标，固定名字，专属显示 `U` |

`ControlClass` 使用 `Normal`、`Elite`、`Boss`，并不由稀有度推导。所有特殊怪常驻生命条与词条图标；桌面悬停、触屏点击显示精确效果，不显示 T 级。波次预告显示特殊怪及其已知词条。

| ID | 生命 | 速度 | 墙伤 | 金币 | 特征 |
|---|---:|---:|---:|---:|---|
| `enemy_shambler` | 50 | 1.0 | 5 | 5 | 基准敌人 |
| `enemy_rusher` | 30 | 1.8 | 4 | 4 | 快速低血 |
| `enemy_swarm` | 15 | 1.2 | 2 | 2 | 高数量 |
| `enemy_shellback` | 120 | 0.7 | 8 | 10 | 高生命，闪电抗性20% |
| `enemy_bog_colossus` | 3000 | 0.45 | 每秒12 | 0 | 首领；控制阈值高；50%生命召唤一组虫群 |

怪物词条（CSV→JSON）：

- `elite_hardened`：首个正式投放的魔法词条。最大生命 +60%，移动速度 -10%；首切片以 `Rarity=Magic`、`ControlClass=Elite` 的蓝色坚韧怪投放。
- `elite_grounded`：第二条配置候选。感电积累效率 `More -40%`，承受闪电伤害不变，绝不获得完全免疫；本切片只做结构、详情与视觉夹具，不进入正式随机投放。

`Rare` 与 `Unique` 的词条数量、颜色和详情同样需要数据结构与视觉夹具，但不进入本切片正式生成。

## 5. 九波构成

组内生成间隔和开始时间由数值调整，但金币总额必须匹配。

| 波 | 构成 | 金币 | 目的 |
|---|---|---:|---|
| 1 | 16 行尸 | 80 | 基准 |
| 2 | 12 行尸 + 25 群虫 | 110 | 首次清杂压力 |
| 3 | 20 奔袭兽 + 12 行尸 | 140 | 速度检查 |
| 4 | 10 甲壳怪 + 14 行尸 | 170 | 高血目标 |
| 5 | 20 奔袭兽 + 25 群虫 + 8 甲壳怪 | 210 | 混合覆盖 |
| 6 | 10 甲壳怪（前3只为蓝色坚韧魔法/Elite）+20行尸+25群虫 | 250 | 特殊怪、持续输出与预告检查 |
| 7 | 20 甲壳怪（接地词条仅长期夹具，当前不投放）+20行尸 | 300 | 感电依赖检查 |
| 8 | 20 甲壳怪 +25奔袭兽+30群虫 | 360 | 首领前峰值 |
| 9 | 10奔袭兽+30群虫+沼泽巨像 | 100 | 首领和战中应急 |

## 6. 装备词条

本节的 18 条是长期完整 DEMO 的词条目录候选；DOC-LOOT-001 只要求 `affix_lightning_damage` 的 T9 配置行、展示和真实结算。所有词条的资格、T9→T1 层级、roll 范围、权重与排他组来自 CSV→JSON，不能由代码常量替代。

| ID | 类型 | 建议范围 |
|---|---|---|
| `affix_build_cost` | Prefix | 建造成本降低 4%–8% |
| `affix_upgrade_cost` | Prefix | 升级成本降低 5%–10% |
| `affix_starting_gold` | Prefix | 开局金币 +20–50 |
| `affix_sell_refund` | Suffix | 出售返还 +3–7个百分点 |
| `affix_lightning_damage` | Prefix | **本切片 T9：闪电塔伤害 +8%–12%，教学验收 roll 12%**；其余层级为长期内容 |
| `affix_cast_speed` | Suffix | 塔释放速度 +6%–15% |
| `affix_shock_buildup` | Prefix | 感电积累 +10%–25% |
| `affix_shock_duration` | Suffix | 感电持续 +10%–30% |
| `affix_arc_chain` | Prefix | 电弧基础连锁 +1，高等级限定 |
| `affix_area_radius` | Prefix | 范围 +8%–18% |
| `affix_ground_duration` | Suffix | 地面效果持续 +10%–25% |
| `affix_wet_damage` | Prefix | 对潮湿目标伤害 +12%–30% |
| `affix_aura_radius` | Prefix | 光环半径 +8%–18% |
| `affix_aura_effect` | Suffix | 光环效果 +6%–15% |
| `affix_icewall_cooldown` | Suffix | 冰墙冷却恢复 +8%–20% |
| `affix_taunt_duration` | Suffix | 嘲讽持续 +8%–20% |
| `affix_wall_health` | Prefix | 城墙生命 +10%–25% |
| `affix_breach_reduction` | Suffix | 突破伤害降低 5%–12% |

词条层级严格为 T9（最低）至 T1（最高）。高影响离散词条不得与低级连续词条使用相同权重；范围与权重的任何变动只改配置并重新验证。

## 7. Unique 结构与长期内容

`unique_storm_architect_gloves` 与 `unique_marsh_conduit_amulet` 仅保留为长期 Unique 定义/视觉夹具；它们不作为新档默认装备、不进入本切片掉落池，也不启用专属效果。新档的 `Hands` 和 `Amulet` 分别使用普通实例 `item_architect_work_gloves`、`item_marsh_charm`。

出售、制作、鉴定、容量和任何制作通货均不在 DOC-LOOT-001 范围内。若将来排期，必须另行定义玩家操作、事务、存档迁移和验收，不能从本目录推断可用。

## 8. 天赋节点

本节保留现有战斗基线的天赋目录；DOC-LOOT-001 不改变天赋成长，也不提供任何重置或制作操作。

| ID | 方向 | 效果 |
|---|---|---|
| `talent_build_gold` | 通用 | 开局金币 +25 |
| `talent_build_cost` | 通用 | 建造成本 -5% |
| `talent_sell` | 通用 | 出售返还 +5个百分点 |
| `talent_wall` | 通用 | 城墙生命 +15% |
| `talent_lightning_damage` | 电系 | 闪电伤害 +12% |
| `talent_shock_buildup` | 电系 | 感电积累 +15% |
| `talent_arc` | 电系 | 电弧对感电目标伤害 +15% |
| `talent_storm_ground` | 电系 | 感电地面持续 +20% |
| `talent_shallow_water` | 地形 | 潮湿目标感电积累额外 +10% |
| `talent_icewall` | 地形/控制 | 冰墙持续 +15% |
| `talent_taunt` | 地形/控制 | 嘲讽半径 +12% |
| `talent_chilled_ground` | 地形/控制 | 冰缓强度 +5个百分点 |

起点连接三个方向首节点；每方向为线性3节点加末端关键节点，具体坐标由 `talents.csv` 控制。DEMO 不提供增加携带槽节点。
