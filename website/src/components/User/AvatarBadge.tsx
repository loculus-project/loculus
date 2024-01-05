import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import type { FC } from 'react';

type Props = {
    username?: string;
};

export const AvatarBadge: FC<Props> = (props) => {
    const { username } = props || {};

    return (
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon fontSize={100} />
            <div className='flex flex-col items-left justify-center'>
                <div className='text-lg'>{username ?? ''}</div>
            </div>
        </div>
    );
};
