import { Datepicker } from 'flowbite-react';
import { DateTime } from 'luxon';
import { type FC, useState, useRef } from 'react';
import { toast } from 'react-toastify';

import { withQueryProvider } from './../common/withQueryProvider';
import { backendClientHooks } from '../../services/serviceHooks';
import {
    type RestrictedDataUseTerms,
    type DataUseTermsType,
    openDataUseTermsType,
    restrictedDataUseTermsType,
} from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { datePickerTheme } from '../Submission/DateChangeModal';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';

type EditDataUseTermsButtonProps = {
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string;
    dataUseTerms: RestrictedDataUseTerms;
};

const InnerEditDataUseTermsButton: FC<EditDataUseTermsButtonProps> = ({
    accessToken,
    clientConfig,
    accessionVersion,
    dataUseTerms,
}) => {
    const restrictedUntil = DateTime.fromISO(dataUseTerms.restrictedUntil);
    const [dataUseTermsType, setDataUseTermsType] = useState<DataUseTermsType>(dataUseTerms.type);
    const [newRestrictedDate, setNewRestrictedDate] = useState<DateTime>(restrictedUntil);

    const dialogRef = useRef<HTMLDialogElement>(null);

    const openDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.showModal();
        }
    };

    const closeDialog = () => {
        if (dialogRef.current) {
            dialogRef.current.close();
        }
    };

    const hooks = backendClientHooks(clientConfig);
    const useSetDataUseTerms = hooks.useSetDataUseTerms(
        { headers: createAuthorizationHeader(accessToken) },
        {
            onError: (error) =>
                toast.error('Failed to edit terms of use: ' + stringifyMaybeAxiosError(error), {
                    position: 'top-center',
                    autoClose: false,
                }),
        },
    );

    return (
        <>
            <button className='btn btn-sm' onClick={openDialog}>
                Edit Data Use Terms
            </button>
            <dialog ref={dialogRef} className='modal-box'>
                <button
                    className='btn btn-sm btn-circle btn-ghost text-gray-900 absolute right-2 top-2'
                    onClick={closeDialog}
                >
                    ✕
                </button>
                <label className='block text-sm font-medium leading-6 text-gray-900'>Edit Data Use Terms</label>
                <div className='mt-2'>
                    <div className='mt-6 space-y-2'>
                        <div className='flex flex-col items-center gap-x-3'>
                            <div>
                                <input
                                    id='data-use-open'
                                    name='data-use'
                                    onChange={() => setDataUseTermsType(openDataUseTermsType)}
                                    type='radio'
                                    checked={dataUseTermsType === openDataUseTermsType}
                                    className='h-4 w-4 p-2 border-gray-300 text-iteal-600 focus:ring-iteal-600 inline-block'
                                />
                                <label
                                    htmlFor='data-use-open'
                                    className='ml-2 h-4 p-2 text-sm font-medium leading-6 text-gray-900'
                                >
                                    <Unlocked className='h-4 w-4 inline-block mr-2 -mt-1' />
                                    Open
                                </label>
                                <div className='text-xs pl-8 text-gray-500 pb-4'>
                                    Anyone can use and share the data (though we believe researchers should exercise
                                    scientific etiquette, including the importance of citation). Data will be released
                                    to the INSDC databases shortly after submission.{' '}
                                    <a href='#TODO-MVP' className='text-primary-600'>
                                        Find out more
                                    </a>
                                    .
                                </div>
                            </div>
                            <div>
                                <input
                                    id='data-use-restricted'
                                    name='data-use'
                                    onChange={() => setDataUseTermsType(restrictedDataUseTermsType)}
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
                                    Data will be restricted for a period of time. The sequences will be available but
                                    there will be limitations on how they can be used by others.{' '}
                                    <a href='#TODO-MVP' className='text-primary-600'>
                                        Find out more
                                    </a>
                                    .
                                </div>
                            </div>
                        </div>
                        {dataUseTermsType === restrictedDataUseTermsType && (
                            <>
                                <div className='text-sm pl-8 text-gray-900 mb-4 py-2'>
                                    Currently restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>.<br />
                                    New restriction will be set to <b>{newRestrictedDate.toFormat('yyyy-MM-dd')}</b>.
                                </div>
                                <Datepicker
                                    className='ml-8'
                                    defaultDate={restrictedUntil.toJSDate()}
                                    showClearButton={false}
                                    showTodayButton={false}
                                    minDate={new Date()}
                                    maxDate={restrictedUntil.toJSDate()}
                                    theme={datePickerTheme}
                                    onSelectedDateChanged={(date) => {
                                        setNewRestrictedDate(DateTime.fromJSDate(date));
                                    }}
                                    inline
                                />
                            </>
                        )}
                    </div>
                </div>
                <div className='flex items-center justify-end my-2'>
                    <button
                        className='btn btn-sm'
                        onClick={() => {
                            closeDialog();
                            useSetDataUseTerms.mutate({
                                accessions: [accessionVersion],
                                newDataUseTerms: {
                                    type: dataUseTermsType,
                                    restrictedUntil: newRestrictedDate.toFormat('yyyy-MM-dd'),
                                },
                            });
                            toast.success('The use terms for this sequence will be updated within a few minutes.');
                        }}
                    >
                        Submit
                    </button>
                </div>
            </dialog>
        </>
    );
};

export const EditDataUseTermsButton = withQueryProvider(InnerEditDataUseTermsButton);
