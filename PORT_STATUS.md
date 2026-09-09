# 非 Sandbox 移植状态

源项目：`D:\\TowerPoe\\poe-tower`  
目标引擎：Cocos Creator 3.8.6 / TypeScript

## 正式场景映射

| Godot 正式场景 | Cocos 实现 |
|---|---|
| `MainMenu.tscn` | `POETowerApp.showMenu` |
| `PreBattleLoadout.tscn` | `POETowerApp.showLoadout` |
| `Backpack.tscn` | `POETowerApp.showBackpack` |
| `DemoGameplay.tscn` | 9 波 `WAVES` 正式分组 |
| `SwampVillageGameplay.tscn` | 7 波 `VILLAGE_WAVES` 正式分组 |
| `entities/Tower.tscn` | `TowerRuntime` + Cocos `Node/Graphics` |
| `entities/Enemy.tscn` | `EnemyRuntime` + Cocos `Node/Graphics` |

界面由单一 Cocos 主场景承载，通过页面状态切换，避免把 Godot 的场景树结构机械复制到另一引擎。

## 系统映射

| Godot 子系统 | Cocos 实现 |
|---|---|
| EntityWorld / StateMachine / fixed simulation | `assets/scripts/core/EntityRuntime.ts` |
| NavigationFlowField / IceWallSystem | `assets/scripts/core/Navigation.ts` 的道路/离路加权流场与战斗接入；入口、终点、占用及最后通路校验 |
| ConfigManager / GameContentRegistry / content hash | `assets/scripts/core/ContentRegistry.ts` |
| FeedbackAudioPlayer | `assets/scripts/core/FeedbackAudio.ts` |
| BattleRuntime / WaveSystem / tower & enemy components | `assets/scripts/POETowerApp.ts` 固定步长运行时 |
| ProfileService / migration / atomic persistence | v3 localStorage 主档、临时档、备份、回读校验 |
| RunLootCoordinator / RewardCommitService | 临时托管、pending reward、runId 幂等提交；波次基线检查点和建造命令定时重放 |
| Backpack / talent / loadout controllers | 对应页面控制器逻辑 |

## 数据与资料

- `assets/resources/config/data`：40 张运行时 JSON 表。
- `assets/resources/config/csv`：40 张原始 CSV 表。
- `assets/resources/config/contracts`：M0/M1 正式验收契约。
- `assets/resources/art`：正式背景及像素图集源文件。
- `docs/godot-design`、`docs/validation`：非 Sandbox 设计文档与验证证据。

## 验证

- TypeScript `--noEmit --skipLibCheck`：通过。
- Cocos Creator 3.8.6 Web Mobile 构建：通过，产物包含新运行时与内容表。
- 浏览器烟雾测试：主菜单 → M2 编队 → 正式战斗 → 建塔 → 第一波生成通过。
- 浏览器控制台：无 warning/error。
- 运行检查点：临时档回读、主/备份轮换、损坏回退与本波命令日志恢复已接入。

按用户要求，名称或用途属于 Sandbox 的 Godot 场景、脚本和测试驱动没有迁移到目标项目。
