import { DateTime, FixedOffsetZone } from 'luxon';
import { type FC, useState } from 'react';

import { type DataUseTermsHistoryEntry, restrictedDataUseTermsOption } from '../../types/backend.ts';
import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';

export type DataUseTermsHistoryProps = {
    dataUseTermsHistory: DataUseTermsHistoryEntry[];
};

export const DataUseTermsHistoryModal: FC<DataUseTermsHistoryProps> = ({ dataUseTermsHistory }) => {
    const [isOpen, setIsOpen] = useState(false);

    const formatDate = (dateString: string) =>
        DateTime.fromISO(dateString, { zone: FixedOffsetZone.utcInstance }).setLocale('en').toFormat('yyyy-MM-dd T');

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
                className='max-w-md'
            >
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
            </BaseDialog>
        </>
    );
};
