import { JsonAsset, resources } from 'cc';

export interface ContentValidationReport {
    ok: boolean;
    hash: string;
    tableCount: number;
    recordCount: number;
    errors: string[];
}

/** Loads the exported Godot data tables as one immutable, validated content snapshot. */
export class ContentRegistry {
    private readonly tables = new Map<string, Readonly<Record<string, any>>>();
    report: ContentValidationReport = { ok: false, hash: '', tableCount: 0, recordCount: 0, errors: ['not_loaded'] };

    load(): Promise<ContentValidationReport> {
        return new Promise(resolve => {
            resources.loadDir('config/data', JsonAsset, (error, assets) => {
                const errors: string[] = [];
                this.tables.clear();
                if (error) errors.push(`load:${error.message || String(error)}`);
                for (const asset of assets || []) {
                    const name = asset.name.replace(/\.json$/i, '');
                    try {
                        const parsed = asset.json as Record<string, any>;
                        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('root_not_object');
                        for (const key of Object.keys(parsed)) {
                            const record = parsed[key];
                            if (!record || typeof record !== 'object') errors.push(`${name}.${key}:record_not_object`);
                            else if (typeof record.id === 'string' && record.id !== key) errors.push(`${name}.${key}:id_mismatch(${record.id})`);
                        }
                        this.tables.set(name, Object.freeze(parsed));
                    } catch (parseError) {
                        errors.push(`${name}:parse:${parseError instanceof Error ? parseError.message : String(parseError)}`);
                    }
                }
                const canonical = Array.from(this.tables.entries()).sort(([a], [b]) => a.localeCompare(b))
                    .map(([name, table]) => `${name}:${stableStringify(table)}`).join('|');
                const recordCount = Array.from(this.tables.values()).reduce((sum, table) => sum + Object.keys(table).length, 0);
                this.report = { ok: errors.length === 0 && this.tables.size > 0, hash: fnv1a(canonical), tableCount: this.tables.size, recordCount, errors };
                resolve(this.report);
            });
        });
    }

    table<T extends Record<string, any> = Record<string, any>>(name: string): Readonly<T> | undefined {
        return this.tables.get(name) as Readonly<T> | undefined;
    }

    get<T = any>(table: string, id: string): T | undefined {
        return this.tables.get(table)?.[id] as T | undefined;
    }
}

function stableStringify(value: any): string {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(',')}}`;
}

function fnv1a(text: string): string {
    let hash = 0x811c9dc5;
    for (let i = 0; i < text.length; i++) {
        hash ^= text.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return (`00000000${hash.toString(16)}`).slice(-8);
}
