import type { SequenceVersion } from '../../types.ts';

export const approveProcessedData = async (
    username: string,
    sequenceVersions: SequenceVersion[],
): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceVersions,
    });
    const response = await fetch(`http://localhost:8079/approve-processed-data?username=${username}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText} - ${await response.text()}`);
    }
    return response as unknown as { approved: number };
};
