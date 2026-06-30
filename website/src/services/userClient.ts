import { userApi } from './userApi.ts';
import { ZodiosWrapperClient } from './zodiosWrapperClient.ts';
import { getRuntimeConfig } from '../config.ts';
import { getInstanceLogger, type InstanceLogger } from '../logger.ts';

const myLogger: InstanceLogger = getInstanceLogger('UserClient');

export class UserClient extends ZodiosWrapperClient<typeof userApi> {
    public static create(backendUrl: string = getRuntimeConfig().serverSide.backendUrl, logger = myLogger) {
        return new UserClient(
            backendUrl,
            userApi,
            (axiosError) => axiosError.data, // eslint-disable-line @typescript-eslint/no-unsafe-return
            logger,
            'backend',
        );
    }

    public getUser(username: string) {
        return this.call('getUser', { params: { username } });
    }
}
