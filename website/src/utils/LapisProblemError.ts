import { type ProblemDetail } from '../types/backend';

/**
 * A failed LAPIS request, rejected as an Error so that it can be used with Promise.any. Keeps the HTTP status, so
 * that a route can answer 401 when every organism rejected the token.
 */
export class LapisProblemError extends Error {
    public readonly status: number;

    constructor(problemDetail: ProblemDetail, message = problemDetail.detail) {
        super(message);
        this.status = problemDetail.status;
    }
}
