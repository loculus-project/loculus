import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import { describe, expect, it, vi } from 'vitest';

import { ColumnMapping } from './ColumnMapping';
import { ColumnMappingModal } from './ColumnMappingModal';
import type { ProcessedFile } from './fileProcessing';
import type { InputField } from '../../../types/config';

vi.mock('react-toastify', () => ({
    toast: {
        error: vi.fn(),
    },
}));

describe('ColumnMappingModal', () => {
    const mockInputFile: ProcessedFile = {
        text: vi.fn().mockResolvedValue('Column1\tColumn2\tColumn3\nData1\tData2\tData3'),
    } as unknown as ProcessedFile;

    const mockGroupedInputFields = new Map<string, InputField[]>([
        ['Group1', [{ name: 'Field1', required: true, displayName: 'Field 1' }]],
        ['Group2', [{ name: 'Field2', required: false, displayName: 'Field 2' }]],
    ]);

    let mockColumnMapping: ColumnMapping | null = null;
    const mockSetColumnMapping = vi.fn();

    it('renders the modal and opens when the button is clicked', async () => {
        render(
            <ColumnMappingModal
                inputFile={mockInputFile}
                columnMapping={null}
                setColumnMapping={vi.fn()}
                groupedInputFields={mockGroupedInputFields}
            />,
        );

        const openButton = screen.getByText(/Add column mapping/i);
        await userEvent.click(openButton);

        expect(await screen.findByText(/Remap columns/i)).toBeInTheDocument();
    });

    it('loads and displays columns from the input file', async () => {
        render(
            <ColumnMappingModal
                inputFile={mockInputFile}
                columnMapping={null}
                setColumnMapping={vi.fn()}
                groupedInputFields={mockGroupedInputFields}
            />,
        );

        await userEvent.click(screen.getByText(/Add column mapping/i));

        // eslint-disable-next-line @typescript-eslint/unbound-method
        await waitFor(() => expect(mockInputFile.text).toHaveBeenCalled());
        expect(await screen.findByText(/Column in your file/i)).toBeInTheDocument();
        expect(await screen.findByText(/Column1/i)).toBeInTheDocument();
        expect(await screen.findByText(/Column2/i)).toBeInTheDocument();
        expect(await screen.findByText(/Column3/i)).toBeInTheDocument();
    });

    it('displays error if file header cannot be read', async () => {
        const mockErrorFile: ProcessedFile = {
            text: vi.fn().mockRejectedValue(new Error('File read error')),
        } as unknown as ProcessedFile;

        render(
            <ColumnMappingModal
                inputFile={mockErrorFile}
                columnMapping={null}
                setColumnMapping={vi.fn()}
                groupedInputFields={mockGroupedInputFields}
            />,
        );

        await userEvent.click(screen.getByText(/Add column mapping/i));

        await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Could not read file header: File read error'));
    });

    it('discards the column mapping', async () => {
        mockColumnMapping = ColumnMapping.fromColumns(
            ['Column1', 'Column2'],
            Array.from(mockGroupedInputFields.values()).flat(),
        );

        render(
            <ColumnMappingModal
                inputFile={mockInputFile}
                columnMapping={mockColumnMapping}
                setColumnMapping={mockSetColumnMapping}
                groupedInputFields={mockGroupedInputFields}
            />,
        );

        await userEvent.click(screen.getByText(/Edit column mapping/i));

        const discardButton = await screen.findByText(/Discard Mapping/i);
        await userEvent.click(discardButton);

        expect(mockSetColumnMapping).toHaveBeenCalledWith(null);
    });
});
