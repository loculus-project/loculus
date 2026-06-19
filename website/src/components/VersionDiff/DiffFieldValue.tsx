import type { SegmentedMutations, SegmentedMutationStrings } from '../../types/config';
import { FileListComponent, parseMutations } from '../SequenceDetailsPage/DataTableEntryValue';
import { LinkWithMenuComponent } from '../SequenceDetailsPage/LinkWithMenuComponent';
import { SubstitutionsContainer } from '../SequenceDetailsPage/MutationBadge';
import { PlainValueDisplay } from '../SequenceDetailsPage/PlainValueDisplay';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

const empty = <span className='italic'>None</span>;

/**
 * Renders segmented mutation badges. Unlike the sequence details page's
 * `SubstitutionsContainers`, this omits the per-segment heading separator (which renders
 * as a bare line for the common single, unnamed segment and looks out of place in the
 * diff table); a light segment label is only shown when there is an actual segment name.
 */
function SegmentedBadges({ segments }: { segments: SegmentedMutations[] }) {
    const nonEmpty = segments.filter(({ mutations }) => mutations.length > 0);
    if (nonEmpty.length === 0) {
        return empty;
    }
    return (
        <>
            {nonEmpty.map(({ segment, mutations }) => (
                <div key={segment}>
                    {segment !== '' && <span className='text-xs font-semibold text-gray-500'>{segment}</span>}
                    <SubstitutionsContainer values={mutations} />
                </div>
            ))}
        </>
    );
}

/** Renders segmented mutation strings (deletions/insertions) without the heading separator. */
function SegmentedStrings({ segments }: { segments: SegmentedMutationStrings[] }) {
    const nonEmpty = segments.filter(({ mutations }) => mutations.length > 0);
    if (nonEmpty.length === 0) {
        return empty;
    }
    return (
        <>
            {nonEmpty.map(({ segment, mutations }) => (
                <div key={segment}>
                    {segment !== '' && <span className='text-xs font-semibold text-gray-500 mr-1'>{segment}</span>}
                    <PlainValueDisplay value={mutations.join(', ')} />
                </div>
            ))}
        </>
    );
}

/**
 * Renders a single field value in the version diff.
 *
 * Custom-display support here is deliberately curated: we only reuse the sequence details
 * renderers for the displays that are interesting and self-contained in a version diff
 * (mutations/indels, links, file lists). Everything else — including custom displays that
 * are constant between versions (submitting group), need extra context not carried in
 * `details.json` (variant reference, data use terms), or are composite/grouped — falls
 * back to a plain text representation of the field's `value`.
 */
export function DiffFieldValue({ entry }: { entry: TableDataEntry }) {
    const { customDisplay, value } = entry;

    switch (customDisplay?.type) {
        // Sequence-derived mutations / deletions / insertions: the core of a version diff.
        case 'badge':
            return <SegmentedBadges segments={customDisplay.badge ?? []} />;
        case 'list':
            return <SegmentedStrings segments={customDisplay.list ?? []} />;
        case 'generatedBadge': {
            if (typeof value !== 'string') {
                return <PlainValueDisplay value={value} />;
            }
            const mutations = parseMutations(value);
            return mutations.length > 0 ? <SubstitutionsContainer values={mutations} /> : empty;
        }

        // Links (e.g. INSDC accession links) and file lists are worth keeping as-is.
        case 'link':
            return customDisplay.url !== undefined ? (
                <a
                    href={customDisplay.url.replace('__value__', value.toString())}
                    target='_blank'
                    className='underline'
                >
                    {value}
                </a>
            ) : (
                <PlainValueDisplay value={value} />
            );
        case 'linkWithMenu':
            return customDisplay.linkMenuItems !== undefined ? (
                <LinkWithMenuComponent value={value} linkMenuItems={customDisplay.linkMenuItems} />
            ) : (
                <PlainValueDisplay value={value} />
            );
        case 'fileList':
            return typeof value === 'string' ? (
                <FileListComponent jsonString={value} />
            ) : (
                <PlainValueDisplay value={value} />
            );

        default:
            return <PlainValueDisplay value={value} />;
    }
}
