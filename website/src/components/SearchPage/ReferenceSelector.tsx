import { type FC, useId, useMemo } from 'react';

import type { LapisSearchParameters } from './DownloadDialog/SequenceFilters.tsx';
import { createOptionsProviderHook, type OptionsProvider } from './fields/AutoCompleteOptions.ts';
import { type ReferenceGenomesInfo } from '../../types/referencesGenomes.ts';
import { formatNumberWithDefaultLocale } from '../../utils/formatNumber.tsx';
import { getReferenceIdentifier } from '../../utils/referenceSelection.ts';
import type { MetadataFilterSchema } from '../../utils/search.ts';
import { segmentsWithMultipleReferences, type SegmentReferenceSelections } from '../../utils/sequenceTypeHelpers.ts';
import { Button } from '../common/Button.tsx';
import { Select } from '../common/Select.tsx';
import MaterialSymbolsClose from '~icons/material-symbols/close';

type SegmentReferenceSelectorProps = {
    selectId: string;
    label: string | undefined;
    value: string | null | undefined;
    onChange: (next: string) => void;
    onClear: () => void;
    optionsProvider: OptionsProvider;
    referenceDisplayNameMap: Map<string, string>;
};

const SegmentReferenceSelector: FC<SegmentReferenceSelectorProps> = ({
    selectId,
    label,
    value,
    onChange,
    onClear,
    optionsProvider,
    referenceDisplayNameMap,
}) => {
    const hook = createOptionsProviderHook(optionsProvider);
    const { options, isPending, error, load } = hook();

    return (
        <div className='bg-gray-50 border border-gray-300 rounded-md p-3 mb-3'>
            <label className='block text-xs font-semibold text-gray-700 mb-1' htmlFor={selectId}>
                {label}
            </label>

            <div className='relative'>
                <Select
                    id={selectId}
                    value={value ?? ''}
                    onChange={(e) => onChange(e.target.value)}
                    onFocus={() => {
                        load();
                    }}
                    className='w-full px-2 py-1.5 rounded border border-gray-300 text-sm bg-white focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-200'
                >
                    <option value='' disabled>
                        Select {formatLabel(label ?? '')}...
                    </option>

                    {isPending && (
                        <option value='' disabled>
                            Loading...
                        </option>
                    )}

                    {error && !isPending && (
                        <option value='' disabled>
                            Failed to load options
                        </option>
                    )}

                    {!isPending &&
                        !error &&
                        options.map((opt) => {
                            const display =
                                opt.count !== undefined
                                    ? `${referenceDisplayNameMap.get(opt.option) ?? opt.option} (${formatNumberWithDefaultLocale(opt.count)})`
                                    : (referenceDisplayNameMap.get(opt.option) ?? opt.option);

                            return (
                                <option key={opt.value} value={opt.value}>
                                    {display}
                                </option>
                            );
                        })}
                </Select>

                {value != null && (
                    <Button
                        className='absolute top-2 right-6 flex items-center pr-2 h-5 bg-white rounded-sm'
                        onClick={onClear}
                        aria-label={`Clear ${label ?? ''}`}
                        type='button'
                    >
                        <MaterialSymbolsClose className='w-5 h-5 text-gray-400' />
                    </Button>
                )}
            </div>

            <p className='text-xs text-gray-600 mt-2'>
                Select a {formatLabel(label ?? '')} to enable mutation search and download of aligned sequences
            </p>
        </div>
    );
};

type ReferenceSelectorProps = {
    lapisSearchParameters: LapisSearchParameters;
    lapisUrl: string;
    filterSchema: MetadataFilterSchema;
    referenceGenomesInfo: ReferenceGenomesInfo;
    referenceIdentifierField: string;
    selectedReferences: SegmentReferenceSelections;
    setSelectedReferences: (newValues: SegmentReferenceSelections) => void;
    segmentName: string;
};

export const ReferenceSelector: FC<ReferenceSelectorProps> = ({
    lapisSearchParameters,
    lapisUrl,
    filterSchema,
    referenceGenomesInfo,
    referenceIdentifierField,
    selectedReferences,
    setSelectedReferences,
    segmentName,
}) => {
    const baseSelectId = useId();

    const multiRefSegments = segmentsWithMultipleReferences(referenceGenomesInfo);
    if (multiRefSegments.length === 0) return null;
    if (!multiRefSegments.includes(segmentName)) return null;
    const identifier = useMemo(() => {
        return getReferenceIdentifier(referenceIdentifierField, segmentName, referenceGenomesInfo.isMultiSegmented);
    }, [referenceIdentifierField, segmentName, referenceGenomesInfo.isMultiSegmented]);
    const label = useMemo(() => {
        return identifier ? filterSchema.filterNameToLabelMap()[identifier] : undefined;
    }, [filterSchema, referenceIdentifierField]);
    const referenceDisplayNameMap = useMemo(
        () =>
            new Map(
                Object.entries(referenceGenomesInfo.segmentReferenceGenomes[segmentName]).map(
                    ([ref, refData]) => [ref, refData.displayName ?? ref] as const,
                ),
            ),
        [referenceGenomesInfo.segmentReferenceGenomes, segmentName],
    );

    const optionsProvider = useMemo(
        () => ({
            type: 'generic' as const,
            lapisUrl,
            lapisSearchParameters,
            fieldName: identifier,
        }),
        [multiRefSegments, identifier, lapisUrl, lapisSearchParameters],
    );

    return (
        <SegmentReferenceSelector
            key={segmentName}
            label={label}
            selectId={`${baseSelectId}-${segmentName}`}
            value={selectedReferences[segmentName]}
            onChange={(e) =>
                setSelectedReferences({
                    ...selectedReferences,
                    [segmentName]: e,
                })
            }
            onClear={() =>
                setSelectedReferences({
                    ...selectedReferences,
                    [segmentName]: null,
                })
            }
            optionsProvider={optionsProvider}
            referenceDisplayNameMap={referenceDisplayNameMap}
        />
    );
};

export const formatLabel = (label: string) => {
    if (label === label.toUpperCase()) {
        return label; // all caps, keep as is
    }
    return label.charAt(0).toLowerCase() + label.slice(1);
};
