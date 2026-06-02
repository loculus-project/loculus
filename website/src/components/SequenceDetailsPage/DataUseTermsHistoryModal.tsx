import { DateTime, FixedOffsetZone } from 'luxon';
import { type FC, useRef } from 'react';

import { type DataUseTermsHistoryEntry, restrictedDataUseTermsOption } from '../../types/backend.ts';
import { Button } from '../common/Button';
import { ModalBox } from '../common/ModalBox';

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
            <dialog ref={dialogRef} className='bg-transparent p-0 backdrop:bg-black/40'>
                <DataUseTermsHistoryDialog dataUseTermsHistory={dataUseTermsHistory} />
            </dialog>
            <span>
                <Button className='underline' onClick={handleOpenHistoryDialog}>
                    (history)
                </Button>
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
        <ModalBox className='w-auto max-w-md'>
            <form method='dialog'>
                <Button circle size='sm' variant='ghost' className='absolute right-2 top-2'>
                    ✕
                </Button>
            </form>
            <h3 className='font-bold text-lg'>Data use terms history</h3>
            <table className='w-full text-sm [&_:where(th,td)]:px-3 [&_:where(th,td)]:py-2 [&_:where(th,td)]:text-left [&_th]:font-semibold [&_tbody_tr]:border-t [&_tbody_tr]:border-base-200'>
                <thead>
                    <tr>
                        <th>Changed</th>
                        <th>User</th>
                        <th>Data use terms</th>
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
                    <Button variant='neutral'>Close</Button>
                </form>
            </div>
        </ModalBox>
    );
};
