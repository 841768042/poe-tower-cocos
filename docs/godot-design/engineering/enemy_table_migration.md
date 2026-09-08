# 敌人基础数据配表迁移（M1.5）

状态：已实施。`resources/config/csv/enemy.csv` 是所有生产敌人基础战斗数据的唯一人工权威源；`resources/config/data/enemy.json` 由转换器生成。

## 字段所有权

| 所有者 | 字段/职责 |
|---|---|
| `enemy.csv` | 稳定 ID、名称、描述、目标优先级、遭遇文本、生命、移速、墙伤、攻墙语义、金币、闪电抗性、基础机制 ID |
| `monster_mechanic.csv` | 已允许机制的参数：减伤、护盾、死亡生成与上限 |
| `EnemyDefinition .tres` | 仅稳定 `Id` 与 Godot 表现值（颜色、半径）；没有战斗数值、机制绑定或玩家文本 |
| C# allowlist | 伤害/护盾/死亡生成的公式和处理顺序；配置不能执行代码 |
| `EnemyVerificationOverride` | 仅夹具使用的进程内、非序列化覆盖；只可通过 `EnemySpawnContext` 交给已显式开启 `EnableVerificationHooks` 的 sandbox，默认关闭且不修改 CSV、JSON、全局配置或共享 Resource |

## 失败策略

启动时按 `EnemyDefinition.Id` 解析 `enemy.json`。每次生成由 `EnemyRuntimeComponent` 形成不可变 `ResolvedEnemyStats` 快照，包含基础/修正生命和移速、墙伤与攻墙间隔、金币、抗性、目标优先级、玩家文本及已解析机制；生产消费者不得把共享 Resource 当作战斗状态。缺少行、重复 ID、非法数值、重复或未知机制、机制目标不匹配、未绑定的基础机制和未知死亡子体都是致命内容错误；不会使用 `.tres` 默认值回退。JSON 重复键也会被拒绝。

## M0 战斗基线的语义延续

M0 的 `14874089246a1f60d08ef8f66041d56e9c47855fc0417098a78bc976a0480901` 是迁移前 allowlist 的**原始字节**标识，不能把它误称为新的语义哈希，也不能用迁移后整个目录的字节哈希替代它。

`BattleContentHasher` 现生成独立的 canonical semantic projection：五个 M0 敌人 `.tres` 只提供受锁定的稳定 `Id`，其完整战斗/可读字段由 `EnemyConfig` 投影；allowlist 里的非敌人输入仍按严格 UTF-8 原始内容投影。颜色和半径不会影响战斗基线。当前投影 SHA-256 为 `da82fa0a026c53c3f5582fbf200d4165847148a87886979db547c03d1b7fec3e`。

只有该投影逐字节等于冻结的迁移等价投影时，运行时才会发布旧的 raw-byte 标识 `148740…`；任一敌人数值、文本、基础机制绑定、资源 ID 或其他 M0 allowlist 输入改变时，输出改为新的 semantic projection hash，不能伪装为旧基线。迁移 sandbox 对 11 个生产敌人逐项固定目标优先级、生命、速度、墙伤、攻墙语义/间隔、金币、闪电抗性和基础机制绑定；其中 M0 五行承接迁移前 `.tres` 值，M1 六行承接 M1 合同。

## M1.5 证据链闭环

旧 M1 合同中的 `e5ad3b2011e5ed02253eda79d680bf1b41e229df3e47a5f78b88e4b62c9a5ea2` 是迁移前的 legacy matrix artifact anchor，必须继续保留，不能被迁移结果覆盖。CSV 单一来源迁移后真实生成的 M0 matrix artifact 是 `dd58a658c3e830f84ae9baaad324fe3a3d814f949ca9d75b2c23dc466ec559ff`；二者通过 `resources/config/swamp_m1/balance_contract_v1.json` 的 `m0Evidence.migrationCompatibility`（状态 `verified_against_migrated_m0_artifacts`）显式串联。

`tools/verify-swamp-m1-contract.ps1` 不接受只靠合同 JSON 自证：它读取真实 M0 matrix、M0 balance envelope 和独立 low/balanced 战报，核对完整 15 cases、24 sensitivity points、战斗兼容标识 `14874089246a1f60d08ef8f66041d56e9c47855fc0417098a78bc976a0480901`、迁移后 `dd58…` hash，以及第 3 波/tick 1793/击杀 62/漏怪 20/金币 220/投入 300 的固定投影。M0 token verifier 为每次运行创建 GUID token，仅在 `finally` 删除该 token 对应的 `user://swamp_m0_runtime_<scenario>__<token>.json`；它不删除默认报告或任何存档文件。

本次 M1.5 两次 CSV→JSON 的完整生成目录 hash 为 `dd36f1d26469eac42cf3a16ff68dcf68b4509656893b15414edbc956da838952`。聚焦运行时生产路径 content hash 为 `79c0e26e247106a204688bcad04023cf09a5f79203bcce92ed110b7d7dd52e39`，summary artifact hash 为 `d6039fb64fc30662a425e8dca39c30d7f15fbb8cf1ccbfb787734b824d9b7e83`，而 partial matrix artifact hash 为 `234775b09e4ba6de0375c3bf42fc3dddf66996f008cb04ec199c24112ac7980a`。最终验收的 100 敌人性能 artifact 为 `9bcd82054d9476038ec473b7a349db37824890f4bc564e3b3026d0025060fce0`，两次 P95/P99 为 `0.1991/1.2474ms` 与 `0.1405/1.3314ms`；其中 performance artifact 包含墙钟采样、完整 hash 可变，确定性判据是相同的玩法 summary hash `960ce490d1f0d2e8be7628b9854464f3fbbd7468336da4a73ac21bc2e0230780` 与结果，不是墙钟 hash。

## 添加新敌人

1. 在 `enemy.csv` 添加一行稳定 ID、完整基础值和玩家文本；若使用基础机制，填入现有白名单 `mechanicIds`。
2. 新建或复用 `EnemyDefinition .tres`，只填写相同 `Id` 和表现字段；不要填写数值或描述。
3. 若机制不存在，先实现受控 C# handler、表校验和测试，再在 `monster_mechanic.csv` 添加其参数行。
4. 将敌人 ID 引用到波次资源、图集或其他表现表。
5. 连续运行两次 `tools/config/convert-csv-to-json.ps1`，确认第二次无变化；运行 `EnemyTableMigrationSandbox`、构建和相关战斗回归。
