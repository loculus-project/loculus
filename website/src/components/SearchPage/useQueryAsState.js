import { useState, useEffect } from 'react';

const MAX_URL_LENGTH = 2000; // Set a maximum URL length threshold

export default function useQueryAsState(defaultDict) {
    const [valueDict, setValueDict] = useState(defaultDict);
    const [useUrlStorage, setUseUrlStorage] = useState(true);

    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        const newDict = {};
        
        // Group parameters with the same key into arrays
        const paramEntries = [...urlParams.entries()];
        const paramGroups = {};
        
        for (const [key, value] of paramEntries) {
            if (!paramGroups[key]) {
                paramGroups[key] = [];
            }
            paramGroups[key].push(value);
        }
        
        // Handle both single values and arrays
        for (const key in paramGroups) {
            if (paramGroups[key].length === 1) {
                // Single value - store as string
                newDict[key] = paramGroups[key][0];
            } else {
                // Multiple values - store as array
                newDict[key] = paramGroups[key];
            }
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
                if (Array.isArray(value)) {
                    // Handle arrays of values by adding multiple params with the same key
                    value.forEach(val => {
                        urlParams.append(key, val);
                    });
                } else {
                    // Handle single values
                    urlParams.set(key, value);
                }
            }
            
            let newUrl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?" + urlParams.toString();

            // Avoid '*' at the end because some systems do not recognize it as part of the link
            if (newUrl.endsWith("*")) {
                newUrl = newUrl.concat("&");
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
