import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm } from './DataUploadForm.tsx';
import type { InputMode } from './FormOrUploadWrapper.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type SubmissionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    inputMode: InputMode;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    inputMode,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}) => {
    return (
        <div className='flex flex-col items-center'>
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
                referenceGenomeSequenceNames={referenceGenomeSequenceNames}
                metadataTemplateFields={metadataTemplateFields}
                clientConfig={clientConfig}
                action='submit'
                inputMode={inputMode}
                onError={(message) => toast.error(message, { position: 'top-center', autoClose: false })}
                group={group}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism, group.groupId);
                }}
                submissionDataTypes={submissionDataTypes}
                dataUseTermsEnabled={dataUseTermsEnabled}
            />
        </div>
    );
};
