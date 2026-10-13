import { seqSetCitationApi } from './seqSetCitationApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const myLogger: InstanceLogger = getInstanceLogger('SeqSetCitationClient');

export class SeqSetCitationClient extends ZodiosWrapperClient<typeof seqSetCitationApi> {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = myLogger) {
        return new SeqSetCitationClient(
            backendUrl,
            seqSetCitationApi,
            (axiosError) => axiosError.data, // eslint-disable-line @typescript-eslint/no-unsafe-return
            logger,
            'backend',
        );
    }

    public getSeqSetsOfUser(accessToken: string) {
        return this.call('getSeqSetsOfUser', {
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getAuthor(username: string, token?: string) {
        return this.call('getAuthor', { headers: createAuthorizationHeader(token), params: { username } });
    }

    public getSeqSetVersions(token: string | undefined, seqSetId: string) {
        return this.call('getSeqSetVersions', {
            headers: createAuthorizationHeader(token),
            params: { seqSetId },
        });
    }

    public getSeqSetRecords(token: string | undefined, seqSetId: string, version: string) {
        return this.call('getSeqSetRecords', {
            headers: createAuthorizationHeader(token),
            params: { seqSetId, version },
        });
    }

    public getSeqSetCitations(token: string | undefined, seqSetId: string, version: string) {
        return this.call('getSeqSetCitations', {
            headers: createAuthorizationHeader(token),
            params: { seqSetId, version },
        });
    }

    public getSequenceCitations(token: string | undefined, accession: string) {
        return this.call('getSequenceCitations', {
            headers: createAuthorizationHeader(token),
            params: { accession }, // Display citations across all accession versions
        });
    }
}
