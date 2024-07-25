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
        if (useUrlStorage) {
            const urlParams = new URLSearchParams();
            for (const [key, value] of Object.entries(valueDict)) {
                urlParams.set(key, value);
            }
            const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?" + urlParams.toString();
            
            if (newurl.length > MAX_URL_LENGTH) {
                setUseUrlStorage(false);
                window.history.replaceState({ path: window.location.pathname }, '', window.location.pathname);
            } else {
                window.history.replaceState({ path: newurl }, '', newurl);
            }
        }
    }, [valueDict, useUrlStorage]);

    return [valueDict, setValueDict];
}
