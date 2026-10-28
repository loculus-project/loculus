import { err, ok } from 'neverthrow';

import { getSequenceDetailsTableData } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';
import { LapisProblemError } from '../../../utils/LapisProblemError.ts';

export async function findOrganismAndData(accessionVersion: string, accessToken: string | undefined) {
    const organisms = getConfiguredOrganisms();

    const promises = organisms.map(({ key }) =>
        getSequenceDetailsTableData(accessionVersion, key, accessToken).then((result) =>
            result.isOk()
                ? ok({ organism: key, result: result.value })
                : Promise.reject(new LapisProblemError(result.error, `${key}: '${result.error.detail}'`)),
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
        // Every organism rejected the token: the caller should answer 401 rather than 404
        const isUnauthorized =
            error instanceof AggregateError &&
            error.errors.length > 0 &&
            error.errors.every((reason) => reason instanceof LapisProblemError && reason.status === 401);
        return err({ message, isUnauthorized });
    }
}
