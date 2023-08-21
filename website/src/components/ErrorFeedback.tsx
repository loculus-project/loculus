import Button from '@mui/material/Button';
import Snackbar from '@mui/material/Snackbar';
import { type FC, useState } from 'react';

type ErrorFeedbackProps = {
    message: string;
};
export const ErrorFeedback: FC<ErrorFeedbackProps> = ({ message }) => {
    const [open, setOpen] = useState(true);

    const handleClose = (event?: React.SyntheticEvent | Event, reason?: string) => {
        if (reason === 'clickaway') {
            return;
        }
        setOpen(false);
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
