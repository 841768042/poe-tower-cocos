# 沼泽 M2《沉水村落》数值合同（候选 v1）

状态：`candidate_requires_runtime_matrix_and_first_clear_transaction`。本合同不改写 M0 migrated matrix `dd58a658c3e830f84ae9baaad324fe3a3d814f949ca9d75b2c23dc466ec559ff` 或 M1 runtime content hash `79c0e26e247106a204688bcad04023cf09a5f79203bcce92ed110b7d7dd52e39`。

## 范围与非目标

- 目标：独立 `map_swamp_village` 双路汇流、7 波、祭师、腐潮母体的可调初始合同。
- 非目标：不宣布 M8 章节分布、三图平衡或残酷/挑战完成；不修改 M0/M1 配置以通过 M2。
- 现有 Q53 的第三波教学保底不作为本图首通保底的替代实现。

## 冻结基线和验证矩阵

无天赋 Profile 乘区：低配/目标/高配 `1.00/1.12/1.16`。构筑：`balanced/shock/arc/storm/control_low`。固定种子：低配 `71001–71004`、目标 `72001–72004`、高配 `73001–73004`；分布流从 `74001` 开始。

候选目标：Boss 前目标 Profile 总投入 `650–900`；低配至少一套合法构筑通关、目标至少两套；任一构筑跨所有用例长期优势不超过 15%。自动策略不能代表“理解机制后的胜率”，该项必须由真实交互回放另行判定。

## 表驱动候选值与回滚

唯一参数源是 `resources/config/csv/m2_encounter.csv`：祭师 `70 HP/62 px·s⁻¹/6 墙伤/10 金`，240px、0.9s 前摇、5s 冷却、4s 持续，交替 `+15%` 移速或 `+0.15` 闪电抗性且同类取强。母体 `2400 HP/38 px·s⁻¹/14 墙伤/120 金`，阈值 `70%/35%`；P1 `8s×6` 幼体，存活上限 24；P2 2 个预设腐囊（120 HP、8s、每囊 2 行尸、活跃 4/总计 6）；P3 `×1.35` 移速、`7s/100` 水幕；嘲讽只把下一次产卵推迟 2.5s。上述每一值即回滚值。

7 波组的入口、数量、错峰与间隔来自 `resources/definitions/waves/swamp_village_wave_01.tres` 至 `07.tres`；路径来自 `swamp_village_routes.csv`。第六波在 Q53 当前只允许 Normal/Magic 正式投放的约束下使用显式 Magic 预演，未把 Rare 伪装为已启用内容。

## 待执行验收

必须用真实 M2 runtime 重放记录每波生成/击杀/漏怪/时长、金币和投入、城墙伤害来源、Boss 阶段与技能次数、掉落及奖励事务。敏感性：Boss HP/幼体 CD/腐囊孵化、祭师移速与抗性、波次数量与间隔、经济、首通主工具权重均做 `-10/0/+10%`；离散生成上限单独记录边界。

## 当前阻塞

首通 Magic 主题奖励需要地图完成标识和 pending 同一奖励事务。现有 `PendingRewardData`/`ProfileSaveData` 只记录 run id，无 `map_id` 或已完成地图集合；直接复用第三波条件会违反首通与幂等要求。必须先做 save v2→v3 纯迁移、`completed_map_ids` 持久字段、pending 事务合入与故障恢复测试，才能宣称 M2 退出条件达成。
