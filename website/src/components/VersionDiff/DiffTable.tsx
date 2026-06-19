import { DiffFieldValue } from './DiffFieldValue';
import { diffMutationEntries } from './mutationDiff';
import type { ComparisonResult, FieldComparison } from './types';
import { groupTableDataByHeader, headerSectionRank } from '../SequenceDetailsPage/groupTableDataByHeader';
import { Checkbox } from '../common/Checkbox';

type DiffTableProps = {
    comparison: ComparisonResult;
    version1: number;
    version2: number;
    showAllFields: boolean;
    mutationsDiffOnly: boolean;
    setMutationsDiffOnly: (value: boolean) => void;
};

function FieldRow({ field, mutationsDiffOnly }: { field: FieldComparison; mutationsDiffOnly: boolean }) {
    const rowClass = field.isNoisy ? 'text-gray-400' : field.hasChanged ? 'bg-amber-50' : '';

    // In diff-only mode, reduce mutation fields to just the mutations that differ between
    // the two versions. Only possible when the field exists in both versions.
    let { entry1, entry2 } = field;
    const isMutation = (entry1 ?? entry2)?.type.kind === 'mutation';
    const diffApplied = mutationsDiffOnly && isMutation && entry1 !== null && entry2 !== null;
    if (diffApplied) {
        [entry1, entry2] = diffMutationEntries(entry1!, entry2!);
    }

    return (
        <tr className={rowClass}>
            <td className='border px-4 py-2 font-medium'>{field.label}</td>
            <td className='border px-4 py-2 break-words'>
                {entry1 !== null && <DiffFieldValue entry={entry1} blankWhenEmpty={diffApplied} />}
            </td>
            <td className='border px-4 py-2 break-words'>
                {entry2 !== null && <DiffFieldValue entry={entry2} blankWhenEmpty={diffApplied} />}
            </td>
        </tr>
    );
}

function FieldGroup({
    header,
    fields,
    mutationsDiffOnly,
    setMutationsDiffOnly,
    showMutationToggle,
}: {
    header: string;
    fields: FieldComparison[];
    mutationsDiffOnly: boolean;
    setMutationsDiffOnly: (value: boolean) => void;
    // Render the "hide shared substitutions/indels" control on this section header. Set
    // only on the first mutation section so the control sits right next to where it acts.
    showMutationToggle: boolean;
}) {
    return (
        <>
            <tr>
                <td colSpan={3} className='bg-gray-100 px-4 py-2 font-semibold'>
                    <div className='flex items-center justify-between gap-4'>
                        <span>{header}</span>
                        {showMutationToggle && (
                            <label className='flex items-center gap-2 cursor-pointer font-normal text-sm'>
                                <span>Hide shared substitutions/indels</span>
                                <Checkbox
                                    size='sm'
                                    checked={mutationsDiffOnly}
                                    onChange={(e) => setMutationsDiffOnly(e.target.checked)}
                                />
                            </label>
                        )}
                    </div>
                </td>
            </tr>
            {fields.map((field) => (
                <FieldRow key={field.name} field={field} mutationsDiffOnly={mutationsDiffOnly} />
            ))}
        </>
    );
}

export function DiffTable({
    comparison,
    version1,
    version2,
    showAllFields,
    mutationsDiffOnly,
    setMutationsDiffOnly,
}: DiffTableProps) {
    // Prepare fields to display
    const fieldsToDisplay: FieldComparison[] = [];

    // Always show changed fields (non-noisy)
    fieldsToDisplay.push(...comparison.changedFields);

    // Show unchanged fields if toggle is on
    if (showAllFields) {
        fieldsToDisplay.push(...comparison.unchangedFields);
    }

    // Add noisy fields at the end
    fieldsToDisplay.push(...comparison.noisyFields);

    // Group by header and order groups/rows by the central, config-defined order, then
    // push the alignment/QC and mutation sections to the bottom, matching how the
    // sequence details page lays out its sections.
    const groupedFields = groupTableDataByHeader(fieldsToDisplay).sort(
        (a, b) => headerSectionRank(a.header) - headerSectionRank(b.header),
    );

    // The first mutation section (if any) hosts the "hide shared substitutions/indels"
    // control, so it sits next to the mutations it affects rather than at the top.
    const firstMutationSectionHeader = groupedFields.find(({ header }) => headerSectionRank(header) === 2)?.header;

    // If no fields to display
    if (fieldsToDisplay.length === 0) {
        return (
            <div className='p-4 text-gray-500'>
                No differences found between version {version1} and version {version2}.
            </div>
        );
    }

    return (
        <div className='overflow-x-auto'>
            <table className='table-fixed w-full border-collapse border'>
                <thead>
                    <tr className='bg-gray-200'>
                        <th className='border px-4 py-2 text-left w-[20ch]'>Field</th>
                        <th className='border px-4 py-2 text-left'>Version {version1}</th>
                        <th className='border px-4 py-2 text-left'>Version {version2}</th>
                    </tr>
                </thead>
                <tbody>
                    {groupedFields.map(({ header, rows }) => (
                        <FieldGroup
                            key={header}
                            header={header}
                            fields={rows}
                            mutationsDiffOnly={mutationsDiffOnly}
                            setMutationsDiffOnly={setMutationsDiffOnly}
                            showMutationToggle={header === firstMutationSectionHeader}
                        />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
