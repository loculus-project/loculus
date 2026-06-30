import type { FC } from 'react';

import { Button } from '../common/Button';
import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import EditIcon from '~icons/ic/baseline-edit';

type Props = {
    displayFullDetails: boolean;
    firstName?: string | null;
    lastName?: string | null;
    emailDomain?: string | null;
    university?: string | null;
    editAccountUrl?: string | null;
};

export const UserDetails: FC<Props> = ({
    displayFullDetails,
    firstName,
    lastName,
    emailDomain,
    university,
    editAccountUrl,
}) => {
    const renderName = () => {
        return [firstName, lastName].filter((name) => name !== null).join(' ');
    };

    const renderEmail = () => {
        if (emailDomain === null) {
            return 'Unknown email';
        }
        return `Registered email @${emailDomain}`;
    };

    const renderPartialDetails = () => (
        <div className='flex flex-row items-center text-sm text-gray-500'>
            <AccountCircleIcon fontSize={20} className='mr-1' />
            <span>{renderName()}</span>
        </div>
    );

    const renderFullDetails = () => (
        <div className='flex self-start my-4 flex-row'>
            <div className='pr-4'>
                <AccountCircleIcon className='text-7xl sm:text-[120px]' />
            </div>
            <div className='flex flex-col'>
                <div className='flex flex-row justify-start items-center pt-2 pb-4'>
                    <h1 className='flex text-xl font-semibold pr-2'>{renderName()}</h1>
                    {editAccountUrl !== null ? (
                        <Button as='a' size='sm' circle variant='ghost' href={editAccountUrl} data-testid='EditIcon'>
                            <EditIcon fontSize='large' />
                        </Button>
                    ) : null}
                </div>
                <h1 className='flex text-base'>
                    {university !== null && university !== '' ? university : 'Unknown affiliation'}
                </h1>
                {renderEmail()}
            </div>
        </div>
    );

    return <div>{displayFullDetails ? renderFullDetails() : renderPartialDetails()}</div>;
};
