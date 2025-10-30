import { Datepicker, type FlowbiteDatepickerTheme } from 'flowbite-react';
import { DateTime } from 'luxon';
import { useState } from 'react';
import { Button } from "src/components/common/Button";

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
                base: 'w-full rounded-lg px-5 py-2 text-center text-sm font-medium focus:ring-4 focus:ring-primary-300',
                today: 'bg-primary-700 text-white hover:bg-primary-800 dark:bg-primary-600 dark:hover:bg-primary-700',
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
                    selected: 'bg-primary-700 text-white hover:bg-primary-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        months: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9 text-gray-900 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600',
                    selected: 'bg-primary-700 text-white hover:bg-primary-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        years: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9 hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 text-gray-900',
                    selected: 'bg-primary-700 text-white hover:bg-primary-600',
                    disabled: 'text-gray-300 disabled',
                },
            },
        },
        decades: {
            items: {
                base: 'grid w-64 grid-cols-4',
                item: {
                    base: 'block flex-1 cursor-pointer rounded-lg border-0 text-center text-sm font-semibold leading-9  hover:bg-gray-100 dark:text-white dark:hover:bg-gray-600 text-gray-900',
                    selected: 'bg-primary-700 text-white hover:bg-primary-600',
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
    maxDate,
    title,
    description = null,
}: {
    restrictedUntil: DateTime;
    setRestrictedUntil: (datetime: DateTime) => void;
    setDateChangeModalOpen: (isOpen: boolean) => void;
    maxDate: DateTime;
    title: string;
    description?: React.ReactNode;
}) => {
    const [date, setDate] = useState(restrictedUntil.toJSDate());
    return (
        <div className='fixed inset-0 bg-gray-900 bg-opacity-75 flex justify-center items-center z-50'>
            <div className='bg-white p-6 rounded-lg w-[30rem]'>
                <h2 className='font-medium text-lg'>{title}</h2>
                {description !== null && <p className='text-sm text-gray-700 py-2'>{description}</p>}
                <div className='text-center'>
                    <Datepicker
                        defaultValue={date}
                        showClearButton={false}
                        showTodayButton={false}
                        minDate={new Date()}
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
                </div>
                <div className='flex justify-end gap-4 mt-4'>
                    <Button className='px-4 py-2 btn normal-case' onClick={() => setDateChangeModalOpen(false)}>
                        Cancel
                    </Button>
                    <Button
                        className='px-4 py-2 btn loculusColor text-white normal-case'
                        onClick={() => {
                            setRestrictedUntil(DateTime.fromJSDate(date));

                            setDateChangeModalOpen(false);
                        }}
                    >
                        Save
                    </Button>
                </div>
            </div>
        </div>
    );
};
