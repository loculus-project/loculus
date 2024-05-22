import type { MetadataField } from '../types/backend.ts';

export const displayMetadataField = (value: MetadataField) => {
    if (value === null) {
        return 'null';
    }

    if (typeof value === 'number' && Number.isInteger(value)) {
        return value.toString();
    }

    if (typeof value === 'number') {
        return value.toFixed(2);
    }

   
        return value.toString();
    
};
