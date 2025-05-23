import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm, type UploadAction } from './DataUploadForm.tsx';
import type { InputMode } from './FormOrUploadWrapper.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

export type UploadFormWrapperProps = {
    action: UploadAction;
    inputMode: InputMode;
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

export const UploadFormWrapper: FC<UploadFormWrapperProps> = ({
    action,
    inputMode,
    accessToken,
    organism,
    clientConfig,
    group,
    referenceGenomeSequenceNames,
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}) => (
    <div className='flex flex-col items-center'>
        <DataUploadForm
            accessToken={accessToken}
            organism={organism}
            referenceGenomeSequenceNames={referenceGenomeSequenceNames}
            metadataTemplateFields={metadataTemplateFields}
            clientConfig={clientConfig}
            action={action}
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
