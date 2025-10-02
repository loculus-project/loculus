import { describe, expect, it } from 'vitest';

import { getSerpentineRows, reorderSerpentine, serpentineIndexForDisplayPosition } from './ladderGameUtils';

describe('ladderGameUtils', () => {
    it('reorders entries in serpentine order', () => {
        const order = ['1', '2', '3', '4'];
        expect(reorderSerpentine(order, 1, 3)).toEqual(['1', '3', '4', '2']);
        expect(reorderSerpentine(order, 0, 0)).toBe(order);
    });

    it('returns serpentine rows alternating direction', () => {
        const rows = getSerpentineRows(['1', '2', '3', '4', '5', '6'], 3);
        expect(rows).toEqual([
            ['1', '2', '3'],
            ['6', '5', '4'],
        ]);
    });

    it('computes serpentine indices for display positions', () => {
        expect(serpentineIndexForDisplayPosition(0, 2, 4)).toBe(2);
        expect(serpentineIndexForDisplayPosition(1, 0, 4)).toBe(7);
        expect(serpentineIndexForDisplayPosition(1, 3, 4)).toBe(4);
    });
});
