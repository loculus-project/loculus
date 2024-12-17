import { backendApi } from './backendApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';
import { createAuthorizationHeader } from '../utils/createAuthorizationHeader.ts';

const myLogger = getInstanceLogger('BackendClient');

export class BackendClient extends ZodiosWrapperClient<typeof backendApi> {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = myLogger) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return new BackendClient(backendUrl, backendApi, (axiosError) => axiosError.data, logger, 'backend');
    }

    public getDataToEdit(organism: string, token: string, accession: string, version: string | number) {
        return this.call('getDataToEdit', {
            params: { accession, version, organism },
            headers: createAuthorizationHeader(token),
        });
    }

    public async isInDebugMode() {
        return (await this.call('info')).match(
            (info) => info.isInDebugMode,
            () => false,
        );
    }
}
