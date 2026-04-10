import { err, ok } from 'neverthrow';

import {
    getSequenceDetailsTableData,
    type Redirect,
    SequenceDetailsTableResultType,
} from './getSequenceDetailsTableData.ts';
import { routes } from '../../../routes/routes.ts';
import { createBackendClient } from '../../../services/backendClientFactory.ts';
import { parseAccessionVersionFromString } from '../../../utils/extractAccessionVersion.ts';

export async function findOrganismAndData(accessionVersion: string) {
    const backendClient = createBackendClient();
    const { accession, version } = parseAccessionVersionFromString(accessionVersion);

    const entries = await backendClient.getSequenceEntryVersions(
        version !== undefined ? { accessionVersions: [accessionVersion] } : { accessions: [accession] },
    );

    if (entries.isErr()) {
        return err({ message: entries.error.detail });
    }
    const entriesValue = entries.unwrapOr([]);

    if (entriesValue.length === 0) {
        return err({ message: `No released entry found for ${accessionVersion}` });
    }

    if (version === undefined) {
        // Find the latest version (max version number) among all entries
        const latestEntry = entriesValue.reduce((max, e) => (e.version > max.version ? e : max));
        const redirect: Redirect = {
            type: SequenceDetailsTableResultType.REDIRECT,
            redirectUrl: routes.sequenceEntryDetailsPage(`${latestEntry.accession}.${latestEntry.version}`),
        };
        return ok({ organism: latestEntry.organism, result: redirect });
    }

    const organism = entriesValue[0].organism;
    const result = await getSequenceDetailsTableData(accessionVersion, organism);
    return result.map((r) => ({ organism, result: r })).mapErr((e) => ({ message: e.detail }));
}
