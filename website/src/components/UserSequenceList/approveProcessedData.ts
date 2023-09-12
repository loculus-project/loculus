export const approveProcessedData = async (username: string, sequenceIds: number[]): Promise<{ approved: number }> => {
    const body = JSON.stringify({
        sequenceIds,
    });
    const response = await fetch(`http://localhost:8079/approve-processed-data?username=${username}`, {
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
