import { makeApi, makeEndpoint } from '@zodios/core';

import { notAuthorizedError } from './commonApiTypes.ts';
import { userProfile } from '../types/user.ts';

const getUserEndpoint = makeEndpoint({
    method: 'get',
    path: '/users/:username',
    alias: 'getUser',
    response: userProfile,
    errors: [notAuthorizedError],
});

export const userApi = makeApi([getUserEndpoint]);
