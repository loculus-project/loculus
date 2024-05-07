import { err, ok, type Result} from 'neverthrow';

import { getSequenceDetailsTableData, SequenceDetailsTableResultType } from './getSequenceDetailsTableData.ts';
import { getConfiguredOrganisms } from '../../../config.ts';


// Define the type for the successful outcome
interface SuccessfulResult {
    organism: string;
    result: SequenceDetailsTableResultType; // You need to define this type based on what `getSequenceDetailsTableData` returns
}

// Define the type for the error outcome
interface ErrorResult {
    type: SequenceDetailsTableResultType.ERROR;
}

// Combine the above two types into a Result type using neverthrow's Result
export type FindOrganismAndDataResult = Result<SuccessfulResult, ErrorResult>;


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
