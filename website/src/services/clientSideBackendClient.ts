import { ZodiosHooks } from '@zodios/react';

import { BackendClient } from './backendClient.ts';
import { type ClientLogger, getClientLogger } from '../api.ts';
import { type ClientConfig } from '../types.ts';

export class ClientSideBackendClient extends BackendClient {
    constructor(
        private readonly logger: ClientLogger,
        backendUrl: string,
    ) {
        super(backendUrl);
    }

    public static create(clientConfig: ClientConfig) {
        return new ClientSideBackendClient(getClientLogger('clientSideBackendClient'), clientConfig.backendUrl);
    }

    public getHooks() {
        return new ZodiosHooks('pathoplexus', this.zodios);
    }

    protected async logError(message: string): Promise<void> {
        await this.logger.error(message);
    }

    protected async logInfo(message: string): Promise<void> {
        await this.logger.info(message);
    }
}
