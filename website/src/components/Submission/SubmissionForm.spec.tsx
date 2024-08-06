import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SubmissionForm } from './SubmissionForm';
import { mockRequest, testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import type { Group, ProblemDetail, SubmissionIdMapping } from '../../types/backend.ts';
import type { ReferenceGenomesSequenceNames, ReferenceAccession } from '../../types/referencesGenomes.ts';

vi.mock('../../api', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
    }),
}));

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

const defaultReferenceGenomesSequenceNames: ReferenceGenomesSequenceNames = {
    nucleotideSequences: ['main'],
    genes: ['gene1', 'gene2'],
    insdc_accession_full: ['insdc_dummy_accession'],
};

function renderSubmissionForm() {
    return render(
        <SubmissionForm
            accessToken={testAccessToken}
            referenceGenomeSequenceNames={defaultReferenceGenomesSequenceNames}
            organism={testOrganism}
            clientConfig={testConfig.public}
            group={group}
        />,
    );
}

const metadataFile = new File(['content'], 'metadata.tsv', { type: 'text/plain' });
const sequencesFile = new File(['content'], 'sequences.fasta', { type: 'text/plain' });

const testResponse: SubmissionIdMapping[] = [
    { accession: '0', version: 1, submissionId: 'header0' },
    { accession: '1', version: 1, submissionId: 'header1' },
];

describe('SubmitForm', () => {
    test('should handle file upload and server response', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByText } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata File/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequence File/i), sequencesFile);

        const submitButton = getByText('Submit sequences');
        await userEvent.click(submitButton);
    });

    test('should answer with feedback that a file is missing', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByText } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata File/i), metadataFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByText('Submit sequences');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(getByText((text) => text.includes('Please select a sequences file'))).toBeInTheDocument();
        });
    });

    test('should be able to open change date modal', async () => {
        const { getByText, getByLabelText } = renderSubmissionForm();
        await userEvent.click(getByLabelText(/Restricted/i));
        await userEvent.click(getByText('Change date'));

        await waitFor(() => {
            expect(getByText('Change date until which sequences are restricted')).toBeInTheDocument();
        });
    });

    test('should unexpected error with proper error message', async () => {
        mockRequest.backend.submit(500, 'a weird, unexpected test error');
        mockRequest.backend.getGroupsOfUser();

        await submitAndExpectErrorMessageContains('Received unexpected message from backend');
    });

    test('should handle unprocessable entity error with proper error message', async () => {
        const problemDetail: ProblemDetail = {
            title: 'Dummy unprocessable entity',
            detail: 'dummy error message',
            instance: 'dummy instance',
            status: 422,
            type: 'dummy type',
        };
        mockRequest.backend.submit(422, problemDetail);
        mockRequest.backend.getGroupsOfUser();

        const expectedErrorMessage = `The submitted file content was invalid: ${problemDetail.detail}`;
        await submitAndExpectErrorMessageContains(expectedErrorMessage);
    });

    test('should allow submission only after agreeing to terms of INSDC submission', async () => {
        const { getByText, getByLabelText } = renderSubmissionForm();

        const submitButton = getByText('Submit sequences');
        await userEvent.click(submitButton);
        await waitFor(() => {
            expect(
                getByText((text) =>
                    text.includes(
                        'Please tick the box agree that you will not independently submit these sequences to INSDC',
                    ),
                ),
            ).toBeInTheDocument();
        });

        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
    });

    async function submitAndExpectErrorMessageContains(receivedUnexpectedMessageFromBackend: string) {
        const { getByLabelText, getByText } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata file/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequence file/i), sequencesFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByText('Submit sequences');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(getByText((text) => text.includes(receivedUnexpectedMessageFromBackend))).toBeInTheDocument();
        });
    }
});
