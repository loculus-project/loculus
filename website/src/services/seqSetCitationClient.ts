import { ApiClient } from './apiClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import { authorProfile, seqSetCitations, seqSetRecords, seqSets, sequenceCitations } from '../types/seqSetCitation.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const myLogger: InstanceLogger = getInstanceLogger('SeqSetCitationClient');

export class SeqSetCitationClient extends ApiClient {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = myLogger) {
        return new SeqSetCitationClient(backendUrl, (responseData) => responseData, logger, 'backend');
    }

    public getSeqSetsOfUser(accessToken: string) {
        return this.request({
            method: 'get',
            path: '/get-seqsets-of-user',
            headers: createAuthorizationHeader(accessToken),
            responseSchema: seqSets,
        });
    }

    /** Returns all versions of the seqSet */
    public getSeqSetVersions(seqSetId: string) {
        return this.request({
            method: 'get',
            path: '/get-seqset',
            params: { seqSetId },
            responseSchema: seqSets,
        });
    }

    public getSeqSetRecords(seqSetId: string, version: string) {
        return this.request({
            method: 'get',
            path: '/get-seqset-records',
            params: { seqSetId, version },
            responseSchema: seqSetRecords,
        });
    }

    public getSeqSetCitations(seqSetId: string, version: string) {
        return this.request({
            method: 'get',
            path: '/get-seqset-citations',
            params: { seqSetId, version },
            responseSchema: seqSetCitations,
        });
    }

    /** Returns citations of the accession. Without a `version`, citations of all versions are returned. */
    public getSequenceCitations(accession: string, version?: number) {
        return this.request({
            method: 'get',
            path: '/get-sequence-citations',
            params: { accession, version },
            responseSchema: sequenceCitations,
        });
    }

    public getAuthor(username: string) {
        return this.request({
            method: 'get',
            path: '/get-author',
            params: { username },
            responseSchema: authorProfile,
        });
    }
}
