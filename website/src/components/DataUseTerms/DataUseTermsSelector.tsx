import { type FC } from 'react';

import { routes } from '../../routes/routes.ts';
import { type DataUseTermsType, openDataUseTermsType, restrictedDataUseTermsType } from '../../types/backend.ts';
import Locked from '~icons/fluent-emoji-high-contrast/locked';
import Unlocked from '~icons/fluent-emoji-high-contrast/unlocked';

type DataUseTermsSelectorProps = {
    dataUseTermsType: DataUseTermsType;
    setDataUseTermsType: (dataUseTermsType: DataUseTermsType) => void;
};

const DataUseTermsSelector: FC<DataUseTermsSelectorProps> = ({ dataUseTermsType, setDataUseTermsType }) => {
    return (
        <>
            <div>
                <input
                    id='data-use-open'
                    name='data-use'
                    onChange={() => setDataUseTermsType(openDataUseTermsType)}
                    type='radio'
                    checked={dataUseTermsType === openDataUseTermsType}
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
                    Data will be restricted for a period of time. The sequences will be available but there will be
                    limitations on how they can be used by others.{' '}
                    <a href={routes.datauseTermsPage()} className='text-primary-600'>
                        Find out more
                    </a>
                    .
                </div>
            </div>
        </>
    );
};

export default DataUseTermsSelector;
