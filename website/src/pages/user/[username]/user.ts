import { getConfig } from '../../../config';

export type SequenceStatus = {
    status: string;
    sequenceId: number;
};
export const getUserSequences = async (name: string): Promise<SequenceStatus[]> => {
    const config = getConfig();

    const mySequencesQuery = `${config.backendUrl}/list-my-sequences?username=${name}`;

    const headers = {
        'Content-Type': 'application/json',
    };

    try {
        const mySequencesResponse = await fetch(mySequencesQuery, {
            method: 'GET',
            headers,
        });

        if (!mySequencesResponse.ok) {
            return [];
        }

        return (await mySequencesResponse.json()) ?? [];
    } catch {
        return [];
    }
};
