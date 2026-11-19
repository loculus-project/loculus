import type { APIRoute } from 'astro';

import { getReferenceGenomes } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { serverLapisApi } from '../../../services/serverApi.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute.ts';
import { getSegmentNames, mapLapisNameToSegmentName } from '../../../utils/sequenceTypeHelpers.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequenceEntryFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisApi = serverLapisApi(organism);

        const referenceGenomesInfo = getReferenceGenomes(organism);

        if (referenceGenomesInfo.useLapisMultiSegmentedEndpoint) {
            if (getSegmentNames(referenceGenomesInfo).length === 1) {
                return lapisApi.getSequenceFasta({
                    accessionVersion,
                    fastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`,
                });
            }
            const referenceNameMap = mapLapisNameToSegmentName(referenceGenomesInfo);
            return lapisApi.getMultiSegmentSequenceFasta({
                accessionVersion,
                segmentNames: Object.keys(referenceNameMap),
                referenceNameMap,
            });
        }

        return lapisApi.getSequenceFasta({ accessionVersion });
    },
);
