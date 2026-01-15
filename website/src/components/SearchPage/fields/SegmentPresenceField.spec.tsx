import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { SegmentPresenceField } from './SegmentPresenceField';
import type { FieldValues } from '../../../types/config.ts';
import type { SuborganismSegmentAndGeneInfo } from '../../../utils/getSuborganismSegmentAndGeneInfo.tsx';

describe('SegmentPresenceField', () => {
    const mockSuborganismSegmentAndGeneInfo: SuborganismSegmentAndGeneInfo = {
        nucleotideSegmentInfos: [
            { lapisName: 'segment1', label: 'Segment 1' },
            { lapisName: 'segment2', label: 'Segment 2' },
            { lapisName: 'segment3', label: 'Segment 3' },
        ],
        geneInfos: [],
        isMultiSegmented: true,
    };

    it('renders all segments as checkboxes', () => {
        const mockSetSomeFieldValues = vi.fn();
        const fieldValues: FieldValues = {};

        render(
            <SegmentPresenceField
                suborganismSegmentAndGeneInfo={mockSuborganismSegmentAndGeneInfo}
                fieldValues={fieldValues}
                setSomeFieldValues={mockSetSomeFieldValues}
            />,
        );

        expect(screen.getByText('Required segments')).toBeInTheDocument();
        expect(screen.getByText('Segment 1')).toBeInTheDocument();
        expect(screen.getByText('Segment 2')).toBeInTheDocument();
        expect(screen.getByText('Segment 3')).toBeInTheDocument();
    });

    it('checks segment when checkbox is clicked', async () => {
        const user = userEvent.setup();
        const mockSetSomeFieldValues = vi.fn();
        const fieldValues: FieldValues = {};

        render(
            <SegmentPresenceField
                suborganismSegmentAndGeneInfo={mockSuborganismSegmentAndGeneInfo}
                fieldValues={fieldValues}
                setSomeFieldValues={mockSetSomeFieldValues}
            />,
        );

        const checkbox1 = screen.getByRole('checkbox', { name: /Segment 1/i });
        await user.click(checkbox1);

        expect(mockSetSomeFieldValues).toHaveBeenCalledWith(['segment1LengthFrom', '1']);
    });

    it('unchecks segment and clears filter when checkbox is clicked', async () => {
        const user = userEvent.setup();
        const mockSetSomeFieldValues = vi.fn();
        const fieldValues: FieldValues = {
            segment1LengthFrom: '1',
        };

        render(
            <SegmentPresenceField
                suborganismSegmentAndGeneInfo={mockSuborganismSegmentAndGeneInfo}
                fieldValues={fieldValues}
                setSomeFieldValues={mockSetSomeFieldValues}
            />,
        );

        const checkbox1 = screen.getByRole('checkbox', { name: /Segment 1/i });
        expect(checkbox1).toBeChecked();

        await user.click(checkbox1);

        expect(mockSetSomeFieldValues).toHaveBeenCalledWith(['segment1LengthFrom', null]);
    });

    it('displays checked state for segments with existing length filters', () => {
        const mockSetSomeFieldValues = vi.fn();
        const fieldValues: FieldValues = {
            segment1LengthFrom: '1',
            segment3LengthFrom: '10',
        };

        render(
            <SegmentPresenceField
                suborganismSegmentAndGeneInfo={mockSuborganismSegmentAndGeneInfo}
                fieldValues={fieldValues}
                setSomeFieldValues={mockSetSomeFieldValues}
            />,
        );

        const checkbox1 = screen.getByRole('checkbox', { name: /Segment 1/i });
        const checkbox2 = screen.getByRole('checkbox', { name: /Segment 2/i });
        const checkbox3 = screen.getByRole('checkbox', { name: /Segment 3/i });

        expect(checkbox1).toBeChecked();
        expect(checkbox2).not.toBeChecked();
        expect(checkbox3).toBeChecked();
    });

    it('handles multiple segment selections', async () => {
        const user = userEvent.setup();
        const mockSetSomeFieldValues = vi.fn();
        const fieldValues: FieldValues = {};

        render(
            <SegmentPresenceField
                suborganismSegmentAndGeneInfo={mockSuborganismSegmentAndGeneInfo}
                fieldValues={fieldValues}
                setSomeFieldValues={mockSetSomeFieldValues}
            />,
        );

        const checkbox1 = screen.getByRole('checkbox', { name: /Segment 1/i });
        const checkbox2 = screen.getByRole('checkbox', { name: /Segment 2/i });

        await user.click(checkbox1);
        await user.click(checkbox2);

        expect(mockSetSomeFieldValues).toHaveBeenCalledWith(['segment1LengthFrom', '1']);
        expect(mockSetSomeFieldValues).toHaveBeenCalledWith(['segment2LengthFrom', '1']);
    });
});
