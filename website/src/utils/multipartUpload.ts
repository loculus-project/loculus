const TARGET_PART_SIZE_BYTES = 10 * 1024 * 1024; // Needs to be larger than 5 MB (minimum by S3)
const MAX_PARTS = 10000; // Defined by S3

export const calculatePartSizeAndCount = (fileSize: number): { partSize: number; partCount: number } => {
    let partSize = TARGET_PART_SIZE_BYTES;
    let partCount = Math.ceil(fileSize / partSize);

    // If we exceed max parts, increase part size
    if (partCount > MAX_PARTS) {
        partSize = Math.ceil(fileSize / MAX_PARTS);
        partCount = MAX_PARTS;
    }

    return { partSize, partCount };
};

export const splitFileIntoParts = (file: File, partSize: number): Blob[] => {
    const parts: Blob[] = [];
    let offset = 0;
    while (offset < file.size) {
        const end = Math.min(offset + partSize, file.size);
        parts.push(file.slice(offset, end));
        offset = end;
    }
    return parts;
};

/**
 * @returns ETag
 */
export async function uploadPart(presignedUrl: string, part: Blob): Promise<string> {
    const response = await fetch(presignedUrl, {
        method: 'PUT',
        body: part,
    });
    if (!response.ok) {
        throw new Error(
            `Failed to upload part to ${presignedUrl}: response status ${response.status}: ${response.statusText}`,
        );
    }
    const etag = response.headers.get('ETag');
    if (!etag) {
        throw new Error(`Failed to upload part to ${presignedUrl}: ETag header missing from upload response`);
    }
    return etag;
}
