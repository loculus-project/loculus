import type { FC } from 'react';

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

export const AuthorDetails: FC<Props> = ({
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
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon fontSize={60} />
            <div className='flex flex-col items-left justify-center'>
                <div className='text-60'>{renderName()}</div>
            </div>
        </div>
    );

    const renderFullDetails = () => (
        <div className='flex self-start my-4 flex-row'>
            <div className='flex'>
                <AccountCircleIcon fontSize={120} />
            </div>
            <div className='flex flex-col pl-4'>
                <div className='flex flex-row justify-start items-center pt-2 pb-4'>
                    <h1 className='flex text-xl font-semibold pr-2'>{renderName()}</h1>
                    {editAccountUrl !== null ? (
                        <a href={editAccountUrl} data-testid='EditIcon' className='btn btn-sm btn-circle btn-ghost'>
                            <EditIcon fontSize='large' />
                        </a>
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
