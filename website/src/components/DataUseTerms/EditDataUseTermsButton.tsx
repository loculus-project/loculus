import { Datepicker } from 'flowbite-react';
import { DateTime } from 'luxon';
import { type FC, useState, useRef } from 'react';
import { toast } from 'react-toastify';

import { withQueryProvider } from './../common/withQueryProvider';
import DataUseTermsSelector from './DataUseTermsSelector';
import { getClientLogger } from '../../clientLogger';
import { backendClientHooks } from '../../services/serviceHooks';
import { type RestrictedDataUseTerms, type DataUseTermsType, restrictedDataUseTermsType } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';
import { stringifyMaybeAxiosError } from '../../utils/stringifyMaybeAxiosError';
import { datePickerTheme } from '../Submission/DateChangeModal';

const logger = getClientLogger('EditDataUseTermsButton');

type EditDataUseTermsButtonProps = {
    accessToken: string;
    clientConfig: ClientConfig;
    accessionVersion: string[];
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
            onSuccess: () => location.reload(),
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
                            <DataUseTermsSelector
                                dataUseTermsType={dataUseTermsType}
                                setDataUseTermsType={setDataUseTermsType}
                            />
                        </div>
                        {dataUseTermsType === restrictedDataUseTermsType && (
                            <>
                                <div className='text-sm pl-8 text-gray-900 mb-4 py-2'>
                                    Currently restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>.<br />
                                    New restriction will be set to <b>{newRestrictedDate.toFormat('yyyy-MM-dd')}</b>.
                                </div>
                                <Datepicker
                                    className='ml-8'
                                    defaultValue={restrictedUntil.toJSDate()}
                                    showClearButton={false}
                                    showTodayButton={false}
                                    minDate={new Date()}
                                    maxDate={restrictedUntil.toJSDate()}
                                    theme={datePickerTheme}
                                    onChange={(date: Date | null) => {
                                        if (date !== null) {
                                            setNewRestrictedDate(DateTime.fromJSDate(date));
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
                    </div>
                </div>
                <div className='flex items-center justify-end my-2'>
                    <button
                        className='btn btn-sm'
                        onClick={() => {
                            closeDialog();
                            useSetDataUseTerms.mutate({
                                accessions: accessionVersion,
                                newDataUseTerms: {
                                    type: dataUseTermsType,
                                    restrictedUntil: newRestrictedDate.toFormat('yyyy-MM-dd'),
                                },
                            });
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
