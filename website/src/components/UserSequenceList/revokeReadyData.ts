export const revokeReadyData = async (sequenceIds: number[]): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`http://localhost:8079/revoke`, {
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

export const confirmRevokedData = async (sequenceIds: number[]): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`http://localhost:8079/confirm-revocation`, {
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

export const reviseData = async (sequenceIds: number[]): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`http://localhost:8079/revise`, {
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
