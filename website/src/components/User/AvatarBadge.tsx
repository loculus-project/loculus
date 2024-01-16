import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import type { FC } from 'react';

type Props = {
    displayName?: string;
};

export const AvatarBadge: FC<Props> = ({ displayName }) => {

    return (
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon fontSize={100} />
            <div className='flex flex-col items-left justify-center'>
                <div className='text-lg'>{displayName ?? ''}</div>
            </div>
        </div>
    );
};
