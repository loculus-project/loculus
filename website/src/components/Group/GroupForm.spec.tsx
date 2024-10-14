import { render, screen } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import { GroupForm } from './GroupForm';

const noOpSubmit = () => {
    throw new Error('Not implemented');
};

describe('GroupForm', () => {
    test('test empty form', () => {
        const formTitle = 'Create group';
        const buttonText = 'Submit';

        render(<GroupForm title={formTitle} buttonText={buttonText} onSubmit={noOpSubmit} />);

        expect(screen.getByRole('heading', { name: formTitle })).toBeVisible();
        expect(screen.getByRole('button', { name: buttonText })).toBeVisible();
        // all text fields by default empty
        screen.getAllByRole('textbox').forEach((field) => expect(field).toHaveValue(''));
        expect(screen.getByRole('combobox')).toHaveValue('Choose a country...');
    });

    test('defaults load correctly', () => {
        const groupName = 'Group Name';
        const institution = 'institution';
        const contactEmail = 'contact@mail.com';
        const line1 = 'AddressLine1';
        const line2 = 'AddressLine2';
        const city = 'City';
        const state = 'state';
        const postalCode = '12345';
        const country = 'Zimbabwe';
        render(
            <GroupForm
                title=''
                buttonText=''
                onSubmit={noOpSubmit}
                defaultGroupData={{
                    groupName,
                    institution,
                    contactEmail,
                    address: { line1, line2, city, state, postalCode, country },
                }}
            />,
        );

        expect(screen.getByLabelText(/group name/i)).toHaveValue(groupName);
        expect(screen.getByLabelText(/institution/i)).toHaveValue(institution);
        expect(screen.getByLabelText(/contact/i)).toHaveValue(contactEmail);
        expect(screen.getByLabelText(/line 1/i)).toHaveValue(line1);
        expect(screen.getByLabelText(/line 2/i)).toHaveValue(line2);
        expect(screen.getByLabelText(/city/i)).toHaveValue(city);
        expect(screen.getByLabelText(/state/i)).toHaveValue(state);
        expect(screen.getByLabelText(/postal/i)).toHaveValue(postalCode);
        expect(screen.getByLabelText(/country/i)).toHaveValue(country);
    });
});
