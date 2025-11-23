import type { Metadata } from '../../types/config.ts';

export function isActiveForSelectedSuborganism(selectedSuborganism: string | null, field: Metadata) {
    return (
        selectedSuborganism === null ||
        field.onlyForSuborganism === undefined ||
        field.onlyForSuborganism === selectedSuborganism
    );
}
