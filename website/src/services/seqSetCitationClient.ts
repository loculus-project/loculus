import { ApiClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import type { ProblemDetail } from '../types/backend.ts';
import { authorProfile, citedByResult, seqSetRecords, seqSets } from '../types/seqSetCitation.ts';
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

    public getUserCitedBy(username: string, accessToken: string) {
        return this.request('get', `/get-user-cited-by-seqset?username=${username}`, citedByResult, {
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getSeqSet(seqSetId: string, version: string) {
        return this.request('get', `/get-seqset?seqSetId=${seqSetId}&version=${version}`, seqSets);
    }

    public getSeqSetRecords(seqSetId: string, version: string) {
        return this.request('get', `/get-seqset-records?seqSetId=${seqSetId}&version=${version}`, seqSetRecords);
    }

    public getSeqSetCitedBy(seqSetId: string, version: string) {
        return this.request(
            'get',
            `/get-seqset-cited-by-publication?seqSetId=${seqSetId}&version=${version}`,
            citedByResult,
        );
    }

    public getAuthor(username: string) {
        return this.request('get', `/get-author?username=${username}`, authorProfile);
    }
}
