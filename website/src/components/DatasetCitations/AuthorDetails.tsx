import IconButton from '@mui/material/IconButton';
import { type FC, useState } from 'react';

import { AuthorDetailsForm } from './AuthorDetailsForm';
import type { ClientConfig } from '../../types/runtimeConfig';
import Modal from '../common/Modal';
import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import EditIcon from '~icons/ic/baseline-edit';

type Props = {
    displayFullDetails: boolean;
    clientConfig?: ClientConfig;
    accessToken?: string;
    authorId?: string;
    name?: string;
    affiliation?: string;
    email?: string;
    emailVerified?: boolean;
    fontSize?: number;
};

export const AuthorDetails: FC<Props> = ({
    displayFullDetails,
    clientConfig,
    accessToken,
    authorId,
    name,
    affiliation,
    email,
    emailVerified,
    fontSize = 100,
}) => {
    const [editModalVisible, setEditModalVisible] = useState(false);

    const renderEmail = () => {
        const emailDomain = email?.split('@')[1];
        const verifiedEmail = emailVerified !== undefined && emailVerified === true ? 'Verified' : 'Unverified';
        let displayText = 'Unknown email';
        if (email !== undefined) {
            displayText = `${verifiedEmail} email at ${emailDomain}`;
        }
        return <h1 className='flex text-base'>{displayText}</h1>;
    };

    // TODO: #1108 make dynamic text-${fontsize} class static as required by tailwindcss

    const renderPartialDetails = () => (
        <div className='flex flex-col items-center justify-center'>
            <AccountCircleIcon fontSize={fontSize} />
            {name !== undefined ? (
                <div className='flex flex-col items-left justify-center'>
                    <div className={`text-${fontSize}`}>{name}</div>
                </div>
            ) : null}
        </div>
    );

    const renderFullDetails = () => (
        <div className='flex self-start my-4 flex-row'>
            <div className='flex'>
                <AccountCircleIcon fontSize={fontSize} />
            </div>
            <div className='flex flex-col pl-4'>
                <div className='flex flex-row justify-start items-center pt-2 pb-4'>
                    <h1 className='flex text-xl font-semibold pr-2'>{name}</h1>
                    <IconButton data-testid='EditIcon' onClick={() => setEditModalVisible(true)}>
                        <EditIcon fontSize='large' />
                    </IconButton>
                </div>
                <h1 className='flex text-base'>
                    {affiliation !== undefined && affiliation !== '' ? affiliation : 'Unknown affiliation'}
                </h1>
                {renderEmail()}
            </div>
        </div>
    );

    return (
        <div>
            {displayFullDetails === true && clientConfig !== undefined && accessToken !== undefined ? (
                <>
                    {renderFullDetails()}
                    <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                        <AuthorDetailsForm
                            clientConfig={clientConfig}
                            accessToken={accessToken}
                            authorId={authorId}
                            name={name}
                            affiliation={affiliation}
                            email={email}
                            emailVerified={emailVerified}
                        />
                    </Modal>
                </>
            ) : (
                renderPartialDetails()
            )}
        </div>
    );
};
