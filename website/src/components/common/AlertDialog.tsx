import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material';
import type { FC } from 'react';

type Props = {
    isVisible: boolean;
    setVisible: (isVisible: boolean) => void;
    title: string;
    description: string;
    onAccept: () => void;
    onReject?: () => void;
};

export const AlertDialog: FC<Props> = ({ isVisible, setVisible, title, description, onAccept, onReject }) => {
    const handleAcceptClick = () => {
        setVisible(false);
        onAccept();
    };
    const handleRejectClick = () => {
        setVisible(false);
        if (onReject) {
            onReject();
        }
    };
    return (
        <Dialog
            open={isVisible}
            onClose={() => setVisible(false)}
            aria-labelledby='alert-dialog-title'
            aria-describedby='alert-dialog-description'
        >
            <DialogTitle id='alert-dialog-title'>{title}</DialogTitle>
            <DialogContent>
                <DialogContentText id='alert-dialog-description'>{description}</DialogContentText>
            </DialogContent>
            <DialogActions>
                <Button onClick={handleRejectClick}>Cancel</Button>
                <Button onClick={handleAcceptClick} autoFocus>
                    Confirm
                </Button>
            </DialogActions>
        </Dialog>
    );
};
