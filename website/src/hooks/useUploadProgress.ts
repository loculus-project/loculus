import { useRef, useState, useCallback } from 'react';

export interface OverallProgress {
    totalFiles: number;
    uploadedFiles: number;
    totalBytes: number;
    uploadedBytes: number;
}

export function useUploadProgress() {
    const fileProgressRef = useRef<Record<string, number>>({});
    const [overallProgress, setOverallProgress] = useState<OverallProgress | null>(null);

    const initializeProgress = useCallback((totalFiles: number, totalBytes: number) => {
        fileProgressRef.current = {};
        setOverallProgress({
            totalFiles,
            uploadedFiles: 0,
            totalBytes,
            uploadedBytes: 0,
        });
    }, []);

    const updateFileProgress = useCallback((fileId: string, uploadedBytes: number) => {
        fileProgressRef.current[fileId] = uploadedBytes;

        setOverallProgress((prev) => {
            if (!prev) return null;

            const totalUploadedBytes = Object.values(fileProgressRef.current).reduce((sum, bytes) => sum + bytes, 0);

            return {
                ...prev,
                uploadedBytes: totalUploadedBytes,
            };
        });
    }, []);

    const markFileCompleted = useCallback((fileId: string, fileSize: number) => {
        fileProgressRef.current[fileId] = fileSize;

        setOverallProgress((prev) => {
            if (!prev) return null;

            const totalUploadedBytes = Object.values(fileProgressRef.current).reduce((sum, bytes) => sum + bytes, 0);

            return {
                ...prev,
                uploadedFiles: prev.uploadedFiles + 1,
                uploadedBytes: totalUploadedBytes,
            };
        });
    }, []);

    const resetProgress = useCallback(() => {
        fileProgressRef.current = {};
        setOverallProgress(null);
    }, []);

    return {
        overallProgress,
        initializeProgress,
        updateFileProgress,
        markFileCompleted,
        resetProgress,
    };
}
