import type { RuntimeConfig } from '../../types.ts';

export const revokeReadyData = async (
    sequenceIds: number[],
    runtimeConfig: RuntimeConfig,
): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`${runtimeConfig.backendUrl}/revoke`, {
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

export const confirmRevokedData = async (
    sequenceIds: number[],
    runtimeConfig: RuntimeConfig,
): Promise<{
    approved: number;
}> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`${runtimeConfig.backendUrl}/confirm-revocation`, {
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
