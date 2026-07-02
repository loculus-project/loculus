import { DateTime, FixedOffsetZone } from 'luxon';
import { type FC, useState } from 'react';

import { type DataUseTermsHistoryEntry, restrictedDataUseTermsOption } from '../../types/backend.ts';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

export type DataUseTermsHistoryProps = {
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
};

const formatDate = (dateString: string) =>
    DateTime.fromISO(dateString, { zone: FixedOffsetZone.utcInstance }).setLocale('en').toFormat('yyyy-MM-dd TTT');

export const DataUseTermsHistoryModal: FC<DataUseTermsHistoryProps> = ({ dataUseTermsHistory }) => {
    const [isOpen, setIsOpen] = useState(false);

    return (
        <>
            <span>
                <Button className='underline' onClick={() => setIsOpen(true)}>
                    (history)
                </Button>
            </span>
            <BaseDialog
                title='Data use terms history'
                isOpen={isOpen}
                onClose={() => setIsOpen(false)}
                fullWidth={false}
                className='max-w-xl'
            >
                <table className='w-full text-sm [&_:where(th,td)]:px-3 [&_:where(th,td)]:py-2 [&_:where(th,td)]:text-left [&_th]:font-semibold [&_tbody_tr]:border-t [&_tbody_tr]:border-base-200'>
                    <thead>
                        <tr>
                            <th className='whitespace-nowrap'>Changed</th>
                            <th className='whitespace-nowrap'>User</th>
                            <th>Data use terms</th>
                        </tr>
                    </thead>
                    <tbody>
                        {dataUseTermsHistory.map((row, index) => (
                            <tr key={index}>
                                <td className='whitespace-nowrap'>{formatDate(row.changeDate)}</td>
                                <td className='whitespace-nowrap'>{row.userName}</td>
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
            </BaseDialog>
        </>
    );
};
