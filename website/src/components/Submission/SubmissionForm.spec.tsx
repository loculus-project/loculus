import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'react-toastify';
import { afterEach, describe, expect, test, vi } from 'vitest';

import type { InputMode } from './FormOrUploadWrapper.tsx';
import { SubmissionForm } from './SubmissionForm';
import { mockRequest, testAccessToken, testConfig, testGroups, testOrganism } from '../../../vitest.setup.ts';
import { SUBMISSION_ID_INPUT_FIELD } from '../../settings.ts';
import type { Group, ProblemDetail, SubmissionIdMapping } from '../../types/backend.ts';
import {
    type ReferenceAccession,
    type ReferenceGenomesLightweightSchema,
    SINGLE_REFERENCE,
} from '../../types/referencesGenomes.ts';

vi.mock('../../api', () => ({
    getClientLogger: () => ({
        error: vi.fn(),
        log: vi.fn(),
        info: vi.fn(),
    }),
}));

vi.mock('react-toastify', () => ({
    toast: {
        error: vi.fn(),
    },
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

const defaultAccession: ReferenceAccession = {
    name: 'main',
    insdcAccessionFull: undefined,
};

const defaultReferenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema = {
    [SINGLE_REFERENCE]: {
        nucleotideSegmentNames: ['main'],
        geneNames: ['gene1', 'gene2'],
        insdcAccessionFull: [defaultAccession],
    },
};

function renderSubmissionForm({
    inputMode = 'bulk',
    allowSubmissionOfConsensusSequences = true,
    dataUseTermsEnabled = true,
}: {
    inputMode?: InputMode;
    allowSubmissionOfConsensusSequences?: boolean;
    dataUseTermsEnabled?: boolean;
} = {}) {
    return render(
        <SubmissionForm
            inputMode={inputMode}
            accessToken={testAccessToken}
            referenceGenomeLightweightSchema={defaultReferenceGenomeLightweightSchema}
            organism={testOrganism}
            clientConfig={testConfig.public}
            group={group}
            metadataTemplateFields={
                new Map([
                    [
                        'fooSection',
                        [
                            { name: SUBMISSION_ID_INPUT_FIELD, displayName: 'ID', noEdit: true },
                            { name: 'foo' },
                            { name: 'bar' },
                        ],
                    ],
                ])
            }
            submissionDataTypes={{ consensusSequences: allowSubmissionOfConsensusSequences }}
            dataUseTermsEnabled={dataUseTermsEnabled}
        />,
    );
}

const metadataFile = new File(['content'], 'metadata.tsv', { type: 'text/plain' });
const sequencesFile = new File(['content'], 'sequences.fasta', { type: 'text/plain' });
const sequenceFile = new File(['content'], 'sequence.txt', { type: 'text/plain' });

const testResponse: SubmissionIdMapping[] = [
    { accession: '0', version: 1, submissionId: 'header0' },
    { accession: '1', version: 1, submissionId: 'header1' },
];

describe('SubmitForm', () => {
    afterEach(() => {
        vi.clearAllMocks();
    });

    test.each<InputMode>(['bulk', 'form'])(
        '%s: should handle file upload and server response',
        async (inputMode: InputMode) => {
            mockRequest.backend.submit(200, testResponse);
            mockRequest.backend.getGroupsOfUser();

            const { getByLabelText, getByRole, findByRole } = renderSubmissionForm({ inputMode });

            switch (inputMode) {
                case 'form': {
                    await userEvent.type(getByLabelText(/ID/), 'myId');
                    await userEvent.type(getByLabelText(/Foo/), 'foo');
                    await userEvent.upload(getByLabelText(/\+ add new sequence/i), sequenceFile);
                    break;
                }
                case 'bulk': {
                    await userEvent.upload(getByLabelText(/metadata file/i), metadataFile);
                    await userEvent.upload(getByLabelText(/sequence file/i), sequencesFile);
                    break;
                }
            }
            await userEvent.click(
                getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
            );
            await userEvent.click(
                getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
            );

            const submitButton = getByRole('button', { name: 'Submit sequences' });
            await userEvent.click(submitButton);
            await userEvent.click(await findByRole('button', { name: 'Continue under Open terms' }));

            await waitFor(() => {
                expect(toast.error).not.toHaveBeenCalled();
            });
        },
    );

    test('should answer with feedback that a file is missing', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByRole } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata File/i), metadataFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Please specify a sequences file.'), {
                position: 'top-center',
                autoClose: false,
            });
        });
    });

    test('should answer with sequence data is missing', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByRole } = renderSubmissionForm({ inputMode: 'form' });

        await userEvent.type(getByLabelText(/ID/), 'myId');
        await userEvent.type(getByLabelText(/Foo/), 'foo');
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Please enter sequence data.'), {
                position: 'top-center',
                autoClose: false,
            });
        });
    });

    test('should answer with metadata data is missing', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByRole } = renderSubmissionForm({ inputMode: 'form' });

        await userEvent.type(getByLabelText(/ID/), 'myId');
        await userEvent.upload(getByLabelText(/\+ add new sequence/i), sequenceFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Please specify metadata.'), {
                position: 'top-center',
                autoClose: false,
            });
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
        const { getByRole, getByLabelText } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata file/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequence file/i), sequencesFile);
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);
        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Please tick the box to agree that you will not independently submit these sequences to INSDC',
                ),
                { position: 'top-center', autoClose: false },
            );
        });

        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
    });

    async function submitAndExpectErrorMessageContains(receivedUnexpectedMessageFromBackend: string) {
        const { getByLabelText, getByRole, findByRole } = renderSubmissionForm();

        await userEvent.upload(getByLabelText(/Metadata file/i), metadataFile);
        await userEvent.upload(getByLabelText(/Sequence file/i), sequencesFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);
        await userEvent.click(await findByRole('button', { name: 'Continue under Open terms' }));

        await waitFor(() => {
            expect(toast.error).toHaveBeenCalledWith(expect.stringContaining(receivedUnexpectedMessageFromBackend), {
                position: 'top-center',
                autoClose: false,
            });
        });
    }

    test('should accept submission without sequence file for organism that does not allow consensus sequences', async () => {
        mockRequest.backend.submit(200, testResponse);
        mockRequest.backend.getGroupsOfUser();

        const { getByLabelText, getByRole, findByRole } = renderSubmissionForm({
            allowSubmissionOfConsensusSequences: false,
        });

        await userEvent.upload(getByLabelText(/Metadata File/i), metadataFile);
        await userEvent.click(
            getByLabelText(/I confirm I have not and will not submit this data independently to INSDC/i),
        );
        await userEvent.click(
            getByLabelText(/I confirm that the data submitted is not sensitive or human-identifiable/i),
        );

        const submitButton = getByRole('button', { name: 'Submit sequences' });
        await userEvent.click(submitButton);
        await userEvent.click(await findByRole('button', { name: 'Continue under Open terms' }));

        await waitFor(() => {
            expect(toast.error).not.toHaveBeenCalled();
        });
    });

    test.each<InputMode>(['bulk', 'form'])(
        '%s: should allow submission without checkings boxes when data use terms are disabled',
        async (inputMode: InputMode) => {
            mockRequest.backend.submit(200, testResponse);
            mockRequest.backend.getGroupsOfUser();

            const { getByLabelText, getByRole } = renderSubmissionForm({ dataUseTermsEnabled: false, inputMode });

            switch (inputMode) {
                case 'form': {
                    await userEvent.type(getByLabelText(/ID/), 'myId');
                    await userEvent.type(getByLabelText(/Foo/), 'foo');
                    await userEvent.upload(getByLabelText(/\+ add new sequence/i), sequenceFile);
                    break;
                }
                case 'bulk': {
                    await userEvent.upload(getByLabelText(/Metadata File/i), metadataFile);
                    await userEvent.upload(getByLabelText(/Sequence File/i), sequencesFile);
                    break;
                }
            }

            const submitButton = getByRole('button', { name: 'Submit sequences' });
            await userEvent.click(submitButton);

            await waitFor(() => {
                expect(toast.error).not.toHaveBeenCalled();
            });
        },
    );
});
