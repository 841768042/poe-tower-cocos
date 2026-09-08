# DOC-LOOT-001 验收证据

- `loot_performance_report.json` 是本轮人工确认后的实测证据快照；`LootPerformanceSandbox.tscn` 的日常运行结果写入 `user://validation/loot_performance_report.json`，不会在每次标准回归时改写仓库。门槛为 100 个并发 Active Enemy、30Hz 模拟 Step P95 ≤ 4ms、P99 ≤ 8ms、测量线程分配 ≤ 256B/Step，结束后实体数为 0。
- `../visual/backpack_*.png` 与 `../visual/loot_battle_*.png` 由 `LootVisualAcceptanceSandbox.tscn` 在 540×960、1080×1920 实际渲染输出。截图场景须使用可用的 GPU 渲染驱动；Godot 的 headless Dummy Renderer 不提供可读取的 viewport texture。
- `artifacts/.gdignore` 保证这些证据不会被当作运行时游戏资产导入。

完整自动化入口：

```powershell
./tools/verify-demo.ps1 -GodotPath '<Godot 4.7.1 Mono console executable>'
```
