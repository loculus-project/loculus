import type { OrganismDraftResponse } from '../../types/loculusConfig';
import { Button } from '../common/Button';

interface Props {
    draft: OrganismDraftResponse;
    organismKey: string;
    busy: boolean;
    /** If true (i.e. we're on a sub-page), show a "View overview" link. */
    showOverviewLink?: boolean;
    onPublish: () => void;
    onDiscard: () => void;
}

export function DraftStatusBanner({ draft, organismKey, busy, showOverviewLink = false, onPublish, onDiscard }: Props) {
    const opCount = draft.operations.length;
    const hasChanges = opCount > 0;
    return (
        <div
            className={`border rounded p-3 flex flex-wrap items-center gap-3 ${
                hasChanges ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'
            }`}
            data-testid='draft-status-banner'
            aria-busy={busy}
        >
            <div className='flex-grow text-sm min-w-0'>
                <span className='font-semibold'>
                    {hasChanges ? `${opCount} pending change${opCount === 1 ? '' : 's'}` : 'No pending changes'}
                </span>{' '}
                <span className='text-gray-500'>
                    · revision {draft.revision}
                    {draft.baseVersion !== null && ` · based on v${draft.baseVersion}`}
                </span>
            </div>
            {showOverviewLink && (
                <a
                    className='text-sm text-primary-700 hover:underline'
                    href={`/admin/config/organisms/${encodeURIComponent(organismKey)}/edit`}
                >
                    View all changes
                </a>
            )}
            <Button
                type='button'
                disabled={busy || !hasChanges}
                onClick={onPublish}
                className='bg-primary-700 hover:bg-primary-800 text-white px-3 py-1.5 rounded text-sm disabled:opacity-50'
            >
                Publish
            </Button>
            <Button
                type='button'
                disabled={busy || !hasChanges}
                onClick={onDiscard}
                className='text-red-700 hover:underline text-sm disabled:opacity-40'
            >
                Discard
            </Button>
        </div>
    );
}
