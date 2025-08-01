import axios, { isCancel } from 'axios';

import { BackendClient } from '../services/backendClient';
import type { Group } from '../types/backend';
import type { ClientConfig } from '../types/runtimeConfig';

export const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB chunks

export interface UploadProgress {
    fileId: string;
    fileName: string;
    totalBytes: number;
    uploadedBytes: number;
    percentage: number;
    speed: number; // bytes per second
    remainingTime: number; // seconds
    status: 'pending' | 'uploading' | 'completed' | 'error';
    error?: string;
}

export interface MultipartUploadOptions {
    file: File;
    fileId: string;
    urls: string[];
    onProgress?: (progress: UploadProgress) => void;
    onPartComplete?: (partNumber: number, etag: string) => void;
    abortSignal?: AbortSignal;
}

export interface PartUploadResult {
    partNumber: number;
    etag: string;
}

/**
 * Calculates the number of parts needed for a file
 */
export function calculateNumberOfParts(fileSize: number, chunkSize: number = CHUNK_SIZE): number {
    return Math.ceil(fileSize / chunkSize);
}

/**
 * Uploads a single part of a file
 */
async function uploadPart(
    file: File,
    url: string,
    partNumber: number,
    start: number,
    end: number,
    abortSignal?: AbortSignal,
): Promise<string> {
    const chunk = file.slice(start, end);

    const response = await axios.put(url, chunk, {
        headers: {
            // eslint-disable-next-line @typescript-eslint/naming-convention
            'Content-Type': file.type || 'application/octet-stream',
        },
        signal: abortSignal,
    });

    const etag = response.headers.etag as string | undefined;
    if (!etag) {
        throw new Error(`No ETag received for part ${partNumber}`);
    }

    return etag;
}

/**
 * Uploads a file using multipart upload with progress tracking
 */
export async function uploadFileMultipart(options: MultipartUploadOptions): Promise<PartUploadResult[]> {
    const { file, fileId, urls, onProgress, onPartComplete, abortSignal } = options;

    const totalParts = urls.length;
    const actualPartsNeeded = calculateNumberOfParts(file.size);
    const partsToUpload = Math.min(totalParts, actualPartsNeeded);

    const results: PartUploadResult[] = [];
    let uploadedBytes = 0;
    const startTime = Date.now();

    const updateProgress = (bytesUploaded: number) => {
        uploadedBytes += bytesUploaded;
        const elapsedTime = (Date.now() - startTime) / 1000; // seconds
        const speed = uploadedBytes / elapsedTime;
        const remainingBytes = file.size - uploadedBytes;
        const remainingTime = remainingBytes / speed;

        onProgress?.({
            fileId,
            fileName: file.name,
            totalBytes: file.size,
            uploadedBytes,
            percentage: Math.round((uploadedBytes / file.size) * 100),
            speed,
            remainingTime,
            status: 'uploading',
        });
    };

    try {
        // Upload parts sequentially to maintain order
        for (let partNumber = 1; partNumber <= partsToUpload; partNumber++) {
            const start = (partNumber - 1) * CHUNK_SIZE;
            const end = Math.min(partNumber * CHUNK_SIZE, file.size);
            const partSize = end - start;

            const etag = await uploadPart(file, urls[partNumber - 1], partNumber, start, end, abortSignal);

            results.push({ partNumber, etag });
            updateProgress(partSize);
            onPartComplete?.(partNumber, etag);
        }

        // Final progress update
        onProgress?.({
            fileId,
            fileName: file.name,
            totalBytes: file.size,
            uploadedBytes: file.size,
            percentage: 100,
            speed: file.size / ((Date.now() - startTime) / 1000),
            remainingTime: 0,
            status: 'completed',
        });

        return results;
    } catch (error) {
        // Check if this is an abort error
        if (isCancel(error)) {
            onProgress?.({
                fileId,
                fileName: file.name,
                totalBytes: file.size,
                uploadedBytes,
                percentage: Math.round((uploadedBytes / file.size) * 100),
                speed: 0,
                remainingTime: 0,
                status: 'error',
                error: 'Upload cancelled',
            });
            throw new Error('Upload cancelled');
        }

        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        onProgress?.({
            fileId,
            fileName: file.name,
            totalBytes: file.size,
            uploadedBytes,
            percentage: Math.round((uploadedBytes / file.size) * 100),
            speed: 0,
            remainingTime: 0,
            status: 'error',
            error: errorMessage,
        });

        throw error;
    }
}

/**
 * Uploads a file using multipart upload - handles everything from requesting URLs to completion
 */
export async function uploadFile(
    file: File,
    accessToken: string,
    clientConfig: ClientConfig,
    group: Group,
    onProgress?: (progress: UploadProgress) => void,
    abortSignal?: AbortSignal,
): Promise<{ fileId: string }> {
    const backendClient = new BackendClient(clientConfig.backendUrl);

    // Request multipart upload URLs
    const numberOfParts = calculateNumberOfParts(file.size);
    const multipartResult = await backendClient.requestMultipartUpload(accessToken, group.groupId, 1, numberOfParts);

    let fileId: string;
    let urls: string[];

    multipartResult.match(
        (responses) => {
            const response = responses[0];
            fileId = response.fileId;
            urls = response.urls;
        },
        (error) => {
            throw new Error(`Failed to prepare upload: ${error.detail || error.title || 'Unknown error'}`);
        },
    );

    // Upload the file parts
    const results = await uploadFileMultipart({
        file,
        fileId: fileId!,
        urls: urls!,
        onProgress,
        abortSignal,
    });

    const etags = results.map((r) => r.etag);

    // Complete the multipart upload for this file
    const completeResult = await backendClient.completeMultipartUpload(accessToken, [{ fileId: fileId!, etags }]);

    completeResult.match(
        () => {
            // Success - upload completed
        },
        (error) => {
            throw new Error(`Failed to complete upload: ${error.detail || error.title || 'Unknown error'}`);
        },
    );

    return { fileId: fileId! };
}

/**
 * Formats bytes to human readable format
 */
export function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Formats seconds to human readable time
 */
export function formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds <= 0) return '0s';

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${secs}s`;
    } else {
        return `${secs}s`;
    }
}
