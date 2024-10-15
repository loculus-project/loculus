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
            (axiosError) => axiosError.data,
            logger,
            'backend',
        );
    }

    public getSeqSetsOfUser(accessToken: string) {
        return this.call('getSeqSetsOfUser', {
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getUserCitedBy(username: string, accessToken: string) {
        return this.call('getUserCitedBy', {
            params: { username },
            headers: createAuthorizationHeader(accessToken),
        });
    }

    public getAuthor(username: string) {
        return this.call('getAuthor', { params: { username } });
    }
}
