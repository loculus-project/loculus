import { type Dispatch, type FC, type SetStateAction, useMemo, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { Compression } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, type OptionBlockOption, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import type { Schema } from '../../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../../types/referencesGenomes.ts';
import { MetadataFilterSchema, type MetadataVisibility } from '../../../utils/search.ts';
import {
    getSegmentAndGeneInfo,
    stillRequiresReferenceNameSelection,
    type SegmentReferenceSelections,
} from '../../../utils/sequenceTypeHelpers.ts';

export type DownloadFormState = {
    includeRestricted: boolean;
    dataType: DownloadDataType['type'];
    compression: Compression;
    unalignedNucleotideSequence: string;
    alignedNucleotideSequence: string;
    alignedAminoAcidSequence: string;
    includeRichFastaHeaders: boolean;
};

type DownloadFormProps = {
    referenceGenomesInfo: ReferenceGenomesInfo;
    downloadFormState: DownloadFormState;
    setDownloadFormState: Dispatch<SetStateAction<DownloadFormState>>;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    schema: Schema;
    downloadFieldVisibilities: Map<string, MetadataVisibility>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedReferenceNames: SegmentReferenceSelections;
    referenceIdentifierField: string | undefined;
};

export const DownloadForm: FC<DownloadFormProps> = ({
    referenceGenomesInfo,
    downloadFormState,
    setDownloadFormState,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    schema,
    downloadFieldVisibilities,
    onSelectedFieldsChange,
    richFastaHeaderFields,
    selectedReferenceNames,
    referenceIdentifierField,
}) => {
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { nucleotideSegmentInfos, geneInfos } = useMemo(
        () => getSegmentAndGeneInfo(referenceGenomesInfo, selectedReferenceNames),
        [referenceGenomesInfo, selectedReferenceNames],
    );

    const disableAlignedSequences = stillRequiresReferenceNameSelection(selectedReferenceNames, referenceGenomesInfo);

    const metadataSchema = schema.metadata;
    const filterSchema = useMemo(() => new MetadataFilterSchema(metadataSchema), [metadataSchema]);

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={
                            Array.from(downloadFieldVisibilities.values()).filter((it) =>
                                it.isDownloadable(selectedReferenceNames, referenceGenomesInfo),
                            ).length
                        }
                        disabled={downloadFormState.dataType !== 'metadata'}
                    />
                </div>
            ),
        };

        const rawNucleotideSequencesOption = {
            label: <>Raw nucleotide sequences</>,
            subOptions: (
                <div className='px-8'>
                    {referenceGenomesInfo.isMultiSegmented ? (
                        <DropdownOptionBlock
                            name='unalignedNucleotideSequences'
                            options={nucleotideSegmentInfos.map((segment) => ({
                                label: <>{segment.name}</>,
                            }))}
                            selected={nucleotideSegmentInfos.findIndex(
                                (info) => info.lapisName === downloadFormState.unalignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    unalignedNucleotideSequence: nucleotideSegmentInfos[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'unalignedNucleotideSequences'}
                        />
                    ) : undefined}
                    {richFastaHeaderFields && (
                        <RadioOptionBlock
                            name='richFastaHeaders'
                            title='FASTA header style'
                            options={[{ label: <>Accession</> }, { label: <>Display name</> }]}
                            selected={downloadFormState.includeRichFastaHeaders ? 1 : 0}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    includeRichFastaHeaders: value > 0,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'unalignedNucleotideSequences'}
                            variant='nested'
                        />
                    )}
                </div>
            ),
        };

        if (!allowSubmissionOfConsensusSequences) {
            return [metadataOption];
        }

        if (disableAlignedSequences) {
            return [metadataOption, rawNucleotideSequencesOption];
        }

        return [
            metadataOption,
            rawNucleotideSequencesOption,
            {
                label: <>Aligned nucleotide sequences</>,
                subOptions: referenceGenomesInfo.isMultiSegmented ? (
                    <div className='px-8'>
                        <DropdownOptionBlock
                            name='alignedNucleotideSequences'
                            options={nucleotideSegmentInfos.map((segment) => ({
                                label: <>{segment.name}</>,
                            }))}
                            selected={nucleotideSegmentInfos.findIndex(
                                (info) => info.lapisName === downloadFormState.alignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    alignedNucleotideSequence: nucleotideSegmentInfos[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'alignedNucleotideSequences'}
                        />
                    </div>
                ) : undefined,
            },
            {
                label: <>Aligned amino acid sequences</>,
                subOptions:
                    geneInfos.length > 0 ? (
                        <div className='px-8'>
                            <DropdownOptionBlock
                                name='alignedAminoAcidSequences'
                                options={geneInfos.map((gene) => ({
                                    label: <>{gene.name}</>,
                                }))}
                                selected={geneInfos.findIndex(
                                    (info) => info.lapisName === downloadFormState.alignedAminoAcidSequence,
                                )}
                                onSelect={(value) =>
                                    setDownloadFormState((previous) => ({
                                        ...previous,
                                        alignedAminoAcidSequence: geneInfos[value].lapisName,
                                    }))
                                }
                                disabled={downloadFormState.dataType !== 'alignedAminoAcidSequences'}
                            />
                        </div>
                    ) : undefined,
            },
        ];
    }

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
                                    <br />(
                                    <a href={routes.datauseTermsPage()} className='underline'>
                                        What does it mean?
                                    </a>
                                    )
                                </>
                            ),
                        },
                    ]}
                    selected={downloadFormState.includeRestricted ? 1 : 0}
                    onSelect={(value) =>
                        setDownloadFormState((previous) => ({
                            ...previous,
                            includeRestricted: value > 0,
                        }))
                    }
                />
            )}
            <div className='flex-1 min-w-0'>
                <RadioOptionBlock
                    name='dataType'
                    title='Data type'
                    options={getDataTypeOptions()}
                    selected={dataTypeToOptionMap[downloadFormState.dataType]}
                    onSelect={(value) =>
                        setDownloadFormState((previous) => ({
                            ...previous,
                            dataType: optionToDataTypeMap[value],
                        }))
                    }
                />
                {disableAlignedSequences && referenceIdentifierField !== undefined && (
                    <div className='text-sm text-gray-400 mt-4 max-w-60'>
                        Or select a {filterSchema.filterNameToLabelMap()[referenceIdentifierField]} with the search UI
                        to enable download of aligned sequences.
                    </div>
                )}
            </div>

            <RadioOptionBlock
                name='compression'
                title='Compression'
                options={[{ label: <>None</> }, { label: <>Zstandard</> }, { label: <>Gzip</> }]}
                selected={mapCompressionToOption(downloadFormState.compression)}
                onSelect={(value) =>
                    setDownloadFormState((previous) => ({
                        ...previous,
                        compression: optionToCompressionMap[value],
                    }))
                }
            />

            <FieldSelectorModal
                isOpen={isFieldSelectorOpen}
                onClose={() => setIsFieldSelectorOpen(false)}
                schema={schema}
                downloadFieldVisibilities={downloadFieldVisibilities}
                onSelectedFieldsChange={onSelectedFieldsChange}
                selectedReferenceNames={selectedReferenceNames}
                referenceGenomesInfo={referenceGenomesInfo}
            />
        </div>
    );
};

const optionToDataTypeMap: DownloadDataType['type'][] = [
    'metadata',
    'unalignedNucleotideSequences',
    'alignedNucleotideSequences',
    'alignedAminoAcidSequences',
];

const dataTypeToOptionMap = optionToDataTypeMap.reduce(
    (acc, value, index) => ({
        ...acc,
        [value]: index,
    }),
    {} as Record<DownloadDataType['type'], number>,
);

const optionToCompressionMap: Compression[] = [undefined, 'zstd', 'gzip'];

function mapCompressionToOption(compression: Compression) {
    return optionToCompressionMap.findIndex((it) => it === compression);
}
