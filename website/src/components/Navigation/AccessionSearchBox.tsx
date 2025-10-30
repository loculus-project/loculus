import { useEffect, useRef, useState, type FC, type FormEvent } from 'react';
import { Button } from "src/components/common/Button";

import { routes } from '../../routes/routes';
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
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (open) {
            inputRef.current?.focus();
        }
    }, [open]);

    // Only allow alphanumeric, dot, dash, underscore - this is for security to prevent injection into URLs, rather than for UX
    function isValidAccession(input: string): boolean {
        return /^[A-Za-z0-9._-]+$/.test(input);
    }

    const onSubmit = (e: FormEvent) => {
        e.preventDefault();
        const v = value.trim();
        if (!v) {
            setOpen(true);
            setError(null);
            return;
        }
        if (!isValidAccession(v)) {
            setError('Invalid accession format.');
            return;
        }
        setError(null);
        onSubmitSuccess?.();
        window.location.href = routes.sequenceEntryDetailsPage(v);
    };

    return (
        <form
            onSubmit={onSubmit}
            className={className}
            role='search'
            aria-label='Accession search'
            data-testid='nav-accession-search-form'
        >
            <div className='relative flex items-center'>
                <Button
                    type='submit'
                    onClick={() => setOpen(true)}
                    className='flex items-center justify-center text-primary-600 hover:text-primary-700 transition-colors'
                    aria-label={open ? 'Search' : 'Open accession search'}
                    data-testid='nav-accession-search-button'
                >
                    <SearchIcon className='w-5 h-5' />
                </Button>
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
                    onBlur={() => {
                        if (!value.trim() && !defaultOpen) {
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
                    data-testid='nav-accession-search-input'
                />
            </div>
            {error && (
                <div className='text-red-600 text-xs mt-1' role='alert' data-testid='nav-accession-search-error'>
                    {error}
                </div>
            )}
        </form>
    );
};

export default AccessionSearchBox;
