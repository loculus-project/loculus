import { type FC } from 'react';

import { backendClientHooks } from '../../services/serviceHooks.ts';
import type { AccessionVersion } from '../../types/backend.ts';
import type { InputField, SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader.ts';
import { EditPage } from '../Edit/EditPage.tsx';
import { BaseDialog } from '../common/BaseDialog.tsx';

interface EditSequenceModalProps {
    isOpen: boolean;
    onClose: () => void;
    organism: string;
    accessionVersion: AccessionVersion;
    clientConfig: ClientConfig;
    accessToken: string;
    groupedInputFields: Map<string, InputField[]>;
    segmentNames: string[];
    submissionDataTypes: SubmissionDataTypes;
}

export const EditSequenceModal: FC<EditSequenceModalProps> = ({
    isOpen,
    onClose,
    organism,
    accessionVersion,
    clientConfig,
    accessToken,
    groupedInputFields,
    segmentNames,
    submissionDataTypes,
}) => {
    const { data, isLoading, isError } = backendClientHooks(clientConfig).useGetDataToEdit(
        {
            headers: createAuthorizationHeader(accessToken),
            params: {
                organism,
                accession: accessionVersion.accession,
                version: accessionVersion.version,
            },
        },
        { enabled: isOpen },
    );

    return (
        <BaseDialog
            title={`Edit ${accessionVersion.accession}.${accessionVersion.version}`}
            isOpen={isOpen}
            onClose={onClose}
        >
            {isLoading && <div>Loading...</div>}
            {isError && <div>Error loading data</div>}
            {data && (
                <EditPage
                    organism={organism}
                    clientConfig={clientConfig}
                    accessToken={accessToken}
                    dataToEdit={data}
                    segmentNames={segmentNames}
                    groupedInputFields={groupedInputFields}
                    submissionDataTypes={submissionDataTypes}
                />
            )}
        </BaseDialog>
    );
};
