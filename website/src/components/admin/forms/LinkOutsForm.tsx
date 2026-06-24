import { useEffect, useState } from 'react';

import type { OrganismFormProps } from './types';
import type { CanonicalOrganismConfig } from '../../../types/loculusConfig';
import { Button } from '../../common/Button';

type LinkOut = CanonicalOrganismConfig['schema']['linkOuts'][number];

export function LinkOutsForm({ draft, busy, postOp }: OrganismFormProps) {
    const linkOuts = draft.config.schema.linkOuts;
    const [newName, setNewName] = useState('');
    const [newUrl, setNewUrl] = useState('');
    const [newCategory, setNewCategory] = useState('');

    const existingNames = new Set(linkOuts.map((l) => l.name));
    const newCollision = newName !== '' && existingNames.has(newName);

    return (
        <section className='space-y-4 max-w-2xl'>
            <p className='text-sm text-gray-600'>
                Link-outs add per-sequence external links (e.g. Nextclade, NCBI). The URL template can include
                placeholders like <code className='font-mono text-xs'>{'{accession}'}</code>.
            </p>

            <div className='space-y-3'>
                {linkOuts.length === 0 ? (
                    <p className='text-sm italic text-gray-500'>No link-outs yet.</p>
                ) : (
                    <ul className='space-y-3'>
                        {linkOuts.map((l) => (
                            <LinkOutRow key={l.name} link={l} busy={busy} postOp={postOp} />
                        ))}
                    </ul>
                )}
            </div>

            <div className='border-t border-gray-200 pt-3 space-y-2'>
                <h3 className='text-sm font-semibold'>Add a link-out</h3>
                <label className='block text-sm'>
                    <span className='text-gray-600'>Name</span>
                    <input
                        value={newName}
                        onChange={(e) => setNewName(e.target.value)}
                        placeholder='e.g. Nextclade'
                        className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                    />
                    {newCollision && (
                        <span className='text-xs text-red-600'>A link-out with this name already exists.</span>
                    )}
                </label>
                <label className='block text-sm'>
                    <span className='text-gray-600'>URL template</span>
                    <input
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        placeholder='https://example.com/?accession={accession}'
                        className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono'
                    />
                </label>
                <label className='block text-sm'>
                    <span className='text-gray-600'>Category (optional)</span>
                    <input
                        value={newCategory}
                        onChange={(e) => setNewCategory(e.target.value)}
                        placeholder='e.g. Analysis'
                        className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                    />
                </label>
                <Button
                    type='button'
                    disabled={busy || newName === '' || newUrl === '' || newCollision}
                    onClick={() => {
                        const linkOut: Record<string, unknown> = { name: newName, url: newUrl };
                        if (newCategory !== '') linkOut.category = newCategory;
                        void postOp({ type: 'addLinkOut', payload: { linkOut } }).then((ok) => {
                            if (ok) {
                                setNewName('');
                                setNewUrl('');
                                setNewCategory('');
                            }
                        });
                    }}
                    className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1 rounded text-sm'
                >
                    Add link-out
                </Button>
            </div>
        </section>
    );
}

function LinkOutRow({ link, busy, postOp }: { link: LinkOut; busy: boolean; postOp: OrganismFormProps['postOp'] }) {
    const initialUrl = link.url;
    const initialCategory = link.category ?? '';
    const [url, setUrl] = useState(initialUrl);
    const [category, setCategory] = useState(initialCategory);

    // Reset if the upstream link changed (e.g. after publish/discard reload).
    useEffect(() => {
        setUrl(initialUrl);
        setCategory(initialCategory);
    }, [initialUrl, initialCategory]);

    const dirty = url !== initialUrl || category !== initialCategory;

    return (
        <li className='border border-gray-200 rounded p-3 space-y-2'>
            <div className='flex items-center gap-3'>
                <span className='font-mono text-sm flex-grow'>{link.name}</span>
                <Button
                    type='button'
                    disabled={busy}
                    onClick={() => void postOp({ type: 'removeLinkOut', payload: { name: link.name } })}
                    className='text-xs text-red-700 hover:underline'
                >
                    Remove
                </Button>
            </div>
            <label className='block text-xs'>
                <span className='text-gray-500'>URL template</span>
                <input
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-xs font-mono'
                />
            </label>
            <label className='block text-xs'>
                <span className='text-gray-500'>Category</span>
                <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className='mt-0.5 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                />
            </label>
            <Button
                type='button'
                disabled={busy || !dirty || url === ''}
                onClick={() => {
                    const payload: Record<string, unknown> = { name: link.name };
                    if (url !== initialUrl) payload.url = url;
                    if (category !== initialCategory) payload.category = category;
                    void postOp({ type: 'updateLinkOut', payload });
                }}
                className='bg-white border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-2 py-0.5 rounded text-xs'
            >
                Save changes
            </Button>
        </li>
    );
}
