import type { ComparisonResult, FieldComparison } from './types';

type DiffTableProps = {
    comparison: ComparisonResult;
    version1: number;
    version2: number;
    showAllFields: boolean;
};

function groupFieldsByHeader(fields: FieldComparison[]): Map<string, FieldComparison[]> {
    const grouped = new Map<string, FieldComparison[]>();
    for (const field of fields) {
        const header = field.header || 'Other';
        if (!grouped.has(header)) {
            grouped.set(header, []);
        }
        grouped.get(header)!.push(field);
    }
    return grouped;
}

function FieldRow({ field }: { field: FieldComparison }) {
    const rowClass = field.isNoisy ? 'text-gray-400' : field.hasChanged ? 'bg-amber-50' : '';

    return (
        <tr className={rowClass}>
            <td className='border px-4 py-2 font-medium'>{field.label}</td>
            <td className='border px-4 py-2'>{String(field.value1)}</td>
            <td className='border px-4 py-2'>{String(field.value2)}</td>
        </tr>
    );
}

function FieldGroup({ header, fields }: { header: string; fields: FieldComparison[] }) {
    return (
        <>
            <tr>
                <td colSpan={3} className='bg-gray-100 px-4 py-2 font-semibold'>
                    {header}
                </td>
            </tr>
            {fields.map((field) => (
                <FieldRow key={field.name} field={field} />
            ))}
        </>
    );
}

export function DiffTable({ comparison, version1, version2, showAllFields }: DiffTableProps) {
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

    // Group by header
    const groupedFields = groupFieldsByHeader(fieldsToDisplay);

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
            <table className='table-auto w-full border-collapse border'>
                <thead>
                    <tr className='bg-gray-200'>
                        <th className='border px-4 py-2 text-left'>Field</th>
                        <th className='border px-4 py-2 text-left'>Version {version1}</th>
                        <th className='border px-4 py-2 text-left'>Version {version2}</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from(groupedFields.entries()).map(([header, fields]) => (
                        <FieldGroup key={header} header={header} fields={fields} />
                    ))}
                </tbody>
            </table>
        </div>
    );
}
