import { err, ok, type Result } from 'neverthrow';
import type z from 'zod';

import { getRuntimeConfig } from '../../../../../config.ts';
import { getInstanceLogger } from '../../../../../logger.ts';
import { sequenceReview, type SequenceReview } from '../../../../../types.ts';

const logger = getInstanceLogger('getReviewData');

export const backendFetch = async <T extends z.Schema | undefined>(
    endpoint: `/${string}`,
    zodSchema: T,
    options?: RequestInit,
): Promise<Result<T extends z.Schema<infer S> ? S : never, string>> => {
    try {
        const response = await fetch(`${getRuntimeConfig().forServer.backendUrl}${endpoint}`, options);

        if (!response.ok) {
            logger.error(`Failed to fetch with status ${response.status}`);
            return err(`Failed to fetch. Reason: ${JSON.stringify((await response.json()).detail)}`);
        }

        if (zodSchema === undefined) {
            return ok(undefined as never);
        }

        try {
            const parser = (candidate: unknown): Result<z.infer<typeof zodSchema>, string> => {
                try {
                    return ok(zodSchema.parse(candidate));
                } catch (error) {
                    return err((error as Error).message);
                }
            };

            const responseJson = await response.json();
            return parser(responseJson);
        } catch (error) {
            logger.error(`Parsing the response failed with error '${JSON.stringify(error)}'`);
            return err(`Parsing the response failed with error '${JSON.stringify(error)}'`);
        }
    } catch (error) {
        logger.error(`Failed to fetch with error '${JSON.stringify(error)}'`);
        return err(`Failed to fetch with error '${JSON.stringify(error)}'`);
    }
};

export const getReviewForSequenceVersion = async (
    userName: string,
    sequenceId: number | string,
    version: number | string,
): Promise<Result<SequenceReview, string>> => {
    return backendFetch(`/get-data-to-review/${sequenceId}/${version}?username=${userName}`, sequenceReview, {
        method: 'GET',
        headers: {
            accept: 'application/json',
        },
    });
};
