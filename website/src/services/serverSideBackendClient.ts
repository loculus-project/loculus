import { BackendClient } from './backendClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export default class ServerSideBackendClient extends BackendClient {
    /** Somehow Typescript's type inference currently doesn't work properly in Astro files */
    public readonly astroFileTypeHelpers = {
        getSequencesOfUser: (username: string) =>
            this.call('getSequencesOfUser', {
                queries: { username },
            }),

        getDataToReview: (username: string, sequenceId: string | number, version: string | number) =>
            this.call('getDataToReview', {
                params: { sequenceId, version },
                queries: { username },
            }),
    };

    private constructor(
        private readonly logger: ReturnType<typeof getInstanceLogger>,
        backendUrl: string,
    ) {
        super(backendUrl);
    }

    public static create() {
        return new ServerSideBackendClient(
            getInstanceLogger('serverSideBackendClient'),
            getRuntimeConfig().forServer.backendUrl,
        );
    }

    protected logError(message: string): Promise<void> {
        this.logger.error(message);
        return Promise.resolve();
    }

    protected logInfo(message: string): Promise<void> {
        this.logger.info(message);
        return Promise.resolve();
    }
}
