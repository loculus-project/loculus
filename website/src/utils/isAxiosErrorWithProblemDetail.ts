import { isAxiosError, type AxiosError } from 'axios';

import { problemDetail, type ProblemDetail } from '../types/backend.ts';

export function isAxiosErrorWithProblemDetail(
    error: unknown,
): error is AxiosError<ProblemDetail> & { response: { data: ProblemDetail } } {
    if (!isAxiosError(error) || !error.response) return false;
    return problemDetail.safeParse(error.response.data).success;
}
