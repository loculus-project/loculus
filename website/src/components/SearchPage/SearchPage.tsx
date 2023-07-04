import React, { useState, type FC } from 'react';

import { SearchForm } from './SearchForm';
import { type SequenceData, Table } from './Table';
import type { Metadata } from '../../config';

interface SearchPageProps {
  fields: Metadata[];
}

export const SearchPage: FC<SearchPageProps> = ({ fields }) => {
  const [data, setData] = useState<SequenceData[]>([]);

  return (
    <>
      <h1 className='text-sky-500 font-bold text-xl'>Search</h1>
      <SearchForm fields={fields} setSequenceData={setData} />
      <Table data={data} />
    </>
  );
};
