# 战斗、技能、状态与修正规格

状态：DEMO 权威战斗契约。

## 1. 设计目标

装备、天赋、辅助宝石、光环、地形和传奇效果必须通过同一套标签、条件、修正和效果管线工作。新增数值内容只增配表；只有全新的触发或效果类别才新增 C# 处理器。

## 2. 每逻辑步结算顺序

1. 应用已排队玩家命令；
2. 应用构造/地形变更并重建导航场；
3. 推进波次生成；
4. 移动敌人与更新所在格；
5. 结算格子地面效果周期；
6. 更新目标候选和目标锁定；
7. 推进塔/敌人技能冷却并创建释放请求；
8. 解析即时技能、生成投射物/召唤物；
9. 移动投射物并创建命中请求；
10. 按稳定事件序列结算伤害；
11. 结算状态积累、触发、消费和控制；
12. 结算死亡、击杀归属、金币和临时掉落；
13. 更新持续效果与过期对象；
14. 清理实体并生成只读表现事件；
15. 记录本 tick 指标。

同一阶段内按 `EventSequence` 递增执行。处理器不得立即递归执行新事件；派生事件进入当前阶段末尾或明确指定的后续阶段，防止无限触发栈。

## 3. 数值与单位

- 核心计算使用有限 `double`；配置编译时拒绝 NaN、Infinity 和超范围值。
- 时间配置单位为秒，编译后转换为整数 tick；伤害、生命、金币在显示时取整，内部可保留小数。
- 距离以战区/建造格为设计单位，表现层转换为像素。
- 百分比在表中使用小数：`0.2` 表示 20%。
- 除显示和明确规则外不在管线中间取整。

## 4. 标签

定义和运行时对象可拥有标签，例如：

`tower.elemental`、`tower.aura`、`skill.lightning`、`skill.projectile`、`skill.area`、`effect.ground`、`status.shock`、`terrain.shallow_water`。

- 标签 ID 使用小写点分层格式；显示名通过本地化键提供。
- 配置编译器把标签映射为稳定内容索引和位集；存档只保存稳定 ID，不保存索引。
- 条件可以要求 `all/any/none` 标签组合，不能执行任意字符串表达式。

## 5. Stat 与修正代数

DEMO 必需 Stat：

```text
damage.base, damage.critical_chance, damage.critical_multiplier
cast.interval_seconds, range.cells, projectile.speed_cells_per_second
area.radius_cells, chain.count, target.count
status.shock_buildup, status.stun_buildup
ground.duration_seconds, ground.magnitude
summon.limit, summon.respawn_seconds
aura.radius_cells, aura.effect
build.cost, upgrade.cost, sell.refund_rate
wall.max_health, tower.loadout_slots
```

修正顺序：

```text
value0 = base + ΣFlat
value1 = value0 × (1 + ΣIncreased)
value2 = value1 × Π(1 + More)
value3 = highest_priority_override_if_any(value2)
final  = clamp(value3, stat_min, stat_max)
```

`More` 可为负但 `(1 + More)` 不得小于 0。多个 `Override` 按 `priority` 高者胜；同优先级同时命中属于配置错误。修正来源记录 `source_entity_id/source_definition_id`，便于 UI 解释。

### 动态与快照

- 建筑师装备/天赋：入场时快照为 `RunModifiers`。
- 地形：建塔时决定费用；对持续属性的影响随塔所在格动态存在。
- 光环、相邻、连接：塔阵变化时重算缓存。
- 辅助宝石：命令成功后重算该塔技能快照。
- 投射物：生成时快照伤害、标签和来源；飞行中不随塔变化。
- 地面效果：生成时快照强度与持续时间；来源塔出售后的存续由定义决定。

## 6. 条件模型

条件由 `ConditionKind` 和类型化参数构成，支持 `All/Any/Not` 组合：

- `SourceHasTag`
- `SkillHasTag`
- `TargetHasStatus`
- `TargetStatusBuildupAtLeast`
- `SourceOnTerrain`
- `TargetOnTerrain`
- `SourceAdjacentToTag`
- `SourceInsideAuraTag`
- `DistanceCompare`
- `WaveIndexCompare`
- `IsBoss/IsElite`

DEMO 不支持任意脚本、反射调用或表格内 C# 表达式。

## 7. 技能模型

`SkillDefinition` 由以下部分组合：

- 释放：间隔、前摇、目标策略、射程、目标数；
- 载体：即时、投射物、范围、召唤、光环、构造；
- 效果序列：伤害、状态积累、状态消费、地面效果、冰墙、嘲讽等；
- 触发：定时释放、命中、击杀、状态触发、构造命令；
- 视觉：表现 ID，不参与逻辑。

效果序列按 `effect_order` 执行。每个效果拥有条件；条件不满足时跳过，不中止其他效果。

DEMO `EffectKind`：

`DealDamage`、`AddStatusBuildup`、`ApplyTimedStatus`、`ConsumeStatus`、`SpawnProjectile`、`CreateGroundEffect`、`CreateIceWall`、`ApplyTaunt`、`ApplyStunBuildup`、`ModifyNextEffect`、`SpawnSummon`。

## 8. 伤害管线

1. 建立 `DamageRequest`：来源、技能、目标、基础伤害、类型、标签；
2. 应用来源和技能修正；
3. 用已注入随机源判定暴击；
4. 应用目标承伤修正；
5. 应用护甲/抗性；
6. 钳制为非负并扣除生命；
7. 生成 `DamageResult`；
8. 生命首次降至 0 时排队死亡事件。

元素抗性公式：`final = incoming × (1 - resistance)`，DEMO 抗性钳制 `[-1.0, 0.75]`。

物理护甲预留公式：`reduction = armour / (armour + 10 × incomingPhysical)`；DEMO 内容可只使用简单护甲敌人，但管线必须支持。

击杀归属为造成致死伤害的技能来源；持续伤害保留生成时的来源塔和技能 ID。

## 9. 状态积累与控制

- 命中伤害结算后增加对应积累；持续伤害默认不积累，定义可显式允许。
- 敌人拥有独立的感电、冻结、眩晕积累槽与阈值。
- 达到 100% 时触发状态并清空该槽；溢出不保留，除非效果定义允许。
- 消费状态只移除已触发状态，不默认清除未满积累。

| 状态 | DEMO 规则 |
|---|---|
| 感电 | 触发后承受伤害提高 20%，持续 6 秒；刷新持续时间，不叠加强度 |
| 寒意 | 取最强减速并刷新持续时间；与其他减速共用移动速度下限 |
| 冻结 | 普通/精英/首领持续 1.5/1.0/0.5 秒 |
| 眩晕 | 普通/精英/首领持续 1.0/0.7/0.35 秒 |
| 嘲讽 | 普通/精英/首领持续 2.0/1.25/0.5 秒；同一来源结束后 3 秒不能重施 |

冻结与眩晕共享 3 秒控制韧性：普通、精英、首领期间积累效率分别降低 40%、60%、80%。两种硬控同时达到阈值时，先触发事件序列较早者，另一种保留在 99% 并等待当前硬控结束。

移动速度下限：普通 40%、精英 55%、首领 70%。

## 10. 目标选择

目标选择拆成：候选收集 → 标签/射程/视线过滤 → 策略排序 → 稳定同价规则 → 锁定。

策略：`ClosestToWall`、`HighestHealth`、`LowestHealth`、`HighestStatusBuildup`、`DensestCell`。

“最接近城墙”使用当前导航场的剩余路径代价和路径进度，不使用直线距离。完全同价时按 `EnemyEntityId` 升序。

锁定目标失效、死亡、离开射程或被视线阻断时重新选择；普通技能不每 tick 无条件换目标。

## 11. 电系 DEMO 循环

| 塔 | 基础成本 | 间隔 | 角色 | 确定性规则 |
|---|---:|---:|---|---|
| 静电针塔 | 80 | 0.5秒 | 施加 | 低伤害；每次命中 +12 感电积累；优先未感电且积累最高目标 |
| 电弧塔 | 100 | 1.2秒 | 利用/清杂 | 连锁 3；感电或处于感电地面的目标使本次额外连锁 1 次；不消费 |
| 雷暴塔 | 120 | 3.0秒 | 消费/爆发 | 命中感电目标时消费感电，该次 50% More 伤害，并在目标格生成 4 秒感电地面 |

雷暴塔先判定并标记可消费状态，再结算该次伤害增幅，伤害后移除感电并创建地面；同 tick 后续技能看到状态已被消费。

## 12. 辅助宝石修改边界

辅助宝石通过以下方式修改技能：

- 给 Stat 增加修正；
- 给技能添加/移除标签；
- 启用已声明的可选效果节点；
- 替换目标策略或载体参数；
- 添加带条件的新效果节点。

不得在表中直接修改场景路径、调用 Node 方法或动态加载 C# 类型。新 `EffectKind` 需要新增处理器、配置编译校验和单元测试。

## 13. 必测边界

- 两个雷暴塔同 tick 命中同一感电目标时，事件序列较早者消费并获得增幅，后者不获得消费增幅。
- 塔出售后，已生成投射物按快照继续结算，但击杀归属仍指向已失效来源 ID 和定义 ID。
- 同类光环重叠只取最终效果最高者；并列时取实体 ID 小者，UI 标记另一座被覆盖。
- 最短释放间隔默认为基础间隔的 35%；传奇若突破必须使用显式 Stat 上限覆盖。

