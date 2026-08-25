import { render } from '@testing-library/react';
import { describe, expect, test } from 'vitest';

import type { InputMode } from './FormOrUploadWrapper.tsx';
import { RevisionForm } from './RevisionForm.tsx';
import { testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import { routes } from '../../routes/routes.ts';
import { SUBMISSION_ID_INPUT_FIELD } from '../../settings.ts';
import type { Group } from '../../types/backend.ts';

const INSTANCE_NAME = 'test-instance';

const group: Group = {
    groupId: 1,
    groupName: testGroups[0].groupName,
    institution: 'institution',
    address: {
        line1: 'line1',
        line2: 'line2',
        city: 'city',
        postalCode: 'zipCode',
        state: 'state',
        country: 'country',
    },
    contactEmail: 'email',
};

function renderRevisionForm({
    inputMode = 'bulk',
    allowSubmissionOfConsensusSequences = true,
}: {
    inputMode?: InputMode;
    allowSubmissionOfConsensusSequences?: boolean;
} = {}) {
    return render(
        <RevisionForm
            instanceName={INSTANCE_NAME}
            inputMode={inputMode}
            accessToken={testAccessToken}
            organism={testOrganism}
            clientConfig={testConfig.public}
            group={group}
            metadataTemplateFields={
                new Map([
                    [
                        'fooSection',
                        [
                            { name: SUBMISSION_ID_INPUT_FIELD, displayName: 'ID', noEdit: true },
                            { name: 'foo', displayName: 'Foo' },
                        ],
                    ],
                ])
            }
            submissionDataTypes={{
                consensusSequences: allowSubmissionOfConsensusSequences,
                maxSequencesPerEntry: 1,
            }}
            dataUseTermsEnabled={true}
        />,
    );
}

describe('RevisionForm', () => {
    test('bulk: links to the released sequences page to download the originally submitted data', () => {
        const { getByRole, getByText } = renderRevisionForm();

        const link = getByRole('link', { name: 'released sequences' });
        expect(link).toHaveAttribute('href', routes.mySequencesPage(testOrganism, group.groupId));
        expect(link).toHaveAttribute('target', '_blank');
        expect(getByText(/Download originally submitted data/)).toBeVisible();
    });

    test('bulk: does not mention sequences when only metadata can be submitted', () => {
        const { getByRole, queryByText } = renderRevisionForm({ allowSubmissionOfConsensusSequences: false });

        expect(getByRole('link', { name: 'released sequences' })).toBeVisible();
        expect(queryByText(/sequences and metadata/)).not.toBeInTheDocument();
        expect(queryByText(/and sequences, ready to edit/)).not.toBeInTheDocument();
    });

    test('form: does not show the bulk download hint', () => {
        const { queryByRole } = renderRevisionForm({ inputMode: 'form' });

        expect(queryByRole('link', { name: 'released sequences' })).not.toBeInTheDocument();
    });
});
