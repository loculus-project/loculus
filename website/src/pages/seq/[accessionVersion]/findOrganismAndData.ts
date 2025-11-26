import { err, ok } from 'neverthrow';

import { getSequenceDetailsTableData } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';

export async function findOrganismAndData(accessionVersion: string) {
    const organisms = getConfiguredOrganisms();

    const promises = organisms.map(({ key }) =>
        getSequenceDetailsTableData(accessionVersion, key).then((result) =>
            result.isOk()
                ? ok({ organism: key, result: result.value })
                : Promise.reject(new Error(`${key}: '${result.error.detail}'`)),
        ),
    );

    try {
        const firstSuccess = await Promise.any(promises);
        return firstSuccess;
    } catch (error) {
        const message =
            error instanceof AggregateError
                ? error.errors.map((error) => (error instanceof Error ? error.message : `${error}`)).join(', ')
                : (error as Error).message;
        return err({ message });
    }
}
