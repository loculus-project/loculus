import type { Config } from '../../types.ts';

export const revokeReadyData = async (sequenceIds: number[], config: Config): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`${config.backendUrl}/revoke`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response as unknown as { approved: number };
};

export const confirmRevokedData = async (sequenceIds: number[], config: Config): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`${config.backendUrl}/confirm-revocation`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body,
    });

    if (!response.ok) {
        throw new Error(`Unexpected response: ${response.statusText}`);
    }
    return response as unknown as { approved: number };
};
