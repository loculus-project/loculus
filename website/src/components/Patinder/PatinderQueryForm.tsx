import { useState } from 'react';

type PatinderQueryFormProps = {
    setQuery: (query: string) => void;
};

export const PatinderQueryForm = ({ setQuery }: PatinderQueryFormProps) => {
    const [input, setInput] = useState<string>('');
    return (
        <div>
            <textarea
                className='block w-full textarea textarea-bordered mb-4 h-36'
                value={input}
                onChange={(e) => setInput(e.target.value)}
            ></textarea>
            <button className='btn btn-small' onClick={() => setQuery(input)}>
                Query
            </button>
        </div>
    );
};
