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

    public getAuthor(accessToken: string | undefined, username: string) {
        return this.call('getAuthor', { headers: createAuthorizationHeader(accessToken), params: { username } });
    }

    public getSeqSetVersions(accessToken: string | undefined, seqSetId: string) {
        return this.call('getSeqSetVersions', {
            headers: createAuthorizationHeader(accessToken),
            params: { seqSetId },
        });
    }

    public getSeqSetRecords(accessToken: string | undefined, seqSetId: string, version: string) {
        return this.call('getSeqSetRecords', {
            headers: createAuthorizationHeader(accessToken),
            params: { seqSetId, version },
        });
    }

    public getSeqSetCitations(accessToken: string | undefined, seqSetId: string, version: string) {
        return this.call('getSeqSetCitations', {
            headers: createAuthorizationHeader(accessToken),
            params: { seqSetId, version },
        });
    }

    public getSequenceCitations(accessToken: string | undefined, accession: string) {
        return this.call('getSequenceCitations', {
            headers: createAuthorizationHeader(accessToken),
            params: { accession }, // Display citations across all accession versions
        });
    }
}
