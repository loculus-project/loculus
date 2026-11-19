import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm } from './DataUploadForm.tsx';
import type { InputMode } from './FormOrUploadWrapper.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { FileSharingConfig, InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';

type SubmissionFormProps = {
    instanceName: string;
    organism: string;
    group: Group;
    inputMode: InputMode;
    metadataTemplateFields: Map<string, InputField[]>;
    authorsFields: string[];
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
    fileSharingConfig: FileSharingConfig;
};

export const SubmissionForm: FC<SubmissionFormProps> = ({
    instanceName,
    organism,
    group,
    inputMode,
    metadataTemplateFields,
    authorsFields,
    submissionDataTypes,
    dataUseTermsEnabled,
    fileSharingConfig,
}) => {
    return (
        <div className='flex flex-col items-center'>
            <DataUploadForm
                instanceName={instanceName}
                organism={organism}
                metadataTemplateFields={metadataTemplateFields}
                authorsFields={authorsFields}
                action='submit'
                inputMode={inputMode}
                onError={(message) => toast.error(message, { position: 'top-center', autoClose: false })}
                group={group}
                onSuccess={() => {
                    window.location.href = routes.userSequenceReviewPage(organism, group.groupId);
                }}
                submissionDataTypes={submissionDataTypes}
                dataUseTermsEnabled={dataUseTermsEnabled}
                fileSharingConfig={fileSharingConfig}
            />
        </div>
    );
};
