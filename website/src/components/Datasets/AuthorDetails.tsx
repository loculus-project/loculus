import { type FC, useState } from 'react';

import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import EditIcon from '~icons/ic/baseline-edit';
import IconButton from '@mui/material/IconButton';
import { AlertDialog } from '../common/AlertDialog';


type Props = {
    displayFullDetails: boolean;
    name?: string;
    affiliation?: string;
    email?: string;
    fontSize?: string;
};

export const AuthorDetails: FC<Props> = ({ displayFullDetails, name, affiliation, email, fontSize = 100 }) => {
    const [editDetailsDialogVisible, setEditDetailsDialogVisible] = useState(false);
    

    const renderPartialDetails = () => (
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon fontSize={fontSize} />
            {
                name !== undefined ? 
                (
                    <div className='flex flex-col items-left justify-center'>
                        <div className={`text-${fontSize}`}>{name ?? ''}</div>
                    </div>
                )
                : null
            }
        </div>
    )

    const renderFullDetails = () => (
        <div className='flex self-start my-4 flex-row'>
            <div className='flex'>
                <AccountCircleIcon fontSize={fontSize} />
            </div>
            <div className='flex flex-col pl-4'>
                <div className='flex flex-row justify-start items-start items-center pt-2 pb-4'>
                    <h1 className='flex text-xl font-semibold pr-2'>{name}</h1>
                    <IconButton onClick={() => setEditDetailsDialogVisible(true)}>
                        <EditIcon fontSize='large' />
                    </IconButton>
                </div>
                <h1 className='flex text-base'>{affiliation ?? 'Unknown affiliation'}</h1>
                <h1 className='flex text-base'>{email ?? 'Unverified email'}</h1>
            </div>
        </div>
    )

    return (
        <>
            { displayFullDetails === true ? renderFullDetails() : renderPartialDetails()}
            <AlertDialog
                isVisible={editDetailsDialogVisible}
                setVisible={setEditDetailsDialogVisible}
                title='Edit author profile'
                description='This feature is under development and will be available soon!'
                onAccept={()=>{}}
            />
        </>
    );
};
