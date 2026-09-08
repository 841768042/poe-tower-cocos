# 核心循环、局内状态与建造规则

状态：DEMO 权威玩法规格。

## 1. 局前输入

开始关卡需要：

- `profile_snapshot`：装备、天赋、永久解锁和存档版本的只读快照；
- `map_id`：DEMO 固定为 `map_swamp_demo`；
- `tower_loadout`：6 个互不重复的塔定义 ID；
- `run_seed`：掉落、波次随机分支和同价目标排序使用的 64 位种子；
- `content_hash`：已编译配置目录的哈希。

前置校验失败不得创建半有效局内状态。错误必须指出字段、无效 ID 或超限来源。

## 2. 局内状态机

| 状态 | 允许输入 | 完成条件 | 下一状态 |
|---|---|---|---|
| `Initializing` | 无 | 内容、地图、配置和快照成功装载 | `WavePreview`；失败则返回据点并报错 |
| `WavePreview` | 建造、升级、出售、配置宝石、开始波次 | 玩家开始或倒计时结束 | `Combat` |
| `Combat` | 建造体系操作、暂停、速度切换、冰墙放置 | 本波不再生成且场上敌人为 0 | `WaveCleanup`；城墙为 0 则 `Defeat` |
| `WaveCleanup` | 无 | 清除残留投射物、结算报告 | 非末波进入 `Intermission`；末波进入 `Victory` |
| `Intermission` | 建造、升级、出售、配置宝石、查看临时战利品 | 玩家继续 | `WavePreview` |
| `Victory` | 确认结算 | 战利品事务提交成功 | 返回据点 |
| `Defeat` | 确认结算 | 临时战利品丢弃 | 返回据点 |
| `Aborted` | 确认 | 清理局内状态 | 按失败规则处理后返回据点 |

`Paused` 不是独立玩法状态，而是模拟时钟停止标记。暂停时 UI 继续响应，领域模拟不推进。

## 3. 时间与速度

- 模拟固定步长为 `1/30` 秒。
- 1× 每现实秒推进 30 步；2× 每现实秒推进 60 步。
- 单次渲染帧最多补算 4 个逻辑步；超过时保留积压并记录性能警告，不扩大 `delta`。
- 冷却、持续时间、移动和伤害周期都存为逻辑 tick 或由秒数在内容编译时转换为 tick。
- 暂停期间不减少冷却、持续时间、波次倒计时和路径改路保护时间。

## 4. RunState 最小字段

```text
RunId, RunSeed, ContentHash, CurrentTick
RunPhase, CurrentWaveIndex, TimeScale, IsPaused
Gold, WallHealth, WallMaxHealth
TowerLoadoutIds
TowerInstances, EnemyInstances, ProjectileInstances
GridState, NavigationVersion, GroundEffectState
WaveRuntimeState, TemporaryLootEscrow
MetricsState, PendingCommands, PendingDomainEvents
```

运行时集合以稳定递增的 `EntityId` 索引；本局不复用已释放实体 ID，避免事件误指向新对象。

## 5. 建造命令

所有玩家操作先形成命令，在下一个逻辑步的命令阶段验证和执行：

- `BuildTower(towerDefinitionId, buildCell)`
- `SellTower(towerEntityId)`
- `UpgradeTowerPower(towerEntityId)`
- `InstallSupport(towerEntityId, supportDefinitionId)`
- `UpgradeSupport(towerEntityId, supportDefinitionId)`
- `CopyTowerSupports(sourceTowerId, targetTowerId)`
- `BindTotem(totemTowerId, sourceTowerId, battleCell)`
- `PlaceIceWall(sourceTowerId, battleCell)`
- `StartWave()`
- `SetPause(bool)`、`SetSpeed(1|2)`

命令结果为 `Accepted` 或带稳定错误码的 `Rejected`。UI 文案通过错误码本地化，不依赖异常文本。

## 6. 建造合法性顺序

`BuildTower` 按固定顺序验证：

1. 当前状态允许建造；
2. 塔 ID 位于本局出战塔池；
3. 塔定义存在且启用；
4. 占地全部位于建造网格；
5. 占地格可建、未被占用且满足地形标签；
6. 特殊数量规则未超限；召唤塔无独立建塔上限；
7. 金币足够；
8. 创建运行时塔状态并扣款；
9. 重算相邻、光环和连接缓存；
10. 发送 `TowerBuiltEvent`。

验证失败不扣金币、不改变网格、不关闭预览。

## 7. 塔的局内成长

每座塔独立持有：威力等级、已装辅助宝石及等级、运行时冷却、目标锁定、连接和来源修正缓存。

- 威力初始 1 级，最高 5 级；升至 2/3/4/5 级的基础费用为 80/140/220/320 金币。
- 辅助宝石最多 5 个不同 ID，单颗最高 3 级。
- 安装第 1–5 个宝石的基础费用为 40/60/90/130/180 金币。
- 单颗宝石升至 2/3 级的基础费用为 90/160 金币。
- 地形、装备和天赋可修正最终费用，但最终建造/升级成本不得低于基础值的 50%，向最近整数取整，0.5 向上。
- 配置变化从命令执行成功后的下一个技能释放开始生效，不追溯修改已生成投射物或地面效果。

复制辅助配置等价于按槽位顺序连续安装/升级。执行前一次性计算总费用和合法性；任一项非法则整体拒绝，不做部分复制。

## 8. 出售

`可返还投入 = 建造实际支付 + 威力升级实际支付 + 宝石安装/升级实际支付`。

`返还金币 = round_half_up(可返还投入 × 最终返还率)`，DEMO 基础返还率 70%，最终钳制到 0%–100%。

出售顺序：停止新释放 → 解绑图腾/光环/相邻关系 → 清除该塔拥有且声明“随来源销毁”的对象 → 移除塔 → 释放格子 → 发放金币 → 重算缓存。已脱离塔存在的投射物和地面效果按其 `source_lifetime_policy` 处理。

## 9. 金币曲线

开局 300 金币。怪物死亡时立即自动入账；最终首领死亡不掉落无后续用途的金币。

| 波次 | 目标击杀金币 | 累计理论收入（含开局） | 设计目的 |
|---|---:|---:|---|
| 1 | 80 | 380 | 补齐三塔循环或首次升级 |
| 2 | 110 | 490 | 控制/清杂选择 |
| 3 | 140 | 630 | 首批辅助宝石 |
| 4 | 170 | 800 | 光环或冰墙塔 |
| 5 | 210 | 1010 | 强化状态循环 |
| 6 | 250 | 1260 | 针对精英调整单塔配置 |
| 7 | 300 | 1560 | 扩建或集中投资 |
| 8 | 360 | 1920 | 首领前整备 |
| 9 | 战中小怪 100 | 2020 | 首领战应急操作 |

实际金币由 `wave_spawn_groups` 中敌人的 `gold_reward` 求和。内容校验器比较实际值与目标值，偏差超过 ±5% 报错。

## 10. 波次规则

- 每波由配置的生成组组成；生成组声明敌人、数量、开始 tick、间隔和入口。
- 同一 tick 多组生成时按 `wave_group_id` 字典序执行，保证确定性。
- 波次只有在所有生成组完成且所有计数敌人死亡/突破后清场。
- 敌人突破按类型造成一次或持续城墙伤害；DEMO 普通怪一次伤害后移除，首领在目标格持续攻击。
- 波末清除未命中的普通投射物；持续地面效果和冰墙默认清除，不带入下一波，除非定义显式允许。

## 11. 胜负与退出

- 城墙生命降至 0 的同一逻辑步立即标记失败；该步之后不再生成新伤害、金币或掉落。
- 最终首领死亡且场上无存活计数敌人时胜利。
- 主动退出关卡按失败处理；UI 必须在确认框说明临时战利品会丢失。
- 胜利提交存档失败时停留在结算页并允许重试，不把局标记为已领取。

## 12. 验收场景

- Given 金币不足，When 尝试建塔，Then 返回 `insufficient_gold`，状态完全不变。
- Given 两座同类塔，When 为它们安装不同宝石，Then 运行时属性和释放行为互不污染。
- Given 复制配置总费用不足，When 执行复制，Then 不安装任何宝石。
- Given 塔已投入 300 金币且返还率 70%，When 出售，Then 获得 210 金币且所有空间关系在同一 tick 更新。
- Given 游戏为 2×，When 运行 5 秒现实时间，Then 领域持续时间消耗等价于 10 秒 1×模拟。

