import { render, screen, fireEvent } from '@testing-library/react';
import { DateTime } from 'luxon';
import { describe, expect, test, vi } from 'vitest';

import DataUseTermsSelector from './DataUseTermsSelector';
import { openDataUseTermsOption, restrictedDataUseTermsOption } from '../../types/backend.ts';

describe('DataUseTermsSelector', () => {
    test('calls setDataUseTerms when an input is clicked', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.now().plus({ days: 30 });

        render(
            <DataUseTermsSelector
                initialDataUseTermsOption={openDataUseTermsOption}
                maxRestrictedUntil={maxRestrictedUntil}
                setDataUseTerms={mockSetDataUseTerms}
            />,
        );

        // Restricted radio input
        const restrictedInput = screen.getByLabelText('Restricted');
        fireEvent.click(restrictedInput);

        expect(mockSetDataUseTerms).toHaveBeenCalledWith({
            type: restrictedDataUseTermsOption,
            restrictedUntil: maxRestrictedUntil.toFormat('yyyy-MM-dd'),
        });

        // Open radio input
        const openInput = screen.getByLabelText('Open');
        fireEvent.click(openInput);

        expect(mockSetDataUseTerms).toHaveBeenCalledWith({ type: openDataUseTermsOption });
    });

    test('opens the modal when calendarUseModal is true and "Change date" button is clicked', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.now().plus({ days: 30 });

        render(
            <DataUseTermsSelector
                initialDataUseTermsOption={restrictedDataUseTermsOption}
                maxRestrictedUntil={maxRestrictedUntil}
                calendarUseModal
                setDataUseTerms={mockSetDataUseTerms}
            />,
        );

        const changeDateButton = screen.getByText('Change date');
        fireEvent.click(changeDateButton);

        expect(screen.getByText('Change date until which sequences are restricted')).toBeInTheDocument();
    });

    test('does not use the modal when calendarUseModal is false and renders the inline datepicker instead', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.now().plus({ days: 30 });

        render(
            <DataUseTermsSelector
                initialDataUseTermsOption={restrictedDataUseTermsOption}
                maxRestrictedUntil={maxRestrictedUntil}
                calendarUseModal={false}
                setDataUseTerms={mockSetDataUseTerms}
            />,
        );

        expect(screen.queryByText('Mon')).toBeInTheDocument();
        expect(screen.queryByText('Tue')).toBeInTheDocument();
        expect(screen.queryByText('Wed')).toBeInTheDocument();
        expect(screen.queryByText('Change date')).not.toBeInTheDocument();
    });

    test('updates the date when a date is clicked in the inline datepicker', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.fromISO('2077-07-15');

        render(
            <DataUseTermsSelector
                initialDataUseTermsOption={restrictedDataUseTermsOption}
                maxRestrictedUntil={maxRestrictedUntil}
                calendarUseModal={false}
                setDataUseTerms={mockSetDataUseTerms}
            />,
        );

        const dateButton = screen.getByText('14');
        fireEvent.click(dateButton);

        expect(mockSetDataUseTerms).toHaveBeenCalledWith({
            type: restrictedDataUseTermsOption,
            restrictedUntil: '2077-07-14',
        });
    });

    test('updates the date via modal when "Change date" is clicked, a date is selected, and submitted', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.fromISO('2077-07-15');

        render(
            <DataUseTermsSelector
                initialDataUseTermsOption={restrictedDataUseTermsOption}
                maxRestrictedUntil={maxRestrictedUntil}
                calendarUseModal
                setDataUseTerms={mockSetDataUseTerms}
            />,
        );

        // Open the modal
        const changeDateButton = screen.getByText('Change date');
        fireEvent.click(changeDateButton);

        // Select a date in the modal
        const dateButton = screen.getByText('14');
        fireEvent.click(dateButton);

        // Submit the modal
        const submitButton = screen.getByText('Save');
        fireEvent.click(submitButton);

        expect(mockSetDataUseTerms).toHaveBeenCalledWith({
            type: restrictedDataUseTermsOption,
            restrictedUntil: '2077-07-14',
        });
    });

    test('renders with no radio input selected when initialDataUseTermsType is not set', () => {
        const mockSetDataUseTerms = vi.fn();
        const maxRestrictedUntil = DateTime.fromISO('2077-07-15');

        render(<DataUseTermsSelector maxRestrictedUntil={maxRestrictedUntil} setDataUseTerms={mockSetDataUseTerms} />);

        const openInput = screen.getByLabelText('Open');
        const restrictedInput = screen.getByLabelText('Restricted');

        expect(openInput).not.toBeChecked();
        expect(restrictedInput).not.toBeChecked();
    });
});
