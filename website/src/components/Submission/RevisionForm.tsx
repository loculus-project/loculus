import { type FC } from 'react';

import { UploadFormWrapper } from './UploadFormWrapper.tsx';
import { type Group } from '../../types/backend.ts';
import type { InputField } from '../../types/config.ts';
import type { SubmissionDataTypes } from '../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../types/referencesGenomes';
import type { ClientConfig } from '../../types/runtimeConfig.ts';

type RevisionFormProps = {
    accessToken: string;
    organism: string;
    clientConfig: ClientConfig;
    group: Group;
    referenceGenomeSequenceNames: ReferenceGenomesSequenceNames;
    metadataTemplateFields: Map<string, InputField[]>;
    submissionDataTypes: SubmissionDataTypes;
    dataUseTermsEnabled: boolean;
};

export const RevisionForm: FC<RevisionFormProps> = (props) => (
    <UploadFormWrapper {...props} action='revise' inputMode='bulk' />
);
