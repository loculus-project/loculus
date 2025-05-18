import type { APIRoute } from 'astro';

import { getReferenceGenomes } from '../../../config.ts';
import { routes } from '../../../routes/routes.ts';
import { LapisClient } from '../../../services/lapisClient.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute.ts';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/x-fasta',
    'fa',
    routes.sequenceEntryFastaPage,
    async (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);
        const referenceGenomes = getReferenceGenomes(organism);
        const segmentNames = referenceGenomes.nucleotideSequences.map((s) => s.name);
        const isMultiSegmented = segmentNames.length > 1;

        return !isMultiSegmented
            ? lapisClient.getSequenceFasta(accessionVersion)
            : lapisClient.getMultiSegmentSequenceFasta(accessionVersion, segmentNames);
    },
);
