import { type FC, useState } from 'react';

import { DownloadDialogButton } from './DowloadDialogButton.tsx';
import { DownloadButton } from './DownloadButton.tsx';
import { DownloadForm } from './DownloadForm.tsx';
import { type DownloadUrlGenerator, type DownloadOption } from './DownloadUrlGenerator.ts';
import { getDefaultSelectedFields } from './FieldSelector/FieldSelectorModal.tsx';
import type { SequenceFilter } from './SequenceFilters.tsx';
import { routes } from '../../../routes/routes.ts';
import type { Metadata } from '../../../types/config.ts';
import type { Schema } from '../../../types/config.ts';
import type { ReferenceGenomesLightweightSchema } from '../../../types/referencesGenomes.ts';
import { ActiveFilters } from '../../common/ActiveFilters.tsx';
import { BaseDialog } from '../../common/BaseDialog.tsx';

type DownloadDialogProps = {
    downloadUrlGenerator: DownloadUrlGenerator;
    sequenceFilter: SequenceFilter;
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    metadata: Metadata[];
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedSuborganism: string | null;
    suborganismIdentifierField: string | undefined;
};

export const DownloadDialog: FC<DownloadDialogProps> = ({
    downloadUrlGenerator,
    sequenceFilter,
    referenceGenomeLightweightSchema,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    metadata,
    richFastaHeaderFields,
    selectedSuborganism,
    suborganismIdentifierField,
}) => {
    const [isOpen, setIsOpen] = useState(false);

    const openDialog = () => setIsOpen(true);
    const closeDialog = () => setIsOpen(false);

    const [downloadOption, setDownloadOption] = useState<DownloadOption | undefined>();
    const [agreedToDataUseTerms, setAgreedToDataUseTerms] = useState(dataUseTermsEnabled ? false : true);
    const [selectedFields, setSelectedFields] = useState<string[]>(getDefaultSelectedFields(metadata));

    return (
        <>
            <DownloadDialogButton sequenceFilter={sequenceFilter} onClick={openDialog} />
            <BaseDialog title='Download' isOpen={isOpen} onClose={closeDialog} fullWidth={false}>
                <div className='mt-2'>
                    {!sequenceFilter.isEmpty() && (
                        <div className='mb-4'>
                            <h4 className='font-bold mb-2'>Active filters</h4>
                            <ActiveFilters sequenceFilter={sequenceFilter} />
                        </div>
                    )}
                    <DownloadForm
                        referenceGenomesLightweightSchema={referenceGenomeLightweightSchema}
                        onChange={setDownloadOption}
                        allowSubmissionOfConsensusSequences={allowSubmissionOfConsensusSequences}
                        dataUseTermsEnabled={dataUseTermsEnabled}
                        metadata={metadata}
                        selectedFields={selectedFields}
                        onSelectedFieldsChange={setSelectedFields}
                        richFastaHeaderFields={richFastaHeaderFields}
                        selectedSuborganism={selectedSuborganism}
                        suborganismIdentifierField={suborganismIdentifierField}
                    />
                    {dataUseTermsEnabled && (
                        <div className='mb-4 py-4'>
                            <label className='flex items-center'>
                                <input
                                    type='checkbox'
                                    name='data-use-terms-agreement'
                                    className='mr-3 ml-1 h-5 w-5 rounded border-gray-300 text-primary-600 focus:ring-primary-600'
                                    checked={agreedToDataUseTerms}
                                    onChange={() => setAgreedToDataUseTerms(!agreedToDataUseTerms)}
                                />
                                <span className='text-sm'>
                                    I agree to the{' '}
                                    <a
                                        href={routes.datauseTermsPage()}
                                        className='underline'
                                        target='_blank'
                                        rel='noopener noreferrer'
                                    >
                                        data use terms
                                    </a>
                                    .
                                </span>
                            </label>
                        </div>
                    )}
                    <DownloadButton
                        downloadUrlGenerator={downloadUrlGenerator}
                        downloadOption={downloadOption}
                        sequenceFilter={sequenceFilter}
                        disabled={!agreedToDataUseTerms}
                        onClick={closeDialog}
                    />
                </div>
            </BaseDialog>
        </>
    );
};
