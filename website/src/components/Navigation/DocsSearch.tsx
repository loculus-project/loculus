import MiniSearch from 'minisearch';
import { useState, useEffect, useRef, type FC } from 'react';

import { Button } from '../common/Button';
import CloseIcon from '~icons/material-symbols/close';
import SearchIcon from '~icons/material-symbols/search';

interface SearchResult {
    id: string;
    title: string;
    url: string;
    section: 'docs' | 'about';
    score?: number;
}

interface SearchIndexResponse {
    options: ConstructorParameters<typeof MiniSearch>[0];
    documents: Record<string, unknown>[];
}

const DocsSearch: FC = () => {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<SearchResult[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [miniSearch, setMiniSearch] = useState<MiniSearch | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // Load and initialize the search index
    useEffect(() => {
        const loadIndex = async () => {
            try {
                const response = await fetch('/search-index.json');
                const data = (await response.json()) as SearchIndexResponse;
                const ms = new MiniSearch(data.options);
                ms.addAll(data.documents);
                setMiniSearch(ms);
            } catch {
                // Search remains unavailable until reload.
            } finally {
                setIsLoading(false);
            }
        };

        void loadIndex();
    }, []);

    // Handle search
    useEffect(() => {
        if (!miniSearch || !query.trim()) {
            setResults([]);
            return;
        }

        try {
            const searchResults = miniSearch.search(query, {
                prefix: true,
                fuzzy: 0.2,
            }) as unknown as SearchResult[];
            setResults(searchResults.slice(0, 8));
        } catch {
            setResults([]);
        }
    }, [query, miniSearch]);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Group results by section
    const docsResults = results.filter((r) => r.section === 'docs');
    const aboutResults = results.filter((r) => r.section === 'about');

    return (
        <div ref={searchRef} className='mb-4 relative'>
            <div className='relative'>
                <div className='flex items-center bg-primary-50 border border-primary-200 rounded-md px-3 py-2'>
                    <SearchIcon className='w-4 h-4 text-primary-600 flex-shrink-0' aria-hidden='true' />
                    <input
                        ref={inputRef}
                        type='text'
                        placeholder='Search documentation...'
                        value={query}
                        onChange={(e) => {
                            setQuery(e.target.value);
                            setIsOpen(true);
                        }}
                        onFocus={() => setIsOpen(true)}
                        disabled={isLoading}
                        className='flex-1 ml-2 bg-transparent border-none outline-none text-sm text-gray-700 placeholder-primary-500 disabled:opacity-50'
                        aria-label='Search documentation'
                    />
                    {query && (
                        <Button
                            type='button'
                            onClick={() => {
                                setQuery('');
                                setResults([]);
                                inputRef.current?.focus();
                            }}
                            className='text-primary-600 hover:text-primary-700 p-1'
                            aria-label='Clear search'
                        >
                            <CloseIcon className='w-4 h-4' />
                        </Button>
                    )}
                </div>

                {/* Results dropdown */}
                {isOpen && query && (
                    <div className='absolute top-full left-0 right-0 mt-1 bg-white border border-primary-200 rounded-md shadow-lg z-50 max-h-96 overflow-y-auto'>
                        {results.length === 0 ? (
                            <div className='px-4 py-3 text-sm text-gray-500'>No results found</div>
                        ) : (
                            <>
                                {docsResults.length > 0 && (
                                    <div>
                                        <div className='px-4 py-2 bg-gray-50 border-b border-primary-200 text-xs font-semibold text-primary-700 uppercase'>
                                            Documentation
                                        </div>
                                        <ul className='py-1'>
                                            {docsResults.map((result) => (
                                                <li key={result.id}>
                                                    <a
                                                        href={result.url}
                                                        className='block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 transition-colors'
                                                        onClick={() => {
                                                            setQuery('');
                                                            setIsOpen(false);
                                                        }}
                                                    >
                                                        {result.title}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}

                                {aboutResults.length > 0 && (
                                    <div>
                                        <div className='px-4 py-2 bg-gray-50 border-b border-primary-200 text-xs font-semibold text-primary-700 uppercase'>
                                            About
                                        </div>
                                        <ul className='py-1'>
                                            {aboutResults.map((result) => (
                                                <li key={result.id}>
                                                    <a
                                                        href={result.url}
                                                        className='block px-4 py-2 text-sm text-gray-700 hover:bg-primary-50 transition-colors'
                                                        onClick={() => {
                                                            setQuery('');
                                                            setIsOpen(false);
                                                        }}
                                                    >
                                                        {result.title}
                                                    </a>
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}
            </div>

            {isLoading && <div className='text-xs text-gray-500 mt-1'>Loading search...</div>}
        </div>
    );
};

export default DocsSearch;
