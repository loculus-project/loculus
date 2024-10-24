import { Datepicker, type FlowbiteDatepickerTheme } from 'flowbite-react';
import { DateTime } from 'luxon';
import { useState } from 'react';

import { getClientLogger } from '../../clientLogger';

const logger = getClientLogger('DateChangeModal');

export const datePickerTheme: FlowbiteDatepickerTheme = {
    root: {
        base: 'relative',
    },
    popup: {
        root: {
            base: 'absolute top-10 z-50 block pt-2',
            inline: 'relative top-0 z-auto',
            inner: 'inline-block rounded-lg bg-white p-4 shadow-lg dark:bg-gray-700',
        },
        header: {
            base: '',
            title: 'px-2 py-3 text-center font-semibold text-gray-900 dark:text-white',
            selectors: {
                base: 'flex justify-between mb-2',
                button: {
                    base: 'text-sm rounded-lg text-gray-900 dark:text-white bg-white dark:bg-gray-700 font-semibold py-2.5 px-5 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-gray-200',
                    prev: '',
                    next: '',
                    view: 'cursor-default pointer-events-none',
                },
            },
        },
        view: {
            base: 'p-1',
        },
        footer: {
            base: 'flex mt-2 space-x-2',
            button: {
                base: 'w-full rounded-lg px-5 py-2 text-center text-sm font-medium focus:ring-4 focus:ring-cyan-300',
                today: 'bg-cyan-700 text-white hover:bg-cyan-800 dark:bg-cyan-600 dark:hover:bg-cyan-700',
                clear: 'border border-gray-300 bg-white text-gray-900 hover:bg-gray-100 dark:border-gray-600 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600',
            },
        },
    },
    views: {
        days: {
            header: {
                base: 'grid grid-cols-7 mb-1',
                title: 'dow h-6 text-center text-sm font-medium leading-6 text-gray-500 dark:text-gray-400',
            },
            items: {
                base: 'grid w-64 grid-cols-7',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 ',
                    selected: 'bg-cyan-700 text-white hover:bg-cyan-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        months: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600',
                    selected: 'bg-cyan-700 text-white hover:bg-cyan-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        years: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 text-gray-900',
                    selected: 'bg-cyan-700 text-white hover:bg-cyan-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        decades: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9  hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 text-gray-900',
                    selected: 'bg-cyan-700 text-white hover:bg-cyan-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
    },
};

export const DateChangeModal = ({
    restrictedUntil,
    setRestrictedUntil,
    setDateChangeModalOpen,
    minDate,
    maxDate,
}: {
    restrictedUntil: DateTime;
    setRestrictedUntil: (datetime: DateTime) => void;
    setDateChangeModalOpen: (isOpen: boolean) => void;
    minDate: DateTime;
    maxDate: DateTime;
}) => {
    const [date, setDate] = useState(restrictedUntil.toJSDate());
    return (
        <div className='fixed inset-0 bg-gray-900 bg-opacity-75 flex justify-center items-center z-50'>
            <div className='bg-white p-6 rounded-lg'>
                <h2 className='font-medium text-lg'>Change date until which sequences are restricted</h2>
                {
                    // "bg-cyan-700" - WE NEED TO KEEP THIS COMMENT OR tailwind removes this color we need for the datepicker
                }
                <Datepicker
                    defaultValue={date}
                    showClearButton={false}
                    showTodayButton={false}
                    minDate={minDate.toJSDate()}
                    maxDate={maxDate.toJSDate()}
                    theme={datePickerTheme}
                    onChange={(date: Date | null) => {
                        if (date !== null) {
                            setDate(date);
                        } else {
                            void logger.warn("Datepicker onChange received a null value, this shouldn't happen!");
                        }
                    }}
                    inline
                />
                <div className='flex justify-end gap-4 mt-4'>
                    <button className='px-4 py-2 btn normal-case' onClick={() => setDateChangeModalOpen(false)}>
                        Cancel
                    </button>
                    <button
                        className='px-4 py-2 btn normal-case'
                        onClick={() => {
                            setRestrictedUntil(DateTime.fromJSDate(date));

                            setDateChangeModalOpen(false);
                        }}
                    >
                        Save
                    </button>
                </div>
            </div>
        </div>
    );
};
