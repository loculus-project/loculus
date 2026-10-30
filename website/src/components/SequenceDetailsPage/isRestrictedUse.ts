import { type TableDataEntry } from './types';
import { DATA_USE_TERMS_FIELD } from '../../settings';

export const isRestrictedUse = (tableData: TableDataEntry[]) => {
    const dataUseTerms = tableData.find((entry) => entry.name === DATA_USE_TERMS_FIELD);
    return dataUseTerms?.value.toString().toUpperCase() === 'RESTRICTED';
};
