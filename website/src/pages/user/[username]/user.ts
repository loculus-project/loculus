import { getConfig } from '../../../config';
import { logger } from '../../../logger';

export enum ResponseStatus {
    OK = 'OK',
    ERROR = 'ERROR',
}
export type SequenceStatus = {
    status: string;
    sequenceId: number;
};
export type UserSequenceResponse = {
    responseStatus: ResponseStatus;
    sequences: SequenceStatus[];
};
export const getUserSequences = async (name: string): Promise<UserSequenceResponse> => {
    try {
        const config = getConfig();
        const mySequencesQuery = `${config.backendUrl}/get-sequences-of-user?username=${name}`;

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
        logger.error(`Failed to fetch user sequences with error '${(error as Error).message}'`);
        return {
            responseStatus: ResponseStatus.ERROR,
            sequences: [],
        };
    }
};
