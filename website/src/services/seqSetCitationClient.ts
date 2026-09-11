import { ApiClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import type { ProblemDetail } from '../types/backend.ts';
import { authorProfile, seqSetCitations, seqSetRecords, seqSets, sequenceCitations } from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const myLogger: InstanceLogger = getInstanceLogger('SeqSetCitationClient');

export class SeqSetCitationClient extends ApiClient {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = myLogger) {
        return new SeqSetCitationClient(
            backendUrl,
            (data: unknown) => data as ProblemDetail | undefined,
            logger,
            'backend',
        );
    }

    public getSeqSetsOfUser(accessToken: string) {
        return this.request('get', '/get-seqsets-of-user', seqSets, {
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getSeqSetCitations(seqSetId: string, version: string) {
        return this.request('get', '/get-seqset-citations', seqSetCitations, {
            params: { seqSetId, version },
        });
    }

    /**
     * Fetches citations for an accession. If `version` is omitted, citations across all versions are returned.
     */
    public getSequenceCitations(accession: string, version?: number) {
        return this.request('get', '/get-sequence-citations', sequenceCitations, {
            params: { accession, version },
        });
    }

    public getSeqSet(seqSetId: string, version: string) {
        return this.request('get', '/get-seqset', seqSets, {
            params: { seqSetId, version },
        });
    }

    public getSeqSetVersions(seqSetId: string) {
        return this.request('get', '/get-seqset', seqSets, {
            params: { seqSetId },
        });
    }

    public getSeqSetRecords(seqSetId: string, version: string) {
        return this.request('get', '/get-seqset-records', seqSetRecords, {
            params: { seqSetId, version },
        });
    }

    public getAuthor(username: string) {
        return this.request('get', '/get-author', authorProfile, {
            params: { username },
        });
    }
}
