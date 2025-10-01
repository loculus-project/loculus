import { useCallback, useMemo } from 'react';

import useQueryAsState, { type QueryState } from './useQueryAsState';
import useUrlParamState from '../../hooks/useUrlParamState';
import type { FieldValueUpdate, FieldValues, Schema, SetSomeFieldValues } from '../../types/config.ts';
import type { OrderDirection } from '../../types/lapis.ts';
import {
    COLUMN_VISIBILITY_PREFIX,
    getColumnVisibilitiesFromQuery,
    getFieldVisibilitiesFromQuery,
    MetadataFilterSchema,
    NULL_QUERY_VALUE,
    VISIBILITY_PREFIX,
} from '../../utils/search.ts';

export interface SearchStateHook {
    state: QueryState;
    setState: React.Dispatch<React.SetStateAction<QueryState>>;
    previewedSeqId: string | null;
    setPreviewedSeqId: (id: string | null) => void;
    previewHalfScreen: boolean;
    setPreviewHalfScreen: (value: boolean) => void;
    selectedSuborganism: string | null;
    setSelectedSuborganism: (value: string | null) => void;
    searchVisibilities: Map<string, boolean>;
    columnVisibilities: Map<string, boolean>;
    columnsToShow: string[];
    orderByField: string;
    orderDirection: OrderDirection;
    page: number;
    setPage: (page: number) => void;
    setOrderByField: (field: string) => void;
    setOrderDirection: (direction: OrderDirection) => void;
    fieldValues: FieldValues;
    setSomeFieldValues: SetSomeFieldValues;
    removeFilter: (metadataFilterName: string) => void;
    setASearchVisibility: (fieldName: string, visible: boolean) => void;
    setAColumnVisibility: (fieldName: string, visible: boolean) => void;
}

export function useSearchState(
    initialQueryDict: QueryState,
    schema: Schema,
    hiddenFieldValues: FieldValues = {},
): SearchStateHook {
    const filterSchema = useMemo(() => new MetadataFilterSchema(schema.metadata), [schema.metadata]);
    const [state, setState] = useQueryAsState(initialQueryDict);

    const [previewedSeqId, setPreviewedSeqId] = useUrlParamState<string | null>(
        'selectedSeq',
        state,
        null,
        setState,
        'nullable-string',
        (value) => !value,
    );

    const [previewHalfScreen, setPreviewHalfScreen] = useUrlParamState(
        'halfScreen',
        state,
        false,
        setState,
        'boolean',
        (value) => !value,
    );

    const [selectedSuborganism, setSelectedSuborganism] = useUrlParamState<string | null>(
        schema.suborganismIdentifierField ?? '',
        state,
        null,
        setState,
        'nullable-string',
        (value) => value === null,
    );

    const searchVisibilities = useMemo(() => {
        return getFieldVisibilitiesFromQuery(schema, state);
    }, [schema, state]);

    const columnVisibilities = useMemo(() => getColumnVisibilitiesFromQuery(schema, state), [schema, state]);

    const columnsToShow = useMemo(() => {
        return schema.metadata
            .filter((field) => columnVisibilities.get(field.name) === true)
            .map((field) => field.name);
    }, [schema.metadata, columnVisibilities]);

    let orderByField = state.orderBy ?? schema.defaultOrderBy;
    if (!columnsToShow.includes(orderByField)) {
        orderByField = schema.primaryKey;
    }

    const orderDirection = state.order ?? schema.defaultOrder;
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

    const fieldValues = useMemo(() => {
        return filterSchema.getFieldValuesFromQuery(state, hiddenFieldValues);
    }, [state, hiddenFieldValues, filterSchema]);

    const setSomeFieldValues: SetSomeFieldValues = useCallback(
        (...fieldValuesToSet: FieldValueUpdate[]) => {
            setState((prev: QueryState) => {
                const newState = { ...prev };
                fieldValuesToSet.forEach(([key, value]) => {
                    if (value === '' || value === null) {
                        if (Object.keys(hiddenFieldValues).includes(key)) {
                            newState[key] = '';
                        } else {
                            delete newState[key];
                        }
                    } else if (Array.isArray(value)) {
                        if (value.length === 0) {
                            delete newState[key];
                        } else {
                            newState[key] = value.map((v) => v ?? NULL_QUERY_VALUE);
                        }
                    } else {
                        newState[key] = value;
                    }
                });
                return newState;
            });
            setPage(1);
        },
        [setState, setPage, hiddenFieldValues],
    );

    const removeFilter = useCallback(
        (metadataFilterName: string) => {
            if (Object.keys(hiddenFieldValues).includes(metadataFilterName)) {
                const hiddenValue = hiddenFieldValues[metadataFilterName];
                const valueToSet = Array.isArray(hiddenValue)
                    ? hiddenValue.filter((v): v is string => v !== null)
                    : hiddenValue;
                setSomeFieldValues([metadataFilterName, valueToSet]);
            } else {
                setSomeFieldValues([metadataFilterName, null]);
            }
        },
        [hiddenFieldValues, setSomeFieldValues],
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
        [setState, setPage, schema.metadata],
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
        [setState, schema.tableColumns],
    );

    return {
        state,
        setState,
        previewedSeqId,
        setPreviewedSeqId,
        previewHalfScreen,
        setPreviewHalfScreen,
        selectedSuborganism,
        setSelectedSuborganism,
        searchVisibilities,
        columnVisibilities,
        columnsToShow,
        orderByField,
        orderDirection,
        page,
        setPage,
        setOrderByField,
        setOrderDirection,
        fieldValues,
        setSomeFieldValues,
        removeFilter,
        setASearchVisibility,
        setAColumnVisibility,
    };
}
