import type { MetadataField } from '../types/backend.ts';

export const displayMetadataField = (value: MetadataField) => (value === null ? 'null' : value.toString());
