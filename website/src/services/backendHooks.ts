import { Zodios } from '@zodios/core';
import { ZodiosHooks } from '@zodios/react';

import { backendApi } from './backendApi.ts';
import { type ClientConfig } from '../types.ts';

export function backendClientHooks(clientConfig: ClientConfig) {
    return new ZodiosHooks('pathoplexus', new Zodios(clientConfig.backendUrl, backendApi));
}
