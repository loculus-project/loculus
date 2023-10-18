import { BackendClient } from './backendClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger } from '../logger.ts';

export default class ServerSideBackendClient extends BackendClient {
    private readonly logger = getInstanceLogger('serverSideBackendClient');

    constructor() {
        super(getRuntimeConfig().forServer.backendUrl);
    }

    protected logError(message: string): Promise<void> {
        this.logger.error(message);
        return Promise.resolve();
    }
}
