import { type Dispatch, type FC, type SetStateAction, useMemo, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { Compression } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, type OptionBlockOption, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import type { Schema } from '../../../types/config.ts';
import type { ReferenceGenomesInfo } from '../../../types/referencesGenomes.ts';
import { type MetadataVisibility } from '../../../utils/search.ts';
import {
    getSegmentAndGeneInfo,
    allReferencesSelected,
    segmentsWithMultipleReferences,
    type SegmentReferenceSelections,
    getSegmentLapisNames,
    type SegmentLapisNames,
} from '../../../utils/sequenceTypeHelpers.ts';

export type DownloadFormState = {
    includeRestricted: boolean;
    dataType: DownloadDataType['type'];
    compression: Compression;
    unalignedNucleotideSequence: SegmentLapisNames;
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
    selectedReferenceNames?: SegmentReferenceSelections;
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

    const segments = useMemo(
        () => getSegmentLapisNames(referenceGenomesInfo, selectedReferenceNames),
        [referenceGenomesInfo, selectedReferenceNames],
    );

    const referenceSelected = useMemo(() => nucleotideSegmentInfos.length !== 0, [nucleotideSegmentInfos, geneInfos]);
    const notSelectedSegmentsText = useMemo(() => {
        const names = segmentsWithMultipleReferences(referenceGenomesInfo)
            .filter((segment) => selectedReferenceNames?.[segment] === null)
            .map((segment) => referenceGenomesInfo.segmentDisplayNames[segment] ?? segment);

        if (names.length === 0) return '';

        let joined: string;
        if (names.length <= 2) {
            joined = names.join(', ');
        } else {
            joined = `${names[0]}, ..., ${names[names.length - 1]}`;
        }

        const label = names.length === 1 ? 'segment' : 'segments';
        return `${label}: ${joined}`;
    }, [referenceGenomesInfo, selectedReferenceNames]);

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={
                            Array.from(downloadFieldVisibilities.values()).filter((it) =>
                                it.isVisible(referenceGenomesInfo, selectedReferenceNames, false),
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
                            options={segments.map((segment) => ({
                                label: <>{segment.name}</>,
                            }))}
                            selected={segments.findIndex((info) => {
                                const currentSet = new Set(downloadFormState.unalignedNucleotideSequence.lapisNames);
                                return (
                                    info.lapisNames.length === currentSet.size &&
                                    info.lapisNames.every((name) => currentSet.has(name))
                                );
                            })}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    unalignedNucleotideSequence: segments[value],
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

        if (!referenceSelected) {
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
                {!referenceSelected && referenceIdentifierField !== undefined && (
                    <div className='text-sm text-gray-400 mt-4 max-w-60'>
                        Select a {referenceIdentifierField} for the {notSelectedSegmentsText} with the search UI to
                        enable download of aligned sequences.
                    </div>
                )}
                {referenceSelected &&
                    !allReferencesSelected(referenceGenomesInfo, selectedReferenceNames) &&
                    referenceIdentifierField !== undefined && (
                        <div className='text-sm text-gray-400 mt-4 max-w-60'>
                            Select a {referenceIdentifierField} for the {notSelectedSegmentsText} with the search UI to
                            enable download of more aligned sequences.
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
