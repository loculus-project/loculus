import type { APIRoute } from 'astro';

import { routes } from '../../../routes/routes';
import { serverLapisApi } from '../../../services/serverApi.ts';
import { createDownloadAPIRoute } from '../../../utils/createDownloadAPIRoute';

export const GET: APIRoute = createDownloadAPIRoute(
    'text/tab-separated-values',
    'tsv',
    routes.sequenceEntryTsvPage,
    (accessionVersion: string, organism: string) => {
        return serverLapisApi(organism).getSequenceEntryVersionDetailsTsv({ accessionVersion });
    },
);
