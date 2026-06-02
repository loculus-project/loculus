import type { PendingOp } from '../../types/loculusConfig';

interface Props {
    ops: PendingOp[];
}

export function PendingOpsList({ ops }: Props) {
    if (ops.length === 0) {
        return <p className='text-sm italic text-gray-500'>No pending operations.</p>;
    }
    return (
        <div className='border border-gray-200 rounded p-3'>
            <h3 className='text-sm font-semibold mb-1'>Pending operations</h3>
            <ol className='space-y-0.5 text-xs'>
                {ops.map((op, idx) => (
                    <li key={idx} className='flex gap-2'>
                        <span className='text-gray-500 w-5 text-right'>{idx + 1}.</span>
                        <span className='font-mono'>{op.opType}</span>
                        <span className='text-gray-700 truncate' title={op.summary}>
                            — {op.summary}
                        </span>
                        <span className='ml-auto text-gray-500'>{op.appliedBy}</span>
                    </li>
                ))}
            </ol>
        </div>
    );
}
