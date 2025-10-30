import { Datepicker } from 'flowbite-react';
import { DateTime } from 'luxon';
import { useState, type FC } from 'react';

import { DateChangeModal, datePickerTheme } from './DateChangeModal.tsx';
import { getClientLogger } from '../../clientLogger.ts';
import {
    type DataUseTermsOption,
    openDataUseTermsOption,
    restrictedDataUseTermsOption,
    type DataUseTerms,
} from '../../types/backend.ts';
import { Button } from '../common/Button';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';

const logger = getClientLogger('DatauseTermsSelector');

type DataUseTermsSelectorProps = {
    initialDataUseTermsOption?: DataUseTermsOption | null;
    maxRestrictedUntil: DateTime;
    calendarUseModal?: boolean;
    calendarDescription?: React.ReactNode;
    setDataUseTerms: (dataUseTerms: DataUseTerms) => void;
};

const DataUseTermsSelector: FC<DataUseTermsSelectorProps> = ({
    initialDataUseTermsOption = null,
    maxRestrictedUntil,
    calendarUseModal = false,
    setDataUseTerms,
    calendarDescription = null,
}) => {
    const setDataUseTermsWithValues = (newOption: DataUseTermsOption, newDate: DateTime) => {
        switch (newOption) {
            case openDataUseTermsOption:
                setDataUseTerms({ type: openDataUseTermsOption });
                break;
            case restrictedDataUseTermsOption:
                setDataUseTerms({
                    type: restrictedDataUseTermsOption,
                    restrictedUntil: newDate.toFormat('yyyy-MM-dd'),
                });
                break;
        }
    };

    const [selectedOption, setSelectedOptionInternal] = useState<DataUseTermsOption | null>(initialDataUseTermsOption);
    const [selectedDate, setSelectedDateInternal] = useState<DateTime>(maxRestrictedUntil);

    const setSelectedOption = (newOption: DataUseTermsOption) => {
        setSelectedOptionInternal(newOption);
        setDataUseTermsWithValues(newOption, selectedDate);
    };

    const setSelectedDate = (newDate: DateTime) => {
        setSelectedOptionInternal(restrictedDataUseTermsOption);
        setSelectedDateInternal(newDate);
        setDataUseTermsWithValues(restrictedDataUseTermsOption, newDate);
    };

    const [dateChangeModalOpen, setDateChangeModalOpen] = useState(false);

    return (
        <>
            {dateChangeModalOpen && (
                <DateChangeModal
                    title='Change date until which sequences are restricted'
                    description={calendarDescription}
                    restrictedUntil={selectedDate}
                    setRestrictedUntil={setSelectedDate}
                    setDateChangeModalOpen={setDateChangeModalOpen}
                    maxDate={maxRestrictedUntil}
                />
            )}
            <div className='flex-1'>
                <input
                    id='data-use-open'
                    name='data-use'
                    onChange={() => setSelectedOption(openDataUseTermsOption)}
                    type='radio'
                    checked={selectedOption === openDataUseTermsOption}
                    className='h-4 w-4 p-2 border-gray-300 text-primary-600 focus:ring-primary-600 inline-block'
                />
                <label htmlFor='data-use-open' className='ml-2 h-4 p-2 text-sm font-medium leading-6 text-gray-900'>
                    <Unlocked className='h-4 w-4 inline-block mr-2 -mt-1' />
                    Open
                </label>
                <div className='text-xs pl-8 text-gray-500 pb-4'>
                    Anyone can use and share the data (though we believe researchers should exercise scientific
                    etiquette, including the importance of citation).{' '}
                    <a href='/about/terms-of-use/open-data' className='text-primary-600'>
                        Find out more
                    </a>
                    .
                </div>
            </div>
            <div className='flex-1'>
                <input
                    id='data-use-restricted'
                    name='data-use'
                    onChange={() => setSelectedOption(restrictedDataUseTermsOption)}
                    type='radio'
                    checked={selectedOption === restrictedDataUseTermsOption}
                    className='h-4 w-4 border-gray-300 text-primary-600 focus:ring-primary-600 inline-block'
                />
                <label
                    htmlFor='data-use-restricted'
                    className='ml-2 h-4 p-2 text-sm font-medium leading-6 text-gray-900'
                >
                    <Locked className='h-4 w-4 inline-block mr-2 -mt-1' />
                    Restricted use
                </label>
                <div className='text-xs pl-8 text-gray-500 mb-4'>
                    Data use will be restricted for a period of time. The sequences will be available but there will be
                    limitations on how they can be used by others.{' '}
                    <a href='/about/terms-of-use/restricted-data' className='text-primary-600'>
                        Find out more
                    </a>
                    .
                </div>
                {selectedOption === restrictedDataUseTermsOption && !calendarUseModal && (
                    <>
                        {calendarDescription !== null && (
                            <p className='ml-8 text-xs text-gray-500 mb-4'>{calendarDescription}</p>
                        )}
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
                                    void logger.warn(
                                        "Datepicker onChange received a null value, this shouldn't happen!",
                                    );
                                }
                            }}
                            inline
                        />
                    </>
                )}
                {selectedOption === restrictedDataUseTermsOption && (
                    <span className='py-4 text-sm ml-8'>
                        Data use will be restricted until <b>{selectedDate.toFormat('yyyy-MM-dd')}</b>.{' '}
                        {calendarUseModal && (
                            <Button className='border rounded px-2 py-1' onClick={() => setDateChangeModalOpen(true)}>
                                Change date
                            </Button>
                        )}
                    </span>
                )}
            </div>
        </>
    );
};

export default DataUseTermsSelector;
