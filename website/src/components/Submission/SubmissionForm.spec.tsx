import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { SubmissionForm } from './SubmissionForm';
import type { HeaderId, ProblemDetail } from '../../types/backend.ts';
import { mockRequest, testConfig, testuser } from '../vitest.setup';

vi.mock('../../api', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
    }),
}));

function renderSubmissionForm() {
    return render(<SubmissionForm clientConfig={testConfig.forClient} />);
}

const metadataFile = new File(['content'], 'metadata.tsv', { type: 'text/plain' });
const sequencesFile = new File(['content'], 'sequences.fasta', { type: 'text/plain' });

const testResponse: HeaderId[] = [
    { sequenceId: 0, version: 1, customId: 'header0' },
    { sequenceId: 1, version: 1, customId: 'header1' },
];

describe('SubmitForm', () => {
    test('should handle file upload and server response', async () => {
        mockRequest.backend.submit(200, testResponse);

        const { getByLabelText, getByText, getByPlaceholderText } = renderSubmissionForm();

        await userEvent.type(getByPlaceholderText('Username:'), testuser);
        await userEvent.upload(getByLabelText(/Metadata File:/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequences File:/i), sequencesFile);

        const submitButton = getByText('Submit');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(getByText((text) => text.includes('header0'))).toBeInTheDocument();
            expect(getByText((text) => text.includes('header1'))).toBeInTheDocument();
        });
    });

    test('should answer with feedback that a file is missing', async () => {
        mockRequest.backend.submit(200, testResponse);

        const { getByLabelText, getByText, getByPlaceholderText } = renderSubmissionForm();

        await userEvent.type(getByPlaceholderText('Username:'), testuser);
        await userEvent.upload(getByLabelText(/Metadata File:/i), metadataFile);

        const submitButton = getByText('Submit');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(
                getByText((text) => text.includes('Please select both a metadata and sequences file')),
            ).toBeInTheDocument();
        });
    });

    test('should unexpected error with proper error message', async () => {
        mockRequest.backend.submit(500, 'a weird, unexpected test error');

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

        const expectedErrorMessage = `The submitted file content was invalid: ${problemDetail.detail}`;
        await submitAndExpectErrorMessageContains(expectedErrorMessage);
    });

    async function submitAndExpectErrorMessageContains(receivedUnexpectedMessageFromBackend: string) {
        const { getByLabelText, getByText, getByPlaceholderText } = renderSubmissionForm();

        await userEvent.type(getByPlaceholderText('Username:'), testuser);
        await userEvent.upload(getByLabelText(/Metadata File:/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequences File:/i), sequencesFile);

        const submitButton = getByText('Submit');
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(getByText((text) => text.includes(receivedUnexpectedMessageFromBackend))).toBeInTheDocument();
        });
    }
});
