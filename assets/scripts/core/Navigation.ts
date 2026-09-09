export interface GridCell { x: number; y: number; }

/** Shared weighted reverse flow field. All enemies read one field; walls trigger one rebuild. */
export class NavigationFlowField {
    private blocked = new Set<string>();
    private distance: number[] = [];
    private next: (GridCell | null)[] = [];
    private terrainCost: number[];
    version = 0;
    constructor(public readonly width: number, public readonly height: number, public readonly goal: GridCell) {
        this.terrainCost = new Array(width * height).fill(8); this.rebuild();
    }
    private key(c: GridCell): string { return `${c.x},${c.y}`; }
    private index(c: GridCell): number { return c.y * this.width + c.x; }
    inBounds(c: GridCell): boolean { return c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height; }
    isBlocked(c: GridCell): boolean { return this.blocked.has(this.key(c)); }
    neighbors(c: GridCell): GridCell[] { return [{x:c.x,y:c.y+1},{x:c.x-1,y:c.y},{x:c.x+1,y:c.y},{x:c.x,y:c.y-1}].filter(n => this.inBounds(n) && !this.isBlocked(n)); }
    configureRoads(roads: GridCell[], offRoadCost = 8): void {
        this.terrainCost.fill(offRoadCost);
        roads.forEach(cell => { if (this.inBounds(cell)) this.terrainCost[this.index(cell)] = 1; });
        this.rebuild();
    }
    canPlaceWall(cell: GridCell, entrances: GridCell[]): boolean {
        if (!this.inBounds(cell) || this.isBlocked(cell) || this.key(cell) === this.key(this.goal) || entrances.some(entrance => this.key(entrance) === this.key(cell))) return false;
        const test = new Set(this.blocked); test.add(this.key(cell));
        const reachable = this.build(test).reachable;
        return entrances.every(entrance => reachable[this.index(entrance)]);
    }
    setWall(cell: GridCell, active: boolean): void { active ? this.blocked.add(this.key(cell)) : this.blocked.delete(this.key(cell)); this.rebuild(); }
    nextCell(cell: GridCell): GridCell | null { return this.next[this.index(cell)] || null; }
    getDistance(cell: GridCell): number { return this.distance[this.index(cell)] ?? Infinity; }
    rebuild(): void {
        const built = this.build(this.blocked); this.distance = built.distance; this.next = built.next;
        this.version++;
    }
    private build(blocked: Set<string>): { distance: number[]; next: (GridCell | null)[]; reachable: boolean[] } {
        const distance = new Array(this.width * this.height).fill(Infinity); const next: (GridCell | null)[] = new Array(this.width * this.height).fill(null);
        const reachable = new Array(this.width * this.height).fill(false); const frontier: { cell: GridCell; cost: number; sequence: number }[] = [];
        if (blocked.has(this.key(this.goal))) return { distance, next, reachable };
        let sequence = 0; distance[this.index(this.goal)] = 0; frontier.push({ cell: this.goal, cost: 0, sequence: sequence++ });
        while (frontier.length) {
            frontier.sort((a, b) => a.cost - b.cost || a.sequence - b.sequence); const current = frontier.shift()!; const currentIndex = this.index(current.cell);
            if (current.cost > distance[currentIndex] + .000001) continue; reachable[currentIndex] = true;
            const candidates = [{x:current.cell.x,y:current.cell.y+1},{x:current.cell.x-1,y:current.cell.y},{x:current.cell.x+1,y:current.cell.y},{x:current.cell.x,y:current.cell.y-1}];
            for (const neighbour of candidates) {
                if (!this.inBounds(neighbour) || blocked.has(this.key(neighbour))) continue;
                const index = this.index(neighbour); const candidate = current.cost + this.terrainCost[currentIndex];
                if (candidate >= distance[index] - .000001) continue;
                distance[index] = candidate; next[index] = current.cell; frontier.push({ cell: neighbour, cost: candidate, sequence: sequence++ });
            }
        }
        return { distance, next, reachable };
    }
}

export class IceWallRules {
    readonly active = new Map<string, { cell: GridCell; endTick: number; sourceId: number }>();
    constructor(public readonly globalLimit = 2, public readonly cooldownTicks = 540, public readonly durationTicks = 180) {}
    canPlace(flow: NavigationFlowField, cell: GridCell, entrances: GridCell[], sourceReadyTick: number, tick: number): string | null {
        if (tick < sourceReadyTick) return 'E_ICE_WALL_COOLDOWN';
        if (this.active.size >= this.globalLimit) return 'E_ICE_WALL_GLOBAL_LIMIT';
        if (!flow.canPlaceWall(cell, entrances)) return 'E_ICE_WALL_BLOCKS_PATH';
        return null;
    }
}
