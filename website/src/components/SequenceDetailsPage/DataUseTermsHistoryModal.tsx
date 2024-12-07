import { DateTime, FixedOffsetZone } from 'luxon';
import { type FC, useRef } from 'react';

import { type DataUseTermsHistoryEntry, restrictedDataUseTermsOption } from '../../types/backend.ts';

export type DataUseTermsHistoryProps = {
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
};

export const DataUseTermsHistoryModal: FC<DataUseTermsHistoryProps> = ({ dataUseTermsHistory }) => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    const handleOpenHistoryDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    return (
        <>
            <dialog ref={dialogRef} className='modal'>
                <DataUseTermsHistoryDialog dataUseTermsHistory={dataUseTermsHistory} />
            </dialog>

            <span>
                <button className='underline' onClick={handleOpenHistoryDialog}>
                    (history)
                </button>
            </span>
        </>
    );
};

type DataUseTermsHistoryContainerProps = {
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
};

const DataUseTermsHistoryDialog: FC<DataUseTermsHistoryContainerProps> = ({ dataUseTermsHistory }) => {
    const formatDate = (dateString: string) =>
        DateTime.fromISO(dateString, { zone: FixedOffsetZone.utcInstance }).setLocale('en').toFormat('yyyy-MM-dd T');

    return (
        <div className='modal-box w-auto max-w-md'>
            <form method='dialog'>
                <button className='btn btn-sm btn-circle btn-ghost absolute right-2 top-2'>✕</button>
            </form>

            <h3 className='font-bold text-lg'>Data Use Terms History</h3>

            <table className='table'>
                <thead>
                    <tr>
                        <th>Changed</th>
                        <th>User</th>
                        <th>Data Use Terms</th>
                    </tr>
                </thead>
                <tbody>
                    {dataUseTermsHistory.map((row, index) => (
                        <tr key={index}>
                            <td>{formatDate(row.changeDate)}</td>
                            <td>{row.userName}</td>
                            <td>
                                {row.dataUseTerms.type}
                                {row.dataUseTerms.type === restrictedDataUseTermsOption
                                    ? ' until ' + row.dataUseTerms.restrictedUntil
                                    : ''}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className='flex justify-end gap-4 mt-4'>
                <form method='dialog'>
                    <button className='btn'>Close</button>
                </form>
            </div>
        </div>
    );
};
