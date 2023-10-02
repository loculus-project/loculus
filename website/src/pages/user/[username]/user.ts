import { getRuntimeConfig } from '../../../config';
import { logger } from '../../../logger';

export enum ResponseStatus {
    OK = 'OK',
    ERROR = 'ERROR',
}
export type SequenceStatusNames =
    | 'RECEIVED'
    | 'PROCESSING'
    | 'NEEDS_REVIEW'
    | 'REVIEWED'
    | 'PROCESSED'
    | 'SILO_READY'
    | 'REVOKED_STAGING';

export type SequenceStatus = {
    status: SequenceStatusNames;
    sequenceId: number;
    version: number;
};
export type UserSequenceResponse = {
    responseStatus: ResponseStatus;
    sequences: SequenceStatus[];
};

export const splitStatusArray = (sequences: SequenceStatus[]) =>
    sequences.reduce(
        (acc, item) => {
            acc[item.status].push(item);
            return acc;
        },
        {
            RECEIVED: [] as SequenceStatus[],
            PROCESSING: [] as SequenceStatus[],
            NEEDS_REVIEW: [] as SequenceStatus[],
            REVIEWED: [] as SequenceStatus[],
            PROCESSED: [] as SequenceStatus[],
            SILO_READY: [] as SequenceStatus[],
            REVOKED_STAGING: [] as SequenceStatus[],
        } as Record<SequenceStatusNames, SequenceStatus[]>,
    );

export const getUserSequences = async (name: string): Promise<UserSequenceResponse> => {
    const serverConfig = getRuntimeConfig().forServer;
    const mySequencesQuery = `${serverConfig.backendUrl}/get-sequences-of-user?username=${name}`;

    try {
        const mySequencesResponse = await fetch(mySequencesQuery, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!mySequencesResponse.ok) {
            logger.error(`Failed to fetch user sequences with status ${mySequencesResponse.status}`);
            return {
                responseStatus: ResponseStatus.ERROR,
                sequences: [],
            };
        }

        return {
            responseStatus: ResponseStatus.OK,
            sequences: (await mySequencesResponse.json()) as SequenceStatus[],
        };
    } catch (error) {
        logger.error(
            `Failed to fetch user sequences from ${mySequencesQuery} with error '${(error as Error).message}'`,
        );
        return {
            responseStatus: ResponseStatus.ERROR,
            sequences: [],
        };
    }
};
