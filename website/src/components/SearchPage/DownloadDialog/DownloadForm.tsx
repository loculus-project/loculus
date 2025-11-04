import { type Dispatch, type FC, type SetStateAction, useMemo, useState } from 'react';

import type { DownloadDataType } from './DownloadDataType.ts';
import type { Compression } from './DownloadUrlGenerator.ts';
import { FieldSelectorButton } from './FieldSelector/FieldSelectorButton.tsx';
import { FieldSelectorModal } from './FieldSelector/FieldSelectorModal.tsx';
import { DropdownOptionBlock, type OptionBlockOption, RadioOptionBlock } from './OptionBlock.tsx';
import { routes } from '../../../routes/routes.ts';
import { ACCESSION_VERSION_FIELD } from '../../../settings.ts';
import type { Metadata, Schema } from '../../../types/config.ts';
import { type ReferenceGenomesLightweightSchema, SINGLE_REFERENCE } from '../../../types/referencesGenomes.ts';
import {
    type GeneInfo,
    getMultiPathogenNucleotideSequenceNames,
    getMultiPathogenSequenceName,
    getSinglePathogenSequenceName,
    isMultiSegmented,
    type SegmentInfo,
} from '../../../utils/sequenceTypeHelpers.ts';
import { formatLabel } from '../SuborganismSelector.tsx';
import { stillRequiresSuborganismSelection } from '../stillRequiresSuborganismSelection.tsx';

export type DownloadFormState = {
    includeRestricted: boolean;
    dataType: DownloadDataType['type'];
    compression: Compression;
    unalignedNucleotideSequence: string;
    alignedNucleotideSequence: string;
    alignedAminoAcidSequence: string;
    includeRichFastaHeaders: boolean;
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

type DownloadFormProps = {
    referenceGenomesLightweightSchema: ReferenceGenomesLightweightSchema;
    downloadFormState: DownloadFormState;
    setDownloadFormState: Dispatch<SetStateAction<DownloadFormState>>;
    allowSubmissionOfConsensusSequences: boolean;
    dataUseTermsEnabled: boolean;
    metadata: Metadata[];
    selectedFields: Set<string>;
    onSelectedFieldsChange: Dispatch<SetStateAction<Set<string>>>;
    richFastaHeaderFields: Schema['richFastaHeaderFields'];
    selectedSuborganism: string | null;
    suborganismIdentifierField: string | undefined;
};

export const DownloadForm: FC<DownloadFormProps> = ({
    referenceGenomesLightweightSchema,
    downloadFormState,
    setDownloadFormState,
    allowSubmissionOfConsensusSequences,
    dataUseTermsEnabled,
    metadata,
    selectedFields,
    onSelectedFieldsChange,
    richFastaHeaderFields,
    selectedSuborganism,
    suborganismIdentifierField,
}) => {
    const [isFieldSelectorOpen, setIsFieldSelectorOpen] = useState(false);
    const { nucleotideSequences, genes } = useMemo(
        () => getSequenceNames(referenceGenomesLightweightSchema, selectedSuborganism),
        [referenceGenomesLightweightSchema, selectedSuborganism],
    );

    const disableAlignedSequences = stillRequiresSuborganismSelection(
        referenceGenomesLightweightSchema,
        selectedSuborganism,
    );

    function getDataTypeOptions(): OptionBlockOption[] {
        const metadataOption = {
            label: (
                <div className='flex items-center gap-3'>
                    <span>Metadata</span>
                    <FieldSelectorButton
                        onClick={() => setIsFieldSelectorOpen(true)}
                        selectedFieldsCount={selectedFields.size}
                        disabled={downloadFormState.dataType !== 'metadata'}
                    />
                </div>
            ),
        };

        const rawNucleotideSequencesOption = {
            label: <>Raw nucleotide sequences</>,
            subOptions: (
                <div className='px-8'>
                    {isMultiSegmented(nucleotideSequences) ? (
                        <DropdownOptionBlock
                            name='unalignedNucleotideSequences'
                            options={nucleotideSequences.map((segment) => ({
                                label: <>{segment.label}</>,
                            }))}
                            selected={nucleotideSequences.findIndex(
                                (info) => info.lapisName === downloadFormState.unalignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    unalignedNucleotideSequence: nucleotideSequences[value].lapisName,
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
                subOptions: isMultiSegmented(nucleotideSequences) ? (
                    <div className='px-8'>
                        <DropdownOptionBlock
                            name='alignedNucleotideSequences'
                            options={nucleotideSequences.map((segment) => ({
                                label: <>{segment.label}</>,
                            }))}
                            selected={nucleotideSequences.findIndex(
                                (info) => info.lapisName === downloadFormState.alignedNucleotideSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    alignedNucleotideSequence: nucleotideSequences[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'alignedNucleotideSequences'}
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
                            options={genes.map((gene) => ({
                                label: <>{gene.label}</>,
                            }))}
                            selected={genes.findIndex(
                                (info) => info.lapisName === downloadFormState.alignedAminoAcidSequence,
                            )}
                            onSelect={(value) =>
                                setDownloadFormState((previous) => ({
                                    ...previous,
                                    alignedAminoAcidSequence: genes[value].lapisName,
                                }))
                            }
                            disabled={downloadFormState.dataType !== 'alignedAminoAcidSequences'}
                        />
                    </div>
                ),
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
                {disableAlignedSequences && suborganismIdentifierField !== undefined && (
                    <div className='text-sm text-gray-400 mt-4 max-w-60'>
                        Or select a {formatLabel(suborganismIdentifierField)} with the search UI to enable download of
                        aligned sequences.
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
                metadata={metadata}
                selectedFields={selectedFields}
                onSelectedFieldsChange={onSelectedFieldsChange}
            />
        </div>
    );
};

export function getSequenceNames(
    referenceGenomeLightweightSchema: ReferenceGenomesLightweightSchema,
    selectedSuborganism: string | null,
): {
    nucleotideSequences: SegmentInfo[];
    genes: GeneInfo[];
    useMultiSegmentEndpoint: boolean;
    defaultFastaHeaderTemplate?: string;
} {
    if (SINGLE_REFERENCE in referenceGenomeLightweightSchema) {
        const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[SINGLE_REFERENCE];
        return {
            nucleotideSequences: nucleotideSegmentNames.map(getSinglePathogenSequenceName),
            genes: geneNames.map(getSinglePathogenSequenceName),
            useMultiSegmentEndpoint: isMultiSegmented(nucleotideSegmentNames),
        };
    }

    if (selectedSuborganism === null) {
        return {
            nucleotideSequences: [],
            genes: [],
            useMultiSegmentEndpoint: false, // When no suborganism is selected, use the "all segments" endpoint to download all available segments, even though LAPIS is multisegmented. That endpoint is available at the same route as the single segmented endpoint.
            defaultFastaHeaderTemplate: `{${ACCESSION_VERSION_FIELD}}`, // make sure that the segment does not appear in the fasta header
        };
    }

    const { nucleotideSegmentNames, geneNames } = referenceGenomeLightweightSchema[selectedSuborganism];
    return {
        nucleotideSequences: getMultiPathogenNucleotideSequenceNames(nucleotideSegmentNames, selectedSuborganism),
        genes: geneNames.map((name) => getMultiPathogenSequenceName(name, selectedSuborganism)),
        useMultiSegmentEndpoint: true,
    };
}
