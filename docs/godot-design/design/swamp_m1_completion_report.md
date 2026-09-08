# 沼泽第一章 M1 收口报告

状态：`completed_for_m1_exit`（2026-09-02）。本报告只判定 M1 的敌人机制最小包退出条件；它不替代 M8 的章节平衡签字。

## 范围与可读性

已接入并在专用场景中验收四个主敌人：沼泽幼体、腐囊行尸、泥甲卫士、水幕巫徒；坚韧、迅捷、水幕、孢群四个词条使用真实运行时机制。死亡子体为胆汁孢子和孢群子体，均不继承死亡生成且金币为零。M1 core、合同和表现验收覆盖固定减伤最低承伤、护盾、受限分裂、防递归、全局 32 活跃子体上限、精确波次预告、目标优先级，以及 1280×720/1920×1080 的真实渲染可读性。

## 聚焦真实运行时证据

命令：`tools/verify-swamp-m1-runtime.ps1 -GodotPath <GodotConsole> -Focused`。每个四类敌人的两种构筑用例均在两个独立、固定步长的 Godot 进程中重放，摘要哈希一致。它走 `BattleRuntime + EntityWorld + Enemy.tscn + BuildGridController + TowerAttackComponent + EnemyDeathSpawnSystem + RunLootCoordinator`，固定目标 Profile/种子 `target/52001`。

| 机制/构筑关系 | 实测结果 | 判定 |
|---|---|---|
| 幼体：连锁清群 vs 雷暴 | 6.45s/0 漏 vs 7.67s/0 漏，比例 0.8413 | 通过；群体目标使连锁清群有可解释优势 |
| 腐囊：连锁清群 vs 高频感电 | 11.32s/0 漏 vs 14.17s/0 漏，比例 0.7988；每具尸体生成 2 个零金币胆汁孢子 | 通过；分裂后的清群价值可观察 |
| 泥甲：雷暴 vs 高频感电 | 12.47s/0 漏 vs 13.98s/1 漏；雷暴累计减伤 22.5，高频累计减伤 49.5 | 通过；固定减伤反制小额高频命中 |
| 水幕：高频感电 vs 雷暴 | 13.98s/1 漏 vs 12.47s/0 漏；两侧均观测到 35 护盾吸收 | 机制通过，但原先“高频更快”的严格比值未通过；不把它伪报为平衡通过 |

前两行和泥甲行已经超过 M1 所要求的“两种基准构筑出现可解释优劣变化”。水幕的护盾层、破盾事件和预告表现已完成；其单体构筑比值留作 M8 章节平衡的明确待决项。

三个直接决策变量边界均使用新进程、真实生产路径的 `+10%` 覆盖测试：胆汁孢子生命 `10→11`、泥甲固定减伤 `1.5→1.65`、水幕护盾 `35→38.5`。覆盖只存在于本次进程，源资源与生成配置未被写回。完整 22 轴敏感性、三档 Profile×四种子×五构筑矩阵、200 种子分布和章节总裁决均明确延期到 M8。

100 活跃敌人性能 smoke 达到峰值 100，两个相同种子重放玩法摘要 `960ce490d1f0d2e8be7628b9854464f3fbbd7468336da4a73ac21bc2e0230780` 一致；最终验收复跑逻辑 P95/P99 分别为 `0.1991ms/1.2474ms` 与 `0.1405ms/1.3314ms`，低于 `4ms/8ms`。这些墙钟采样会随机器状态变化；性能 artifact 的完整 hash 因而不是确定性门。分配统计仍标注为包含测试线和 Godot 托管包装的边界测量，未声称生产稳态 0B。

## 证据文件

- `artifacts/validation/swamp_m1_runtime_summary_v1.json`：聚焦验收，本次 artifact hash `d6039fb64fc30662a425e8dca39c30d7f15fbb8cf1ccbfb787734b824d9b7e83`。
- `artifacts/validation/swamp_m1_runtime_matrix_v1.json`：明确标为 `partial_runtime_smoke`，不冒充完整矩阵；本次 canonical artifact hash `234775b09e4ba6de0375c3bf42fc3dddf66996f008cb04ec199c24112ac7980a`。
- `artifacts/validation/swamp_m1_runtime_performance_v1.json`：100 敌人 replay smoke；最终验收 artifact hash `9bcd82054d9476038ec473b7a349db37824890f4bc564e3b3026d0025060fce0`。该产物包含机器计时样本，因此完整 artifact hash 可随复跑变化；确定性门比较的是排除墙钟样本后的运行摘要哈希与玩法结果。
- `artifacts/validation/swamp_m1_runtime_distribution_v1.json`：仍为 M8 延后的 200-seed 分布，artifact hash `015676282fb267443feb69930bf2cbdc56020ff2caa009559f54c0acf237faaa`。

本次生产路径运行时内容哈希为 `79c0e26e247106a204688bcad04023cf09a5f79203bcce92ed110b7d7dd52e39`；M1.5 合同验证的两次 CSV→JSON 完整生成目录哈希为 `dd36f1d26469eac42cf3a16ff68dcf68b4509656893b15414edbc956da838952`。合同初值与回滚值仍保存在 `resources/config/swamp_m1/balance_contract_v1.json`；未因单次聚焦证据而改写成章节已平衡。

## 后续边界

M1 至此停止开发。M2 开始前应先重排后续里程碑；不得把本报告的聚焦验收误读为三张地图、全章节难度、完整掉落或 M8 发布验收完成。
