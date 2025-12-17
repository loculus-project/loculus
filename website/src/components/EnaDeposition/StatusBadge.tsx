import { type FC } from 'react';

import type { SubmissionStatusAll } from '../../types/enaDeposition';

interface Props {
    status: SubmissionStatusAll;
}

const statusConfig: Record<SubmissionStatusAll, { label: string; className: string }> = {
    READY_TO_SUBMIT: { label: 'Ready', className: 'bg-blue-100 text-blue-800' },
    SUBMITTING_PROJECT: { label: 'Submitting Project', className: 'bg-yellow-100 text-yellow-800' },
    SUBMITTED_PROJECT: { label: 'Project Done', className: 'bg-green-100 text-green-800' },
    SUBMITTING_SAMPLE: { label: 'Submitting Sample', className: 'bg-yellow-100 text-yellow-800' },
    SUBMITTED_SAMPLE: { label: 'Sample Done', className: 'bg-green-100 text-green-800' },
    SUBMITTING_ASSEMBLY: { label: 'Submitting Assembly', className: 'bg-yellow-100 text-yellow-800' },
    SUBMITTED_ALL: { label: 'Submitted', className: 'bg-green-100 text-green-800' },
    SENT_TO_LOCULUS: { label: 'Complete', className: 'bg-green-500 text-white' },
    HAS_ERRORS_PROJECT: { label: 'Project Error', className: 'bg-red-100 text-red-800' },
    HAS_ERRORS_SAMPLE: { label: 'Sample Error', className: 'bg-red-100 text-red-800' },
    HAS_ERRORS_ASSEMBLY: { label: 'Assembly Error', className: 'bg-red-100 text-red-800' },
    HAS_ERRORS_EXT_METADATA_UPLOAD: { label: 'Upload Error', className: 'bg-red-100 text-red-800' },
};

export const StatusBadge: FC<Props> = ({ status }) => {
    const config = statusConfig[status] ?? { label: status, className: 'bg-gray-100 text-gray-800' };

    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${config.className}`}>
            {config.label}
        </span>
    );
};
