import { DateTime } from 'luxon';
import { type FC, useState } from 'react';

import { BaseDialog } from '../common/BaseDialog';
import { Button } from '../common/Button';
import { withQueryProvider } from './../common/withQueryProvider';
import DataUseTermsSelector from './DataUseTermsSelector';
import { errorToast, successToast } from './EditDataUseTermsToasts.ts';
import { backendClientHooks } from '../../services/serviceHooks';
import { type RestrictedDataUseTerms, type DataUseTerms } from '../../types/backend.ts';
import type { ClientConfig } from '../../types/runtimeConfig';
import { createAuthorizationHeader } from '../../utils/createAuthorizationHeader';

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
    const [selectedDataUseTerms, setDataUseTerms] = useState<DataUseTerms>(dataUseTerms);
    const [isDialogOpen, setIsDialogOpen] = useState(false);

    const openDialog = () => setIsDialogOpen(true);
    const closeDialog = () => setIsDialogOpen(false);

    const useSetDataUseTerms = backendClientHooks(clientConfig).useSetDataUseTerms(
        { headers: createAuthorizationHeader(accessToken) },
        { onError: errorToast, onSuccess: successToast },
    );

    return (
        <>
            <Button size='sm' onClick={openDialog}>
                Edit data use terms
            </Button>
            <BaseDialog title='' isOpen={isDialogOpen} onClose={closeDialog} fullWidth={false} dismissible={false}>
                <label className='block text-sm font-medium leading-6 text-gray-900'>Edit data use terms</label>
                <p className='text-sm text-gray-900 mb-4 py-2'>
                    Currently restricted until <b>{restrictedUntil.toFormat('yyyy-MM-dd')}</b>
                </p>
                <div className='mt-2'>
                    <div className='mt-6 space-y-2'>
                        <div className='flex flex-col items-center gap-x-3'>
                            <DataUseTermsSelector
                                initialDataUseTermsOption={selectedDataUseTerms.type}
                                maxRestrictedUntil={restrictedUntil}
                                setDataUseTerms={setDataUseTerms}
                            />
                        </div>
                    </div>
                </div>
                <div className='flex items-center justify-end my-2'>
                    <Button
                        size='sm'
                        onClick={() => {
                            closeDialog();
                            useSetDataUseTerms.mutate({
                                accessions: accessionVersion,
                                newDataUseTerms: selectedDataUseTerms,
                            });
                        }}
                    >
                        Submit
                    </Button>
                </div>
            </BaseDialog>
        </>
    );
};

export const EditDataUseTermsButton = withQueryProvider(InnerEditDataUseTermsButton);
