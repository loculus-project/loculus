import { type AxiosError } from 'axios';

export function stringifyMaybeAxiosError(error: unknown | AxiosError) {
    return error?.toString() ?? JSON.stringify(error);
}
