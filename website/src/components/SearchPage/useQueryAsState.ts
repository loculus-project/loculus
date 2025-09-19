import { useState, useEffect, type Dispatch, type SetStateAction } from 'react';

import type { OrderDirection } from '../../types/lapis.ts';

export interface QueryState {
    page?: string;
    orderBy?: string;
    order?: OrderDirection;
    [key: string]: string | string[] | undefined;
}

const MAX_URL_LENGTH = 2000; // Set a maximum URL length threshold

function parseSearchToDict(search: string): QueryState {
    const urlParams = new URLSearchParams(search);
    const dict: QueryState = {};

    for (const key of new Set(urlParams.keys())) {
        const values = urlParams.getAll(key);
        dict[key] = values.length === 1 ? values[0] : values;
    }
    return dict;
}

function dictToSearchParams(dict: QueryState) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(dict)) {
        if (value === undefined) {
            continue;
        }

        if (Array.isArray(value)) {
            value.forEach((v) => {
                params.append(key, v);
            });
        } else {
            params.set(key, value);
        }
    }
    return params;
}

function buildUrlFromParams(params: URLSearchParams) {
    const base = window.location.protocol + '//' + window.location.host + window.location.pathname;

    // Keep the original behavior of always appending '?'
    let url = base + '?' + params.toString();

    // Avoid '*' at the end because some systems do not recognize it as part of the link
    if (url.endsWith('*')) {
        url = url + '&';
    }

    return url;
}

export default function useQueryAsState(defaultDict: QueryState): [QueryState, Dispatch<SetStateAction<QueryState>>] {
    const [valueDict, setValueDict] = useState(defaultDict);
    const [useUrlStorage, setUseUrlStorage] = useState(true);

    // Initialize from URL once
    useEffect(() => {
        const parsed = parseSearchToDict(window.location.search);
        setValueDict((prev) => (JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed));
    }, []);

    // Keep URL in sync with state (with max-length guard)
    useEffect(() => {
        const params = dictToSearchParams(valueDict);
        const candidateUrl = buildUrlFromParams(params);

        if (useUrlStorage) {
            if (candidateUrl.length > MAX_URL_LENGTH) {
                setUseUrlStorage(false);
                window.history.replaceState({ path: window.location.pathname }, '', window.location.pathname);
            } else {
                window.history.replaceState({ path: candidateUrl }, '', candidateUrl);
            }
        } else {
            if (candidateUrl.length <= MAX_URL_LENGTH) {
                setUseUrlStorage(true);
                window.history.replaceState({ path: candidateUrl }, '', candidateUrl);
            }
        }
    }, [valueDict, useUrlStorage]);

    return [valueDict, setValueDict];
}
