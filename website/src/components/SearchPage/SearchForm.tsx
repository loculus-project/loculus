import { TextField } from '@mui/material';
import { DatePicker, LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import React, { useState } from 'react';

import type { TableSequenceData } from './Table';
import { fakeData } from '../../api/lapisFakeApi.json';
import type { Metadata } from '../../config';

interface SearchFormProps {
  fields: Metadata[];
  setSequenceData: (sequenceData: TableSequenceData[]) => void;
}

export const SearchForm: React.FC<SearchFormProps> = ({ fields, setSequenceData }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [fieldValues, setFieldValues] = useState(new Array(fields.length).fill(''));

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setSearchQuery(e.target.value);
  };

  const handleFieldChange = (index: number, value: string): void => {
    const updatedFieldValues = [...fieldValues];
    updatedFieldValues[index] = value;
    setFieldValues(updatedFieldValues);
  };

  // use useMutation?
  const handleSearch = (): void => {
    // Perform search operation using the searchQuery and fieldValues
    // const baseUrl = 'https://lapis.cov-spectrum.org/open/v1/sample/details?';
    // country=Germany&dateFrom=2023-01-02&fields=strain&fields=pangoLineage&fields=date&limit=100
    // console.log('Search query:', searchQuery);
    // console.log('Field values:', fieldValues);

    setSequenceData(fakeData.data);
  };

  const fieldGroups = [];
  for (let i = 0; i < fields.length; i += 4) {
    const group = fields.slice(i, i + 4);
    fieldGroups.push(group);
  }

  return (
    <div className='mx-4'>
      <TextField
        fullWidth
        variant='outlined'
        margin='normal'
        placeholder='Accessions'
        value={searchQuery}
        onChange={handleInputChange}
      />
      {fieldGroups.map((group, groupIndex) => (
        <div key={groupIndex} className='flex gap-4 justify-evenly'>
          {group.map((field, index) =>
            field.type !== 'date' ? (
              <TextField
                key={index}
                variant='outlined'
                margin='dense'
                placeholder={field.name}
                type={field.type}
                required
                size='small'
                value={fieldValues[groupIndex * 4 + index]}
                onChange={(e) => handleFieldChange(groupIndex * 4 + index, e.target.value)}
                InputLabelProps={{
                  shrink: true,
                }}
                className='w-1/4'
              />
            ) : (
              <LocalizationProvider dateAdapter={AdapterLuxon}>
                <DatePicker
                  label={field.name}
                  slotProps={{
                    textField: { size: 'small', variant: 'outlined', margin: 'dense', className: 'w-1/4' },
                  }}
                />
              </LocalizationProvider>
            ),
          )}
        </div>
      ))}
      <div className='flex justify-center mt-4'>
        <button className='btn' style={{ textTransform: 'none' }} onClick={handleSearch}>
          Search
        </button>
      </div>
    </div>
  );
};
