import Box from '@mui/material/Box';
import Modal from '@mui/material/Modal';
import type { FC } from 'react';

const style = {
    position: 'absolute' as const,
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    width: '80%',
    height: '80%',
    bgcolor: 'background.paper',
    border: '1px solid #000',
    boxShadow: 24,
    p: 4,
    overflow: 'scroll',
};

type Props = {
    isModalVisible: boolean;
    setModalVisible: (isVisible: boolean) => void;
    children?: React.ReactNode;
};

const BasicModal: FC<Props> = ({ isModalVisible, setModalVisible, ...props }) => {
    const handleClose = () => setModalVisible(false);

    return (
        <div>
            <Modal
                open={isModalVisible}
                onClose={handleClose}
                aria-labelledby='modal-modal-title'
                aria-describedby='modal-modal-description'
            >
                <Box sx={style}>{props.children}</Box>
            </Modal>
        </div>
    );
};

export default BasicModal;
