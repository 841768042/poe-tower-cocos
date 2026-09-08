/** Engine-neutral entity/component/state-machine runtime ported from the Godot C# layer. */

export enum EntityLifecycleState { Created, Active, Resolving, Released }

export abstract class EntityComponent {
    entity: GameEntity | null = null;
    onAttach(_entity: GameEntity): void {}
    onDetach(): void {}
    simulate(_step: SimulationStep): void {}
}

export class GameEntity {
    readonly components = new Map<Function, EntityComponent>();
    lifecycle = EntityLifecycleState.Created;
    constructor(public readonly entityId: number, public readonly definitionId: string) {}

    activate(): void {
        if (this.lifecycle !== EntityLifecycleState.Created) throw new Error('E_ENTITY_ACTIVATE_STATE');
        this.lifecycle = EntityLifecycleState.Active;
    }

    add<T extends EntityComponent>(component: T): T {
        if (this.lifecycle === EntityLifecycleState.Released) throw new Error('E_ENTITY_RELEASED');
        const key = component.constructor;
        if (this.components.has(key)) throw new Error(`E_COMPONENT_DUPLICATE:${key.name}`);
        component.entity = this; this.components.set(key, component); component.onAttach(this); return component;
    }

    get<T extends EntityComponent>(type: new (...args: any[]) => T): T | undefined {
        return this.components.get(type) as T | undefined;
    }

    resolve(): void { if (this.lifecycle === EntityLifecycleState.Active) this.lifecycle = EntityLifecycleState.Resolving; }
    release(): void {
        this.components.forEach(c => { c.onDetach(); c.entity = null; }); this.components.clear();
        this.lifecycle = EntityLifecycleState.Released;
    }
}

export interface SimulationStep { tick: number; deltaSeconds: number; }

export class EntityWorld {
    private nextId = 1;
    private entities = new Map<number, GameEntity>();
    create(definitionId: string): GameEntity {
        const entity = new GameEntity(this.nextId++, definitionId); this.entities.set(entity.entityId, entity); entity.activate(); return entity;
    }
    find(id: number): GameEntity | undefined { return this.entities.get(id); }
    all(): readonly GameEntity[] { return Array.from(this.entities.values()).sort((a, b) => a.entityId - b.entityId); }
    simulate(step: SimulationStep): void {
        this.all().forEach(entity => { if (entity.lifecycle === EntityLifecycleState.Active) entity.components.forEach(c => c.simulate(step)); });
        this.all().filter(e => e.lifecycle === EntityLifecycleState.Resolving).forEach(e => { this.entities.delete(e.entityId); e.release(); });
    }
    clear(): void { this.all().forEach(e => e.release()); this.entities.clear(); }
}

export interface StateTransitionResult { accepted: boolean; from: string; to: string; reason?: string; }

export abstract class EntityState<TContext> {
    abstract readonly id: string;
    enter(_context: TContext): void {}
    exit(_context: TContext): void {}
    update(_context: TContext, _step: SimulationStep): string | null { return null; }
}

export class EntityStateMachine<TContext> {
    private states = new Map<string, EntityState<TContext>>();
    current: EntityState<TContext> | null = null;
    constructor(private readonly context: TContext) {}
    add(state: EntityState<TContext>): this { if (this.states.has(state.id)) throw new Error(`E_STATE_DUPLICATE:${state.id}`); this.states.set(state.id, state); return this; }
    transition(nextId: string): StateTransitionResult {
        const next = this.states.get(nextId); const from = this.current?.id || '';
        if (!next) return { accepted: false, from, to: nextId, reason: 'E_STATE_UNKNOWN' };
        if (next === this.current) return { accepted: false, from, to: nextId, reason: 'E_STATE_SAME' };
        this.current?.exit(this.context); this.current = next; next.enter(this.context); return { accepted: true, from, to: nextId };
    }
    update(step: SimulationStep): void { const next = this.current?.update(this.context, step); if (next) this.transition(next); }
}

export enum RunPhase { Preparation, Combat, Victory, Defeat, Aborted }

export class FixedSimulationClock {
    private accumulator = 0;
    tick = 0;
    constructor(public readonly hz = 30) {}
    advance(frameSeconds: number, speed: 1 | 2, run: (step: SimulationStep) => void): void {
        this.accumulator += Math.min(.25, frameSeconds) * speed; const fixed = 1 / this.hz;
        while (this.accumulator >= fixed) { this.accumulator -= fixed; run({ tick: ++this.tick, deltaSeconds: fixed }); }
    }
}
