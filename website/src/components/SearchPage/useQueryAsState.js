import { useState, useEffect } from 'react';

export default function useQueryAsState(defaultDict) {
    const [valueDict, setValueDict] = useState(defaultDict);
    useEffect(() => {
        const urlParams = new URLSearchParams(window.location.search);
        
        const newDict = {};
        for (const [key, value] of urlParams) {
            newDict[key] = value;
        }
        setValueDict(newDict);
        console.log('useQueryAsState', newDict);
    }
    , []);
    useEffect(() => {
        const urlParams = new URLSearchParams();
        for (const [key, value] of Object.entries(valueDict)) {
            urlParams.set(key, value);
        }
        const newurl = window.location.protocol + "//" + window.location.host + window.location.pathname + "?" + urlParams.toString();
        window.history.replaceState({path:newurl},'',newurl);
    }
    , [valueDict]);


    return [valueDict, setValueDict]

}
