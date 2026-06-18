// Deep equality used for the loader's idempotency check. `null` and `undefined`
// are treated as equivalent because backend defaults often resurface fields as
// `null` that the fixture YAML leaves unset.
export function deepEqualIgnoringUndefined(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a === null || a === undefined) return b === null || b === undefined;
    if (b === null || b === undefined) return false;
    if (typeof a !== typeof b) return false;

    if (Array.isArray(a)) {
        if (!Array.isArray(b)) return false;
        if (a.length !== b.length) return false;
        for (let i = 0; i < a.length; i++) {
            if (!deepEqualIgnoringUndefined(a[i], b[i])) return false;
        }
        return true;
    }

    if (typeof a === 'object') {
        if (typeof b !== 'object' || Array.isArray(b)) return false;
        const aRec = a as Record<string, unknown>;
        const bRec = b as Record<string, unknown>;
        const aKeys = new Set(Object.keys(aRec).filter((k) => aRec[k] !== undefined && aRec[k] !== null));
        const bKeys = new Set(Object.keys(bRec).filter((k) => bRec[k] !== undefined && bRec[k] !== null));
        if (aKeys.size !== bKeys.size) return false;
        for (const k of aKeys) {
            if (!bKeys.has(k)) return false;
            if (!deepEqualIgnoringUndefined(aRec[k], bRec[k])) return false;
        }
        return true;
    }

    return Object.is(a, b);
}
