import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FileUploadComponent } from './FileUploadComponent';
import { PLAIN_SEGMENT_KIND, VirtualFile } from './fileProcessing';

const mockSetFile = vi.fn();

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
});
