import { useState, useEffect } from 'react';

const MAX_URL_LENGTH = 2000; // Set a maximum URL length threshold

export default function useQueryAsState(defaultDict) {
    const [valueDict, setValueDict] = useState(defaultDict);
    const [useUrlStorage, setUseUrlStorage] = useState(true);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const newDict = {};
        for (const [key, value] of urlParams) {
            newDict[key] = value;
        }
       
        setValueDict( // only change if actually different
        (prev) =>
            JSON.stringify(prev) === JSON.stringify(newDict) ? prev : newDict
        );
    }, []);

    useEffect(() => {
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
            if (useUrlStorage) {
                setUseUrlStorage(false);
                window.history.replaceState(
                    { path: window.location.pathname },
                    '',
                    window.location.pathname,
                );
            }
        } else {
            if (!useUrlStorage) {
                setUseUrlStorage(true);
            }
            window.history.replaceState({ path: newUrl }, '', newUrl);
        }
    }, [valueDict, useUrlStorage]);

    return [valueDict, setValueDict];
}
