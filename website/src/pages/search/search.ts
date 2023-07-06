import type { TableSequenceData } from '../../components/SearchPage/Table';
import { config, type Filter } from '../../config';

export const getData = async (metadataFilter: Filter[]): Promise<TableSequenceData[]> => {
    const searchFilters = metadataFilter
        .filter((metadata) => metadata.filter !== '')
        .map((metadata) => `${metadata.name}=${metadata.filter}`);

    const fieldsToShow = config.schema.tableColumns.map((field) => `fields=${field}`).join('&');
    const queryUrl = searchFilters.length === 0 ? '' : `${searchFilters.join('&')}`;
    const query = `${config.lapisHost}/details?${queryUrl}&${fieldsToShow}&fields=${config.schema.primaryKey}&limit=100`;
    const response = await fetch(query);
    return (await response.json()).data;
};
