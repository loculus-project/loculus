import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm } from './DataUploadForm.tsx';
import type { InputMode } from './FormOrUploadWrapper.tsx';
import { IndividualRevisionForm } from './IndividualRevisionForm.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type RevisionFormProps = {
    accessToken: string;
    instanceName: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    inputMode: InputMode;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
    accession?: string;
    version?: string;
};

export const RevisionForm: FC<RevisionFormProps> = ({
    accessToken,
    instanceName,
    organism,
    clientConfig,
    group,
    inputMode,
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
    accession,
    version,
}) => {
    return (
        <div className='flex flex-col items-center'>
            {inputMode === 'form' ? (
                <IndividualRevisionForm
                    accessToken={accessToken}
                    organism={organism}
                    clientConfig={clientConfig}
                    group={group}
                    metadataTemplateFields={metadataTemplateFields}
                    submissionDataTypes={submissionDataTypes}
                    accession={accession}
                    version={version}
                />
            ) : (
                <DataUploadForm
                    accessToken={accessToken}
                    instanceName={instanceName}
                    organism={organism}
                    metadataTemplateFields={metadataTemplateFields}
                    clientConfig={clientConfig}
                    action='revise'
                    inputMode={inputMode}
                    onError={(message) => toast.error(message, { position: 'top-center', autoClose: false })}
                    group={group}
                    onSuccess={() => {
                        window.location.href = routes.userSequenceReviewPage(organism, group.groupId);
                    }}
                    submissionDataTypes={submissionDataTypes}
                    dataUseTermsEnabled={dataUseTermsEnabled}
                />
            )}
        </div>
    );
};
