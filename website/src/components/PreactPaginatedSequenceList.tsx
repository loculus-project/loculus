import { useEffect, useState } from 'preact/compat';
import { fetchSequenceList } from '../api';
import type { Config } from '../config';

type Props = {
  config: Config;
};

export const PreactPaginatedSequenceList = ({ config }: Props) => {
  const [page, setPage] = useState(0);
  const [sequences, setSequences] = useState<any[] | undefined>();
  const offset = 100 * page;

  useEffect(() => {
    fetchSequenceList(config).then((d) => setSequences(d));
  }, []);

  if (!sequences) {
    return <>Loading..</>;
  }

  return (
    <div>
      <button onClick={() => setPage(Math.max(page - 1, 0))} class='mr-2'>
        Previous
      </button>
      <button onClick={() => setPage(page + 1)}>Next</button>
      <ul>
        {sequences.slice(offset, offset + 100).map((d) => (
          <li key={d[config.schema.primaryKey]}>
            <a href={`/sequences/${d[config.schema.primaryKey]}`}>{d[config.schema.primaryKey]}</a>
          </li>
        ))}
      </ul>
    </div>
  );
};
