import Button from '@mui/material/Button';
import FormControl from '@mui/material/FormControl';
import FormHelperText from '@mui/material/FormHelperText';
import IconButton from '@mui/material/IconButton';
import TextField from '@mui/material/TextField';
import { type FC, type FormEvent, useState } from 'react';

import Modal from '../common/Modal';
import AccountCircleIcon from '~icons/ic/baseline-account-circle';
import EditIcon from '~icons/ic/baseline-edit';
import SearchIcon from '~icons/ic/baseline-search';

type Props = {
    displayFullDetails: boolean;
    name?: string;
    affiliation?: string;
    email?: string;
    fontSize?: string;
};

export const AuthorDetails: FC<Props> = ({ displayFullDetails, name, affiliation, email, fontSize = 100 }) => {
    const [editModalVisible, setEditModalVisible] = useState(false);
    const [authorName, setAuthorName] = useState(name ?? '');

    const handleQueryAuthorProfiles = () => {
        return true;
    };

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
                <div className='flex flex-row justify-start items-start items-center pt-2 pb-4'>
                    <h1 className='flex text-xl font-semibold pr-2'>{name}</h1>
                    <IconButton onClick={() => setEditModalVisible(true)}>
                        <EditIcon fontSize='large' />
                    </IconButton>
                </div>
                <h1 className='flex text-base'>{affiliation ?? 'Unknown affiliation'}</h1>
                <h1 className='flex text-base'>{email ?? 'Unverified email'}</h1>
            </div>
        </div>
    );

    const handleSubmit = () => {
        setEditModalVisible(false);
        return true;
    };

    const renderEditDetails = () => (
        <div className='flex flex-col items-center  overflow-auto-y w-full h-full'>
            <div className='flex justify-start items-center py-5'>
                <h1 className='text-xl font-semibold py-4'>Edit Author Profile</h1>
            </div>
            <div className='flex max-w-md w-full'>
                <FormControl variant='outlined' fullWidth>
                    <div className='flex flex-row w-full'>
                        <div className='flex w-11/12'>
                            <TextField
                                className='text'
                                id='author-name'
                                onInput={(e: FormEvent<HTMLFormElement>) => {
                                    setAuthorName((e.target as HTMLInputElement).value);
                                }}
                                label='Author name'
                                variant='outlined'
                                placeholder=''
                                size='small'
                                value={authorName}
                                required
                                fullWidth
                                focused
                            />
                        </div>
                        <IconButton className='flex' aria-label='search' onClick={handleQueryAuthorProfiles}>
                            <SearchIcon />
                        </IconButton>
                    </div>
                    <FormHelperText id='outlined-weight-helper-text'>
                        Full name as it appears on your articles
                    </FormHelperText>
                </FormControl>
            </div>

            <div className='flex w-full items-center justify-center h-1/2'>
                <p>No users found.</p>
            </div>

            <Button variant='outlined' onClick={handleSubmit}>
                {/* {isLoading ? <CircularProgress size={20} color='primary' /> : 'Save'} */}
                Save
            </Button>
        </div>
    );

    return (
        <div>
            {displayFullDetails === true ? (
                <>
                    {renderFullDetails()}
                    <Modal isModalVisible={editModalVisible} setModalVisible={setEditModalVisible}>
                        {renderEditDetails()}
                    </Modal>
                </>
            ) : (
                renderPartialDetails()
            )}
        </div>
    );
};
