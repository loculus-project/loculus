import { err, ok } from 'neverthrow';

import { getSequenceDetailsTableData, SequenceDetailsTableResultType } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';

export async function findOrganismAndData(accessionVersion: string) {
    const organisms = getConfiguredOrganisms();

    const promises = organisms.map(({ key }) =>
        getSequenceDetailsTableData(accessionVersion, key).then((result) =>
            result.isOk()
                ? ok({ organism: key, result: result.value })
                : Promise.reject(new Error(result.error.detail)),
        ),
    );

    try {
        const firstSuccess = await Promise.any(promises);
        return firstSuccess;
    } catch (_) {
        return err({ type: SequenceDetailsTableResultType.ERROR });
    }
}
