import { useState, useEffect } from 'react';

export interface QueryState {
    [key: string]: string;
}

export type UseQueryAsStateReturn<T extends QueryState> = [T, React.Dispatch<React.SetStateAction<T>>];

const MAX_URL_LENGTH = 2000; // Set a maximum URL length threshold

export default function useQueryAsState<T extends QueryState>(defaultDict: T): UseQueryAsStateReturn<T> {
    const [valueDict, setValueDict] = useState<T>(defaultDict);
    const [useUrlStorage, setUseUrlStorage] = useState(true);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const newDict: Record<string, string> = {};
        for (const [key, value] of urlParams) {
            newDict[key] = value;
        }

        setValueDict((prev) => (JSON.stringify(prev) === JSON.stringify(newDict) ? prev : (newDict as T)));
    }, []);

    useEffect(() => {
        if (useUrlStorage) {
            const urlParams = new URLSearchParams();
            for (const [key, value] of Object.entries(valueDict)) {
                urlParams.set(key, value);
            }
            let newUrl =
                window.location.protocol +
                '//' +
                window.location.host +
                window.location.pathname +
                '?' +
                urlParams.toString();

            // Avoid '*' at the end because some systems do not recognize it as part of the link
            if (newUrl.endsWith('*')) {
                newUrl = newUrl.concat('&');
            }

            if (newUrl.length > MAX_URL_LENGTH) {
                setUseUrlStorage(false);
                window.history.replaceState({ path: window.location.pathname }, '', window.location.pathname);
            } else {
                window.history.replaceState({ path: newUrl }, '', newUrl);
            }
        }
    }, [valueDict, useUrlStorage]);

    return [valueDict, setValueDict];
}
