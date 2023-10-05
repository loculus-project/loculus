import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import type { FC } from 'react';

type ErrorFeedbackProps = {
    message: string;
    open: boolean;
    onClose: () => void;
};

export const ManagedErrorFeedback: FC<ErrorFeedbackProps> = ({ message, open, onClose }) => {
    const action = (
        <Button color='secondary' size='small' onClick={onClose} sx={{ color: 'white' }}>
            CLOSE
        </Button>
    );
    return (
        <Snackbar
            className='whitespace-pre-line'
            open={open}
            anchorOrigin={{ horizontal: 'center', vertical: 'top' }}
            message={message}
            action={action}
            onClose={onClose}
        />
    );
};
