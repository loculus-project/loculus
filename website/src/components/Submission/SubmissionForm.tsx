import { type FC } from 'react';

import type { InputMode } from './FormOrUploadWrapper.tsx';
import { UploadFormWrapper } from './UploadFormWrapper.tsx';
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

export const SubmissionForm: FC<SubmissionFormProps> = (props) => (
    <UploadFormWrapper {...props} action='submit' inputMode={props.inputMode} />
);
