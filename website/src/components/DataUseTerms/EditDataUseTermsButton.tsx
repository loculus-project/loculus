import { type FC, useState, useRef } from 'react';
import { toast } from 'react-toastify';

import { routes } from '../../routes/routes';
import { backendClientHooks } from '../../services/serviceHooks';
import { type DataUseTermsType, openDataUseTermsType, restrictedDataUseTermsType } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { dateTimeInMonths } from '../../utils/DateTimeInMonths.tsx';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { displayConfirmationDialog } from './../ConfirmationDialog';
import { DateChangeModal } from '../Submission/DateChangeModal';
import { withQueryProvider } from './../common/withQueryProvider';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';

type RevokeSequenceEntryProps = {
    organism: string;
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string;
};

const InnerEditDataUseTermsButton: FC<RevokeSequenceEntryProps> = ({
    organism,
    accessToken,
    clientConfig,
    accessionVersion,
}) => {
    const [dataUseTermsType, setDataUseTermsType] = useState<DataUseTermsType>(openDataUseTermsType);
    const [restrictedUntil, setRestrictedUntil] = useState<DateTime>(dateTimeInMonths(6));
    const [dateChangeModalOpen, setDateChangeModalOpen] = useState(false);

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
                {dateChangeModalOpen && (
                    <DateChangeModal
                        restrictedUntil={restrictedUntil}
                        setRestrictedUntil={setRestrictedUntil}
                        setDateChangeModalOpen={setDateChangeModalOpen}
                        minDate={dateTimeInMonths(0)}
                        maxDate={dateTimeInMonths(12)}
                    />
                )}
                <button className='btn btn-sm btn-circle btn-ghost text-gray-900 absolute right-2 top-2' onClick={closeDialog}>✕</button>
                <label className='block text-sm font-medium leading-6 text-gray-900'>Terms of use for these data</label>
                <div className='mt-2'>
                    <div className='mt-6 space-y-2'>
                        <div className='flex flex-col items-center gap-x-3'>
                            <input
                                id='data-use-open'
                                name='data-use'
                                onChange={() => setDataUseTermsType(openDataUseTermsType)}
                                type='radio'
                                checked={dataUseTermsType === openDataUseTermsType}
                                className='h-4 w-4 border-gray-300 text-iteal-600 focus:ring-iteal-600 inline-block'
                            />
                            <label
                                htmlFor='data-use-open'
                                className='block text-sm font-medium leading-6 text-gray-900'
                            >
                                <Unlocked className='h-4 w-4 inline-block mr-2 -mt-1' />
                                Open
                            </label>
                            <div className='text-xs pl-6 text-gray-500 pb-4'>
                                Anyone can use and share the data (though we believe researchers should exercise
                                scientific etiquette, including the importance of citation). Data will be released to
                                the INSDC databases shortly after submission.{' '}
                                <a href='#TODO-MVP' className='text-primary-600'>Find out more</a>.
                            </div>
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
                                className='block text-sm font-medium leading-6 text-gray-900'
                            >
                                <Locked className='h-4 w-4 inline-block mr-2 -mt-1' />
                                Restricted
                            </label>
                            <div className='text-xs pl-6 text-gray-500 mb-4'>
                                Data will be restricted for a period of time. The sequences will be available but there
                                will be limitations on how they can be used by others.{' '}
                                <a href='#TODO-MVP' className='text-primary-600'>Find out more</a>.
                            </div>
                        </div>
                        {dataUseTermsType === restrictedDataUseTermsType && (
                            <div className='text-sm pl-6 text-gray-900 mb-4'>
                                Data will be restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>.{' '}
                                <button
                                className='border rounded px-2 py-1 '
                                onClick={() => setDateChangeModalOpen(true)}
                                >
                                    Change date
                                </button>
                            </div>
                        )}
                    </div>
                </div>
                <div className='flex items-center justify-end '>
                    <button className='btn btn-sm ' onClick={closeDialog}>Submit</button>
                </div>
            </dialog>
        </>
    );
};

export const EditDataUseTermsButton = withQueryProvider(InnerEditDataUseTermsButton);

// onClick={() => {
//     useSetDataUseTerms.mutate({
//         accessions: [accessionVersion],
//         newDataUseTerms: { type: "RESTRICTED", restrictedUntil: "2024-09-01" },
//     })
// }}
