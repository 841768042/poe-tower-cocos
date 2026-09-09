import {
    _decorator, Color, Component, EventTouch, Graphics, Label, Node, Sprite,
    SpriteFrame, Texture2D, JsonAsset, UITransform, Vec3, resources, sys, tween, view, ResolutionPolicy, Layers, profiler,
} from 'cc';
import { NavigationFlowField } from './core/Navigation';
import { ContentRegistry } from './core/ContentRegistry';
import { FeedbackAudio } from './core/FeedbackAudio';

const { ccclass } = _decorator;

type Screen = 'menu' | 'talents' | 'backpack' | 'loadout' | 'battle' | 'result';
type TowerKind = 'needle' | 'arc' | 'storm' | 'aura' | 'frost' | 'totem';

interface TowerDef {
    id: TowerKind;
    name: string;
    role: string;
    cost: number;
    damage: number;
    interval: number;
    range: number;
    color: Color;
}

interface TowerRuntime {
    kind: TowerKind;
    node: Node;
    level: number;
    cooldown: number;
    invested: number;
    supports: Record<string, number>;
    iceWallReadyAt: number;
    damageDone: number;
    kills: number;
    controlSeconds: number;
}

interface EnemyRuntime {
    node: Node;
    hp: number;
    maxHp: number;
    speed: number;
    reward: number;
    damage: number;
    pathIndex: number;
    shock: number;
    boss: boolean;
    alive: boolean;
    stableId: string;
    rarity: 'Normal' | 'Magic' | 'Rare' | 'Boss';
    affix: string;
    shield: number;
    shieldMax: number;
    shieldRechargeDelay: number;
    shieldRechargeRate: number;
    lastHitAt: number;
    enemyId: string;
    phase: number;
    mechanicClock: number;
    path: Vec3[];
    hpBar: Graphics;
    shieldBar: Graphics;
    statusBar: Graphics;
    lastWallCell: string;
    disabledUntil: number;
    freezeBuildup: number;
    tauntedUntil: number;
    cystsCreated: number;
    wasTaunted: boolean;
    miasmaSpeedUntil: number;
    miasmaResistUntil: number;
    shockUntil: number;
    stunBuildup: number;
    chilledUntil: number;
    targetPriority: number;
    lightningResistance: number;
    navCell: { x: number; y: number };
    nextNavCell: { x: number; y: number } | null;
    breaching: boolean;
    breachWindup: number;
    wallAttackClock: number;
    continuousWallAttack: boolean;
    wallAttackInterval: number;
}

interface AffixInstance { affixId: string; tierId: string; rolledValue: number; }
interface ItemInstance {
    itemInstanceId: string;
    itemBaseId: string;
    rarity: 'Normal' | 'Magic';
    itemLevel: number;
    identified: boolean;
    affixes: AffixInstance[];
    acquiredRunId?: string;
    acquiredWaveIndex?: number;
}

interface ProfileData {
    saveVersion: number;
    profileId: string;
    architectLevel: number;
    unspentTalentPoints: number;
    talents: string[];
    victories: number;
    loadout: TowerKind[];
    inventoryItems: ItemInstance[];
    equippedItemIds: Record<string, string>;
    processedRewardRunIds: string[];
    completedMapIds: string[];
}

interface RunCheckpoint {
    mapMode: 'demo' | 'village';
    runId: string;
    waveIndex: number;
    gold: number;
    wallHp: number;
    escrow: ItemInstance[];
    towers: { kind: TowerKind; cell: string; level: number; invested: number; supports: Record<string, number> }[];
    rngIndices?: Record<string, number>;
    dropSequence?: number;
    commands?: RunCommandData[];
}

type RunCommandKind = 'Build' | 'UpgradePower' | 'InstallSupport' | 'UpgradeSupport' | 'Sell';
interface RunCommandData {
    sequence: number;
    relativeTick: number;
    kind: RunCommandKind;
    cell: string;
    towerKind?: TowerKind;
    supportId?: string;
}

const TOWERS: TowerDef[] = [
    { id: 'needle', name: '静电针塔', role: '快速叠加感电', cost: 80, damage: 2, interval: .5, range: 550, color: new Color(67, 190, 235) },
    { id: 'arc', name: '电弧塔', role: '连锁清杂', cost: 100, damage: 8, interval: 1.2, range: 650, color: new Color(137, 143, 255) },
    { id: 'storm', name: '雷暴塔', role: '范围爆发', cost: 120, damage: 25, interval: 3, range: 550, color: new Color(171, 91, 242) },
    { id: 'aura', name: '电势光环', role: '强化邻近塔', cost: 140, damage: 0, interval: 1, range: 225, color: new Color(77, 224, 210) },
    { id: 'frost', name: '冰障塔', role: '冰缓控场', cost: 130, damage: 0, interval: 18, range: 400, color: new Color(116, 205, 255) },
    { id: 'totem', name: '嘲讽图腾', role: '拖延敌群', cost: 120, damage: 0, interval: 6, range: 150, color: new Color(244, 142, 82) },
];

const TALENTS = [
    ['talent_build_gold', '战争储备', '开局金币 +25', ''],
    ['talent_build_cost', '精打细算', '建造成本 -5%', 'talent_build_gold'],
    ['talent_sell', '回收工艺', '出售返还 +5 个百分点', 'talent_build_cost'],
    ['talent_wall', '加固城墙', '城墙生命 +15%', 'talent_sell'],
    ['talent_lightning_damage', '驭雷', '闪电伤害 +12%', ''],
    ['talent_shock_buildup', '感电专精', '感电积累 +15%', 'talent_lightning_damage'],
    ['talent_arc', '电弧共鸣', '电弧对感电目标伤害 +15%', 'talent_shock_buildup'],
    ['talent_storm_ground', '雷暴余波', '感电地面持续 +20%', 'talent_arc'],
    ['talent_shallow_water', '湿地导体', '潮湿目标感电积累 +10%', ''],
    ['talent_icewall', '永冻屏障', '冰墙持续 +15%', 'talent_shallow_water'],
    ['talent_taunt', '回声诱饵', '嘲讽半径 +12%', 'talent_icewall'],
    ['talent_chilled_ground', '刺骨冻土', '冰缓强度 +5 个百分点', 'talent_taunt'],
];

const SLOT_NAMES: Record<string, string> = { Head: '头部', Body: '身体', Hands: '手部', Feet: '脚部', MainTool: '主手工具', Amulet: '护符' };
const ITEM_BASES: Record<string, { name: string; slot: string }> = {
    item_marsh_surveyor_hood: { name: '沼泽勘探兜帽', slot: 'Head' },
    item_reinforced_field_coat: { name: '加固野战外套', slot: 'Body' },
    item_architect_work_gloves: { name: '建筑师工作手套', slot: 'Hands' },
    item_waders_of_haste: { name: '轻捷涉水靴', slot: 'Feet' },
    item_copper_conductor_rod: { name: '铜制导能杖', slot: 'MainTool' },
    item_marsh_charm: { name: '沼泽护符', slot: 'Amulet' },
};

interface WaveGroup { enemyId: string; count: number; start?: number; gap?: number; path?: 0 | 1; rarity?: 'Normal' | 'Magic' | 'Rare'; affix?: string; }
interface WaveConfig { name: string; groups: WaveGroup[]; targetGold: number; }
const WAVES: WaveConfig[] = [
    { name: '第一波 · 沼泽来客', targetGold: 80, groups: [{ enemyId: 'enemy_shambler', count: 16, gap: .35, path: 0 }] },
    { name: '第二波 · 群虫', targetGold: 110, groups: [{ enemyId: 'enemy_shambler', count: 12, gap: .4, path: 0 }, { enemyId: 'enemy_swarm', count: 25, start: 1, gap: .16, path: 1 }] },
    { name: '第三波 · 奔袭', targetGold: 140, groups: [{ enemyId: 'enemy_rusher', count: 20, gap: .25, path: 0 }, { enemyId: 'enemy_shambler', count: 12, start: 1.5, gap: .4, path: 1 }] },
    { name: '第四波 · 甲壳', targetGold: 170, groups: [{ enemyId: 'enemy_shellback', count: 10, gap: .55, path: 0 }, { enemyId: 'enemy_shambler', count: 13, start: 1.35, gap: .35, path: 1 }, { enemyId: 'enemy_shambler', count: 1, start: 1, path: 1, rarity: 'Magic', affix: 'elite_hardened' }] },
    { name: '第五波 · 混合压力', targetGold: 210, groups: [{ enemyId: 'enemy_rusher', count: 20, gap: .25, path: 0 }, { enemyId: 'enemy_swarm', count: 25, start: 1, gap: .16, path: 1 }, { enemyId: 'enemy_shellback', count: 8, start: 2, gap: .65, path: 0 }] },
    { name: '第六波 · 坚韧先锋', targetGold: 250, groups: [{ enemyId: 'enemy_shellback', count: 10, gap: .55, path: 0 }, { enemyId: 'enemy_shambler', count: 20, start: 1, gap: .3, path: 1 }, { enemyId: 'enemy_swarm', count: 25, start: 2, gap: .16, path: 0 }] },
    { name: '第七波 · 接地者', targetGold: 300, groups: [{ enemyId: 'enemy_shellback', count: 20, gap: .45, path: 0 }, { enemyId: 'enemy_shambler', count: 20, start: 1.5, gap: .3, path: 1 }] },
    { name: '第八波 · 峰值', targetGold: 360, groups: [{ enemyId: 'enemy_shellback', count: 20, gap: .4, path: 0 }, { enemyId: 'enemy_rusher', count: 25, start: .8, gap: .2, path: 1 }, { enemyId: 'enemy_swarm', count: 30, start: 1.8, gap: .13, path: 0 }] },
    { name: '第九波 · 沼泽巨像', targetGold: 100, groups: [{ enemyId: 'enemy_rusher', count: 10, gap: .25, path: 0 }, { enemyId: 'enemy_swarm', count: 30, start: .8, gap: .14, path: 1 }, { enemyId: 'enemy_bog_colossus', count: 1, start: 2.5, path: 0 }] },
];
const VILLAGE_WAVES: WaveConfig[] = [
    { name: '沉水村落 1 · 群潮', targetGold: 64, groups: [{ enemyId: 'enemy_swamp_larva', count: 32, gap: .16, path: 0 }] },
    { name: '沉水村落 2 · 腐囊分裂', targetGold: 72, groups: [{ enemyId: 'enemy_bile_corpse', count: 8, gap: .6, path: 1 }, { enemyId: 'enemy_swamp_larva', count: 16, start: 1.5, gap: .16, path: 1 }] },
    { name: '沉水村落 3 · 双路错峰', targetGold: 96, groups: [{ enemyId: 'enemy_swamp_larva', count: 24, gap: .16, path: 0 }, { enemyId: 'enemy_swamp_larva', count: 24, start: 2, gap: .16, path: 1 }] },
    { name: '沉水村落 4 · 魔法先锋', targetGold: 38, groups: [{ enemyId: 'enemy_swamp_larva', count: 1, path: 0, rarity: 'Magic', affix: 'elite_hardened' }, { enemyId: 'enemy_swamp_larva', count: 18, start: 1, gap: .16, path: 0 }] },
    { name: '沉水村落 5 · 瘴气护送', targetGold: 70, groups: [{ enemyId: 'enemy_miasma_priest', count: 1, path: 0 }, { enemyId: 'enemy_bile_corpse', count: 5, start: .9, gap: .6, path: 0 }, { enemyId: 'enemy_miasma_priest', count: 1, start: 1.5, path: 1 }, { enemyId: 'enemy_bile_corpse', count: 5, start: 2.4, gap: .6, path: 1 }] },
    { name: '沉水村落 6 · 双路预演（固定 Rare 猎杀者）', targetGold: 83, groups: [{ enemyId: 'enemy_mud_armored_guard', count: 3, path: 0, rarity: 'Magic', affix: 'elite_hardened' }, { enemyId: 'enemy_bile_corpse', count: 1, path: 1, rarity: 'Rare', affix: 'elite_hardened|elite_swift' }, { enemyId: 'enemy_swamp_larva', count: 24, start: 1, gap: .16, path: 1 }] },
    { name: '沉水村落 7 · 腐潮母体', targetGold: 120, groups: [{ enemyId: 'enemy_rot_tide_matriarch', count: 1, path: 0 }] },
];

const gridRoute = (cells: number[][]) => cells.map(([x, y]) => new Vec3(-375 + x * 150, 775 - y * 110));
const DEMO_PATH = gridRoute([[1,0],[1,1],[2,1],[2,2],[2,3],[2,4],[2,5],[3,5],[3,6],[3,7]]);
const DEMO_PATH_ALT = gridRoute([[4,0],[4,1],[4,2],[4,3],[3,3],[3,4],[3,5],[3,6],[3,7]]);
const VILLAGE_PATH = gridRoute([[0,0],[1,0],[1,1],[2,1],[2,2],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7]]);
const VILLAGE_PATH_ALT = gridRoute([[5,0],[4,0],[4,1],[3,1],[3,2],[3,3],[3,4],[3,5],[3,6],[3,7]]);
const WIRED_SUPPORT_EFFECTS: Record<string, Set<string>> = {
    support_rapid_cycle: new Set(['speed', 'damage_more']), support_deep_conduction: new Set(['shock']), support_long_range: new Set(['range', 'damage_more']),
    support_ground_pin: new Set(['damage_more']), support_extra_chain: new Set(['chain']), support_arc_speed: new Set(['speed', 'damage_more']),
    support_equalized_arc: new Set(['damage_more']), support_wide_storm: new Set(['radius', 'damage_more']), support_lingering_field: new Set(['duration']),
    support_fast_storm: new Set(['speed', 'damage_more']), support_concentrated_storm: new Set(['radius', 'damage_more']), support_delayed_thunder: new Set(['damage_more']),
    support_wall_duration: new Set(['duration']), support_wall_cooldown: new Set(['cooldown_recovery', 'duration_more']), support_short_wall: new Set(['duration_more', 'cooldown_recovery']),
    support_chilled_ground_duration: new Set(['duration']), support_chilled_ground_slow: new Set(['duration_more']), support_taunt_radius: new Set(['range']),
    support_taunt_duration: new Set(['duration']), support_taunt_pulse: new Set(['speed', 'duration_more']),
};

@ccclass('POETowerApp')
export class POETowerApp extends Component {
    private screen: Screen = 'menu';
    private page!: Node;
    private overlay!: Node;
    private profile: ProfileData = this.createDefaultProfile();
    private selectedKind: TowerKind = 'needle';
    private towers: TowerRuntime[] = [];
    private enemies: EnemyRuntime[] = [];
    private gold = 300;
    private wallHp = 100;
    private wallMax = 100;
    private waveIndex = 0;
    private spawned = 0;
    private spawnClock = 0;
    private waveActive = false;
    private paused = false;
    private speed = 1;
    private hudGold!: Label;
    private hudWall!: Label;
    private hudWave!: Label;
    private hint!: Label;
    private waveButton!: Label;
    private selectedTower: TowerRuntime | null = null;
    private battleTime = 0;
    private kills = 0;
    private escrow: ItemInstance[] = [];
    private runId = '';
    private equipmentLightningMultiplier = 1;
    private selectedItemId = '';
    private backpackPage = 0;
    private buildGrid!: Node;
    private mapMode: 'demo' | 'village' = 'demo';
    private simulationAccumulator = 0;
    private supportConfigs: Record<string, { id: string; towerId: string; effectText: string }> = {};
    private supportEffects: Record<string, Record<string, Record<string, { value: number }>>> = {};
    private iceWalls: { node: Node; endAt: number; cell: string; source: TowerRuntime }[] = [];
    private groundEffects: { node: Node; kind: 'Shocked' | 'Chilled'; endAt: number; position: Vec3; radius: number; cell: string }[] = [];
    private navigation = new NavigationFlowField(6, 8, { x: 3, y: 7 });
    private activeGroups: { definition: WaveGroup; spawned: number; nextAt: number }[] = [];
    private readonly content = new ContentRegistry();
    private readonly feedback = new FeedbackAudio();
    private contentStatus = '配置载入中';
    private contentLabel: Label | null = null;
    private rngIndices: Record<string, number> = {};
    private dropSequence = 0;
    private waveStartCheckpoint: RunCheckpoint | null = null;
    private waveStartTick = 0;
    private replayCommands: RunCommandData[] = [];
    private nextReplayCommand = 0;
    private replayingCommands = false;
    private restoringCheckpoint = false;

    onLoad() {
        profiler.hideStats();
        view.setDesignResolutionSize(1080, 1920, ResolutionPolicy.SHOW_ALL);
        this.loadProfile();
        void this.content.load().then(report => {
            this.contentStatus = report.ok ? `配置 ${report.tableCount} 表/${report.recordCount} 条 · ${report.hash}` : `配置异常 ${report.errors[0] || 'unknown'}`;
            if (this.contentLabel?.isValid) this.contentLabel.string = `Cocos Creator 3.8.6 · TypeScript · ${this.contentStatus}`;
        });
        resources.load('config/data/support', JsonAsset, (err, asset) => { if (!err && asset) this.supportConfigs = asset.json as typeof this.supportConfigs; });
        resources.load('config/data/support_effect', JsonAsset, (err, asset) => { if (!err && asset) this.supportEffects = asset.json as typeof this.supportEffects; });
        this.showMenu();
    }

    update(dt: number) {
        if (this.screen !== 'battle' || this.paused) return;
        this.simulationAccumulator += Math.min(dt, .25) * this.speed;
        const fixedStep = 1 / 30;
        while (this.simulationAccumulator >= fixedStep) {
            this.simulationAccumulator -= fixedStep; this.battleTime += fixedStep;
            this.replayDueCommands();
            this.updateIceWalls(); this.updateWave(fixedStep); this.updateEnemies(fixedStep); this.updateTowers(fixedStep);
            if (this.waveActive && this.spawned >= this.waveEnemyCount(this.waves()[this.waveIndex]) && this.enemies.every(e => !e.alive)) { this.finishWave(); break; }
        }
    }

    private loadProfile() {
        const defaults = this.createDefaultProfile();
        this.profile = defaults;
        const primaryKey = 'poe_tower_profile_v3'; const backupKey = 'poe_tower_profile_v3_backup';
        let raw = sys.localStorage.getItem(primaryKey) || sys.localStorage.getItem('poe_tower_cocos_profile_v1');
        let old: any = null;
        try { if (raw) old = JSON.parse(raw); } catch {
            raw = sys.localStorage.getItem(backupKey); try { if (raw) old = JSON.parse(raw); } catch { old = null; }
        }
        try {
            if (old) {
                const migrated = this.createDefaultProfile();
                Object.assign(migrated, old);
                const legacyTalentMap: Record<string, string> = { lightning: 'talent_lightning_damage', gold: 'talent_build_gold', wall: 'talent_wall', range: 'talent_shallow_water' };
                migrated.talents = (old.talents || []).map((id: string) => legacyTalentMap[id] || id);
                migrated.saveVersion = 3;
                migrated.unspentTalentPoints = Math.max(0, migrated.architectLevel - 1 - migrated.talents.length);
                if (!migrated.inventoryItems || !migrated.inventoryItems.length) {
                    const fresh = this.createDefaultProfile(); migrated.inventoryItems = fresh.inventoryItems; migrated.equippedItemIds = fresh.equippedItemIds;
                }
                if (!this.validateProfile(migrated)) throw new Error('E_PROFILE_MIGRATION_VALIDATION');
                this.profile = migrated;
                this.saveProfile();
                sys.localStorage.removeItem('poe_tower_cocos_profile_v1');
            } else this.saveProfile();
        } catch { this.profile = defaults; try { this.saveProfile(); } catch { /* storage unavailable */ } }
        this.recoverPendingReward();
    }

    private saveProfile() {
        if (!this.validateProfile(this.profile)) throw new Error('E_PROFILE_VALIDATION');
        const primaryKey = 'poe_tower_profile_v3', backupKey = 'poe_tower_profile_v3_backup', tempKey = 'poe_tower_profile_v3_tmp';
        const serialized = JSON.stringify(this.profile); sys.localStorage.setItem(tempKey, serialized);
        const readback = sys.localStorage.getItem(tempKey); if (!readback || !this.validateProfile(JSON.parse(readback))) throw new Error('E_PROFILE_TEMP_READBACK');
        const previous = sys.localStorage.getItem(primaryKey); if (previous) sys.localStorage.setItem(backupKey, previous);
        sys.localStorage.setItem(primaryKey, readback); sys.localStorage.removeItem(tempKey);
    }

    private validateProfile(profile: ProfileData): boolean {
        if (!profile || profile.saveVersion !== 3 || !profile.profileId || !Array.isArray(profile.inventoryItems)) return false;
        const ids = new Set<string>();
        for (const item of profile.inventoryItems) {
            if (!item.itemInstanceId || ids.has(item.itemInstanceId) || !ITEM_BASES[item.itemBaseId]) return false; ids.add(item.itemInstanceId);
            if (item.rarity !== 'Normal' && item.rarity !== 'Magic') return false;
        }
        return Object.keys(profile.equippedItemIds || {}).every(slot => !!SLOT_NAMES[slot] && ids.has(profile.equippedItemIds[slot]));
    }

    private recoverPendingReward() {
        try {
            const raw = sys.localStorage.getItem('poe_tower_pending_reward_v1'); if (!raw) return;
            const pending = JSON.parse(raw) as { runId: string; items: ItemInstance[]; mapId: string };
            if (this.profile.processedRewardRunIds.indexOf(pending.runId) < 0) {
                this.profile.inventoryItems.push(...pending.items); this.profile.processedRewardRunIds.push(pending.runId);
                if (pending.mapId && this.profile.completedMapIds.indexOf(pending.mapId) < 0) this.profile.completedMapIds.push(pending.mapId);
                this.saveProfile();
            }
            sys.localStorage.removeItem('poe_tower_pending_reward_v1');
        } catch { /* retain malformed pending for diagnosis */ }
    }

    private commitVictoryReward() {
        const mapId = this.mapMode === 'village' ? 'map_swamp_village' : '';
        if (mapId && this.profile.completedMapIds.indexOf(mapId) < 0) {
            this.dropSequence++;
            const firstClear = this.createCopperRod(true, this.waves().length, 12);
            firstClear.itemInstanceId = `itm_m2_first_${this.runId}`;
            this.escrow.push(firstClear);
        }
        const pending = { runId: this.runId, items: this.escrow, mapId };
        sys.localStorage.setItem('poe_tower_pending_reward_v1', JSON.stringify(pending));
        if (this.profile.processedRewardRunIds.indexOf(this.runId) < 0) {
            this.profile.inventoryItems.push(...this.escrow); this.profile.processedRewardRunIds.push(this.runId);
        }
        if (mapId && this.profile.completedMapIds.indexOf(mapId) < 0) this.profile.completedMapIds.push(mapId);
        this.saveProfile(); sys.localStorage.removeItem('poe_tower_pending_reward_v1'); this.feedback.play('LootCollect');
    }

    private createDefaultProfile(): ProfileData {
        const profileId = `profile_${Date.now().toString(36)}`;
        const inventoryItems: ItemInstance[] = [];
        const equippedItemIds: Record<string, string> = {};
        Object.keys(ITEM_BASES).forEach((itemBaseId, index) => {
            const itemInstanceId = `itm_start_${index}_${profileId}`;
            inventoryItems.push({ itemInstanceId, itemBaseId, rarity: 'Normal', itemLevel: 1, identified: true, affixes: [] });
            equippedItemIds[ITEM_BASES[itemBaseId].slot] = itemInstanceId;
        });
        return { saveVersion: 3, profileId, architectLevel: 4, unspentTalentPoints: 3, talents: [], victories: 0,
            loadout: TOWERS.map(t => t.id), inventoryItems, equippedItemIds, processedRewardRunIds: [], completedMapIds: [] };
    }

    private resetPage() {
        const previous = this.node.getChildByName('Page');
        if (previous) previous.destroy();
        this.page = this.makeNode('Page');
        this.page.addComponent(UITransform).setContentSize(1080, 1920);
        this.node.addChild(this.page);
        this.overlay = this.makeNode('Overlay');
        this.overlay.addComponent(UITransform).setContentSize(1080, 1920);
        this.page.addChild(this.overlay);
    }

    private showMenu() {
        this.screen = 'menu';
        this.resetPage();
        this.addBackdrop(true);
        this.panel(this.page, 0, 20, 900, 1540, new Color(5, 18, 20, 220));
        this.text(this.page, '流 放 之 塔', 0, 690, 66, new Color(145, 242, 210), 880);
        this.text(this.page, 'PATH OF EXILE 风格·竖屏塔防', 0, 625, 23, new Color(178, 190, 180), 860);
        this.text(this.page, `建筑师 Lv.${this.profile.architectLevel}   胜利 ${this.profile.victories}   天赋 ${this.profile.talents.length}/12`, 0, 520, 28, Color.WHITE, 850);
        this.rule(this.page, 0, 470, 760);
        const checkpoint = this.readCheckpoint();
        this.button(this.page, '进入沼泽防线（9 波）', 0, 410, 760, 75, () => this.showLoadout('demo'), new Color(43, 117, 100));
        this.button(this.page, '进入沉水村落 M2（7 波）', 0, 320, 760, 75, () => this.showLoadout('village'), new Color(45, 92, 89));
        if (checkpoint) this.button(this.page, `继续异常中断的第 ${checkpoint.waveIndex + 1} 波`, 0, 230, 700, 62, () => { this.mapMode = checkpoint.mapMode || 'demo'; this.startBattle(checkpoint); }, new Color(94, 86, 45), 19);
        const utilityY = checkpoint ? 145 : 215;
        this.button(this.page, '建筑师天赋', -195, utilityY, 370, 72, () => this.showTalents(), new Color(45, 72, 73));
        this.button(this.page, '背包与装备', 195, utilityY, 370, 72, () => this.showBackpack(), new Color(64, 67, 49));
        this.text(this.page, '已迁移的正式玩法', 0, 65, 27, new Color(215, 189, 125), 820);
        this.text(this.page, '六塔·辅助宝石·双路导航·冰墙·特殊怪\n装备掉落·托管事务·中断恢复·战斗报告', 0, -35, 23, new Color(190, 205, 196), 800, 36);
        this.text(this.page, '敌人将沿水道前往城墙。\n守住防线，让电光照亮沼泽。', 0, -205, 26, new Color(136, 181, 171), 800, 40);
        this.button(this.page, '重置档案', 0, -610, 420, 66, () => {
            this.profile = this.createDefaultProfile();
            this.clearCheckpoint(); sys.localStorage.removeItem('poe_tower_pending_reward_v1');
            sys.localStorage.removeItem('poe_tower_profile_v3'); sys.localStorage.removeItem('poe_tower_profile_v3_backup'); sys.localStorage.removeItem('poe_tower_profile_v3_tmp');
            sys.localStorage.removeItem('poe_tower_cocos_profile_v1');
            this.saveProfile(); this.showMenu();
        }, new Color(78, 48, 46));
        this.contentLabel = this.text(this.page, `Cocos Creator 3.8.6 · TypeScript · ${this.contentStatus}`, 0, -720, 19, new Color(100, 129, 123), 900);
    }

    private showTalents() {
        this.screen = 'talents';
        this.resetPage(); this.addBackdrop(true);
        this.panel(this.page, 0, 0, 940, 1660, new Color(5, 18, 20, 235));
        this.text(this.page, '建筑师天赋', 0, 730, 48, new Color(145, 242, 210), 850);
        this.text(this.page, `可用点数 ${this.profile.unspentTalentPoints} · 每个节点在下一局生效`, 0, 665, 23, new Color(170, 188, 180), 850);
        TALENTS.forEach((t, i) => {
            const owned = this.profile.talents.indexOf(t[0]) >= 0;
            const col = Math.floor(i / 4), row = i % 4;
            const x = -285 + col * 285, y = 485 - row * 235;
            const prerequisiteMet = !t[3] || this.profile.talents.indexOf(t[3]) >= 0;
            this.button(this.page, `${owned ? '✓ ' : prerequisiteMet ? '+ ' : '◇ '}${t[1]}\n${t[2]}`, x, y, 255, 165, () => {
                if (owned) return;
                if (!prerequisiteMet) return;
                if (this.profile.unspentTalentPoints <= 0) return;
                this.profile.talents.push(t[0]); this.profile.unspentTalentPoints--; this.saveProfile(); this.showTalents();
            }, owned ? new Color(37, 95, 76) : prerequisiteMet ? new Color(48, 65, 66) : new Color(42, 44, 44), 22);
        });
        this.button(this.page, '返回据点', 0, -650, 520, 78, () => this.showMenu(), new Color(78, 76, 56));
    }

    private showBackpack() {
        this.screen = 'backpack'; this.resetPage(); this.addBackdrop(true);
        this.panel(this.page, 0, 0, 990, 1760, new Color(5, 18, 20, 244));
        this.text(this.page, '背包与装备', 0, 780, 46, new Color(145, 242, 210), 900);
        this.text(this.page, '局外可更换装备 · 变更将在下一局快照生效', 0, 720, 21, new Color(188, 200, 190), 900);
        this.panel(this.page, -250, 245, 440, 850, new Color(13, 36, 37, 245));
        this.text(this.page, '已装备六槽', -250, 625, 27, new Color(108, 211, 190), 400);
        const slots = Object.keys(SLOT_NAMES);
        slots.forEach((slot, i) => {
            const item = this.itemById(this.profile.equippedItemIds[slot]);
            this.button(this.page, `${SLOT_NAMES[slot]}\n${item ? this.itemCompact(item) : '空'}`, -250, 520 - i * 118, 390, 96, () => {
                if (item) { this.selectedItemId = item.itemInstanceId; this.showBackpack(); }
            }, item?.rarity === 'Magic' ? new Color(51, 91, 158) : new Color(48, 66, 64), 19);
        });
        this.panel(this.page, 250, 245, 440, 850, new Color(13, 31, 34, 245));
        this.text(this.page, `无限背包 · ${this.profile.inventoryItems.length} 件`, 250, 625, 27, new Color(216, 189, 116), 400);
        const perPage = 6, maxPage = Math.max(0, Math.ceil(this.profile.inventoryItems.length / perPage) - 1);
        this.backpackPage = Math.min(this.backpackPage, maxPage);
        this.profile.inventoryItems.slice(this.backpackPage * perPage, this.backpackPage * perPage + perPage).forEach((item, i) => {
            const equipped = Object.keys(this.profile.equippedItemIds).some(k => this.profile.equippedItemIds[k] === item.itemInstanceId);
            this.button(this.page, `${equipped ? '◆ ' : ''}${this.itemCompact(item)}`, 250, 520 - i * 118, 390, 96, () => { this.selectedItemId = item.itemInstanceId; this.showBackpack(); },
                item.itemInstanceId === this.selectedItemId ? new Color(84, 83, 48) : item.rarity === 'Magic' ? new Color(46, 77, 134) : new Color(48, 62, 63), 18);
        });
        if (maxPage > 0) {
            this.button(this.page, '‹', 130, -195, 85, 54, () => { this.backpackPage = Math.max(0, this.backpackPage - 1); this.showBackpack(); }, new Color(54, 67, 64), 28);
            this.text(this.page, `${this.backpackPage + 1}/${maxPage + 1}`, 250, -195, 20, Color.WHITE, 100);
            this.button(this.page, '›', 370, -195, 85, 54, () => { this.backpackPage = Math.min(maxPage, this.backpackPage + 1); this.showBackpack(); }, new Color(54, 67, 64), 28);
        }
        const selected = this.itemById(this.selectedItemId) || this.profile.inventoryItems[0];
        if (selected) {
            this.selectedItemId = selected.itemInstanceId;
            const base = ITEM_BASES[selected.itemBaseId]; const equipped = this.itemById(this.profile.equippedItemIds[base.slot]);
            this.panel(this.page, 0, -380, 900, 245, new Color(18, 32, 31, 250));
            this.text(this.page, this.itemCard(selected, equipped), 0, -350, 22, selected.rarity === 'Magic' ? new Color(118, 174, 255) : new Color(216, 226, 222), 840, 32);
            const already = equipped?.itemInstanceId === selected.itemInstanceId;
            this.button(this.page, already ? '已装备' : `装备到${SLOT_NAMES[base.slot]}`, -190, -555, 330, 64, () => {
                this.profile.equippedItemIds[base.slot] = selected.itemInstanceId; this.saveProfile(); this.feedback.play('Equip'); this.showBackpack();
            }, already ? new Color(42, 57, 55) : new Color(48, 111, 84), 20);
            this.button(this.page, '卸下该槽位', 190, -555, 300, 64, () => {
                delete this.profile.equippedItemIds[base.slot]; this.saveProfile(); this.feedback.play('Unequip'); this.showBackpack();
            }, new Color(91, 62, 47), 20);
        }
        this.button(this.page, '返回据点', 0, -735, 480, 68, () => this.showMenu(), new Color(68, 69, 60));
    }

    private itemById(id?: string): ItemInstance | undefined { return id ? this.profile.inventoryItems.find(i => i.itemInstanceId === id) : undefined; }
    private itemCompact(item: ItemInstance): string {
        const affix = item.affixes[0]; const suffix = affix ? ` ${affix.tierId} +${affix.rolledValue}%` : '';
        return `${item.rarity === 'Magic' ? '魔法 ' : ''}${ITEM_BASES[item.itemBaseId]?.name || item.itemBaseId}${suffix}`;
    }
    private itemCard(item: ItemInstance, equipped?: ItemInstance): string {
        const base = ITEM_BASES[item.itemBaseId]; const current = equipped && equipped.itemInstanceId !== item.itemInstanceId ? this.itemCompact(equipped) : '无对比装备';
        const effects = item.affixes.length ? item.affixes.map(a => `导电 ${a.tierId}：闪电伤害 +${a.rolledValue}%`).join('\n') : '无词缀';
        return `${this.itemCompact(item)}  ·  ${SLOT_NAMES[base.slot]}\n${effects}\n当前槽位：${current}`;
    }

    private equippedAffixValue(affixId: string): number {
        return Object.keys(this.profile.equippedItemIds).reduce((sum, slot) => {
            const item = this.itemById(this.profile.equippedItemIds[slot]);
            return sum + (item?.affixes.filter(a => a.affixId === affixId).reduce((v, a) => v + a.rolledValue, 0) || 0);
        }, 0);
    }

    private getBuildCost(def: TowerDef): number {
        return Math.round(def.cost * (this.profile.talents.indexOf('talent_build_cost') >= 0 ? .95 : 1));
    }

    private rollLoot(enemy: EnemyRuntime) {
        if (enemy.enemyId === 'enemy_rot_tide_cyst') return;
        this.dropSequence++;
        if (this.nextRandom('loot.quantity') >= .02) return;
        const affixCount = enemy.affix.split('|').filter(Boolean).length;
        const rarityBonus = enemy.rarity === 'Magic' ? .25 : enemy.rarity === 'Rare' ? .5 : 0;
        const quantity = Math.ceil(1 + rarityBonus + affixCount);
        const quality = 1 + rarityBonus + affixCount;
        let lastMagic = false;
        for (let i = 0; i < quantity; i++) {
            this.nextRandom('loot.base');
            const magic = this.nextRandom('loot.quality') < (30 * quality) / (70 + 30 * quality);
            let affixRoll = 0;
            if (magic) {
                this.nextRandom('loot.affix_select'); this.nextRandom('loot.affix_select');
                affixRoll = 8 + this.nextRandom('loot.affix_roll') * 4;
            }
            this.escrow.push(this.createCopperRod(magic, this.waveIndex + 1, affixRoll));
            lastMagic = magic;
        }
        this.feedback.play('LootDrop'); this.showLootFly(enemy.node.worldPosition, lastMagic);
        this.hint.string = `◆ 战利品飞入临时托管（${this.escrow.length}）`;
    }

    private nextRandom(stream: string): number {
        const index = this.rngIndices[stream] || 0; this.rngIndices[stream] = index + 1;
        const input = `${this.runId}|${stream}|${index}`;
        let hash = 0x811c9dc5;
        for (let i = 0; i < input.length; i++) { hash ^= input.charCodeAt(i); hash = Math.imul(hash, 0x01000193); }
        hash ^= hash >>> 16; hash = Math.imul(hash, 0x7feb352d); hash ^= hash >>> 15; hash = Math.imul(hash, 0x846ca68b); hash ^= hash >>> 16;
        return (hash >>> 0) / 0x100000000;
    }

    private showLootFly(worldPosition: Vec3, magic: boolean) {
        const node = this.makeNode('LootFly'); node.addComponent(UITransform).setContentSize(42, 42); this.overlay.addChild(node);
        node.setPosition(this.overlay.getComponent(UITransform)!.convertToNodeSpaceAR(worldPosition));
        const g = node.addComponent(Graphics); g.fillColor = magic ? new Color(85, 133, 255) : new Color(226, 190, 91); g.strokeColor = Color.WHITE; g.lineWidth = 2;
        g.moveTo(0, 18); g.lineTo(16, 0); g.lineTo(0, -18); g.lineTo(-16, 0); g.close(); g.fill(); g.stroke();
        tween(node).to(.5, { position: new Vec3(-350, 785), scale: new Vec3(.55, .55, 1) }, { easing: 'quadIn' }).call(() => node.destroy()).start();
    }

    private createCopperRod(magic: boolean, wave: number, roll: number): ItemInstance {
        return { itemInstanceId: `itm_${this.runId}_${wave}_${this.dropSequence}_${this.escrow.length}`, itemBaseId: 'item_copper_conductor_rod', rarity: magic ? 'Magic' : 'Normal', itemLevel: 1, identified: true,
            affixes: magic ? [{ affixId: 'affix_lightning_damage', tierId: 'T9', rolledValue: roll || 12 }] : [], acquiredRunId: this.runId, acquiredWaveIndex: wave };
    }

    private readCheckpoint(): RunCheckpoint | null {
        for (const key of ['poe_tower_run_checkpoint_v1', 'poe_tower_run_checkpoint_v1_backup']) try {
            const raw = sys.localStorage.getItem(key); if (!raw) continue;
            const checkpoint = JSON.parse(raw) as RunCheckpoint;
            if (this.validateCheckpoint(checkpoint)) return checkpoint;
        } catch { /* try backup */ }
        return null;
    }

    private captureCheckpoint(commands: RunCommandData[] = []): RunCheckpoint {
        return {
            mapMode: this.mapMode, runId: this.runId, waveIndex: this.waveIndex, gold: this.gold, wallHp: this.wallHp,
            escrow: this.escrow.map(i => JSON.parse(JSON.stringify(i))),
            towers: this.towers.map(t => ({ kind: t.kind, cell: t.node.parent?.name || '', level: t.level, invested: t.invested, supports: { ...t.supports } })),
            rngIndices: { ...this.rngIndices }, dropSequence: this.dropSequence, commands: commands.map(command => ({ ...command })),
        };
    }

    private persistCheckpoint(checkpoint: RunCheckpoint) {
        if (!this.validateCheckpoint(checkpoint)) throw new Error('E_RUN_CHECKPOINT_VALIDATION');
        const primary = 'poe_tower_run_checkpoint_v1', backup = `${primary}_backup`, temp = `${primary}_tmp`;
        sys.localStorage.setItem(temp, JSON.stringify(checkpoint));
        const readback = sys.localStorage.getItem(temp);
        if (!readback || !this.validateCheckpoint(JSON.parse(readback))) throw new Error('E_RUN_CHECKPOINT_READBACK');
        const previous = sys.localStorage.getItem(primary); if (previous) sys.localStorage.setItem(backup, previous);
        sys.localStorage.setItem(primary, readback); sys.localStorage.removeItem(temp);
    }

    private validateCheckpoint(checkpoint: RunCheckpoint): boolean {
        if (!checkpoint || (checkpoint.mapMode !== 'demo' && checkpoint.mapMode !== 'village') || !checkpoint.runId) return false;
        if (!Number.isInteger(checkpoint.waveIndex) || checkpoint.waveIndex < 0 || checkpoint.waveIndex >= (checkpoint.mapMode === 'village' ? VILLAGE_WAVES.length : WAVES.length)) return false;
        if (!Number.isFinite(checkpoint.gold) || !Number.isFinite(checkpoint.wallHp) || !Array.isArray(checkpoint.towers) || !Array.isArray(checkpoint.escrow)) return false;
        const cells = new Set<string>();
        for (const tower of checkpoint.towers) {
            if (!TOWERS.some(def => def.id === tower.kind) || !/^Cell_[0-5]_[0-3]$/.test(tower.cell) || cells.has(tower.cell)) return false;
            cells.add(tower.cell);
        }
        const commands = checkpoint.commands || [];
        return Array.isArray(commands) && commands.length <= 4096 && commands.every((command, index) => command.sequence === index && Number.isInteger(command.relativeTick) && command.relativeTick >= 0 && /^Cell_[0-5]_[0-3]$/.test(command.cell));
    }

    private clearCheckpoint() {
        ['poe_tower_run_checkpoint_v1', 'poe_tower_run_checkpoint_v1_backup', 'poe_tower_run_checkpoint_v1_tmp'].forEach(key => sys.localStorage.removeItem(key));
    }

    private showLoadout(mode: 'demo' | 'village' = 'demo') {
        this.mapMode = mode;
        this.screen = 'loadout';
        this.resetPage(); this.addBackdrop(true);
        this.panel(this.page, 0, 0, 950, 1720, new Color(5, 18, 20, 238));
        this.text(this.page, `${mode === 'village' ? '沉水村落 M2' : '沼泽防线'}·出战编队`, 0, 760, 46, new Color(145, 242, 210), 900);
        this.text(this.page, '已携带 6/6 · 全员解锁', 0, 700, 22, new Color(202, 181, 117), 880);
        TOWERS.forEach((tower, i) => {
            const col = i % 2, row = Math.floor(i / 2);
            const x = col ? 220 : -220, y = 500 - row * 285;
            this.towerCard(this.page, tower, x, y);
        });
        this.panel(this.page, 0, -390, 820, 180, new Color(15, 37, 37, 245));
        this.text(this.page, '波次情报', 0, -345, 27, new Color(224, 198, 125), 760);
        this.text(this.page, `${this.waves().length} 波 · 群潮 · 重甲 · 坚韧精英 · 腐潮母体`, 0, -415, 22, new Color(185, 205, 193), 760);
        this.button(this.page, '开始防守', 0, -610, 690, 100, () => this.startBattle(), new Color(54, 132, 101));
        this.button(this.page, '返回', 0, -740, 360, 62, () => this.showMenu(), new Color(65, 66, 58));
    }

    private startBattle(checkpoint?: RunCheckpoint) {
        if (checkpoint) this.mapMode = checkpoint.mapMode || 'demo';
        this.screen = 'battle';
        this.resetPage();
        this.towers = []; this.enemies = []; this.selectedTower = null;
        this.waveIndex = 0; this.spawned = 0; this.spawnClock = 0; this.waveActive = false;
        this.paused = false; this.speed = 1; this.kills = 0; this.battleTime = 0;
        this.simulationAccumulator = 0;
        this.escrow = checkpoint?.escrow || []; this.iceWalls = []; this.groundEffects = []; this.navigation = new NavigationFlowField(6, 8, { x: 3, y: 7 }); this.runId = checkpoint?.runId || `run_${Date.now().toString(36)}`;
        const roadCells: { x: number; y: number }[] = [];
        this.paths().forEach(route => route.forEach(position => { const [x, y] = this.battleCell(position); roadCells.push({ x, y }); }));
        this.navigation.configureRoads(roadCells);
        this.rngIndices = checkpoint?.rngIndices ? { ...checkpoint.rngIndices } : {};
        this.dropSequence = checkpoint?.dropSequence || 0;
        this.gold = 300 + (this.profile.talents.indexOf('talent_build_gold') >= 0 ? 25 : 0);
        this.wallMax = this.profile.talents.indexOf('talent_wall') >= 0 ? 115 : 100; this.wallHp = this.wallMax;
        this.equipmentLightningMultiplier = 1 + this.equippedAffixValue('affix_lightning_damage') / 100;
        if (checkpoint) { this.waveIndex = checkpoint.waveIndex; this.gold = checkpoint.gold; this.wallHp = checkpoint.wallHp; }
        this.waveStartCheckpoint = checkpoint ? JSON.parse(JSON.stringify(checkpoint)) as RunCheckpoint : null;
        this.replayCommands = checkpoint?.commands?.map(command => ({ ...command })) || [];
        this.nextReplayCommand = 0; this.restoringCheckpoint = !!checkpoint && this.replayCommands.length > 0;
        this.replayingCommands = this.restoringCheckpoint;
        this.addBackdrop(false);
        this.drawPath();
        this.createBuildGrid();
        if (checkpoint) checkpoint.towers.forEach(saved => {
            const cell = this.buildGrid.getChildByName(saved.cell); if (cell) this.buildTower(cell, saved);
        });
        this.overlay.setSiblingIndex(this.page.children.length - 1);
        this.createHud();
        this.refreshHud();
    }

    private createHud() {
        this.panel(this.overlay, 0, 855, 1020, 150, new Color(4, 15, 17, 240));
        this.hudGold = this.text(this.overlay, '', -345, 882, 27, new Color(239, 199, 99), 300);
        this.hudWall = this.text(this.overlay, '', 0, 882, 27, new Color(121, 227, 195), 340);
        this.hudWave = this.text(this.overlay, '', 348, 882, 27, Color.WHITE, 300);
        this.hint = this.text(this.overlay, '选择塔，然后点击下方建造格', 0, 775, 22, new Color(218, 204, 151), 960);
        this.button(this.overlay, 'Ⅱ', 435, 700, 74, 64, () => { this.speed = this.speed === 1 ? 2 : 1; this.hint.string = `游戏速度 ${this.speed}×`; }, new Color(39, 75, 76));
        this.button(this.overlay, 'Ⅰ', 345, 700, 74, 64, () => { this.paused = !this.paused; this.hint.string = this.paused ? '已暂停' : '继续战斗'; }, new Color(39, 75, 76));
        this.button(this.overlay, '退', -435, 700, 74, 64, () => this.showConfirmExit(), new Color(88, 49, 47));
        this.button(this.overlay, '情', -345, 700, 74, 64, () => this.showWavePreview(), new Color(67, 68, 48));

        this.panel(this.overlay, 0, -820, 1030, 270, new Color(4, 14, 16, 245));
        TOWERS.forEach((tower, i) => {
            const x = -425 + i * 170;
            const b = this.button(this.overlay, `${tower.name.slice(0, 2)}\n${this.getBuildCost(tower)}`, x, -785, 150, 105, () => {
                this.selectedKind = tower.id; this.selectedTower = null;
                this.hint.string = `已选 ${tower.name}：${tower.role}`;
            }, tower.color, 21);
            b.on(Node.EventType.TOUCH_START, () => b.setScale(new Vec3(.96, .96, 1)));
            b.on(Node.EventType.TOUCH_END, () => b.setScale(Vec3.ONE));
        });
        const waveNode = this.button(this.overlay, '开始第 1 波', 0, -915, 560, 70, () => this.beginWave(), new Color(72, 121, 83), 24);
        this.waveButton = waveNode.getChildByName('Label')!.getComponent(Label)!;
    }

    private createBuildGrid() {
        const grid = this.makeNode('BuildGrid'); this.buildGrid = grid; grid.addComponent(UITransform).setContentSize(960, 470); this.page.addChild(grid); grid.setPosition(0, -455);
        for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
            const cell = this.makeNode(`Cell_${col}_${row}`); cell.addComponent(UITransform).setContentSize(138, 88);
            grid.addChild(cell); cell.setPosition(-345 + col * 138, 165 - row * 94);
            const g = cell.addComponent(Graphics); g.fillColor = new Color(12, 31, 31, 135); g.strokeColor = new Color(87, 125, 112, 175); g.lineWidth = 2;
            g.roundRect(-64, -39, 128, 78, 8); g.fill(); g.stroke();
            cell.on(Node.EventType.TOUCH_END, () => this.buildTower(cell));
        }
    }

    private buildTower(cell: Node, saved?: RunCheckpoint['towers'][number], replaying = false, commandKind?: TowerKind) {
        if (cell.getChildByName('Tower')) { this.selectTowerAt(cell); return; }
        if (this.replayingCommands && !replaying) { this.hint.string = '正在恢复本波操作，请稍候'; return; }
        const def = this.def(saved?.kind || commandKind || this.selectedKind);
        const buildCost = this.getBuildCost(def);
        if (!saved) {
            if (this.gold < buildCost) { this.hint.string = `金币不足，还差 ${buildCost - this.gold}`; return; }
            this.gold -= buildCost;
        }
        const node = this.makeNode('Tower'); node.addComponent(UITransform).setContentSize(72, 72); cell.addChild(node);
        const g = node.addComponent(Graphics); this.drawTower(g, def);
        const runtime: TowerRuntime = { kind: def.id, node, level: saved?.level || 1, cooldown: this.towers.length * .037 % .3, invested: saved?.invested || buildCost, supports: saved?.supports || {}, iceWallReadyAt: 0, damageDone: 0, kills: 0, controlSeconds: 0 };
        this.towers.push(runtime); this.selectedTower = runtime;
        node.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; this.selectedTower = runtime; this.showTowerActions(runtime); });
        if (!saved) {
            tween(node).set({ scale: new Vec3(.2, .2, 1) }).to(.18, { scale: Vec3.ONE }, { easing: 'backOut' }).start();
            this.hint.string = `${def.name}已建造，点击塔可升级/出售`;
            if (!replaying) this.recordRunCommand('Build', cell.name, def.id);
        }
        this.refreshHud();
    }

    private upgradeTower(tower: TowerRuntime, replaying = false): boolean {
        if (this.replayingCommands && !replaying) { this.hint.string = '正在恢复本波操作，请稍候'; return false; }
        const cost = [80, 140, 220, 320][tower.level - 1] || 0;
        if (tower.level >= 5) { this.hint.string = '已达最高等级'; return false; }
        if (this.gold < cost) { this.hint.string = '金币不足'; return false; }
        const cell = tower.node.parent?.name || '';
        this.gold -= cost; tower.invested += cost; tower.level++; this.refreshHud();
        if (!replaying) { this.recordRunCommand('UpgradePower', cell); this.showTowerActions(tower); }
        return true;
    }

    private sellTower(tower: TowerRuntime, replaying = false): boolean {
        if (this.replayingCommands && !replaying) { this.hint.string = '正在恢复本波操作，请稍候'; return false; }
        const index = this.towers.indexOf(tower); if (index < 0) return false;
        const cell = tower.node.parent?.name || '';
        const rate = this.profile.talents.indexOf('talent_sell') >= 0 ? .75 : .7;
        this.gold += Math.round(tower.invested * rate); this.towers.splice(index, 1); tower.node.destroy();
        const panel = this.overlay.getChildByName('TowerActions'); if (panel) panel.destroy();
        if (this.selectedTower === tower) this.selectedTower = null;
        this.refreshHud(); if (!replaying) this.recordRunCommand('Sell', cell);
        return true;
    }

    private installOrUpgradeSupport(tower: TowerRuntime, supportId: string, replaying = false): boolean {
        if (this.replayingCommands && !replaying) { this.hint.string = '正在恢复本波操作，请稍候'; return false; }
        if (!WIRED_SUPPORT_EFFECTS[supportId]) return false;
        const level = tower.supports[supportId] || 0;
        const full = Object.keys(tower.supports).length >= 5 && level === 0;
        const cost = level === 0 ? [40, 60, 90, 130, 180][Object.keys(tower.supports).length] : [90, 160][level - 1] || 0;
        if (level >= 3 || full || !cost || this.gold < cost) return false;
        this.gold -= cost; tower.invested += cost; tower.supports[supportId] = level + 1; this.refreshHud();
        if (!replaying) {
            this.recordRunCommand(level === 0 ? 'InstallSupport' : 'UpgradeSupport', tower.node.parent?.name || '', undefined, supportId);
            this.showSupportPanel(tower);
        }
        return true;
    }

    private selectTowerAt(cell: Node) {
        const node = cell.getChildByName('Tower');
        const runtime = this.towers.find(t => t.node === node);
        if (runtime) { this.selectedTower = runtime; this.showTowerActions(runtime); }
    }

    private showTowerActions(tower: TowerRuntime) {
        const old = this.overlay.getChildByName('TowerActions'); if (old) old.destroy();
        const panel = this.makeNode('TowerActions'); panel.addComponent(UITransform).setContentSize(780, 150); this.overlay.addChild(panel); panel.setPosition(0, -610);
        const def = this.def(tower.kind);
        this.panel(panel, 0, 0, 900, 165, new Color(10, 30, 31, 248));
        this.text(panel, `${def.name} Lv.${tower.level}  伤害 ${(def.damage * (1 + .2 * (tower.level - 1))).toFixed(1)}`, -120, 38, 22, def.color, 500);
        const cost = [80, 140, 220, 320][tower.level - 1] || 0;
        this.button(panel, `升级 ${cost}`, 300, -38, 180, 55, () => this.upgradeTower(tower), new Color(52, 100, 77), 19);
        this.button(panel, `出售 +${Math.round(tower.invested * (this.profile.talents.indexOf('talent_sell') >= 0 ? .75 : .7))}`, -300, -38, 190, 55, () => this.sellTower(tower), new Color(98, 65, 49), 19);
        this.button(panel, `辅助 ${Object.keys(tower.supports).length}/5`, 0, -38, 200, 55, () => this.showSupportPanel(tower), new Color(64, 67, 112), 19);
        if (tower.kind === 'frost') this.button(panel, '部署冰墙', 0, 35, 190, 48, () => this.enterIceWallMode(tower), new Color(57, 119, 145), 18);
    }

    private showSupportPanel(tower: TowerRuntime) {
        const old = this.overlay.getChildByName('SupportPanel'); if (old) old.destroy();
        const panel = this.makeNode('SupportPanel'); panel.addComponent(UITransform).setContentSize(980, 1220); this.overlay.addChild(panel); panel.setPosition(0, 20);
        this.panel(panel, 0, 0, 980, 1220, new Color(6, 20, 24, 252));
        const def = this.def(tower.kind); this.text(panel, `${def.name}·辅助宝石`, 0, 535, 34, def.color, 900);
        this.text(panel, '候选固定 10 个 · 最多安装 5 个 · 最高 Lv.3', 0, 485, 20, new Color(190, 202, 194), 900);
        const sourceId = this.towerSourceId(tower.kind);
        let supports = Object.keys(this.supportConfigs).map(k => this.supportConfigs[k]).filter(s => s.towerId === sourceId);
        if (!supports.length) supports = this.fallbackSupports(sourceId);
        supports.slice(0, 10).forEach((support, i) => {
            const col = i % 2, row = Math.floor(i / 2); const x = col ? 235 : -235, y = 365 - row * 175;
            const level = tower.supports[support.id] || 0; const full = Object.keys(tower.supports).length >= 5 && level === 0;
            const cost = level === 0 ? [40, 60, 90, 130, 180][Object.keys(tower.supports).length] : [90, 160][level - 1] || 0;
            const wired = !!WIRED_SUPPORT_EFFECTS[support.id];
            this.button(panel, `${level ? '◆ ' : ''}${this.supportName(support.id)} ${level ? `Lv.${level}` : ''}\n${this.supportEffectText(support)}\n${!wired ? '当前版本不可安装' : level >= 3 ? '已满级' : full ? '槽位已满' : `${cost} 金币`}`, x, y, 430, 145, () => {
                if (!wired) { this.hint.string = '该辅助效果尚未接线，当前版本不可安装'; return; }
                this.installOrUpgradeSupport(tower, support.id);
            }, !wired ? new Color(40, 43, 46) : level ? new Color(54, 70, 130) : full ? new Color(40, 43, 46) : new Color(43, 61, 75), 18);
        });
        const copyCost = this.supportCopyCost(tower);
        this.button(panel, copyCost < 0 ? '复制到同类塔 · 槽位冲突' : `复制到同类塔${copyCost ? ` · ${copyCost} 金币` : ''}`, 0, -465, 460, 52, () => {
            if (this.replayingCommands) { this.hint.string = '正在恢复本波操作，请稍候'; return; }
            if (copyCost < 0) { this.hint.string = '复制失败：目标塔已有其他辅助且没有足够槽位，未做任何修改'; return; }
            if (!copyCost) { this.hint.string = '没有需要同步的同类塔'; return; }
            if (this.gold < copyCost) { this.hint.string = `复制失败：还差 ${copyCost - this.gold} 金币，未做任何修改`; return; }
            const targets = this.towers.filter(other => other !== tower && other.kind === tower.kind);
            const commandBatch: { kind: RunCommandKind; cell: string; supportId: string }[] = [];
            for (const target of targets) for (const id of Object.keys(tower.supports)) {
                let level = target.supports[id] || 0;
                while (level < tower.supports[id]) { commandBatch.push({ kind: level++ === 0 ? 'InstallSupport' : 'UpgradeSupport', cell: target.node.parent?.name || '', supportId: id }); }
            }
            for (const command of commandBatch) {
                const target = targets.find(candidate => candidate.node.parent?.name === command.cell);
                if (!target || !this.installOrUpgradeSupport(target, command.supportId, true)) { this.hint.string = '复制失败：配置发生变化，请重试'; return; }
            }
            commandBatch.forEach(command => this.recordRunCommand(command.kind, command.cell, undefined, command.supportId));
            this.refreshHud(); this.hint.string = `已原子复制辅助配置到 ${targets.length} 座同类塔`; this.showSupportPanel(tower);
        }, new Color(54, 81, 95), 18);
        this.button(panel, '返回塔信息', 0, -535, 400, 52, () => { panel.destroy(); this.showTowerActions(tower); }, new Color(68, 74, 65), 19);
    }

    private towerSourceId(kind: TowerKind): string {
        return { needle: 'tower_static_needle', arc: 'tower_arc', storm: 'tower_thunderstorm', aura: 'tower_voltage_aura', frost: 'tower_frost_barrier', totem: 'tower_taunt_totem' }[kind];
    }

    private supportName(id: string): string { return id.replace('support_', '').replace(/_/g, ' '); }
    private supportEffectText(support: { id: string; effectText: string }): string {
        const configuredKeys = Object.keys(this.supportEffects[support.id] || {});
        const wired = WIRED_SUPPORT_EFFECTS[support.id];
        if (!wired) return `${support.effectText}（意图，未接线）`;
        return configuredKeys.some(key => !wired.has(key)) ? `${support.effectText}（部分未接线）` : support.effectText;
    }
    private fallbackSupports(towerId: string): { id: string; towerId: string; effectText: string }[] {
        return Array.from({ length: 10 }, (_, i) => ({ id: `support_${towerId}_${i + 1}`, towerId, effectText: i % 2 ? '强化射程与持续' : '强化伤害与速度' }));
    }

    private supportValue(tower: TowerRuntime, key: string): number {
        let total = 0;
        Object.keys(tower.supports).forEach(id => {
            if (!WIRED_SUPPORT_EFFECTS[id]?.has(key)) return;
            const level = String(tower.supports[id]); const entry = this.supportEffects[id]?.[key]?.[level]; if (entry) total += Number(entry.value) || 0;
        });
        return total;
    }

    private supportEffect(tower: TowerRuntime, id: string, key: string): number {
        if (!WIRED_SUPPORT_EFFECTS[id]?.has(key)) return 0;
        const level = String(tower.supports[id] || 0);
        return Number(this.supportEffects[id]?.[key]?.[level]?.value) || 0;
    }

    private supportMultiplier(tower: TowerRuntime, key: string): number {
        let multiplier = 1;
        Object.keys(tower.supports).forEach(id => {
            if (!WIRED_SUPPORT_EFFECTS[id]?.has(key)) return;
            const level = String(tower.supports[id]); const entry = this.supportEffects[id]?.[key]?.[level];
            if (entry) multiplier *= 1 + (Number(entry.value) || 0);
        });
        return multiplier;
    }

    private supportCopyCost(source: TowerRuntime): number {
        let total = 0;
        for (const target of this.towers.filter(tower => tower !== source && tower.kind === source.kind)) {
            const union = new Set<string>(Object.keys(target.supports)); Object.keys(source.supports).forEach(id => union.add(id));
            if (union.size > 5) return -1;
            let slotCount = Object.keys(target.supports).length;
            for (const id of Object.keys(source.supports)) {
                let level = target.supports[id] || 0;
                while (level < source.supports[id]) {
                    total += level === 0 ? [40, 60, 90, 130, 180][slotCount++] || 180 : [90, 160][level - 1] || 160;
                    level++;
                }
            }
        }
        return total;
    }

    private addStunBuildup(enemy: EnemyRuntime, amount: number) {
        if (amount <= 0) return;
        enemy.stunBuildup += amount;
        if (enemy.stunBuildup < 100) return;
        enemy.stunBuildup = 0;
        const duration = enemy.boss ? .2 : enemy.rarity === 'Normal' ? 1 : .5;
        enemy.disabledUntil = Math.max(enemy.disabledUntil, this.battleTime + duration);
    }

    private enterIceWallMode(tower: TowerRuntime) {
        const actions = this.overlay.getChildByName('TowerActions'); if (actions) actions.destroy();
        const picker = this.makeNode('IceWallPicker'); picker.addComponent(UITransform).setContentSize(900, 1000); this.overlay.addChild(picker); picker.setPosition(0, 170);
        this.panel(picker, 0, 0, 900, 1000, new Color(5, 20, 25, 205));
        this.text(picker, '选择战区格部署冰墙（不可封死最后通路）', 0, 440, 23, new Color(144, 218, 246), 820);
        for (let row = 0; row < 8; row++) for (let col = 0; col < 6; col++) {
            const x = -310 + col * 124, y = 330 - row * 92; const cellId = `${col},${row}`;
            const b = this.button(picker, '', x, y, 108, 76, () => {
                if (!this.waveActive) { this.hint.string = '冰墙只能在波次战斗中部署'; return; }
                if (this.battleTime < tower.iceWallReadyAt) { this.hint.string = `冰墙冷却中 ${Math.ceil(tower.iceWallReadyAt - this.battleTime)}s`; return; }
                if (this.iceWalls.length >= 2) { this.hint.string = '全场最多同时 2 段冰墙'; return; }
                if (this.iceWalls.some(wall => wall.source === tower)) { this.hint.string = '每座冰障塔同时只能维持 1 段冰墙'; return; }
                if (this.enemies.some(enemy => enemy.alive && this.battleCell(enemy.node.position).join(',') === cellId)) { this.hint.string = '放置失败：该格已有敌人'; return; }
                const entrances = this.paths().map(route => { const [px, py] = this.battleCell(route[0]); return { x: px, y: py }; });
                if (!this.navigation.canPlaceWall({ x: col, y: row }, entrances)) { this.hint.string = '放置失败：不能占据入口/终点或封死最后通路'; return; }
                this.navigation.setWall({ x: col, y: row }, true); this.placeIceWall(tower, cellId); picker.destroy();
            }, new Color(40, 89, 105, 115), 12);
            b.name = `IceCell_${cellId}`;
        }
        this.button(picker, '取消', 0, -440, 260, 55, () => { picker.destroy(); this.showTowerActions(tower); }, new Color(80, 59, 54), 19);
    }

    private placeIceWall(tower: TowerRuntime, cell: string) {
        const [col, row] = cell.split(',').map(Number);
        const wall = this.makeNode('IceWall'); wall.addComponent(UITransform).setContentSize(110, 32); this.page.addChild(wall); wall.setPosition(gridRoute([[col, row]])[0]);
        const g = wall.addComponent(Graphics); g.fillColor = new Color(115, 215, 255, 220); g.strokeColor = new Color(223, 251, 255); g.lineWidth = 3; g.roundRect(-52, -14, 104, 28, 7); g.fill(); g.stroke();
        this.overlay.setSiblingIndex(this.page.children.length - 1);
        const duration = 6 * (this.profile.talents.indexOf('talent_icewall') >= 0 ? 1.15 : 1)
            * (1 + this.supportEffect(tower, 'support_wall_duration', 'duration'))
            * (1 + this.supportEffect(tower, 'support_wall_cooldown', 'duration_more'))
            * (1 + this.supportEffect(tower, 'support_short_wall', 'duration_more'));
        const cooldownRecovery = this.supportEffect(tower, 'support_wall_cooldown', 'cooldown_recovery') + this.supportEffect(tower, 'support_short_wall', 'cooldown_recovery');
        tower.iceWallReadyAt = this.battleTime + 18 / Math.max(.2, 1 + cooldownRecovery);
        this.iceWalls.push({ node: wall, endAt: this.battleTime + duration, cell, source: tower });
        this.hint.string = `冰墙已部署，持续 ${duration.toFixed(1)}s，导航场已重算`;
    }

    private updateIceWalls() {
        for (let i = this.iceWalls.length - 1; i >= 0; i--) if (this.iceWalls[i].endAt <= this.battleTime) {
            const parts = this.iceWalls[i].cell.split(',').map(Number); this.navigation.setWall({ x: parts[0], y: parts[1] }, false);
            this.iceWalls[i].node.destroy(); this.iceWalls.splice(i, 1);
        }
        for (let i = this.groundEffects.length - 1; i >= 0; i--) if (this.groundEffects[i].endAt <= this.battleTime) {
            this.groundEffects[i].node.destroy(); this.groundEffects.splice(i, 1);
        }
    }

    private createGroundEffect(kind: 'Shocked' | 'Chilled', worldPosition: Vec3, duration: number, radius = 100) {
        const localPosition = this.page.getComponent(UITransform)!.convertToNodeSpaceAR(worldPosition);
        const [col, row] = this.battleCell(localPosition);
        const shallow = this.isShallowWater(col, row);
        this.createGroundCell(kind, col, row, kind === 'Chilled' && shallow ? duration * 1.5 : duration, radius);
        if (kind === 'Shocked' && shallow) {
            let spread = 0;
            for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
                if (spread >= 2 || !this.isShallowWater(col + dx, row + dy)) continue;
                this.createGroundCell(kind, col + dx, row + dy, duration, radius); spread++;
            }
        }
    }

    private createGroundCell(kind: 'Shocked' | 'Chilled', col: number, row: number, duration: number, radius: number) {
        const cell = `${col},${row}`;
        const existing = this.groundEffects.find(effect => effect.kind === kind && effect.cell === cell);
        if (existing) { existing.endAt = Math.max(existing.endAt, this.battleTime + duration); return; }
        if (this.groundEffects.length >= 48) { const first = this.groundEffects.shift(); first?.node.destroy(); }
        const node = this.makeNode(`${kind}Ground`); node.addComponent(UITransform).setContentSize(radius * 2, radius * 2); this.page.addChild(node);
        const local = gridRoute([[col, row]])[0]; node.setPosition(local);
        const g = node.addComponent(Graphics); g.fillColor = kind === 'Shocked' ? new Color(184, 97, 255, 62) : new Color(77, 191, 255, 62); g.circle(0, 0, radius); g.fill();
        node.setSiblingIndex(Math.max(1, this.page.children.length - 3));
        this.groundEffects.push({ node, kind, endAt: this.battleTime + duration, position: local.clone(), radius, cell });
    }

    private battleCell(position: Vec3): [number, number] { return [Math.round((position.x + 375) / 150), Math.round((775 - position.y) / 110)]; }
    private isShallowWater(col: number, row: number): boolean { return (col === 0 && row === 1) || (col === 1 && (row === 1 || row === 2)); }
    private isOnGround(kind: 'Shocked' | 'Chilled', position: Vec3): boolean {
        const cell = this.battleCell(position).join(','); return this.groundEffects.some(effect => effect.kind === kind && effect.cell === cell);
    }

    private beginWave() {
        if (this.waveActive || this.waveIndex >= this.waves().length) return;
        this.waveActive = true; this.spawned = 0; this.spawnClock = -.25;
        this.activeGroups = this.waves()[this.waveIndex].groups.map(definition => ({ definition, spawned: 0, nextAt: this.battleTime + (definition.start || 0) }));
        this.waveStartTick = Math.round(this.battleTime * 30);
        if (this.restoringCheckpoint) {
            this.restoringCheckpoint = false; this.nextReplayCommand = 0;
            this.replayingCommands = this.replayCommands.length > 0;
        } else {
            this.replayCommands = []; this.nextReplayCommand = 0; this.replayingCommands = false;
            this.waveStartCheckpoint = this.captureCheckpoint([]); this.persistCheckpoint(this.waveStartCheckpoint);
        }
        this.waveButton.string = `第 ${this.waveIndex + 1} 波进行中`;
        this.hint.string = `${this.waves()[this.waveIndex].name} 正在接近`;
    }

    private recordRunCommand(kind: RunCommandKind, cell: string, towerKind?: TowerKind, supportId?: string) {
        if (!this.waveActive || this.replayingCommands || !this.waveStartCheckpoint) return;
        const commands = this.waveStartCheckpoint.commands || (this.waveStartCheckpoint.commands = []);
        commands.push({ sequence: commands.length, relativeTick: Math.max(0, Math.round(this.battleTime * 30) - this.waveStartTick), kind, cell, towerKind, supportId });
        this.persistCheckpoint(this.waveStartCheckpoint);
    }

    private replayDueCommands() {
        if (!this.waveActive || !this.replayingCommands) return;
        const relativeTick = Math.max(0, Math.round(this.battleTime * 30) - this.waveStartTick);
        while (this.nextReplayCommand < this.replayCommands.length && this.replayCommands[this.nextReplayCommand].relativeTick <= relativeTick) {
            const command = this.replayCommands[this.nextReplayCommand++];
            if (!this.replayRunCommand(command)) {
                this.hint.string = `恢复失败：命令 ${command.sequence}/${command.kind}`;
                this.endBattle(false); return;
            }
        }
        if (this.nextReplayCommand >= this.replayCommands.length) {
            this.replayingCommands = false;
            this.hint.string = '本波操作恢复完成';
        }
    }

    private replayRunCommand(command: RunCommandData): boolean {
        const cell = this.buildGrid.getChildByName(command.cell);
        if (!cell) return false;
        const tower = this.towers.find(candidate => candidate.node.parent?.name === command.cell);
        if (command.kind === 'Build') {
            if (!command.towerKind || cell.getChildByName('Tower')) return false;
            const before = this.towers.length; this.buildTower(cell, undefined, true, command.towerKind); return this.towers.length === before + 1;
        }
        if (!tower) return false;
        if (command.kind === 'UpgradePower') return this.upgradeTower(tower, true);
        if (command.kind === 'Sell') return this.sellTower(tower, true);
        if (!command.supportId) return false;
        return this.installOrUpgradeSupport(tower, command.supportId, true);
    }

    private updateWave(dt: number) {
        if (!this.waveActive || this.spawned >= this.waveEnemyCount(this.waves()[this.waveIndex])) return;
        for (const group of this.activeGroups) {
            let safety = 0;
            while (group.spawned < group.definition.count && this.battleTime >= group.nextAt && safety++ < 16) {
                this.spawnEnemy(group.definition); group.spawned++; group.nextAt += group.definition.gap || 1;
            }
        }
    }

    private spawnEnemy(group: WaveGroup) {
        this.spawned++;
        const routes = this.paths(); const route = group.path === 1 ? routes[1] : routes[0];
        const [navX, navY] = this.battleCell(route[0]); const navCell = { x: navX, y: navY };
        const node = this.makeNode('Enemy'); node.addComponent(UITransform).setContentSize(54, 62); this.page.addChild(node); node.setPosition(route[0]);
        this.overlay.setSiblingIndex(this.page.children.length - 1);
        const enemyId = group.enemyId;
        const boss = enemyId === 'enemy_rot_tide_matriarch' || enemyId === 'enemy_bog_colossus';
        const magic = group.rarity === 'Magic' || group.rarity === 'Rare';
        const g = node.addComponent(Graphics); this.drawEnemy(g, boss, magic);
        const bars = this.addEnemyBars(node);
        const configured = this.content.get<any>('enemy', enemyId) || this.enemyFallback(enemyId);
        const magicAffixes = ['elite_hardened', 'elite_swift', 'elite_waterveil', 'elite_sporebrood'];
        const affix = magic ? (group.affix || magicAffixes[this.spawned % magicAffixes.length]) : '';
        const hardened = affix.indexOf('elite_hardened') >= 0;
        const shieldMax = enemyId === 'enemy_waterveil_acolyte' ? 35 : affix.indexOf('elite_waterveil') >= 0 ? 25 : 0;
        const shieldRechargeDelay = enemyId === 'enemy_waterveil_acolyte' ? 2.5 : affix.indexOf('elite_waterveil') >= 0 ? 3 : 0;
        const shieldRechargeRate = enemyId === 'enemy_waterveil_acolyte' ? 14 : affix.indexOf('elite_waterveil') >= 0 ? 10 : 0;
        const swift = affix.indexOf('elite_swift') >= 0;
        const maxHp = Number(configured.maxHealth) * (1 + (hardened ? .6 : 0) - (swift ? .1 : 0));
        const moveSpeed = Number(configured.moveSpeedPixelsPerSecond) * (1 - (hardened ? .1 : 0) + (swift ? .25 : 0));
        this.enemies.push({ node, hp: maxHp, maxHp, speed: moveSpeed, reward: Number(configured.goldReward), damage: Number(configured.wallDamage), pathIndex: 1, shock: 0, boss, alive: true,
            stableId: `enemy_${this.waveIndex}_${this.spawned}`, rarity: boss ? 'Boss' : group.rarity || 'Normal', affix,
            shield: shieldMax, shieldMax, shieldRechargeDelay, shieldRechargeRate, lastHitAt: -999,
            enemyId, phase: 1, mechanicClock: enemyId === 'enemy_rot_tide_matriarch' ? 8 : enemyId === 'enemy_miasma_priest' ? .9 : 0, path: route, lastWallCell: '', disabledUntil: 0, freezeBuildup: 0, tauntedUntil: 0,
            cystsCreated: 0, wasTaunted: false, miasmaSpeedUntil: 0, miasmaResistUntil: 0, shockUntil: 0, stunBuildup: 0, chilledUntil: 0,
            targetPriority: Number(configured.targetPriority) || 0, lightningResistance: Number(configured.lightningResistance) || 0,
            navCell, nextNavCell: this.navigation.nextCell(navCell), breaching: false, breachWindup: 0, wallAttackClock: 0,
            continuousWallAttack: !!configured.attacksWallContinuously, wallAttackInterval: Number(configured.wallAttackIntervalSeconds) || 1, ...bars });
        const created = this.enemies[this.enemies.length - 1];
        if (boss || magic || enemyId === 'enemy_miasma_priest' || enemyId === 'enemy_waterveil_acolyte') this.feedback.play('SpecialMonster');
        node.on(Node.EventType.TOUCH_END, () => { this.hint.string = this.enemyDetails(created); });
    }

    private updateEnemies(dt: number) {
        for (const e of this.enemies) {
            if (!e.alive) continue;
            this.refreshEnemyBars(e);
            if (e.enemyId === 'enemy_rot_tide_cyst') {
                e.mechanicClock -= dt;
                if (e.mechanicClock <= 0) { for (let i = 0; i < 2; i++) this.spawnChild(e, 'enemy_bile_corpse', 50, 70, 5, 5); e.alive = false; e.node.destroy(); }
                continue;
            }
            if (e.shieldRechargeRate > 0 && this.battleTime - e.lastHitAt >= e.shieldRechargeDelay) e.shield = Math.min(e.shieldMax, e.shield + e.shieldRechargeRate * dt);
            if (e.enemyId === 'enemy_miasma_priest') {
                e.mechanicClock -= dt;
                if (e.mechanicClock <= 0) {
                    e.phase = e.phase === 1 ? 2 : 1; e.mechanicClock = 5.9;
                    for (const target of this.enemies.filter(target => target.alive && target !== e && Vec3.distance(target.node.position, e.node.position) <= 240)) {
                        if (e.phase === 2) target.miasmaSpeedUntil = this.battleTime + 4; else target.miasmaResistUntil = this.battleTime + 4;
                    }
                    this.hint.string = e.phase === 2 ? '瘴气祭师施放疾行瘴气' : '瘴气祭师施放抗雷瘴气';
                }
            }
            if (e.enemyId === 'enemy_rot_tide_matriarch') {
                if (e.phase === 1 && e.hp <= e.maxHp * .7) { e.phase = 2; e.mechanicClock = 0; this.hint.string = '首领进入第二阶段：孢囊增殖'; }
                if (e.phase === 2 && e.hp <= e.maxHp * .35) { e.phase = 3; e.speed *= 1.35; e.mechanicClock = 0; this.hint.string = '首领进入第三阶段：水幕冲刺'; }
                const taunted = e.tauntedUntil > this.battleTime;
                if (taunted && !e.wasTaunted) e.mechanicClock += 2.5;
                e.wasTaunted = taunted; e.mechanicClock -= dt;
                if (e.mechanicClock <= 0 && e.phase === 1) {
                    const live = this.enemies.filter(child => child.alive && child.enemyId === 'enemy_swamp_larva').length;
                    for (let i = 0; i < Math.min(6, 24 - live); i++) this.spawnChild(e, 'enemy_swamp_larva', 15, 85, 2, 2);
                    e.mechanicClock += 8;
                } else if (e.mechanicClock <= 0 && e.phase === 2) {
                    const liveCysts = this.enemies.filter(child => child.alive && child.enemyId === 'enemy_rot_tide_cyst').length;
                    const count = Math.min(2, 4 - liveCysts, 6 - e.cystsCreated);
                    for (let i = 0; i < count; i++) this.spawnChild(e, 'enemy_rot_tide_cyst', 120, 0, 0, 0);
                    e.cystsCreated += count; e.mechanicClock += 8;
                } else if (e.mechanicClock <= 0 && e.phase === 3) {
                    e.shieldMax = 100; e.shield = 100; e.mechanicClock += 7;
                }
            }
            if (e.breaching) {
                if (e.continuousWallAttack) {
                    e.wallAttackClock -= dt;
                    while (e.wallAttackClock <= .000001 && this.wallHp > 0) { this.applyWallDamage(e.damage); e.wallAttackClock += e.wallAttackInterval; }
                } else {
                    e.breachWindup -= dt; if (e.breachWindup <= 0) this.resolveBreach(e);
                }
                continue;
            }
            if (e.disabledUntil > this.battleTime) { e.freezeBuildup = Math.max(0, e.freezeBuildup - dt * 8); continue; }
            if (e.nextNavCell && this.navigation.isBlocked(e.nextNavCell)) e.nextNavCell = this.navigation.nextCell(e.navCell);
            if (!e.nextNavCell) { e.breaching = true; e.breachWindup = .45; e.wallAttackClock = e.wallAttackInterval; continue; }
            const target = gridRoute([[e.nextNavCell.x, e.nextNavCell.y]])[0]; const p = e.node.position;
            const dx = target.x - p.x, dy = target.y - p.y; const dist = Math.hypot(dx, dy);
            const onChilledGround = this.isOnGround('Chilled', e.node.position);
            const slow = !e.boss && e.tauntedUntil > this.battleTime ? 0 : onChilledGround || e.chilledUntil > this.battleTime ? .8 : 1;
            const priestBoost = e.miasmaSpeedUntil > this.battleTime ? 1.15 : 1;
            const move = e.speed * priestBoost * dt * slow;
            if (dist <= move) {
                e.node.setPosition(target); e.pathIndex++; e.navCell = e.nextNavCell; e.nextNavCell = this.navigation.nextCell(e.navCell);
                if (!e.nextNavCell && e.navCell.x === 3 && e.navCell.y === 7) { e.breaching = true; e.breachWindup = .45; e.wallAttackClock = e.wallAttackInterval; }
            } else e.node.setPosition(p.x + dx / dist * move, p.y + dy / dist * move);
        }
    }

    private findTarget(origin: Vec3, range: number, excluded: Set<string> = new Set()): EnemyRuntime | undefined {
        return this.enemies.filter(enemy => enemy.alive && !excluded.has(enemy.stableId) && Vec3.distance(origin, enemy.node.worldPosition) <= range)
            .sort((a, b) => b.targetPriority - a.targetPriority || Vec3.distance(origin, a.node.worldPosition) - Vec3.distance(origin, b.node.worldPosition) || a.stableId.localeCompare(b.stableId))[0];
    }

    private updateTowers(dt: number) {
        for (const tower of this.towers) {
            tower.cooldown -= dt;
            if (tower.cooldown > 0 || tower.kind === 'aura') continue;
            const def = this.def(tower.kind);
            const auraBoost = this.towers.some(a => a !== tower && a.kind === 'aura' && Vec3.distance(a.node.worldPosition, tower.node.worldPosition) < this.def('aura').range);
            const range = def.range * Math.max(.35, 1 + this.supportValue(tower, 'range'));
            const primary = this.findTarget(tower.node.worldPosition, range);
            if (!primary) continue;
            tower.cooldown += def.interval / Math.max(.2, (1 + this.supportValue(tower, 'speed')) * (auraBoost ? 1.08 : 1));

            if (tower.kind === 'totem') {
                const duration = 2 * (1 + this.supportEffect(tower, 'support_taunt_duration', 'duration')) * (1 + this.supportEffect(tower, 'support_taunt_pulse', 'duration_more'));
                const targets = this.enemies.filter(enemy => enemy.alive && Vec3.distance(primary.node.worldPosition, enemy.node.worldPosition) <= range);
                for (const enemy of targets) {
                    const appliedDuration = enemy.enemyId === 'enemy_bog_colossus' ? .5 : duration;
                    enemy.tauntedUntil = Math.max(enemy.tauntedUntil, this.battleTime + appliedDuration);
                    this.addStunBuildup(enemy, this.supportValue(tower, 'stun'));
                    tower.controlSeconds += appliedDuration;
                }
                continue;
            }

            let baseDamage = def.damage * (1 + .2 * (tower.level - 1)) * this.supportMultiplier(tower, 'damage_more');
            if (['needle', 'arc', 'storm'].indexOf(tower.kind) >= 0) {
                if (this.profile.talents.indexOf('talent_lightning_damage') >= 0) baseDamage *= 1.12;
                baseDamage *= this.equipmentLightningMultiplier;
            }

            if (tower.kind === 'arc') {
                const chain: EnemyRuntime[] = [primary]; const excluded = new Set<string>([primary.stableId]);
                const maxTargets = 4 + Math.max(0, Math.round(this.supportEffect(tower, 'support_extra_chain', 'chain'))) + (primary.shockUntil > this.battleTime ? 1 : 0);
                while (chain.length < maxTargets) {
                    const next = this.findTarget(chain[chain.length - 1].node.worldPosition, def.range * .65, excluded);
                    if (!next) break; chain.push(next); excluded.add(next.stableId);
                }
                chain.forEach((enemy, index) => {
                    let damage = baseDamage * Math.pow(.9, index);
                    this.addStunBuildup(enemy, this.supportValue(tower, 'stun'));
                    this.hitEnemy(enemy, damage, def.color, index ? chain[index - 1].node.worldPosition : tower.node.worldPosition, tower);
                });
                continue;
            }

            if (tower.kind === 'storm') {
                const consumedShock = primary.shockUntil > this.battleTime;
                if (consumedShock) { primary.shockUntil = 0; primary.shock = 0; }
                const damage = baseDamage * (consumedShock ? 1.5 : 1);
                const radius = 125 * Math.max(.1, 1 + this.supportEffect(tower, 'support_wide_storm', 'radius') + this.supportEffect(tower, 'support_concentrated_storm', 'radius'));
                const targets = this.enemies.filter(enemy => enemy.alive && Vec3.distance(primary.node.worldPosition, enemy.node.worldPosition) <= radius);
                for (const enemy of targets) { this.addStunBuildup(enemy, this.supportValue(tower, 'stun')); this.hitEnemy(enemy, damage, def.color, tower.node.worldPosition, tower); }
                const duration = 4 * (1 + this.supportEffect(tower, 'support_lingering_field', 'duration'));
                this.createGroundEffect('Shocked', primary.node.worldPosition, duration, radius);
                continue;
            }

            if (tower.kind === 'frost') {
                const radius = 90;
                const targets = this.enemies.filter(enemy => enemy.alive && Vec3.distance(primary.node.worldPosition, enemy.node.worldPosition) <= radius);
                for (const enemy of targets) {
                    enemy.chilledUntil = Math.max(enemy.chilledUntil, this.battleTime + 5);
                }
                this.createGroundEffect('Chilled', primary.node.worldPosition,
                    5 * (1 + this.supportEffect(tower, 'support_chilled_ground_duration', 'duration')) * (1 + this.supportEffect(tower, 'support_chilled_ground_slow', 'duration_more')), radius);
                continue;
            }

            let buildup = 12 * (this.profile.talents.indexOf('talent_shock_buildup') >= 0 ? 1.15 : 1) * (auraBoost ? 1.15 : 1) * Math.max(.2, 1 + this.supportEffect(tower, 'support_deep_conduction', 'shock'));
            if (this.isOnGround('Shocked', primary.node.position)) buildup *= 1.25;
            primary.shock += buildup;
            if (primary.shock >= 100) { primary.shock = 0; primary.shockUntil = this.battleTime + 6; }
            this.addStunBuildup(primary, this.supportValue(tower, 'stun'));
            this.hitEnemy(primary, baseDamage, def.color, tower.node.worldPosition, tower);
        }
    }

    private hitEnemy(enemy: EnemyRuntime, damage: number, color: Color, from: Vec3, source: TowerRuntime) {
        const lightning = ['needle', 'arc', 'storm'].indexOf(source.kind) >= 0;
        if (lightning && enemy.shockUntil <= this.battleTime && this.isOnGround('Shocked', enemy.node.position)) damage *= 1.1;
        if (lightning && enemy.shockUntil > this.battleTime) damage *= 1.2;
        if (lightning) damage *= 1 - Math.min(.75, enemy.lightningResistance + (enemy.miasmaResistUntil > this.battleTime ? .15 : 0));
        enemy.lastHitAt = this.battleTime;
        if (enemy.shield > 0) { const absorbed = Math.min(enemy.shield, damage); enemy.shield -= absorbed; damage -= absorbed; }
        if (enemy.enemyId === 'enemy_mud_armored_guard') damage = Math.max(damage * .2, damage - 1.5);
        const applied = Math.min(Math.max(0, damage), Math.max(0, enemy.hp)); enemy.hp -= damage; source.damageDone += applied;
        const fx = this.makeNode('Bolt'); fx.addComponent(UITransform).setContentSize(1080, 1920); this.overlay.addChild(fx);
        const g = fx.addComponent(Graphics); const a = this.overlay.getComponent(UITransform)!.convertToNodeSpaceAR(from); const b = this.overlay.getComponent(UITransform)!.convertToNodeSpaceAR(enemy.node.worldPosition);
        g.strokeColor = color; g.lineWidth = 4; g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
        this.scheduleOnce(() => fx.destroy(), .07);
        if (enemy.hp <= 0) { source.kills++; this.kill(enemy); }
    }

    private kill(enemy: EnemyRuntime) {
        if (!enemy.alive) return; enemy.alive = false; this.gold += enemy.reward; this.kills++;
        this.rollLoot(enemy);
        if (enemy.enemyId === 'enemy_bile_corpse') for (let i = 0; i < 2; i++) this.spawnChild(enemy, 'enemy_bile_spore', 10, 95, 0, 2);
        if (enemy.affix.indexOf('elite_sporebrood') >= 0) this.spawnChild(enemy, 'enemy_sporebrood_child', 8, 90, 0, 1);
        const n = enemy.node; tween(n).to(.12, { scale: new Vec3(1.45, 1.45, 1) }).to(.14, { scale: new Vec3(.05, .05, 1) }).call(() => n.destroy()).start();
        this.refreshHud();
    }

    private spawnChild(parent: EnemyRuntime, enemyId: string, hp: number, speed: number, reward: number, damage: number) {
        const node = this.makeNode('EnemyChild'); node.addComponent(UITransform).setContentSize(42, 48); this.page.addChild(node);
        node.setPosition(parent.node.position.x + (this.enemies.length % 3 - 1) * 22, parent.node.position.y + (this.enemies.length % 2 ? 16 : -16));
        this.drawEnemy(node.addComponent(Graphics), false, false); const bars = this.addEnemyBars(node); this.overlay.setSiblingIndex(this.page.children.length - 1);
        this.enemies.push({ node, hp, maxHp: hp, speed, reward, damage, pathIndex: Math.min(parent.pathIndex, parent.path.length - 1), shock: 0, boss: false, alive: true,
            stableId: `${parent.stableId}_child_${this.enemies.length}`, rarity: 'Normal', affix: '', shield: 0, shieldMax: 0, shieldRechargeDelay: 0, shieldRechargeRate: 0, lastHitAt: -999, enemyId, phase: 1, mechanicClock: enemyId === 'enemy_rot_tide_cyst' ? 8 : 0, path: parent.path, lastWallCell: '', disabledUntil: 0, freezeBuildup: 0, tauntedUntil: 0,
            cystsCreated: 0, wasTaunted: false, miasmaSpeedUntil: 0, miasmaResistUntil: 0, shockUntil: 0, stunBuildup: 0, chilledUntil: 0,
            targetPriority: 0, lightningResistance: 0, navCell: { ...parent.navCell }, nextNavCell: parent.nextNavCell ? { ...parent.nextNavCell } : null,
            breaching: false, breachWindup: 0, wallAttackClock: 0, continuousWallAttack: false, wallAttackInterval: 1, ...bars });
    }

    private resolveBreach(enemy: EnemyRuntime) {
        enemy.alive = false; enemy.node.destroy(); this.applyWallDamage(enemy.damage);
    }

    private applyWallDamage(damage: number) {
        this.wallHp = Math.max(0, this.wallHp - damage); this.refreshHud();
        this.hint.string = `敌人攻城！城墙 -${damage}`;
        if (this.wallHp <= 0) this.endBattle(false);
    }

    private finishWave() {
        this.waveActive = false; this.replayingCommands = false; this.replayCommands = []; this.nextReplayCommand = 0;
        const cleared = this.waveIndex + 1; this.waveIndex++;
        if (this.mapMode === 'demo' && cleared === 3 && this.escrow.length === 0) {
            this.dropSequence++;
            this.escrow.push(this.createCopperRod(true, 3, 12));
            this.feedback.play('LootDrop');
            this.hint.string = '第 3 波保底：魔法 T9 铜制导能杖（闪电 +12%）';
        }
        if (this.waveIndex >= this.waves().length) { this.endBattle(true); return; }
        this.waveStartCheckpoint = this.captureCheckpoint([]); this.persistCheckpoint(this.waveStartCheckpoint);
        this.feedback.play('WaveLootSummary');
        this.waveButton.string = `开始第 ${this.waveIndex + 1} 波`;
        if (cleared !== 3 || this.escrow.length !== 1) this.hint.string = `第 ${cleared} 波完成 · 临时托管 ${this.escrow.length} 件`;
        this.refreshHud();
    }

    private endBattle(victory: boolean) {
        if (this.screen !== 'battle') return;
        if (victory) {
            this.profile.victories++;
            this.commitVictoryReward();
        }
        this.screen = 'result'; this.paused = true;
        this.clearCheckpoint();
        const shade = this.makeNode('ResultShade'); shade.addComponent(UITransform).setContentSize(1080, 1920); this.overlay.addChild(shade);
        this.panel(shade, 0, 0, 1080, 1920, new Color(2, 8, 10, 225));
        this.panel(shade, 0, 0, 860, 900, new Color(9, 30, 31, 252));
        this.text(shade, victory ? '防 线 守 住' : '城 墙 失 陷', 0, 285, 55, victory ? new Color(134, 245, 192) : new Color(239, 117, 94), 800);
        const seconds = String(Math.floor(this.battleTime % 60));
        const report = this.towers.slice().sort((a, b) => b.damageDone - a.damageDone).slice(0, 3).map(t => `${this.def(t.kind).name} ${Math.round(t.damageDone)} 伤害/${t.kills} 击杀`).join(' · ') || '未建造塔';
        this.text(shade, `完成波次 ${victory ? this.waves().length : this.waveIndex + 1}/${this.waves().length}\n消灭敌人 ${this.kills}\n用时 ${Math.floor(this.battleTime / 60)}:${seconds.length < 2 ? '0' + seconds : seconds}\n剩余城墙 ${Math.ceil(this.wallHp)}/${this.wallMax}\n塔阵报告：${report}`, 0, 90, 25, new Color(210, 220, 210), 760, 43);
        this.text(shade, victory ? `${this.escrow.length} 件战利品已安全提交至据点` : `本局 ${this.escrow.length} 件临时战利品已丢失`, 0, -125, 23, new Color(218, 190, 116), 750);
        this.button(shade, '再来一局', 0, -250, 560, 78, () => this.startBattle(), new Color(49, 118, 91));
        this.button(shade, '返回据点', 0, -355, 560, 68, () => this.showMenu(), new Color(68, 69, 60));
    }

    private showConfirmExit() {
        if (this.screen !== 'battle') return; this.paused = true;
        const box = this.makeNode('ExitConfirm'); box.addComponent(UITransform).setContentSize(800, 400); this.overlay.addChild(box);
        this.panel(box, 0, 0, 800, 400, new Color(10, 29, 30, 255));
        this.text(box, '退出会丢失本局临时战利品', 0, 95, 27, new Color(239, 190, 123), 700);
        this.button(box, '继续战斗', -175, -80, 300, 70, () => { box.destroy(); this.paused = false; }, new Color(53, 108, 82));
        this.button(box, '确认退出', 175, -80, 300, 70, () => { this.clearCheckpoint(); this.showMenu(); }, new Color(108, 55, 49));
    }

    private showWavePreview() {
        if (this.overlay.getChildByName('WavePreview')) return; this.paused = true;
        const panel = this.makeNode('WavePreview'); panel.addComponent(UITransform).setContentSize(900, 1260); this.overlay.addChild(panel);
        this.panel(panel, 0, 0, 900, 1260, new Color(6, 20, 23, 253));
        this.text(panel, `${this.mapMode === 'village' ? '沉水村落 M2' : '沼泽防线'}·波次情报`, 0, 560, 34, new Color(226, 199, 122), 820);
        this.waves().forEach((wave, i) => {
            const enemies = Array.from(new Set(wave.groups.map(group => group.enemyId.replace('enemy_', '')))).join('/');
            const special = wave.groups.some(group => group.rarity === 'Rare') ? '◆ 固定 Rare' : wave.groups.some(group => group.rarity === 'Magic') ? '◆ Magic' : wave.groups.some(group => group.enemyId.indexOf('matriarch') >= 0 || group.enemyId.indexOf('colossus') >= 0) ? '◆ 首领' : '';
            this.text(panel, `${i + 1}. ${wave.name}  ×${this.waveEnemyCount(wave)}  ${enemies} ${special}`, 0, 460 - i * 105, 20, i < this.waveIndex ? new Color(102, 133, 123) : i === this.waveIndex ? new Color(130, 235, 194) : new Color(196, 207, 199), 800);
        });
        this.button(panel, '关闭情报', 0, -555, 350, 60, () => { panel.destroy(); this.paused = false; }, new Color(66, 78, 65), 20);
    }

    private refreshHud() {
        if (!this.hudGold) return;
        this.hudGold.string = `◆ ${this.gold}`;
        this.hudWall.string = `城墙 ${Math.ceil(this.wallHp)}/${this.wallMax}`;
        this.hudWave.string = `波次 ${Math.min(this.waveIndex + 1, this.waves().length)}/${this.waves().length}`;
    }

    private addBackdrop(dim: boolean) {
        const bg = this.makeNode('SwampBackdrop'); bg.addComponent(UITransform).setContentSize(1080, 1920); this.page.insertChild(bg, 0);
        resources.load('art/swamp_battlefield_v1/texture', Texture2D, (err, texture) => {
            if (!err && texture && bg.isValid) {
                const frame = new SpriteFrame(); frame.texture = texture;
                const sprite = bg.addComponent(Sprite); sprite.spriteFrame = frame; sprite.sizeMode = Sprite.SizeMode.CUSTOM;
            }
        });
        if (dim) this.panel(this.page, 0, 0, 1080, 1920, new Color(2, 9, 10, 145));
    }

    private drawPath() {
        const n = this.makeNode('PathGuide'); n.addComponent(UITransform).setContentSize(1080, 1920); this.page.addChild(n);
        const g = n.addComponent(Graphics);
        this.paths().forEach(path => {
            g.strokeColor = new Color(84, 221, 205, 70); g.lineWidth = 18; g.moveTo(path[0].x, path[0].y); path.slice(1).forEach(p => g.lineTo(p.x, p.y)); g.stroke();
            g.strokeColor = new Color(188, 255, 234, 95); g.lineWidth = 3; g.moveTo(path[0].x, path[0].y); path.slice(1).forEach(p => g.lineTo(p.x, p.y)); g.stroke();
        });
    }

    private drawTower(g: Graphics, def: TowerDef) {
        g.fillColor = new Color(8, 21, 25, 245); g.strokeColor = def.color; g.lineWidth = 5; g.circle(0, 0, 33); g.fill(); g.stroke();
        g.fillColor = def.color; g.roundRect(-15, -20, 30, 40, 6); g.fill();
        g.strokeColor = new Color(235, 255, 247); g.lineWidth = 3;
        if (def.id === 'needle') { g.moveTo(0, 26); g.lineTo(0, -25); g.stroke(); }
        else if (def.id === 'arc') { g.moveTo(-14, 15); g.lineTo(7, 5); g.lineTo(-4, -4); g.lineTo(14, -17); g.stroke(); }
        else { g.circle(0, 0, 9); g.stroke(); }
    }

    private drawEnemy(g: Graphics, boss: boolean, elite: boolean) {
        const c = boss ? new Color(173, 61, 75) : elite ? new Color(62, 122, 226) : new Color(135, 173, 100);
        g.fillColor = new Color(7, 16, 15, 245); g.strokeColor = c; g.lineWidth = boss ? 7 : 4; g.circle(0, 0, boss ? 28 : 21); g.fill(); g.stroke();
        g.fillColor = c; g.circle(-7, 5, 4); g.circle(7, 5, 4); g.fill(); g.strokeColor = c; g.moveTo(-8, -8); g.lineTo(8, -8); g.stroke();
    }

    private addEnemyBars(node: Node): { hpBar: Graphics; shieldBar: Graphics; statusBar: Graphics } {
        const make = (name: string, y: number) => { const n = this.makeNode(name); n.addComponent(UITransform).setContentSize(62, 8); node.addChild(n); n.setPosition(0, y); return n.addComponent(Graphics); };
        return { hpBar: make('HpBar', 35), shieldBar: make('ShieldBar', 44), statusBar: make('ShockBar', -35) };
    }

    private refreshEnemyBars(e: EnemyRuntime) {
        const draw = (g: Graphics, ratio: number, color: Color) => { g.clear(); if (ratio <= 0) return; g.fillColor = new Color(2, 8, 9, 220); g.rect(-28, -3, 56, 6); g.fill(); g.fillColor = color; g.rect(-28, -3, 56 * Math.min(1, ratio), 6); g.fill(); };
        draw(e.hpBar, e.hp / e.maxHp, new Color(96, 218, 126));
        draw(e.shieldBar, e.shieldMax ? e.shield / e.shieldMax : 0, new Color(94, 179, 255));
        draw(e.statusBar, e.shockUntil > this.battleTime ? 1 : e.shock / 100, new Color(199, 103, 255));
    }

    private enemyDetails(e: EnemyRuntime): string {
        const names: Record<string, string> = { enemy_shambler: '行尸', enemy_rusher: '奔袭兽', enemy_swarm: '虫群', enemy_shellback: '甲壳兽', enemy_bog_colossus: '沼泽巨像', enemy_swamp_larva: '沼泽幼体', enemy_mud_armored_guard: '泥甲卫士', enemy_bile_corpse: '腐囊行尸', enemy_waterveil_acolyte: '水幕巫徒', enemy_miasma_priest: '瘴气祭师', enemy_rot_tide_matriarch: '腐潮母体', enemy_rot_tide_cyst: '腐潮孢囊' };
        const affixNames: Record<string, string> = { elite_hardened: '◆ 坚韧', elite_swift: '◆ 迅捷', elite_waterveil: '◆ 水幕', elite_sporebrood: '◆ 孢群' };
        const affix = e.affix.split('|').map(id => affixNames[id] || id).join(' ');
        return `${e.rarity === 'Magic' ? '魔法 ' : e.rarity === 'Rare' ? '稀有 ' : e.boss ? '首领 ' : ''}${names[e.enemyId] || e.enemyId} ${affix} · HP ${Math.ceil(e.hp)}/${Math.ceil(e.maxHp)}${e.shieldMax ? ` · 水幕 ${Math.ceil(e.shield)}` : ''}${e.shockUntil > this.battleTime ? ' · 已感电' : ''}`;
    }

    private towerCard(parent: Node, tower: TowerDef, x: number, y: number) {
        this.panel(parent, x, y, 390, 235, new Color(13, 36, 37, 248));
        const icon = this.makeNode('Icon'); icon.addComponent(UITransform).setContentSize(78, 78); parent.addChild(icon); icon.setPosition(x, y + 48); this.drawTower(icon.addComponent(Graphics), tower);
        this.text(parent, tower.name, x, y - 22, 27, tower.color, 350);
        this.text(parent, `${tower.role}  ·  ${tower.cost} 金`, x, y - 68, 19, new Color(189, 204, 195), 350);
    }

    private def(kind: TowerKind) { return TOWERS.find(t => t.id === kind)!; }
    private waves(): WaveConfig[] { return this.mapMode === 'village' ? VILLAGE_WAVES : WAVES; }
    private paths(): Vec3[][] { return this.mapMode === 'village' ? [VILLAGE_PATH, VILLAGE_PATH_ALT] : [DEMO_PATH, DEMO_PATH_ALT]; }
    private waveEnemyCount(wave: WaveConfig): number { return wave.groups.reduce((sum, group) => sum + group.count, 0); }
    private enemyFallback(id: string): any {
        const fallback: Record<string, any> = {
            enemy_shambler: [50, 70, 5, 5, 0, false], enemy_rusher: [30, 125, 4, 4, 0, false], enemy_swarm: [15, 85, 2, 2, 0, false],
            enemy_shellback: [120, 75, 8, 10, .2, false], enemy_bog_colossus: [3000, 45, 12, 0, 0, true], enemy_swamp_larva: [15, 85, 2, 2, 0, false],
            enemy_bile_corpse: [50, 70, 5, 5, 0, false], enemy_bile_spore: [10, 95, 2, 0, 0, false], enemy_sporebrood_child: [8, 90, 1, 0, 0, false],
            enemy_mud_armored_guard: [80, 68, 8, 10, 0, false], enemy_waterveil_acolyte: [55, 68, 6, 7, 0, false], enemy_miasma_priest: [70, 62, 6, 10, 0, false],
            enemy_rot_tide_matriarch: [2400, 38, 14, 120, 0, true], enemy_rot_tide_cyst: [120, 1, 0, 0, 0, false],
        };
        const row = fallback[id] || [30, 70, 4, 4, 0, false];
        return { maxHealth: row[0], moveSpeedPixelsPerSecond: row[1], wallDamage: row[2], goldReward: row[3], lightningResistance: row[4], attacksWallContinuously: row[5], wallAttackIntervalSeconds: 1, targetPriority: 0 };
    }

    private text(parent: Node, value: string, x: number, y: number, size: number, color: Color, width = 500, lineHeight = 0): Label {
        const n = this.makeNode('Label'); const tr = n.addComponent(UITransform); const actualLineHeight = lineHeight || Math.ceil(size * 1.25); tr.setContentSize(width, Math.max(size * 1.5, actualLineHeight * (value.split('\n').length + .25))); parent.addChild(n); n.setPosition(x, y);
        const l = n.addComponent(Label); l.string = value; l.fontSize = size; l.lineHeight = lineHeight || Math.ceil(size * 1.25); l.color = color; l.horizontalAlign = Label.HorizontalAlign.CENTER; l.verticalAlign = Label.VerticalAlign.CENTER; l.overflow = Label.Overflow.SHRINK;
        return l;
    }

    private button(parent: Node, label: string, x: number, y: number, w: number, h: number, callback: () => void, color: Color, fontSize = 27): Node {
        const n = this.makeNode('Button'); n.addComponent(UITransform).setContentSize(w, h); parent.addChild(n); n.setPosition(x, y);
        const g = n.addComponent(Graphics); g.fillColor = new Color(color.r, color.g, color.b, 235); g.strokeColor = new Color(Math.min(255, color.r + 65), Math.min(255, color.g + 65), Math.min(255, color.b + 65), 255); g.lineWidth = 3; g.roundRect(-w / 2, -h / 2, w, h, 11); g.fill(); g.stroke();
        const l = this.text(n, label, 0, 0, fontSize, Color.WHITE, w - 24, Math.ceil(fontSize * 1.25)); l.node.name = 'Label';
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => { e.propagationStopped = true; callback(); });
        return n;
    }

    private panel(parent: Node, x: number, y: number, w: number, h: number, color: Color): Node {
        const n = this.makeNode('Panel'); n.addComponent(UITransform).setContentSize(w, h); parent.addChild(n); n.setPosition(x, y);
        const g = n.addComponent(Graphics); g.fillColor = color; g.strokeColor = new Color(93, 133, 116, 190); g.lineWidth = 2; g.roundRect(-w / 2, -h / 2, w, h, 12); g.fill(); g.stroke(); return n;
    }

    private rule(parent: Node, x: number, y: number, width: number) {
        const n = this.makeNode('Rule'); n.addComponent(UITransform).setContentSize(width, 4); parent.addChild(n); n.setPosition(x, y); const g = n.addComponent(Graphics); g.strokeColor = new Color(118, 174, 148); g.lineWidth = 2; g.moveTo(-width / 2, 0); g.lineTo(width / 2, 0); g.stroke();
    }

    private makeNode(name: string): Node {
        const node = new Node(name);
        node.layer = Layers.Enum.UI_2D;
        return node;
    }
}
