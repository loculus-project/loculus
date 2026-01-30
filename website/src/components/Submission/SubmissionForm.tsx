import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm, type UploadAction } from './DataUploadForm.tsx';
import type { InputMode } from './FormOrUploadWrapper.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type DataSubmissionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    action: UploadAction;
    inputMode?: InputMode;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

const DataSubmissionForm: FC<DataSubmissionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    action,
    inputMode = 'bulk',
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}) => {
    return (
        <div className='flex flex-col items-center'>
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
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
};

type SubmissionFormProps = Omit<DataSubmissionFormProps, 'action'> & { inputMode: InputMode };

export const SubmissionForm: FC<SubmissionFormProps> = (props) => (
    <DataSubmissionForm {...props} action='submit' />
);

type RevisionFormProps = Omit<DataSubmissionFormProps, 'action' | 'inputMode'>;

export const RevisionForm: FC<RevisionFormProps> = (props) => (
    <DataSubmissionForm {...props} action='revise' inputMode='bulk' />
);
