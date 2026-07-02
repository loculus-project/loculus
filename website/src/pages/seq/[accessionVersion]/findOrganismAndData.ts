import { err } from 'neverthrow';

import { getSequenceDetailsTableData } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';

export async function findOrganismAndData(accessionVersion: string) {
    const organisms = getConfiguredOrganisms();

    try {
        const result = await getSequenceDetailsTableData(accessionVersion, organisms);
        return result
            .map((value) => ({ organism: value.organism, result: value }))
            .mapErr((error) => ({ message: error.detail }));
    } catch (error) {
        const message =
            error instanceof AggregateError
                ? error.errors.map((error) => (error instanceof Error ? error.message : `${error}`)).join(', ')
                : (error as Error).message;
        return err({ message });
    }
}
