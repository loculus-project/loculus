import type { Metadata } from '../../types/config.ts';

export function isActiveForSelectedSuborganism(selectedSuborganism: string | null, field: Metadata) {
    return (
        selectedSuborganism === null ||
        field.onlyShowInSearchWhenSuborganismIs === undefined ||
        field.onlyShowInSearchWhenSuborganismIs === selectedSuborganism
    );
}
