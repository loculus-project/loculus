import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { type FC, useState } from 'react';

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

export function useErrorFeedbackState() {
    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const openErrorFeedback = (message: string) => {
        setErrorMessage(message);
        setIsErrorOpen(true);
    };

    const closeErrorFeedback = () => {
        setErrorMessage('');
        setIsErrorOpen(false);
    };

    return { errorMessage, isErrorOpen, openErrorFeedback, closeErrorFeedback };
}
