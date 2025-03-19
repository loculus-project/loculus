import { type FC, useEffect, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { DownloadOption } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Metadata } from '../../../types/config.ts';
import type { Schema } from '../../../types/config.ts';
import type { ReferenceGenomesSequenceNames } from '../../../types/referencesGenomes.ts';

type DownloadFormProps = {
    referenceGenomesSequenceNames: ReferenceGenomesSequenceNames;
    onChange: (value: DownloadOption) => void;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    metadata: Metadata[];
    selectedFields: string[];
    onSelectedFieldsChange: (fields: string[]) => void;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
};

// Helper function to ensure accessionVersion is always the first field
function ensureAccessionVersionField(fields: string[]): string[] {
    const fieldsWithoutAccessionVersion = fields.filter((field) => field !== ACCESSION_VERSION_FIELD);
    return [ACCESSION_VERSION_FIELD, ...fieldsWithoutAccessionVersion];
}

export const DownloadForm: FC<DownloadFormProps> = ({
    referenceGenomesSequenceNames,
    onChange,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    metadata,
    selectedFields,
    onSelectedFieldsChange,
    richFastaHeaderFields,
}) => {
    const [includeRestricted, setIncludeRestricted] = useState(0);
    const [includeOldData, setIncludeOldData] = useState(0);
    const [dataType, setDataType] = useState(0);
    const [compression, setCompression] = useState(0);
    const [unalignedNucleotideSequence, setUnalignedNucleotideSequence] = useState(0);
    const [alignedNucleotideSequence, setAlignedNucleotideSequence] = useState(0);
    const [alignedAminoAcidSequence, setAlignedAminoAcidSequence] = useState(0);
    const [includeRichFastaHeaders, setIncludeRichFastaHeaders] = useState(0);

    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);

    const isMultiSegmented = referenceGenomesSequenceNames.nucleotideSequences.length > 1;

    useEffect(() => {
        let downloadDataType: DownloadDataType;
        switch (dataType) {
            case 0:
                downloadDataType = { type: 'metadata' };
                break;
            case 1:
                downloadDataType = {
                    type: 'unalignedNucleotideSequences',
                    segment: isMultiSegmented
                        ? referenceGenomesSequenceNames.nucleotideSequences[unalignedNucleotideSequence]
                        : undefined,
                    includeRichFastaHeaders: includeRichFastaHeaders === 1,
                };
                break;
            case 2:
                downloadDataType = {
                    type: 'alignedNucleotideSequences',
                    segment: isMultiSegmented
                        ? referenceGenomesSequenceNames.nucleotideSequences[alignedNucleotideSequence]
                        : undefined,
                };
                break;
            case 3:
                downloadDataType = {
                    type: 'alignedAminoAcidSequences',
                    gene: referenceGenomesSequenceNames.genes[alignedAminoAcidSequence],
                };
                break;
            default:
                throw new Error(`Invalid state error: DownloadForm dataType=${dataType}`);
        }
        const compressionOptions = [undefined, 'zstd', 'gzip'] as const;
        onChange({
            dataType: downloadDataType,
            includeOldData: includeOldData === 1,
            includeRestricted: includeRestricted === 1,
            fields: dataType === 0 ? ensureAccessionVersionField(selectedFields) : undefined, // Always include accessionVersion as first field
            compression: includeRichFastaHeaders ? undefined : compressionOptions[compression],
            dataFormat: undefined,
        });
    }, [
        includeRestricted,
        includeOldData,
        compression,
        dataType,
        unalignedNucleotideSequence,
        alignedNucleotideSequence,
        alignedAminoAcidSequence,
        includeRichFastaHeaders,
        isMultiSegmented,
        referenceGenomesSequenceNames.nucleotideSequences,
        referenceGenomesSequenceNames.genes,
        onChange,
        selectedFields,
    ]);

    const metadataOption = {
        label: (
            <div className='flex items-center gap-3'>
                <span>Metadata</span>
                <FieldSelectorButton
                    onClick={() => setIsFieldSelectorOpen(true)}
                    selectedFieldsCount={selectedFields.length}
                    disabled={dataType !== 0}
                />
            </div>
        ),
    };
    const dataTypeOptions = allowSubmissionOfConsensusSequences
        ? [
              metadataOption,
              {
                  label: <>Raw nucleotide sequences</>,
                  subOptions: (
                      <div className='px-8'>
                          {isMultiSegmented ? (
                              <DropdownOptionBlock
                                  name='unalignedNucleotideSequences'
                                  options={referenceGenomesSequenceNames.nucleotideSequences.map((segment) => ({
                                      label: <>{segment}</>,
                                  }))}
                                  selected={unalignedNucleotideSequence}
                                  onSelect={setUnalignedNucleotideSequence}
                                  disabled={dataType !== 1}
                              />
                          ) : undefined}
                          {richFastaHeaderFields && (
                              <RadioOptionBlock
                                  name='richFastaHeaders'
                                  title='FASTA header style'
                                  options={[{ label: <>Accession</> }, { label: <>Display name</> }]}
                                  selected={includeRichFastaHeaders}
                                  onSelect={setIncludeRichFastaHeaders}
                                  disabled={dataType !== 1}
                                  variant='nested'
                              />
                          )}
                      </div>
                  ),
              },
              {
                  label: <>Aligned nucleotide sequences</>,
                  subOptions: isMultiSegmented ? (
                      <div className='px-8'>
                          <DropdownOptionBlock
                              name='alignedNucleotideSequences'
                              options={referenceGenomesSequenceNames.nucleotideSequences.map((gene) => ({
                                  label: <>{gene}</>,
                              }))}
                              selected={alignedNucleotideSequence}
                              onSelect={setAlignedNucleotideSequence}
                              disabled={dataType !== 2}
                          />
                      </div>
                  ) : undefined,
              },
              {
                  label: <>Aligned amino acid sequences</>,
                  subOptions: (
                      <div className='px-8'>
                          <DropdownOptionBlock
                              name='alignedAminoAcidSequences'
                              options={referenceGenomesSequenceNames.genes.map((gene) => ({
                                  label: <>{gene}</>,
                              }))}
                              selected={alignedAminoAcidSequence}
                              onSelect={setAlignedAminoAcidSequence}
                              disabled={dataType !== 3}
                          />
                      </div>
                  ),
              },
          ]
        : [metadataOption];

    return (
        <div className='flex flex-row flex-wrap mb-4 gap-y-2 py-4'>
            {dataUseTermsEnabled && (
                <RadioOptionBlock
                    name='includeRestricted'
                    title='Include restricted data?'
                    options={[
                        { label: <>No, only download open data</> },
                        {
                            label: (
                                <>
                                    Yes, include restricted data
                                    <br />({/* TODO(862) */}
                                    <a href={routes.datauseTermsPage()} className='underline'>
                                        What does it mean?
                                    </a>
                                    )
                                </>
                            ),
                        },
                    ]}
                    selected={includeRestricted}
                    onSelect={setIncludeRestricted}
                />
            )}
            <RadioOptionBlock
                name='includeOlder'
                title='Include older versions?'
                options={[
                    { label: <>No, only download latest version</> },
                    { label: <>Yes, include older versions and revoked sequences</> },
                ]}
                selected={includeOldData}
                onSelect={setIncludeOldData}
            />
            <RadioOptionBlock
                name='dataType'
                title='Data Type'
                options={dataTypeOptions}
                selected={dataType}
                onSelect={setDataType}
            />
            <RadioOptionBlock
                name='compression'
                title='Compression'
                options={[{ label: <>None</> }, { label: <>Zstandard</> }, { label: <>Gzip</> }]}
                selected={compression}
                onSelect={setCompression}
                disabled={dataType === 1 && includeRichFastaHeaders === 1}
            />

            <FieldSelectorModal
                isOpen={isFieldSelectorOpen}
                onClose={() => setIsFieldSelectorOpen(false)}
                metadata={metadata}
                initialSelectedFields={selectedFields}
                onSave={onSelectedFieldsChange}
            />
        </div>
    );
};
