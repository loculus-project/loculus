import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { err, ok } from 'neverthrow';
import { useEffect, useState, type ComponentProps } from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { FolderUploadComponent } from './FolderUploadComponent';
import { type FileMapping } from './fileMapping';
import { deriveFileMapping, type FileUploadState } from './fileUpload';
import * as multipartUpload from '../../../utils/multipartUpload';

const mockRequestMultipartUpload = vi.fn();
const mockCompleteMultipartUpload = vi.fn();
const mockOnError = vi.fn();

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

const FolderUploadComponentWithState = ({
    initialState,
    otherCategories,
    onMapping,
    ...props
}: Omit<ComponentProps<typeof FolderUploadComponent>, 'fileUploadState' | 'setFileUploadState'> & {
    initialState?: FileUploadState;
    otherCategories?: Map<string, FileUploadState>;
    onMapping?: (mapping: FileMapping | undefined) => void;
}) => {
    const [fileUploadState, setFileUploadState] = useState(initialState);
    // Stands in for the parent, which derives the mapping from the states of all its categories.
    const states = new Map(otherCategories);
    if (fileUploadState !== undefined) states.set(props.fileCategory.name, fileUploadState);
    const mapping = deriveFileMapping(states);
    useEffect(() => onMapping?.(mapping), [mapping, onMapping]);
    return (
        <FolderUploadComponent {...props} fileUploadState={fileUploadState} setFileUploadState={setFileUploadState} />
    );
};

const defaultProps = {
    fileCategory: {
        name: 'extraFiles',
        displayName: 'Extra Files',
    },
    inputMode: 'bulk' as const,
    accessToken: 'test-token',
    clientConfig: { backendUrl: 'http://test-backend', lapisUrls: {} },
    groupId: 1,
    onError: mockOnError,
};

const previousUploadsState = (files: { fileId: string; path: string }[]): FileUploadState => ({
    type: 'uploadCompleted',
    files: files.map(({ fileId, path }) => ({ type: 'previousUpload', fileId, path })),
});

const previousUploads = [
    { fileId: 'file-1', path: 'file-a.txt' },
    { fileId: 'file-2', path: 'file-b.txt' },
];

const defaultPropsWithFiles = {
    ...defaultProps,
    inputMode: 'form' as const,
    initialState: previousUploadsState(previousUploads),
};

// The mapping is keyed by category, then by file path, to its file ID.
const mappingOf = (files: [path: string, fileId: string][]) => new Map([['extraFiles', new Map(files)]]);

describe('FolderUploadComponent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockRequestMultipartUpload.mockReturnValue(ok([]));
        mockCompleteMultipartUpload.mockReturnValue(ok(undefined));
        vi.mocked(multipartUpload.uploadPart).mockResolvedValue('"etag"');
    });

    describe('folder upload', () => {
        it('renders upload folder button', () => {
            render(<FolderUploadComponentWithState {...defaultProps} />);
            expect(screen.getByText('Upload folder')).toBeInTheDocument();
            expect(screen.getByTestId('folder-up-icon')).toBeInTheDocument();
        });

        it('renders upload folder button when there is no upload state for the category', () => {
            render(<FolderUploadComponentWithState {...defaultProps} inputMode='form' />);

            expect(screen.getByText('Upload folder')).toBeInTheDocument();
            expect(screen.getByTestId('extraFiles')).toBeInTheDocument();
            expect(screen.queryByTestId('discard_extraFiles')).not.toBeInTheDocument();
        });

        it('displays files after selection', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/test.txt',
                writable: false,
            });

            await userEvent.upload(input, file);
            await waitFor(() => expect(screen.getByTitle('submission1/test.txt')).toBeInTheDocument());
        });

        it('shows progress during multipart upload', async () => {
            // 20 MB file will be split into 2 parts (10 MB each) by real calculatePartSizeAndCount
            mockRequestMultipartUpload.mockReturnValue(
                ok([{ fileId: 'file-1', urls: ['http://test.com/url1', 'http://test.com/url2'] }]),
            );
            mockCompleteMultipartUpload.mockReturnValue(new Promise(() => {}));

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

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['x'.repeat(20_000_000)], 'large.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/large.txt',
                writable: false,
            });

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

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['x'.repeat(30_000_000)], 'large.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/large.txt',
                writable: false,
            });

            await userEvent.upload(input, file);
            await waitFor(() => expect(mockRequestMultipartUpload).toHaveBeenCalledWith('test-token', 1, 1, 3));
        });

        it('calls completeMultipartUpload with ETags', async () => {
            // 20 MB file will be split into 2 parts
            mockRequestMultipartUpload.mockReturnValue(
                ok([{ fileId: 'file-1', urls: ['http://test.com/url1', 'http://test.com/url2'] }]),
            );
            vi.mocked(multipartUpload.uploadPart).mockResolvedValueOnce('"etag1"').mockResolvedValueOnce('"etag2"');

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['x'.repeat(20_000_000)], 'test.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/test.txt',
                writable: false,
            });

            await userEvent.upload(input, file);
            await waitFor(() => {
                expect(mockCompleteMultipartUpload).toHaveBeenCalledWith('test-token', [
                    { fileId: 'file-1', etags: ['"etag1"', '"etag2"'] },
                ]);
            });
        });

        it('shows success state after upload completes', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/test.txt',
                writable: false,
            });

            await userEvent.upload(input, file);
            await waitFor(() => expect(screen.getByText('✓')).toBeInTheDocument());
        });

        it('filters out dot files', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]));

            render(<FolderUploadComponentWithState {...defaultProps} />);

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

    describe('rejects whitespace', () => {
        it('rejects a folder upload containing a file name with whitespace', async () => {
            render(<FolderUploadComponentWithState {...defaultProps} />);

            const file = new File(['content'], 'my reads.fastq', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission1/my reads.fastq',
                writable: false,
            });

            await userEvent.upload(screen.getByTestId('extraFiles'), file);

            expect(mockOnError).toHaveBeenCalledWith('File names cannot contain whitespace.');
            expect(mockRequestMultipartUpload).not.toHaveBeenCalled();
        });

        it('rejects a folder upload containing a folder name with whitespace', async () => {
            render(<FolderUploadComponentWithState {...defaultProps} />);

            const file = new File(['content'], 'reads.fastq', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', {
                value: 'folder/submission 1/reads.fastq',
                writable: false,
            });

            await userEvent.upload(screen.getByTestId('extraFiles'), file);

            expect(mockOnError).toHaveBeenCalledWith('Folder names cannot contain whitespace.');
            expect(mockRequestMultipartUpload).not.toHaveBeenCalled();
        });

        it('rejects individually selected files with whitespace in their names', async () => {
            render(<FolderUploadComponentWithState {...defaultProps} />);

            const file = new File(['content'], 'my reads.fastq', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });

            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);

            expect(mockOnError).toHaveBeenCalledWith('File names cannot contain whitespace.');
            expect(mockRequestMultipartUpload).not.toHaveBeenCalled();
        });
    });

    describe('previous uploads', () => {
        it('renders previous uploads with an "uploaded" label', () => {
            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            expect(screen.getByText('file-a.txt')).toBeInTheDocument();
            expect(screen.getByText('file-b.txt')).toBeInTheDocument();
            expect(screen.getAllByText('(uploaded)')).toHaveLength(2);
        });
    });

    describe('discarding individual files', () => {
        it('files can be discarded and removed from the file mapping', async () => {
            const onMapping = vi.fn();
            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} onMapping={onMapping} />);

            await userEvent.click(screen.getByTestId('discard_extraFiles_file-a.txt'));
            await waitFor(() => expect(screen.queryByText('file-a.txt')).not.toBeInTheDocument());
            expect(screen.getByText('file-b.txt')).toBeInTheDocument();

            expect(onMapping).toHaveBeenLastCalledWith(mappingOf([['file-b.txt', 'file-2']]));
        });

        it('files are discarded by path, not by name', async () => {
            mockRequestMultipartUpload
                .mockReturnValueOnce(ok([{ fileId: 'file-1', urls: ['http://test.com/url1'] }]))
                .mockReturnValueOnce(ok([{ fileId: 'file-2', urls: ['http://test.com/url2'] }]));

            const onMapping = vi.fn();
            render(<FolderUploadComponentWithState {...defaultProps} onMapping={onMapping} />);

            const firstFile = new File(['content'], 'a.txt', { type: 'text/plain' });
            Object.defineProperty(firstFile, 'webkitRelativePath', { value: 'folder/sub1/a.txt', writable: false });
            const secondFile = new File(['content'], 'a.txt', { type: 'text/plain' });
            Object.defineProperty(secondFile, 'webkitRelativePath', { value: 'folder/sub2/a.txt', writable: false });

            await userEvent.upload(screen.getByTestId('extraFiles'), [firstFile, secondFile]);
            await waitFor(() => expect(screen.getAllByText('✓')).toHaveLength(2));

            await userEvent.click(screen.getByTestId('discard_extraFiles_sub1/a.txt'));

            await waitFor(() => expect(screen.getAllByText('a.txt')).toHaveLength(1));
            expect(screen.getByText('sub2 /')).toBeInTheDocument();
            expect(screen.queryByText('sub1 /')).not.toBeInTheDocument();
            expect(onMapping).toHaveBeenLastCalledWith(mappingOf([['sub2/a.txt', 'file-2']]));
        });

        it('reverts to the upload folder prompt and clears the file mapping after discarding the last upload', async () => {
            const singleFile = { fileId: 'file-1', path: 'file-a.txt' };
            const onMapping = vi.fn();
            render(
                <FolderUploadComponentWithState
                    {...defaultPropsWithFiles}
                    initialState={previousUploadsState([singleFile])}
                    onMapping={onMapping}
                />,
            );

            await userEvent.click(screen.getByTestId('discard_extraFiles_file-a.txt'));
            await waitFor(() => expect(screen.getByText('Upload folder')).toBeInTheDocument());
            expect(screen.queryByText('file-a.txt')).not.toBeInTheDocument();
            expect(onMapping).toHaveBeenLastCalledWith(undefined);
        });

        it('disables the individual discard buttons while an upload is in progress', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'added-id', urls: ['http://test.com/url1'] }]));
            // Keep the upload pending so the component stays in the uploadInProgress state.
            vi.mocked(multipartUpload.uploadPart).mockReturnValue(new Promise(() => {}));

            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            const file = new File(['content'], 'added.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });
            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);
            await waitFor(() => expect(screen.getByTestId('discard_extraFiles_file-a.txt')).toBeDisabled());
        });
    });

    describe('adding additional files', () => {
        it('keeps existing files when adding additional ones', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'added-id', urls: ['http://test.com/url1'] }]));

            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            const file = new File(['content'], 'added.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });

            const input = screen.getByTestId<HTMLInputElement>('add_extraFiles');
            await userEvent.upload(input, file);

            await waitFor(() => expect(screen.getByText('added.txt')).toBeInTheDocument());
            expect(screen.getByText('file-a.txt')).toBeInTheDocument();
            expect(screen.getByText('file-b.txt')).toBeInTheDocument();

            // The input is cleared so that selecting the same file again still fires onChange.
            expect(input.value).toBe('');
        });

        it('confirms before overwriting an existing file with the same name', async () => {
            mockRequestMultipartUpload.mockReturnValue(
                ok([{ fileId: 'replacement-id', urls: ['http://test.com/url1'] }]),
            );

            const onMapping = vi.fn();
            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} onMapping={onMapping} />);

            const file = new File(['content'], 'file-a.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });
            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);

            await waitFor(() => expect(screen.getByText(/already exist and will be replaced/)).toBeInTheDocument());
            // Nothing is uploaded until the user confirms the overwrite.
            expect(mockRequestMultipartUpload).not.toHaveBeenCalled();

            await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

            // The replaced entry is a fresh upload, so it reports a size rather than the 'uploaded'
            // label carried by the untouched previous upload.
            await waitFor(() => expect(screen.getByText('(7 B)')).toBeInTheDocument());
            expect(screen.getAllByText('file-a.txt')).toHaveLength(1);
            expect(screen.getAllByText('(uploaded)')).toHaveLength(1);

            expect(onMapping).toHaveBeenLastCalledWith(
                mappingOf([
                    ['file-b.txt', 'file-2'],
                    ['file-a.txt', 'replacement-id'],
                ]),
            );
        });

        it('stops reporting a replaced file as uploaded as soon as the replacement is confirmed', async () => {
            let deliverUploadUrls = () => {};
            mockRequestMultipartUpload.mockReturnValue(
                new Promise((resolve) => {
                    deliverUploadUrls = () =>
                        resolve(ok([{ fileId: 'replacement-id', urls: ['http://test.com/url1'] }]));
                }),
            );

            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            const file = new File(['content'], 'file-a.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });
            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);
            await waitFor(() => expect(screen.getByText(/already exist and will be replaced/)).toBeInTheDocument());
            await userEvent.click(screen.getByRole('button', { name: 'Replace' }));

            // The request for upload urls is still in flight, so nothing has been uploaded yet: the
            // replaced entry must stop claiming the previous upload it is about to replace, while
            // the untouched entry keeps its own.
            await waitFor(() => expect(screen.getByTestId('status_extraFiles_file-a.txt')).not.toHaveTextContent('✓'));
            expect(screen.getByTestId('status_extraFiles_file-b.txt')).toHaveTextContent('✓');

            deliverUploadUrls();
            await waitFor(() => expect(screen.getByTestId('status_extraFiles_file-a.txt')).toHaveTextContent('✓'));
        });

        it('leaves the existing files alone when the overwrite is cancelled', async () => {
            mockRequestMultipartUpload.mockReturnValue(
                ok([{ fileId: 'replacement-id', urls: ['http://test.com/url1'] }]),
            );

            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            const file = new File(['content'], 'file-a.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });
            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);

            await waitFor(() => expect(screen.getByText(/already exist and will be replaced/)).toBeInTheDocument());
            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            await waitFor(() =>
                expect(screen.queryByText(/already exist and will be replaced/)).not.toBeInTheDocument(),
            );

            expect(mockRequestMultipartUpload).not.toHaveBeenCalled();
            expect(screen.getAllByText('file-a.txt')).toHaveLength(1);
            expect(screen.getAllByText('(uploaded)')).toHaveLength(2);
        });

        it('disables the additional files button while an upload is in progress', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'added-id', urls: ['http://test.com/url1'] }]));
            // Keep the upload pending so the component stays in the uploadInProgress state.
            vi.mocked(multipartUpload.uploadPart).mockReturnValue(new Promise(() => {}));

            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            const file = new File(['content'], 'added.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: '', writable: false });
            await userEvent.upload(screen.getByTestId('add_extraFiles'), file);
            await waitFor(() => expect(screen.getByTestId('add_button_extraFiles')).toBeDisabled());
        });
    });

    describe('discarding all files', () => {
        it('shows a dialog before discarding all files and discards after confirmation', async () => {
            const onMapping = vi.fn();
            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} onMapping={onMapping} />);

            await userEvent.click(screen.getByTestId('discard_extraFiles'));
            await waitFor(() => expect(screen.getByText(/are you sure you want to discard/i)).toBeInTheDocument());

            await userEvent.click(screen.getByRole('button', { name: /^Discard$/ }));
            await waitFor(() => expect(screen.getByText('Upload folder')).toBeInTheDocument());
            expect(onMapping).toHaveBeenLastCalledWith(undefined);
        });

        it('removes only its own category when the file mapping holds several', async () => {
            const otherCategoryFiles = new Map([['other-file.txt', 'file-3']]);
            const onMapping = vi.fn();
            render(
                <FolderUploadComponentWithState
                    {...defaultPropsWithFiles}
                    otherCategories={
                        new Map([
                            [
                                'otherFiles',
                                {
                                    type: 'uploadCompleted',
                                    files: [{ type: 'previousUpload', fileId: 'file-3', path: 'other-file.txt' }],
                                } satisfies FileUploadState,
                            ],
                        ])
                    }
                    onMapping={onMapping}
                />,
            );

            await userEvent.click(screen.getByTestId('discard_extraFiles'));
            await userEvent.click(screen.getByRole('button', { name: /^Discard$/ }));
            await waitFor(() => expect(screen.getByText('Upload folder')).toBeInTheDocument());

            expect(onMapping).toHaveBeenLastCalledWith(new Map([['otherFiles', otherCategoryFiles]]));
        });

        it('keeps the files when discarding all files is cancelled', async () => {
            render(<FolderUploadComponentWithState {...defaultPropsWithFiles} />);

            await userEvent.click(screen.getByTestId('discard_extraFiles'));
            await waitFor(() => expect(screen.getByText(/are you sure you want to discard/i)).toBeInTheDocument());

            await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
            await waitFor(() =>
                expect(screen.queryByText(/are you sure you want to discard/i)).not.toBeInTheDocument(),
            );
            expect(screen.getByText('file-a.txt')).toBeInTheDocument();
            expect(screen.getByText('file-b.txt')).toBeInTheDocument();
        });

        it('discard all files is not disabled during upload or file upload failure', async () => {
            mockRequestMultipartUpload.mockReturnValue(ok([{ fileId: 'failed-id', urls: ['http://test.com/url1'] }]));
            mockCompleteMultipartUpload.mockReturnValue(err({ detail: 'Could not complete upload' }));

            render(<FolderUploadComponentWithState {...defaultProps} />);

            const input = screen.getByTestId('extraFiles');
            const file = new File(['content'], 'test.txt', { type: 'text/plain' });
            Object.defineProperty(file, 'webkitRelativePath', { value: 'folder/test.txt', writable: false });

            await userEvent.upload(input, file);
            await waitFor(() => expect(screen.getByText('✗')).toBeInTheDocument());
            expect(defaultProps.onError).toHaveBeenCalledWith(expect.stringContaining('Could not complete upload'));

            // A failed file never reaches 'uploaded', so the component stays in the in-progress state
            // and only the discard-all button remains usable.
            expect(screen.getByTestId('add_button_extraFiles')).toBeDisabled();
            expect(screen.getByTestId('discard_extraFiles_test.txt')).toBeDisabled();
            expect(screen.getByTestId('discard_extraFiles')).toBeEnabled();

            await userEvent.click(screen.getByTestId('discard_extraFiles'));
            await waitFor(() => expect(screen.getByText(/are you sure you want to discard/i)).toBeInTheDocument());
            await userEvent.click(screen.getByRole('button', { name: /^Discard$/ }));
            await waitFor(() => expect(screen.getByText('Upload folder')).toBeInTheDocument());
        });
    });
});
