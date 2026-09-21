import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ExtraFilesUpload } from './DataUploadForm';

const defaultProps = {
    accessToken: 'test-token',
    clientConfig: { backendUrl: 'http://test-backend', lapisUrls: {} },
    inputMode: 'form' as const,
    groupId: 1,
    fileUploadStates: new Map(),
    setFileUploadStates: vi.fn(),
    onError: vi.fn(),
    fileSharingConfig: { disableStrictFilenameValidation: false },
};

describe('ExtraFilesUpload', () => {
    it('uses a single file category as the section heading without repeating it', () => {
        render(
            <ExtraFilesUpload
                {...defaultProps}
                fileCategories={[{ name: 'images', displayName: 'Microscopy images' }]}
            />,
        );

        expect(screen.getByRole('heading', { level: 2, name: 'Microscopy images' })).toBeInTheDocument();
        expect(screen.queryByRole('heading', { level: 3, name: 'Microscopy images' })).not.toBeInTheDocument();
        expect(screen.queryByRole('heading', { name: 'Extra files' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'microscopy images documentation' })).toBeInTheDocument();
    });

    it('names the metadata column in the guidance for a single file category', () => {
        render(
            <ExtraFilesUpload
                {...defaultProps}
                inputMode='bulk'
                fileCategories={[{ name: 'rawReads', displayName: 'Raw reads' }]}
            />,
        );

        expect(
            screen.getByText(/Each file must be referenced by its name in the rawReads column of your metadata\./),
        ).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'raw reads documentation' })).toBeInTheDocument();
    });

    it('keeps the section and category headings when there are multiple file categories', () => {
        render(
            <ExtraFilesUpload
                {...defaultProps}
                fileCategories={[
                    { name: 'images', displayName: 'Microscopy images' },
                    { name: 'documents', displayName: 'Supporting documents' },
                ]}
            />,
        );

        expect(screen.getByRole('heading', { level: 2, name: 'Extra files' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Microscopy images' })).toBeInTheDocument();
        expect(screen.getByRole('heading', { level: 3, name: 'Supporting documents' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'extra files documentation' })).toBeInTheDocument();
    });
});
