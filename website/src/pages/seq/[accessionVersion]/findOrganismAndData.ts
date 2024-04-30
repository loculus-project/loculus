import { err, ok } from 'neverthrow';

import { getSequenceDetailsTableData, SequenceDetailsTableResultType } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';

export async function findOrganismAndData(accessionVersion: string) {
    const organisms = getConfiguredOrganisms();

    const promises = organisms.map(async ({ key }) => {
        return {
            organism: key,
            result: await getSequenceDetailsTableData(accessionVersion, key),
        };
    });

    const queries = await Promise.all(promises);

    for (const { organism, result } of queries) {
        if (result.isOk()) {
            return ok({
                organism,
                result: result.value,
            });
        }
    }

    return err({ type: SequenceDetailsTableResultType.ERROR });
}
