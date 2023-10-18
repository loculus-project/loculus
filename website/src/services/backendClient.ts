import { err, ok, type Result } from 'neverthrow';
import z from 'zod';

import { sequenceReview, sequenceStatus, type SequenceVersion, type UnprocessedData } from '../types.ts';
import { extractSequenceVersion } from '../utils/extractSequenceVersion.ts';

export abstract class BackendClient {
    protected constructor(protected readonly backendUrl: string) {}

    public async submitReviewedSequence(username: string, data: UnprocessedData) {
        return this.call(`/submit-reviewed-sequence?username=${username}`, undefined, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });
    }

    public async getDataToReview(userName: string, sequenceId: number | string, version: number | string) {
        return this.call(`/get-data-to-review/${sequenceId}/${version}?username=${userName}`, sequenceReview, {
            method: 'GET',
            headers: {
                accept: 'application/json',
            },
        });
    }

    public async approveProcessedData(username: string, selectedSequences: SequenceVersion[]) {
        return this.call(`/approve-processed-data?username=${username}`, undefined, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sequenceVersions: selectedSequences.map(extractSequenceVersion),
            }),
        });
    }

    public async deleteSequences(userName: string, sequenceVersions: SequenceVersion[]) {
        return this.call(`/delete-sequences?username=${userName}`, undefined, {
            method: 'DELETE',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sequenceIds: sequenceVersions.map((sequence) => sequence.sequenceId),
            }),
        });
    }

    public async revokeSequences(userName: string, sequenceVersions: SequenceVersion[]) {
        return this.call(`/revoke-sequences?username=${userName}`, undefined, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sequenceIds: sequenceVersions.map((sequence) => sequence.sequenceId),
            }),
        });
    }

    public async confirmRevocation(userName: string, sequenceVersions: SequenceVersion[]) {
        return this.call(`/confirm-revocation?username=${userName}`, undefined, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                sequenceIds: sequenceVersions.map((sequence) => sequence.sequenceId),
            }),
        });
    }

    public async getSequencesOfUser(userName: string) {
        return this.call(`/get-sequences-of-user?username=${userName}`, z.array(sequenceStatus), {
            method: 'GET',
            headers: {
                accept: 'application/json',
            },
        });
    }

    private async call<T extends z.Schema | undefined>(
        endpoint: `/${string}`,
        zodSchema: T,
        options?: RequestInit,
    ): Promise<Result<T extends z.Schema<infer S> ? S : never, string>> {
        try {
            const response = await fetch(`${this.backendUrl}${endpoint}`, options);

            if (!response.ok) {
                await this.logError(`Failed to fetch with status ${response.status}`);
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
                await this.logError(`Parsing the response failed with error '${JSON.stringify(error)}'`);
                return err(`Parsing the response failed with error '${JSON.stringify(error)}'`);
            }
        } catch (error) {
            await this.logError(`Failed to fetch with error '${JSON.stringify(error)}'`);
            return err(`Failed to fetch with error '${JSON.stringify(error)}'`);
        }
    }

    protected abstract logError(message: string): Promise<void>;
}
