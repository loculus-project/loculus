import type { APIRoute } from 'astro';

import { routes } from '../../../routes/routes';
import { LapisClient } from '../../../services/lapisClient';
import { createDownloadAPIRoute } from '../sequenceDownload';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/tab-separated-values',
    'tsv',
    routes.sequencesTsvPage,
    (accessionVersion: string, organism: string) => {
        const lapisClient = LapisClient.createForOrganism(organism);
        return lapisClient.getSequenceEntryVersionDetailsTsv(accessionVersion);
    },
);
