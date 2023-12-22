import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { type FC, type SyntheticEvent, useState } from 'react';

type ErrorFeedbackProps = {
    message: string;
    onClose?: () => void;
};
export const ErrorFeedback: FC<ErrorFeedbackProps> = ({ message, onClose }) => {
    const [open, setOpen] = useState(true);

    const handleClose = (_?: SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setOpen(false);
        onClose?.();
    };

    const action = (
        <Button color='secondary' size='small' onClick={handleClose} sx={{ color: 'white' }}>
            CLOSE
        </Button>
    );

    return (
        <Snackbar
            open={open}
            anchorOrigin={{ horizontal: 'center', vertical: 'top' }}
            message={message}
            action={action}
        />
    );
};
