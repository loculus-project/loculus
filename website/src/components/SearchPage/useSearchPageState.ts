import { useCallback, useMemo } from 'react';

import useStateSyncedWithUrlQueryParams, { type QueryState } from './useStateSyncedWithUrlQueryParams.ts';
import useUrlParamState from '../../hooks/useUrlParamState.ts';
import type { FieldValues, FieldValueUpdate, Schema, SetSomeFieldValues } from '../../types/config.ts';
import type { OrderDirection } from '../../types/lapis.ts';
import {
    COLUMN_VISIBILITY_PREFIX,
    HALF_SCREEN_PARAM,
    MetadataFilterSchema,
    MUTATION_KEY,
    NULL_QUERY_VALUE,
    SELECTED_SEQ_PARAM,
    VISIBILITY_PREFIX,
} from '../../utils/search.ts';
import type { ReferenceGenomesMap } from '../../types/referencesGenomes.ts';

// UI-only parameters that should not reset pagination when changed
const UI_ONLY_PARAMS = new Set([SELECTED_SEQ_PARAM, HALF_SCREEN_PARAM]);

type UseSearchPageStateParams = {
    initialQueryDict: QueryState;
    schema: Schema;
    hiddenFieldValues: FieldValues;
    filterSchema: MetadataFilterSchema;
    referenceGenomesMap: ReferenceGenomesMap;
};

export function useSearchPageState({
    initialQueryDict,
    schema,
    hiddenFieldValues,
    filterSchema,
    referenceGenomesMap,
}: UseSearchPageStateParams) {
    const [state, setState] = useStateSyncedWithUrlQueryParams(initialQueryDict);

    const page = parseInt(state.page ?? '1', 10);

    const setPage = useCallback(
        (newPage: number) => {
            setState((prev: QueryState) => {
                if (newPage === 1) {
                    const withoutPageSet = { ...prev };
                    delete withoutPageSet.page;
                    return withoutPageSet;
                } else {
                    return {
                        ...prev,
                        page: newPage.toString(),
                    };
                }
            });
        },
        [setState],
    );

    /**
     * Update field values (query parameters).
     * If value is '' or null, the query parameter is unset.
     * For multi-select fields, we handle fieldValuesToSet as an array where:
     * - If value is an array, it sets multiple values for that field
     * - If value is '' or null, it clears the field
     *
     * Resets pagination to page 1 unless the parameter is a UI-only parameter
     * (defined in UI_ONLY_PARAMS) that doesn't affect search results.
     */
    const setSomeFieldValues: SetSomeFieldValues = useCallback(
        (...fieldValuesToSet: FieldValueUpdate[]) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === '' || value === null) {
                        if (Object.keys(hiddenFieldValues).includes(key)) {
                            // keep explicitly empty fields because they override the hiddenFieldValues here
                            newState[key] = '';
                        } else {
                            // we can delete keys that are not in the hiddenFieldValues
                            delete newState[key];
                        }
                    } else if (Array.isArray(value)) {
                        // Handle array values for multi-select
                        if (value.length === 0) {
                            delete newState[key];
                        } else {
                            newState[key] = value.map((v) => v ?? NULL_QUERY_VALUE);
                        }
                    } else {
                        newState[key] = value;
                    }

                    if (schema.referenceIdentifierField !== undefined && key === schema.referenceIdentifierField) {
                        delete newState[MUTATION_KEY];
                        filterSchema
                            .ungroupedMetadataFilters()
                            .filter((metadataFilter) => metadataFilter.onlyForReference !== undefined)
                            .forEach((metadataFilter) => {
                                delete newState[metadataFilter.name];
                            });
                    }
                });

                return newState;
            });

            // Only reset pagination if not a UI-only parameter
            const shouldResetPagination = fieldValuesToSet.some(([key]) => !UI_ONLY_PARAMS.has(key));
            if (shouldResetPagination) {
                setPage(1);
            }
        },
        [setState, setPage, hiddenFieldValues, schema.referenceIdentifierField, filterSchema],
    );

    const [previewedSeqId, setPreviewedSeqId] = useUrlParamState<string | null>(
        SELECTED_SEQ_PARAM,
        state,
        null,
        setSomeFieldValues,
        'nullable-string',
        (value) => !value,
    );
    const [previewHalfScreen, setPreviewHalfScreen] = useUrlParamState(
        HALF_SCREEN_PARAM,
        state,
        false,
        setSomeFieldValues,
        'boolean',
        (value) => !value,
    );

    const segments = useMemo(() => Object.keys(referenceGenomesMap), [referenceGenomesMap]);
    const getIdentifier = (identifier: string | undefined, segmentName: string, multipleSegments: boolean) => {
        if (identifier === undefined) {
            return undefined;
        }
        return multipleSegments ? `${identifier}-${segmentName}` : identifier;
    };
    const selectedReferences = useMemo<Record<string, string | null>>(() => {
        const result: Record<string, string | null> = {};

        segments.forEach((segmentName) => {
            const referenceIdentifier = getIdentifier(
                schema.referenceIdentifierField,
                segmentName,
                segments.length > 1,
            );
            result[segmentName] = referenceIdentifier === undefined ? null : (state[referenceIdentifier] ?? null);
        });

        return result;
    }, [segments, state, schema.referenceIdentifierField]);

    console.log('selectedReferences in useSearchPageState:');
    console.log(selectedReferences);

    const setSelectedReferences = useCallback(
        (updates: Record<string, string | null>) => {
            Object.entries(updates).forEach(([segmentName, value]) => {
                const identifier = getIdentifier(schema.referenceIdentifierField, segmentName, segments.length > 1);
                if (identifier === undefined) {
                    return;
                }
                setSomeFieldValues([identifier, value]);
            });
        },
        [setSomeFieldValues, segments, schema.referenceIdentifierField],
    );

    const removeFilter = useCallback(
        (metadataFilterName: string) => {
            if (Object.keys(hiddenFieldValues).includes(metadataFilterName)) {
                const hiddenValue = hiddenFieldValues[metadataFilterName];
                // If it's an array with nulls, filter them out (shouldn't happen but TypeScript doesn't know)
                const valueToSet = Array.isArray(hiddenValue)
                    ? hiddenValue.filter((v): v is string => v !== null)
                    : hiddenValue;
                setSomeFieldValues([metadataFilterName, valueToSet]);
            } else {
                setSomeFieldValues([metadataFilterName, null]);
            }
        },
        [setSomeFieldValues, hiddenFieldValues],
    );

    const orderByField = state.orderBy ?? schema.defaultOrderBy;
    const orderDirection = state.order ?? schema.defaultOrder;

    const setOrderByField = useCallback(
        (field: string) => {
            setState((prev: QueryState) => ({
                ...prev,
                orderBy: field,
                page: '1',
            }));
        },
        [setState],
    );

    const setOrderDirection = useCallback(
        (direction: OrderDirection) => {
            setState((prev: QueryState) => ({
                ...prev,
                order: direction,
                page: '1',
            }));
        },
        [setState],
    );

    const setASearchVisibility = useCallback(
        (fieldName: string, visible: boolean) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                const key = `${VISIBILITY_PREFIX}${fieldName}`;
                const metadataField = schema.metadata.find((field) => {
                    let name = field.name;
                    if (field.rangeOverlapSearch) {
                        name = field.rangeOverlapSearch.rangeName;
                    }
                    return name === fieldName;
                });
                const defaultVisible = metadataField?.initiallyVisible === true;
                if (visible === defaultVisible) {
                    delete newState[key];
                } else {
                    newState[key] = visible ? 'true' : 'false';
                }
                if (!visible) {
                    delete newState[fieldName];
                }
                return newState;
            });
            if (!visible) {
                setPage(1);
            }
        },
        [setState, schema, setPage],
    );

    const setAColumnVisibility = useCallback(
        (fieldName: string, visible: boolean) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                const key = `${COLUMN_VISIBILITY_PREFIX}${fieldName}`;
                const defaultVisible = schema.tableColumns.includes(fieldName);
                if (visible === defaultVisible) {
                    delete newState[key];
                } else {
                    newState[key] = visible ? 'true' : 'false';
                }
                return newState;
            });
        },
        [setState, schema],
    );

    return useMemo(
        () => ({
            state,
            previewedSeqId,
            setPreviewedSeqId,
            previewHalfScreen,
            setPreviewHalfScreen,
            selectedReferences,
            setSelectedReferences,
            page,
            setPage,
            setSomeFieldValues,
            removeFilter,
            orderByField,
            orderDirection,
            setOrderByField,
            setOrderDirection,
            setASearchVisibility,
            setAColumnVisibility,
        }),
        [
            state,
            previewedSeqId,
            setPreviewedSeqId,
            previewHalfScreen,
            setPreviewHalfScreen,
            selectedReferences,
            setSelectedReferences,
            page,
            setPage,
            setSomeFieldValues,
            removeFilter,
            orderByField,
            orderDirection,
            setOrderByField,
            setOrderDirection,
            setASearchVisibility,
            setAColumnVisibility,
        ],
    );
}
