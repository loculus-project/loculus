import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadComponent } from './FileUploadComponent';
import { PLAIN_SEGMENT_KIND, VirtualFile } from './fileProcessing';
import { toast } from 'react-toastify';

const mockSetFile = vi.fn();
vi.mock('react-toastify', () => ({
    toast: {
        error: vi.fn(),
    },
}));

describe('FileUploadComponent', () => {
    it('renders upload button and allows file selection', async () => {
        render(
            <FileUploadComponent
                setFile={mockSetFile}
                name='testFile'
                ariaLabel='Upload test file'
                fileKind={PLAIN_SEGMENT_KIND}
            />,
        );

        const uploadButton = screen.getByText(/Upload/);
        expect(uploadButton).toBeInTheDocument();

        const fileInput = screen.getByTestId('testFile');
        const file = new File(['file content'], 'test.txt', { type: 'text/plain' });

        await userEvent.upload(fileInput, file);

        expect(mockSetFile).toHaveBeenCalled();
    });

    it('resets file to `undefined` when undo button is clicked after a file was selected', async () => {
        render(
            <FileUploadComponent
                setFile={mockSetFile}
                name='testFile'
                ariaLabel='Upload test file'
                fileKind={PLAIN_SEGMENT_KIND}
                showUndo={true}
            />,
        );

        const uploadButton = screen.getByText(/Upload/);
        expect(uploadButton).toBeInTheDocument();

        const fileInput = screen.getByTestId('testFile');
        const file = new File(['file content'], 'test.txt', { type: 'text/plain' });

        await userEvent.upload(fileInput, file);

        expect(mockSetFile).toHaveBeenCalled();
        const undoButton = screen.getByTestId('undo_testFile');
        expect(undoButton).toBeInTheDocument();

        await userEvent.click(undoButton);

        expect(mockSetFile).lastCalledWith(undefined);
    });

    it('displays the uploaded file name and allows discarding and undoing discard', async () => {
        const initialFile = new VirtualFile('content', 'initial.txt');
        render(
            <FileUploadComponent
                setFile={mockSetFile}
                name='test'
                ariaLabel='Upload test file'
                fileKind={PLAIN_SEGMENT_KIND}
                initialValue={initialFile}
                showUndo={true}
            />,
        );

        expect(screen.getByText('initial.txt')).toBeInTheDocument();
        expect(screen.queryByTestId('undo_test')).not.toBeInTheDocument();

        const discardButton = screen.getByTestId('discard_test');
        await userEvent.click(discardButton);

        expect(mockSetFile).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText('initial.txt')).not.toBeInTheDocument();
        mockSetFile.mockReset();

        const undoButton = screen.getByTestId('undo_test');
        await userEvent.click(undoButton);

        expect(mockSetFile).toHaveBeenCalledWith(initialFile);
        expect(screen.getByText('initial.txt')).toBeInTheDocument();

        expect(screen.queryByTestId('undo_test')).not.toBeInTheDocument();
    });

    it('does not show undo button if it is disabled', async () => {
        const initialFile = new VirtualFile('content', 'initial.txt');
        render(
            <FileUploadComponent
                setFile={mockSetFile}
                name='test'
                ariaLabel='Upload test file'
                fileKind={PLAIN_SEGMENT_KIND}
                initialValue={initialFile}
                showUndo={false}
            />,
        );

        expect(screen.getByText('initial.txt')).toBeInTheDocument();
        expect(screen.queryByTestId('undo_test')).not.toBeInTheDocument();

        const discardButton = screen.getByTestId('discard_test');
        await userEvent.click(discardButton);

        expect(mockSetFile).toHaveBeenCalledWith(undefined);
        expect(screen.queryByText('initial.txt')).not.toBeInTheDocument();
        expect(screen.queryByTestId('undo_test')).not.toBeInTheDocument();
    });

    it('shows error and resets input if submitted file is not valid', async () => {
        render(
            <FileUploadComponent
                setFile={mockSetFile}
                name='testFile'
                ariaLabel='Upload test file'
                fileKind={PLAIN_SEGMENT_KIND}
                initialValue={undefined}
                showUndo={false}
            />,
        );

        const fileInput = screen.getByTestId('testFile');
        const erroneousFile = new File(['>seg1\n>seg2\nATCG'], 'error.txt');
        await userEvent.upload(fileInput, erroneousFile);

        expect(toast.error).toHaveBeenCalledOnce();
        expect(toast.error).toHaveBeenCalledWith(
            "Found 2 headers in uploaded file, only a single header is allowed.",
            { "autoClose": false }
        );
        expect(fileInput).toHaveValue('');  // input resets path
        expect(screen.queryByText('error.txt')).not.toBeInTheDocument();
    });
});
