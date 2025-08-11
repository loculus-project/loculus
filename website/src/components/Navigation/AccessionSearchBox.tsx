import { useEffect, useRef, useState, type FC, type FormEvent } from 'react';

import SearchIcon from '~icons/material-symbols/search';

interface Props {
    className?: string;
    onSubmitSuccess?: () => void;
    defaultOpen?: boolean;
    fullWidth?: boolean;
}

export const AccessionSearchBox: FC<Props> = ({ className, onSubmitSuccess, defaultOpen, fullWidth }) => {
    const [value, setValue] = useState('');
    const [open, setOpen] = useState(!!defaultOpen);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        if (open) {
            // Focus the input when opening
            inputRef.current?.focus();
        }
    }, [open]);

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) {
            // If empty, just ensure it stays open to allow typing
            setOpen(true);
            return;
        }
        // Allow parent to react (e.g., close drawer) before navigation
        onSubmitSuccess?.();
        // Navigate to the sequence details page for the given accession/version
        window.location.href = `/seq/${encodeURIComponent(v)}`;
    };

    return (
        <form onSubmit={onSubmit} className={className} role='search' aria-label='Accession search'>
            <div className='relative flex items-center'>
                <button
                    type='submit'
                    onClick={() => setOpen(true)}
                    className='flex items-center justify-center text-primary-600 hover:text-primary-700 transition-colors'
                    aria-label={open ? 'Search' : 'Open accession search'}
                >
                    <SearchIcon className='w-5 h-5' />
                </button>
                <input
                    ref={inputRef}
                    type='text'
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            setOpen(false);
                        }
                    }}
                    placeholder='Search by accession'
                    className={
                        `input input-bordered input-md text-sm placeholder:text-gray-500 text-gray-900 ` +
                        `bg-white focus:border-primary focus:outline-none transition-all duration-200 ease-out ml-2 ` +
                        (open
                            ? `px-3 ${fullWidth ? 'w-full' : 'w-36 lg:w-48'} opacity-100`
                            : 'px-0 w-0 opacity-0 pointer-events-none')
                    }
                    aria-label='Enter an accession or accession.version'
                />
            </div>
        </form>
    );
};

export default AccessionSearchBox;
