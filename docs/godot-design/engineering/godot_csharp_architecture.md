# Godot 4.7 / C# 项目架构规格

状态：DEMO 权威工程架构。架构以 Godot 场景树和 Node 组合为项目运行骨架，同时把高频计算、确定性规则和持久化 DTO 保持为可独立验证的 C# 类型。

## 1. 架构目标

1. `EntityWorld`、`GameEntity`、组件 Node 和状态 Node 构成统一运行时对象模型。
2. 塔、敌人、投射物、召唤物和临时构造共享实体生命周期、身份、组件发现和释放契约。
3. 行为通过场景组合、Resource 定义和显式系统扩展，避免巨型基类与深继承树。
4. Godot Node 可以承载项目规则；需要确定性、批处理或单元测试的算法可下沉为普通 C# 类，但不强制建立与 Godot 隔离的独立 Core 程序集。
5. 运行时状态与共享定义 Resource 分离，实例不得回写定义资源。
6. 不使用大型 Autoload、字符串事件总线、Service Locator、反射类型扫描或表格脚本执行器。
7. 时间、随机、实体遍历和同价排序必须有稳定规则。

## 2. 项目结构

```text
POETower.csproj
scripts/
  architecture/
    entities/                 # EntityWorld、GameEntity、组件与生命周期
    state_machine/            # 通用实体状态机
    sandbox/                  # 架构验证场景脚本，非正式玩法内容
  app/                        # AppRoot、屏幕与应用服务
  gameplay/
    combat/                   # 伤害、状态、技能、目标选择
    construction/             # 建造、出售、升级
    navigation/               # 网格、流场、动态阻挡
    ground/                   # 按战区格聚合的地面效果
    waves/                    # 波次和关卡状态
  content/                    # 运行时内容目录、校验与内容哈希
  profile/                    # 版本化档案与只读局前快照
  ui/
  infrastructure/            # 存档、内容装载、日志
scenes/
  architecture/
  app/
  gameplay/
  ui/
resources/
  definitions/
data/tables/
data/generated/
tests/
```

按功能继续垂直扩展；除非编译时间、工具复用或团队边界出现实际问题，DEMO 阶段只保留一个生产程序集。

## 3. EntityWorld

`EntityWorld : Node2D` 是一个玩法场景内实体的唯一注册中心，不是跨场景全局单例。

职责：

- 分配本次 World 内单调递增且不复用的 `EntityId`；
- 生成、注册、查询和注销实体；
- 作为实体场景的所有权根节点；
- 提供实体加入/离开强类型信号；
- 场景退出时随玩法场景整体释放。

`EntityWorld` 不负责伤害、AI、波次或导航等具体玩法。需要按类别或空间查询时建立专门索引组件，不能把所有查询堆入 World。

## 4. GameEntity

`GameEntity : Node2D` 是所有运行时实体的项目基类。

基础字段与职责：

- `EntityId`：World 分配的运行时身份；
- `Definition`：可选的共享 `EntityDefinition` Resource；
- `LifecycleState`：`Unbound / Ready / Active / Suspended / Despawning`；
- 发现子树中的 `EntityComponent` 并统一转发生命周期、帧、物理帧和输入；
- 提供 `Activate`、`Suspend`、`Despawn`；
- 离开场景树时从 World 注销。

实体基类不直接包含生命、移动、攻击、掉落等字段。这些能力由组件提供，例如：

```text
EnemyEntity (GameEntity)
├── VisualRoot
├── HealthComponent
├── MovementComponent
├── StatusComponent
├── TargetableComponent
└── StateMachine (EntityStateMachine)
    ├── SpawningState
    ├── MovingState
    ├── ControlledState
    ├── AttackingWallState
    └── DyingState
```

项目允许建立 `EnemyEntity`、`TowerEntity` 等薄子类，用于该类别明确共有的编辑器引用或入口 API；不得把所有具体变化继续塞进继承层。

## 5. EntityComponent

`EntityComponent : Node` 是实体能力模块。

- 组件由所属 `GameEntity` 在 `_Ready` 时发现并绑定；不得同时属于两个实体。
- `OnAttached` 只建立引用和不变式，不假设实体已经激活。
- `OnEntityActivated/Suspended/Despawning` 与实体生命周期对称。
- `OnTick` 用于表现或非固定更新；战斗、移动和冷却优先使用 `OnPhysicsTick` 或后续固定模拟调度器。
- 组件可使用 Export、Godot Signal、资源、场景树和物理 API。
- 高频批处理规则可以委托普通 C# 服务，但所有权仍由具体玩法 Node 持有。

实体组件只在初始化时扫描。热路径不得每帧 `GetNode`、遍历完整子树或临时构建组件集合。

## 6. 实体状态机

`EntityStateMachine : EntityComponent` 管理其直接子节点中的 `EntityState`。

- 状态 ID 使用 `StringName`；为空时采用节点名。
- 状态进入顺序：当前 `CanExit` → 目标 `CanEnter` → 当前 `Exit` → 目标 `Enter` → `StateChanged`。
- `Enter/Exit` 中发起的新切换进入单槽队列，当前切换完成后执行。
- 单次请求最多连续处理 16 次排队切换，超过视为状态循环并抛出可定位错误。
- `Suspend` 保留当前状态但停止 Tick；再次激活从原状态继续。
- `Despawn` 调用当前状态 `Stop`，用于解除状态私有订阅和临时资源。
- 状态只表达阶段行为；生命、伤害、导航等长期数据保存在组件，不在状态切换时搬移所有权。

状态机适合敌人行为、塔释放阶段、波次阶段、关卡阶段和 UI 流程。简单的布尔能力不必强行做成状态。

## 7. 定义与运行时状态

- `EntityDefinition : Resource` 提供稳定 ID、显示信息和通用定义入口。
- 后续使用 `TowerDefinition`、`EnemyDefinition`、`ProjectileDefinition` 等 Resource 子类暴露设计参数。
- CSV 仍是批量内容权威源时，由内容编译器生成可加载资源或类型目录；场景只保存表现和节点组合。
- Resource 是共享只读定义；生命、冷却、目标、状态积累和本局修正必须保存在实体/组件实例。
- 存档只保存稳定内容 ID 和 DTO，不保存 Node、NodePath、Resource 实例 ID 或 EntityId。

## 8. 项目场景与会话

当前正式入口使用主菜单场景和局内场景：

```text
AppRoot
├── ScreenHost
├── OverlayHost
├── AudioRoot
└── AppCompositionRoot
```

Gameplay 场景拥有自己的 `GameSession`、`EntityWorld`、导航、波次与 UI Presenter。离开 Gameplay 时整棵子树释放，避免 RunState、实体和订阅泄漏到下一局。

唯一 Autoload 为小型 `ProfileService`，只拥有永久档案、内容校验和当前只读 `ProfileSnapshot`；实体、关卡状态、战斗集合和事件总线均不进入 Autoload。离开 Gameplay 时完整释放本局场景树。

## 9. 固定逻辑调度

- 目标模拟频率 30Hz；Godot `_PhysicsProcess` 是调度入口。
- 2×速度通过一次物理更新推进更多固定逻辑步，不修改 `Engine.TimeScale`。
- Entity 组件当前具备 `PhysicsTick` 接口；进入战斗实现前增加 `GameSimulationScheduler`，按文档规定的系统顺序调度。
- 同一阶段批量处理实体时使用稳定 `EntityId` 顺序或专用稳定索引。
- 不能让每个实体自行决定跨系统结算顺序；伤害、死亡、奖励等必须经过集中系统队列。

## 10. 命令、信号与事件

- UI/输入向 Gameplay 提交类型化命令；最终合法性由拥有规则的系统判断。
- 同一实体内部优先直接组件引用或强类型 C# event。
- 场景表现可以使用 Godot Signal，连接和解除必须生命周期对称。
- 跨大量实体的高频事件使用系统队列，避免无界信号广播。
- 不使用字符串名称的全局 EventBus。

## 11. 塔防扩展方式

| 新需求 | 推荐扩展 |
|---|---|
| 新敌人，仅参数/表现不同 | 新 Resource/表行与实体场景变体 |
| 新敌人行为阶段 | 新 `EntityState` 子节点 |
| 新实体长期能力 | 新 `EntityComponent` |
| 新伤害/状态规则 | 战斗处理器与对应定义类型 |
| 新目标策略 | `ITargetStrategy` 实现并显式注册 |
| 新移动类型 | 移动组件配置与导航 Profile |
| 新关卡流程 | 关卡状态机状态 |
| 联网、ECS、用户脚本 | 架构评审，不在 DEMO 预埋 |

## 12. 对象池与释放

对象池属于具体 `EntityWorld` 或表现根，不是全局静态池。

Reset 必须恢复：EntityId、Definition、生命周期、状态机当前状态、组件运行时数据、信号订阅、Tween/Timer/Animation、材质、目标、轨迹和 transform。未完成完整 Reset 契约的类型不得池化。

DEMO 先使用正常实例化并测量；只有敌人、投射物或特效的性能数据证明必要时再加入池。

## 13. 当前实现

已实现：

- `EntityWorld` 注册、查询、生成和注销；
- `GameEntity` 身份与完整生命周期；
- `EntityComponent` 组合和更新转发；
- Node 化实体状态机、切换守卫、排队、循环保护和销毁停止；
- `GameSession` 以 30Hz 固定步推进，支持暂停、1×/2×和单帧补步上限；
- 敌人生命、感电/冰缓/嘲讽、共享流场移动、死亡/突破状态、金币/城墙结算与首领持续攻墙；
- 每逻辑 tick 共享的稳定敌人空间桶，塔和地面效果不再逐来源全场扫描；
- 塔实体、稳定目标选择、闪电抗性、静电针感电、电弧连锁、雷暴消费/范围伤害、光环、冰障和图腾；
- Resource 驱动的 4 种普通敌人、首领、6 种塔和 9 波生成数据；
- 6×4 可交互建造网格、6×8 Dijkstra 共享流场、冰墙事务验证和导航版本；
- 建塔、威力 1–5、辅助宝石 5 槽/3 级、投入计价出售、HUD、波次/暂停/速度控制；
- 雷暴/冰障地面效果按格聚合，支持浅水扩散、持续修正和 48 格上限；
- 全量稳定内容 ID 目录：60 个辅助候选、18 词条、6 基底、2 传奇、3 通货、12 天赋，并生成内容哈希；
- 据点主菜单、六槽装备展示、天赋前置分配、版本化原子 JSON 存档与只读局前快照；
- 9 波完整胜利闭环、Boss 持续攻墙失败闭环、结算重试/返回据点；
- 架构、敌人、塔、建造、导航、冰墙、地面效果、Boss、首波和完整 9 波均有 Godot 无头验收场景。

仍属于后续产品化增强而非当前灰盒闭环的内容：完整随机掉落/临时托管提交、全部 60 个辅助宝石的专属效果处理器、两个精英词缀的波次实例化、音频与正式美术。

## 14. 编码要求

- Godot Node/Resource 类使用 `partial`，文件名与职责对应。
- Export 字段具有安全默认值、单位和合理范围。
- 开启 Nullable，不用无意义的 null-forgiving 运算符掩盖生命周期问题。
- NodePath 只存在于场景适配位置；重复访问的 Node 必须缓存。
- 热路径不使用 LINQ、反射、字符串标签判断、临时闭包和全场扫描。
- 主线程访问 SceneTree 与 Godot 对象；后台线程只处理隔离的纯数据任务。
- 状态、组件和场景退出必须解除其拥有的订阅。
