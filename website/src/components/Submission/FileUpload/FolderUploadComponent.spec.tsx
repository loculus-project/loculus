import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ok } from 'neverthrow';
import type { Result } from 'neverthrow';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FolderUploadComponent } from './FolderUploadComponent';
import * as multipartUpload from '../../../utils/multipartUpload';

const mockRequestMultipartUpload = vi.fn();
const mockCompleteMultipartUpload = vi.fn();

vi.mock('../../../services/backendClient', () => {
    return {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        BackendClient: class {
            requestMultipartUpload = mockRequestMultipartUpload;
            completeMultipartUpload = mockCompleteMultipartUpload;
        },
    };
});

// Only mock uploadPart (external HTTP calls), keep real implementations of pure functions
vi.mock('../../../utils/multipartUpload', async () => {
    const actual = await vi.importActual<typeof import('../../../utils/multipartUpload')>(
        '../../../utils/multipartUpload',
    );
    return {
        ...actual,
        uploadPart: vi.fn(),
    };
});

const mockSetFileMapping = vi.fn();
const mockOnError = vi.fn();

const defaultProps = {
    fileCategory: 'extraFiles',
    inputMode: 'bulk' as const,
    accessToken: 'test-token',
    clientConfig: { backendUrl: 'http://test-backend', lapisUrls: {} },
    groupId: 1,
    setFileMapping: mockSetFileMapping,
    onError: mockOnError,
};

describe('FolderUploadComponent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequestMultipartUpload.mockReturnValue(ok([]));
        mockCompleteMultipartUpload.mockReturnValue(ok(undefined));
        vi.mocked(multipartUpload.uploadPart).mockResolvedValue('"etag"');
    });

    it('renders upload folder button', () => {
        render(<FolderUploadComponent {...defaultProps} />);
        expect(screen.getByText('Upload folder')).toBeInTheDocument();
        expect(screen.getByTestId('folder-up-icon')).toBeInTheDocument();
    });

    it('displays files after selection', async () => {
        mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/submission1/test.txt', writable: false });

        await userEvent.upload(input, file);
        await waitFor(() => expect(screen.getByText('test.txt')).toBeInTheDocument());
    });

    it('shows progress during multipart upload', async () => {
        // 20 MB file will be split into 2 parts (10 MB each) by real calculatePartSizeAndCount
        mockRequestMultipartUpload.mockReturnValue(
            ok([{ fileId: 'file-1', urls: ['http://test.com/url1', 'http://test.com/url2'] }]),
        );
        mockCompleteMultipartUpload.mockReturnValue(new Promise(() => {}) as unknown as Result<void, never>);

        let uploadCount = 0;
        vi.mocked(multipartUpload.uploadPart).mockImplementation(async () => {
            uploadCount++;
            if (uploadCount === 1) {
                await new Promise((resolve) => setTimeout(resolve, 10));
            } else {
                await new Promise(() => {});
            }
            return '"etag"';
        });

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const file = new File(['x'.repeat(20_000_000)], 'large.txt', { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/submission1/large.txt', writable: false });

        await userEvent.upload(input, file);
        await waitFor(() => expect(screen.getByText('50%')).toBeInTheDocument(), { timeout: 3000 });
    });

    it('calls requestMultipartUpload with correct parameters', async () => {
        // 30 MB file will be split into 3 parts (10 MB each)
        mockRequestMultipartUpload.mockReturnValue(
            ok([
                {
                    fileId: 'file-1',
                    urls: ['http://test.com/url1', 'http://test.com/url2', 'http://test.com/url3'],
                },
            ]),
        );

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const file = new File(['x'.repeat(30_000_000)], 'large.txt', { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/submission1/large.txt', writable: false });

        await userEvent.upload(input, file);
        await waitFor(() => expect(mockRequestMultipartUpload).toHaveBeenCalledWith('test-token', 1, 1, 3));
    });

    it('calls completeMultipartUpload with ETags', async () => {
        // 20 MB file will be split into 2 parts
        mockRequestMultipartUpload.mockReturnValue(
            ok([{ fileId: 'file-1', urls: ['http://test.com/url1', 'http://test.com/url2'] }]),
        );
        vi.mocked(multipartUpload.uploadPart).mockResolvedValueOnce('"etag1"').mockResolvedValueOnce('"etag2"');

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const file = new File(['x'.repeat(20_000_000)], 'test.txt', { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/submission1/test.txt', writable: false });

        await userEvent.upload(input, file);
        await waitFor(() => {
            expect(mockCompleteMultipartUpload).toHaveBeenCalledWith('test-token', [
                { fileId: 'file-1', etags: ['"etag1"', '"etag2"'] },
            ]);
        });
    });

    it('shows success state after upload completes', async () => {
        mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const file = new File(['content'], 'test.txt', { type: 'text/plain' });
        Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/submission1/test.txt', writable: false });

        await userEvent.upload(input, file);
        await waitFor(() => expect(screen.getByText('✓')).toBeInTheDocument());
    });

    it('filters out dot files', async () => {
        mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

        render(<FolderUploadComponent {...defaultProps} />);

        const input = screen.getByTestId('extraFiles');
        const validFile = new File(['content'], 'test.txt', { type: 'text/plain' });
        const dotFile = new File(['content'], '.DS_Store', { type: 'text/plain' });

        Object.defineProperty(validFile, 'webkitRelativePath', {
            value: 'folder/submission1/test.txt',
            writable: false,
        });
        Object.defineProperty(dotFile, 'webkitRelativePath', {
            value: 'folder/submission1/.DS_Store',
            writable: false,
        });

        await userEvent.upload(input, [validFile, dotFile]);
        await waitFor(() => {
            expect(screen.getByText('test.txt')).toBeInTheDocument();
            expect(screen.queryByText('.DS_Store')).not.toBeInTheDocument();
        });
    });
});
