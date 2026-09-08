# 存档、波前恢复与奖励事务规范

状态：DOC-LOOT-001 权威持久化契约。装备、掉落与怪物规则见 [装备掉落垂直切片规格](../design/loot_inventory_vertical_slice_spec.md)；本文件定义其文件、DTO、迁移与故障行为。

## 1. 文件与写入原则

    user://saves/profile.json
    user://saves/profile.backup.json
    user://saves/profile.tmp.json
    user://saves/run_checkpoint.json
    user://saves/run_checkpoint.backup.json
    user://saves/run_checkpoint.tmp.json
    user://saves/run_terminal.json
    user://saves/run_terminal.backup.json
    user://saves/run_terminal.tmp.json
    user://saves/pending_reward.json
    user://saves/pending_reward.backup.json
    user://saves/pending_reward.tmp.json
    user://settings.json

Profile、波前检查点和 pending 均使用“内存验证 → 写 tmp → 刷新 → 回读验证 → 原子替换 → 最终验证”的相同仓储接口。替换失败必须保留至少一个可诊断、可恢复副本，并向调用方返回错误；不能声称保存成功。

主档、backup 或临时文件损坏时，禁止自动创建空档并覆盖它。启动先验证主档，再验证 backup；backup 成功时保留损坏主档的诊断副本并通知玩家；两者都不能恢复时只提供“创建新档”或“导出诊断”的显式选择。创建新档也是新的原子写入，不能重用或静默替换损坏内容。

## 2. Profile DTO

    save_version
    profile_id
    created_at_utc, updated_at_utc
    content_version, last_content_hash
    architect_level, architect_experience
    unspent_talent_points
    allocated_talent_ids[]
    equipped_item_instance_ids{slot:item_instance_id}
    inventory_items[ItemInstance]
    unlocked_tower_ids[]
    unlocked_support_ids[]
    selected_tower_loadout_ids[]
    craft_rng_counter
    currency_inventory{currency_id:amount}
    processed_reward_run_ids[]

- DTO 不保存 Node、Resource/场景路径、运行时 Stat 索引、随机对象或可执行元数据。
- inventory_items 即玩家背包，当前无容量上限；每个 item_instance_id 在装备映射和背包中恰好出现一次。装备映射只可引用对应槽位的背包实例。
- 集合在序列化前按稳定 ID 排序；processed_reward_run_ids 至少保留最近 64 个，防止同一胜利重复发奖。
- `craft_rng_counter` 与 `currency_inventory` 仅为旧档兼容和已有资产保全而持久化：迁移必须原样保留合法的非负值，新档从 `currency.csv` 初始化。它们在本切片没有掉落、制作、出售或 UI 操作入口，不能成为当前战斗行为来源。

### 2.1 ItemInstance DTO

    item_instance_id
    item_base_id
    rarity
    item_level
    identified
    affixes[{affix_id, tier_id, rolled_value}]
    unique_item_id?
    acquired_run_id?
    acquired_wave_index?

装载时以内容目录验证基底、槽位、品质容量、词条资格、T9→T1、roll、排他组、物品等级与 Unique 关系。缺失 ID 先查显式 alias，再查本版本迁移规则；仍不能解析则装载失败并保留文件。禁止静默删除实例、钳制 roll 或把定义 ID 当成实例 ID。

## 3. 新档和版本迁移

新档从 starting_item_instances.csv 生成六个 Normal、零词缀、ilvl 1、identified=true 的实例，分别装备六槽。新档绝不引用 unique_storm_architect_gloves 或 unique_marsh_conduit_amulet。

每次持久字段语义变化提高 save_version。迁移器只支持 N→N+1，且是纯函数“旧 DTO → 新 DTO + 报告”；迁移前保留原文件，成功后通过原子写入落盘。较新版本存档必须拒绝，不能降级打开。

旧档如果以装备定义 ID 填充槽位，迁移器按 migration_version|profile_id|slot|legacy_definition_id 的规范化拼接生成实例 ID（可使用该串 SHA-256 的固定截断）。它不调用随机流：相同输入的迁移结果完全相同，重试不会创建第二件物品。普通旧基底映射为对应无词缀 Normal 实例；两条历史占位 unique_storm_architect_gloves、unique_marsh_conduit_amulet 分别映射为 item_architect_work_gloves、item_marsh_charm 的普通实例。未知 ID、槽位不符或碰撞均为迁移失败，不得覆盖旧档。

## 4. RunCheckpoint DTO 与恢复

每当当前波即将进入可运行状态，在该波开始前保存 RunCheckpoint：

    checkpoint_version
    run_id, content_hash
    run_seed
    rng_stream_draw_indices{stream_name:draw_index}
    current_wave_index
    wall_state
    run_gold
    towers[{cell, tower_id, power_level, support_configuration}]
    completed_wave_loot_escrow[EscrowEntry]

EscrowEntry 保存完整 ItemInstance、来源波次和稳定掉落来源。检查点只记录已完成波次的托管物；当前未完成波的敌人、投射物、临时状态、局内命令结果和掉落均不保存。

| 结束方式 | 永久档与检查点行为 |
|---|---|
| Victory | 先执行第 5 节 pending 事务，成功后清除检查点。 |
| Defeat | 展示“本局失去”，丢弃托管和检查点；不写奖励。 |
| Aborted（玩家主动退出） | 丢弃托管和检查点；不创建 pending，也不提供继续本局入口。 |
| 异常中断 | 启动时从当前波开始前检查点恢复；当前未完成波掉落回滚，使用保存的种子和流计数确定性重放。 |

Defeat 与 Aborted 使用独立的 `run_terminal` tombstone 事务，不能只依赖删除检查点：先原子写入
`{run_id, disposition, lost_item_instance_ids, lost_items_hash}`，再删除该局 checkpoint 的主档、backup 和遗留 tmp，最后删除
terminal。启动处理 checkpoint 前必须先处理 terminal；只要 terminal 仍是有效权威，就只重试清理对应 checkpoint，绝不恢复该局、
创建 pending 或修改 Profile。terminal 或清理任一步失败时，结果页、返回菜单和重试均保持阻断；全部清理成功后才允许离开。

terminal 的删除顺序为 backup → primary。删除 checkpoint 时 terminal 已经持久化，因此允许同时清理被终止局的遗留 checkpoint tmp；
删除 terminal 前 checkpoint 必须已不存在。terminal 主档损坏时从 backup 恢复，主档和 backup 均损坏时阻断并保留诊断。

恢复不得合并当前波内存残留和检查点内容，也不得让表现动画消耗随机流。若无法验证检查点的内容哈希、流名称、流计数或塔/辅助配置，必须拒绝恢复、保留诊断文件，并明确向玩家说明；不能悄悄结算失败或胜利。

## 5. 胜利奖励事务与 pending

RewardCommit 包含 run_id、内容哈希、完整 ItemInstance 数组、经验结果和所有已完成/当前胜利有效的托管来源。奖励的实例 ID、词条和 roll 在写 pending 前已确定；重放绝不能重新抽取。

1. Run 进入 Victory 后创建完整 RewardCommit；
2. 原子写入 pending_reward.json；
3. 若 run_id 已在 processed_reward_run_ids，视为幂等成功；否则先验证奖励，再合入背包并记录 run_id；
4. 原子写入 Profile；
5. 回读确认 Profile 含该 run_id 和所有奖励实例；
6. 原子删除 pending 与当前检查点；
7. 仅在第 6 步成功后，UI 才展示“获得”并允许离开结算页。

启动优先于主菜单和恢复局处理 pending：若 Profile 已含 run_id，只清理 pending；否则自动重放步骤 3–6。玩家不能放弃、删除、跳过或从 pending 胜利奖励进入失败路径。pending 损坏同样保留诊断/backup，不能自动舍弃或重新随机奖励。

## 6. 内容兼容与安全

- Profile 记录最后内容版本/哈希用于诊断。普通数值调整不会修改已存实例的 rolled_value；超出新范围时保留值并报告，只有显式迁移可改写。
- 资产、奖励和检查点限制集合大小、字符串长度和数值范围；拒绝负数、重复实例 ID、非法槽位、非法稀有度和重复奖励。
- 本地单机不承诺防作弊，但不反序列化任意类型或可执行元数据。

## 7. 必测场景

- 正常保存、重启装载和无变化重写后 DTO 等价；每个原子写入故障点至少有一个有效副本。
- 主档损坏从 backup 恢复；主/backup 均损坏时不覆盖并可导出诊断。
- 六槽新档实例与定义 ID→实例迁移均确定、幂等；两条历史 Unique 占位不再成为默认 Unique。
- 异常中断恢复到当前波开始前，已完成波托管保持一次，未完成波掉落确定性重放。
- 主动退出和失败不改变入场前永久资产；失败 UI 能列出本局失去项。
- terminal 写入及 checkpoint/terminal 删除的每个故障窗口均可重启幂等清理；已明确终止的局绝不恢复，也不生成 pending。
- pending 在写入前、Profile 写入前、Profile 写入后和 pending 删除前故障，重启后均只奖励一次且不可放弃。
