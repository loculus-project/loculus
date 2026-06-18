import { useState } from 'react';
import { z } from 'zod';

import { AdminConfigClient, AdminConfigError } from '../../services/adminConfigClient';
import { fetchOrganismConfig } from '../../services/configClient';
import { Button } from '../common/Button';

const createOrganismSchema = z.object({
    key: z
        .string()
        .min(1, 'Key is required')
        .regex(/^[a-z0-9][a-z0-9-]*$/, 'Key must be lowercase letters/digits/hyphens and start with a letter or digit'),
});

type CreateOrganismForm = z.infer<typeof createOrganismSchema>;

interface Props {
    accessToken: string;
    backendUrl: string;
    /**
     * Keys of released organisms the admin can copy from. Pass an empty list to
     * hide the "copy from" select entirely.
     */
    releasedOrganismKeys: string[];
}

export function CreateOrganismDialog({ accessToken, backendUrl, releasedOrganismKeys }: Props) {
    const [key, setKey] = useState('');
    const [copyFrom, setCopyFrom] = useState<string>(''); // '' means don't copy
    const [keyError, setKeyError] = useState<string | null>(null);
    const [serverError, setServerError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const onSubmit = async ({ key }: CreateOrganismForm) => {
        setServerError(null);
        setIsSubmitting(true);
        const client = new AdminConfigClient(accessToken, backendUrl);
        try {
            // Fetch the source config before creating, so a copy failure doesn't leave an empty organism.
            let seedConfig: Awaited<ReturnType<typeof fetchOrganismConfig>>['config'] | null = null;
            if (copyFrom !== '') {
                try {
                    const source = await fetchOrganismConfig(backendUrl, copyFrom);
                    seedConfig = source.config;
                } catch (e) {
                    setServerError(
                        `Could not fetch source organism "${copyFrom}": ${e instanceof Error ? e.message : String(e)}`,
                    );
                    return;
                }
            }

            const created = await client.createOrganism(key);

            if (seedConfig !== null) {
                const draftConfig = {
                    ...seedConfig,
                    schema: { ...seedConfig.schema, organismName: key },
                    displayName: null,
                };
                try {
                    await client.putOrganismDraft(created.key, draftConfig);
                } catch (e) {
                    setServerError(
                        `Organism created, but copying from "${copyFrom}" failed: ` +
                            (AdminConfigError.isInstance(e)
                                ? (e.body.message ?? e.body.error)
                                : e instanceof Error
                                  ? e.message
                                  : String(e)),
                    );
                }
            }

            window.location.href = `/admin/config/organisms/${encodeURIComponent(created.key)}/draft`;
        } catch (e) {
            if (AdminConfigError.isInstance(e)) {
                if (e.body.error === 'organism_already_exists') {
                    setKeyError('Key already exists');
                    return;
                }
                setServerError(e.body.message ?? e.body.error);
                return;
            }
            setServerError(e instanceof Error ? e.message : String(e));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form
            onSubmit={(e) => {
                e.preventDefault();
                const result = createOrganismSchema.safeParse({ key });
                if (!result.success) {
                    setKeyError(result.error.issues[0]?.message ?? 'Invalid organism key');
                    return;
                }
                setKeyError(null);
                void onSubmit(result.data);
            }}
            className='border border-gray-200 rounded p-4 max-w-md space-y-3'
        >
            <h2 className='text-lg font-semibold'>Create new organism</h2>
            <p className='text-sm text-gray-600'>
                The new organism starts as <em>unreleased</em>. You can fill in the rest of its config in the editor
                that opens next. After publishing v1, it stays hidden from the public website until SILO/LAPIS are
                deployed and an administrator marks it deployed.
            </p>
            <label className='block'>
                <span className='text-sm font-medium'>Organism key</span>
                <input
                    type='text'
                    autoComplete='off'
                    className='mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono'
                    placeholder='e.g. west-nile-virus'
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                />
                {keyError !== null && <span className='text-xs text-red-600 block mt-1'>{keyError}</span>}
            </label>
            {releasedOrganismKeys.length > 0 && (
                <label className='block'>
                    <span className='text-sm font-medium'>Copy config from (optional)</span>
                    <select
                        value={copyFrom}
                        onChange={(e) => setCopyFrom(e.target.value)}
                        className='mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm'
                    >
                        <option value=''>— Start with a blank config —</option>
                        {releasedOrganismKeys.map((k) => (
                            <option key={k} value={k}>
                                {k}
                            </option>
                        ))}
                    </select>
                    <span className='text-xs text-gray-500 block mt-1'>
                        Seeds the new organism's draft with the chosen organism's currently published config. You'll be
                        sent to the draft editor where you can tweak it before publishing v1.
                    </span>
                </label>
            )}
            {serverError !== null && <p className='text-sm text-red-600'>{serverError}</p>}
            <div className='flex gap-2'>
                <Button
                    type='submit'
                    disabled={isSubmitting}
                    className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm'
                >
                    {isSubmitting ? 'Creating…' : 'Create'}
                </Button>
            </div>
        </form>
    );
}
