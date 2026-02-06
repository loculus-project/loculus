import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test } from 'vitest';

import { GroupForm } from './GroupForm';
import type { GetGroupsResult } from '../../hooks/useGroupOperations';

const MOCK_GROUP = {
    groupId: 1,
    groupName: 'Group Name',
    institution: 'institution',
    contactEmail: 'contact@mail.com',
    address: {
        line1: 'AddressLine1',
        line2: 'AddressLine2',
        city: 'City',
        state: 'state',
        postalCode: '12345',
        country: 'Zimbabwe',
    },
};

const noOpSubmit = () => {
    throw new Error('Not implemented');
};

// eslint-disable-next-line @typescript-eslint/require-await
const mockGetGroupsWithNoGroups = async (_groupName?: string): Promise<GetGroupsResult> => {
    return {
        succeeded: true,
        groups: [],
    };
};

// eslint-disable-next-line @typescript-eslint/require-await
const mockGetGroupsWithGroup = async (_groupName?: string): Promise<GetGroupsResult> => {
    return {
        succeeded: true,
        groups: [MOCK_GROUP],
    };
};

describe('GroupForm', () => {
    test('test empty form', () => {
        const formTitle = 'Create group';
        const buttonText = 'Submit';

        render(
            <GroupForm
                title={formTitle}
                buttonText={buttonText}
                onSubmit={noOpSubmit}
                getGroups={mockGetGroupsWithNoGroups}
            />,
        );

        expect(screen.getByRole('heading', { name: formTitle })).toBeVisible();
        expect(screen.getByRole('button', { name: buttonText })).toBeVisible();
        // all text fields by default empty
        screen.getAllByRole('textbox').forEach((field) => expect(field).toHaveValue(''));
        expect(screen.getByRole('combobox')).toHaveValue('Choose a country...');
    });

    test('defaults load correctly', () => {
        render(
            <GroupForm
                title=''
                buttonText=''
                onSubmit={noOpSubmit}
                defaultGroupData={MOCK_GROUP}
                getGroups={mockGetGroupsWithNoGroups}
            />,
        );

        expect(screen.getByLabelText(/group name/i)).toHaveValue(MOCK_GROUP.groupName);
        expect(screen.getByLabelText(/institution/i)).toHaveValue(MOCK_GROUP.institution);
        expect(screen.getByLabelText(/contact/i)).toHaveValue(MOCK_GROUP.contactEmail);
        expect(screen.getByLabelText(/line 1/i)).toHaveValue(MOCK_GROUP.address.line1);
        expect(screen.getByLabelText(/line 2/i)).toHaveValue(MOCK_GROUP.address.line2);
        expect(screen.getByLabelText(/city/i)).toHaveValue(MOCK_GROUP.address.city);
        expect(screen.getByLabelText(/state/i)).toHaveValue(MOCK_GROUP.address.state);
        expect(screen.getByLabelText(/postal/i)).toHaveValue(MOCK_GROUP.address.postalCode);
        expect(screen.getByLabelText(/country/i)).toHaveValue(MOCK_GROUP.address.country);
    });

    test('modal appears after submit when groupName exists', async () => {
        const formTitle = 'Create group';
        const buttonText = 'Submit';
        render(
            <GroupForm
                title={formTitle}
                buttonText={buttonText}
                onSubmit={noOpSubmit}
                defaultGroupData={MOCK_GROUP}
                getGroups={mockGetGroupsWithGroup}
            />,
        );

        expect(screen.queryByText(/group name already in use/i)).not.toBeInTheDocument();

        await userEvent.click(screen.getByRole('button', { name: buttonText }));

        expect(await screen.findByText(/group name already in use/i)).toBeInTheDocument();
    });
});
