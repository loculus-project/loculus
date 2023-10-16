import { AccountCircle as AccountCircleIcon } from '@mui/icons-material';
import type { FC } from 'react';

type Props = {
    username: string;
};

export const AvatarBadge: FC<Props> = ({ username }) => {
    return (
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon sx={{ fontSize: 100 }} />
            <div className='flex flex-col items-left justify-center'>
                <div className='text-lg'>{username}</div>
            </div>
        </div>
    );
};
