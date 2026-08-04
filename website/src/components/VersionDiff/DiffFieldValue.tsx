import { FileListComponent, parseMutations } from '../SequenceDetailsPage/DataTableEntryValue';
import { LinkWithMenuComponent } from '../SequenceDetailsPage/LinkWithMenuComponent';
import {
    MutationStringContainers,
    SubstitutionsContainer,
    SubstitutionsContainers,
} from '../SequenceDetailsPage/MutationBadge';
import { PlainValueDisplay } from '../SequenceDetailsPage/PlainValueDisplay';
import type { TableDataEntry } from '../SequenceDetailsPage/types';

const none = <span className='italic'>None</span>;

/**
 * Renders a single field value in the version diff.
 *
 * Custom-display support here is deliberately curated: we only reuse the sequence details
 * renderers for the displays that are interesting and self-contained in a version diff
 * (mutations/indels, links, file lists). Everything else — including custom displays that
 * are constant between versions (submitting group), need extra context not carried in
 * `details.json` (variant reference, data use terms), or are composite/grouped — falls
 * back to a plain text representation of the field's `value`.
 *
 * `blankWhenEmpty` is set when a mutation field has been reduced to only its differences
 * (diff-only mode): an empty result then means "nothing changed here", so we render
 * nothing rather than "None" (which would wrongly suggest the version has no mutations).
 */
export function DiffFieldValue({ entry, blankWhenEmpty = false }: { entry: TableDataEntry; blankWhenEmpty?: boolean }) {
    const { customDisplay, value } = entry;

    const empty = blankWhenEmpty ? null : none;

    switch (customDisplay?.type) {
        // Sequence-derived mutations / deletions / insertions: the core of a version diff.
        case 'badge':
            return customDisplay.badge !== undefined && customDisplay.badge.length > 0 ? (
                <SubstitutionsContainers values={customDisplay.badge} />
            ) : (
                empty
            );
        case 'list':
            return customDisplay.list !== undefined && customDisplay.list.length > 0 ? (
                <MutationStringContainers values={customDisplay.list} />
            ) : (
                empty
            );
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
