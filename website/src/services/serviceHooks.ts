import { Zodios } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';

import { seqSetCitationApi } from './seqSetCitationApi.ts';
import type { ClientConfig } from '../types/runtimeConfig.ts';
import type { SeqSetRecord } from '../types/seqSetCitation.ts';

export function seqSetCitationClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('loculus', new Zodios(clientConfig.backendUrl, seqSetCitationApi));
}

/**
 * Query for all records of a SeqSet version, fetched in the browser. Response validation is off because zodios'
 * async validation of a large record list costs hundreds of MB (#7752).
 */
export function seqSetRecordsQueryOptions(clientConfig: ClientConfig, seqSetId: string, seqSetVersion: number) {
    return {
        queryKey: ['seqset-records', clientConfig.backendUrl, seqSetId, seqSetVersion],
        queryFn: (): Promise<SeqSetRecord[]> =>
            new Zodios(clientConfig.backendUrl, seqSetCitationApi, { validate: false }).getSeqSetRecords({
                params: { seqSetId, version: seqSetVersion },
            }),
        staleTime: Infinity,
        retry: 1,
    };
}
