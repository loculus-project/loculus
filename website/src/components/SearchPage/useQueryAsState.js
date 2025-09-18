import { useState, useEffect } from 'react';
import { NULL_QUERY_VALUE } from '../../utils/search.ts';

const MAX_URL_LENGTH = 2000; // Set a maximum URL length threshold

function parseSearchToDict(search) {
  const urlParams = new URLSearchParams(search);
  const dict = {};

  for (const key of new Set(urlParams.keys())) {
    const values = urlParams.getAll(key);
    dict[key] = values.length === 1 ? values[0] : values;
  }
  return dict;
}

function dictToSearchParams(dict) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(dict)) {
    if (Array.isArray(value)) {
      value.forEach((v) => {
        params.append(key, v === null ? NULL_QUERY_VALUE : v);
      });
    } else {
      params.set(key, value === null ? NULL_QUERY_VALUE : value);
    }
  }
  return params;
}

function buildUrlFromParams(params) {
  const base =
    window.location.protocol +
    '//' +
    window.location.host +
    window.location.pathname;

  // Keep the original behavior of always appending '?'
  let url = base + '?' + params.toString();

  // Avoid '*' at the end because some systems do not recognize it as part of the link
  if (url.endsWith('*')) url = url + '&';

  return url;
}


export default function useQueryAsState(defaultDict) {
  const [valueDict, setValueDict] = useState(defaultDict);
  const [useUrlStorage, setUseUrlStorage] = useState(true);

  // Initialize from URL once
  useEffect(() => {
    const parsed = parseSearchToDict(window.location.search);
    setValueDict((prev) =>
      JSON.stringify(prev) === JSON.stringify(parsed) ? prev : parsed
    );
  }, []);

  // Keep URL in sync with state (with max-length guard)
  useEffect(() => {
    const params = dictToSearchParams(valueDict);
    const candidateUrl = buildUrlFromParams(params);

    if (useUrlStorage) {
      if (candidateUrl.length > MAX_URL_LENGTH) {
        setUseUrlStorage(false);
        window.history.replaceState(
          { path: window.location.pathname },
          '',
          window.location.pathname
        );
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
