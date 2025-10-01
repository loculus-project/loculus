import { type FC } from 'react';
import { toast } from 'react-toastify';

import { DataUploadForm } from './DataUploadForm.tsx';
import { routes } from '../../routes/routes.ts';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ReferenceGenomesLightweightSchema } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type RevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

export const RevisionForm: FC<RevisionFormProps> = ({
    accessToken,
    organism,
    clientConfig,
    group,
    referenceGenomeLightweightSchema,
    metadataTemplateFields,
    submissionDataTypes,
    dataUseTermsEnabled,
}) => {
    return (
        <div className='flex flex-col items-center'>
            <DataUploadForm
                accessToken={accessToken}
                organism={organism}
                referenceGenomeLightweightSchema={referenceGenomeLightweightSchema}
                metadataTemplateFields={metadataTemplateFields}
                clientConfig={clientConfig}
                action='revise'
                inputMode='bulk'
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
