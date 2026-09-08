export interface GridCell { x: number; y: number; }

/** Shared reverse-BFS flow field. All enemies read one field; walls trigger one rebuild. */
export class NavigationFlowField {
    private blocked = new Set<string>();
    private distance: number[] = [];
    private next: (GridCell | null)[] = [];
    version = 0;
    constructor(public readonly width: number, public readonly height: number, public readonly goal: GridCell) { this.rebuild(); }
    private key(c: GridCell): string { return `${c.x},${c.y}`; }
    private index(c: GridCell): number { return c.y * this.width + c.x; }
    inBounds(c: GridCell): boolean { return c.x >= 0 && c.y >= 0 && c.x < this.width && c.y < this.height; }
    isBlocked(c: GridCell): boolean { return this.blocked.has(this.key(c)); }
    neighbors(c: GridCell): GridCell[] { return [{x:c.x+1,y:c.y},{x:c.x-1,y:c.y},{x:c.x,y:c.y+1},{x:c.x,y:c.y-1}].filter(n => this.inBounds(n) && !this.isBlocked(n)); }
    canPlaceWall(cell: GridCell, entrances: GridCell[]): boolean {
        if (!this.inBounds(cell) || this.isBlocked(cell) || this.key(cell) === this.key(this.goal)) return false;
        const test = new Set(this.blocked); test.add(this.key(cell));
        const visited = new Set<string>([this.key(this.goal)]), queue: GridCell[] = [this.goal];
        while (queue.length) { const at = queue.shift()!; [{x:at.x+1,y:at.y},{x:at.x-1,y:at.y},{x:at.x,y:at.y+1},{x:at.x,y:at.y-1}].forEach(n => {
            const k=this.key(n); if(this.inBounds(n)&&!test.has(k)&&!visited.has(k)){visited.add(k);queue.push(n);}
        }); }
        return entrances.every(e => visited.has(this.key(e)));
    }
    setWall(cell: GridCell, active: boolean): void { active ? this.blocked.add(this.key(cell)) : this.blocked.delete(this.key(cell)); this.rebuild(); }
    nextCell(cell: GridCell): GridCell | null { return this.next[this.index(cell)] || null; }
    getDistance(cell: GridCell): number { return this.distance[this.index(cell)] ?? Infinity; }
    rebuild(): void {
        this.distance = new Array(this.width*this.height).fill(Infinity); this.next = new Array(this.width*this.height).fill(null);
        if (this.isBlocked(this.goal)) return;
        const queue: GridCell[]=[this.goal]; this.distance[this.index(this.goal)]=0;
        while(queue.length){const at=queue.shift()!;const d=this.distance[this.index(at)];this.neighbors(at).forEach(n=>{const i=this.index(n);if(this.distance[i]!==Infinity)return;this.distance[i]=d+1;this.next[i]=at;queue.push(n);});}
        this.version++;
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
