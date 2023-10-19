import { BackendClient } from './backendClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export default class ServerSideBackendClient extends BackendClient {
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
