import { Datepicker } from 'flowbite-react';
import { DateTime } from 'luxon';
import { useEffect, useState, type FC } from 'react';

import { getClientLogger } from '../../clientLogger.ts';
import { routes } from '../../routes/routes.ts';
import {
    type DataUseTermsType,
    openDataUseTermsType,
    restrictedDataUseTermsType,
    type DataUseTerms,
} from '../../types/backend.ts';
import { datePickerTheme } from '../Submission/DateChangeModal.tsx';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';

const logger = getClientLogger('DatauseTermsSelector');

type DataUseTermsSelectorProps = {
    dataUseTermsType: DataUseTermsType;
    maxRestrictedUntil: DateTime;
    setDataUseTerms: (dataUseTerms: DataUseTerms) => void;
};

const DataUseTermsSelector: FC<DataUseTermsSelectorProps> = ({
    dataUseTermsType,
    maxRestrictedUntil,
    setDataUseTerms,
}) => {
    const [selectedType, setSelectedType] = useState<DataUseTermsType>(dataUseTermsType);
    const [selectedDate, setSelectedDate] = useState<DateTime>(maxRestrictedUntil);

    useEffect(() => {
        switch (selectedType) {
            case openDataUseTermsType:
                setDataUseTerms({ type: openDataUseTermsType });
                break;
            case restrictedDataUseTermsType:
                setDataUseTerms({
                    type: restrictedDataUseTermsType,
                    restrictedUntil: selectedDate.toFormat('yyyy-MM-dd'),
                });
                break;
        }
    }, [selectedType, selectedDate, setDataUseTerms]);

    return (
        <>
            <div>
                <input
                    id='data-use-open'
                    name='data-use'
                    onChange={() => setSelectedType(openDataUseTermsType)}
                    type='radio'
                    checked={selectedType === openDataUseTermsType}
                    className='h-4 w-4 p-2 border-gray-300 text-iteal-600 focus:ring-iteal-600 inline-block'
                />
                <label htmlFor='data-use-open' className='ml-2 h-4 p-2 text-sm font-medium leading-6 text-gray-900'>
                    <Unlocked className='h-4 w-4 inline-block mr-2 -mt-1' />
                    Open
                </label>
                <div className='text-xs pl-8 text-gray-500 pb-4'>
                    Anyone can use and share the data (though we believe researchers should exercise scientific
                    etiquette, including the importance of citation).{' '}
                    <a href={routes.datauseTermsPage()} className='text-primary-600'>
                        Find out more
                    </a>
                    .
                </div>
            </div>
            <div>
                <input
                    id='data-use-restricted'
                    name='data-use'
                    onChange={() => setSelectedType(restrictedDataUseTermsType)}
                    type='radio'
                    checked={dataUseTermsType === restrictedDataUseTermsType}
                    className='h-4 w-4 border-gray-300 text-iteal-600 focus:ring-iteal-600 inline-block'
                />
                <label
                    htmlFor='data-use-restricted'
                    className='ml-2 h-4 p-2 text-sm font-medium leading-6 text-gray-900'
                >
                    <Locked className='h-4 w-4 inline-block mr-2 -mt-1' />
                    Restricted
                </label>
                <div className='text-xs pl-8 text-gray-500 mb-4'>
                    Data use will be restricted for a period of time. The sequences will be available but there will be
                    limitations on how they can be used by others.{' '}
                    <a href={routes.datauseTermsPage()} className='text-primary-600'>
                        Find out more
                    </a>
                    .
                </div>
            </div>
            {dataUseTermsType === restrictedDataUseTermsType && (
                <Datepicker
                    className='ml-8'
                    defaultValue={selectedDate.toJSDate()}
                    showClearButton={false}
                    showTodayButton={false}
                    minDate={new Date()}
                    maxDate={maxRestrictedUntil.toJSDate()}
                    theme={datePickerTheme}
                    onChange={(date: Date | null) => {
                        if (date !== null) {
                            setSelectedDate(DateTime.fromJSDate(date));
                        } else {
                            void logger.warn("Datepicker onChange received a null value, this shouldn't happen!");
                        }
                    }}
                    inline
                />
            )}
        </>
    );
};

export default DataUseTermsSelector;

/**
 * 

                                <div className='text-sm pl-8 text-gray-900 mb-4 py-2'>
                                    Currently restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>.<br />
                                    New restriction will be set to <b>{newRestrictedDate.toFormat('yyyy-MM-dd')}</b>.
                                </div>
 */
