// src/components/LocationSelector.tsx
import { useState, useEffect } from "react";

const LocationSelector = () => {
  const data = {
    "USA": {
      "MI": ['Wayne', 'Oakland', 'Macomb'],
      "WI": ['Dane', 'Milwaukee'],
      "MA": ['Suffolk', 'Middlesex'],
      "WY": ['Laramie', 'Natrona'],
    },
    "Switzerland": {
      "BS": ['Basel-Stadt'],
      "BL": ['Liestal', 'Arlesheim'],
      "GR": ['Chur', 'Davos'],
    },
  };

  const [country, setCountry] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [county, setCounty] = useState<string>("");

  const [states, setStates] = useState<string[]>([]);
  const [counties, setCounties] = useState<string[]>([]);

  // Update states based on selected country
  useEffect(() => {
    if (country) {
      setStates(Object.keys(data[country]));
      setState("");
      setCounty("");
      setCounties([]);
    }
  }, [country]);

  // Update counties based on selected state
  useEffect(() => {
    if (state) {
      setCounties(data[country][state]);
      setCounty("");
    }
  }, [state, country]);

  return (
    <div>
      <h2>Location Selector</h2>

      <label htmlFor="country">Country:</label>
      <select
        id="country"
        value={country}
        onChange={(e) => setCountry(e.target.value)}
      >
        <option value="">-- Select Country --</option>
        {Object.keys(data).map((countryName) => (
          <option key={countryName} value={countryName}>
            {countryName}
          </option>
        ))}
      </select>

      <label htmlFor="state">State:</label>
      <select
        id="state"
        value={state}
        onChange={(e) => setState(e.target.value)}
        disabled={!country}
      >
        <option value="">-- Select State --</option>
        {states.map((stateName) => (
          <option key={stateName} value={stateName}>
            {stateName}
          </option>
        ))}
      </select>

      <label htmlFor="county">County:</label>
      <select
        id="county"
        value={county}
        onChange={(e) => setCounty(e.target.value)}
        disabled={!state}
      >
        <option value="">-- Select County --</option>
        {counties.map((countyName) => (
          <option key={countyName} value={countyName}>
            {countyName}
          </option>
        ))}
      </select>
    </div>
  );
};

export default LocationSelector;
