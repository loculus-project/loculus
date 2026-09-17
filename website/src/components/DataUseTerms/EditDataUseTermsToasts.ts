import { toast } from 'react-toastify';

import { formatErrorMessage } from '../../utils/formatErrorMessage';

export function successToast() {
    toast.success('Data use terms updated successfully. Changes take some time propagate and become visible here.', {
        autoClose: 4000,
    });
}

export function errorToast(error: unknown) {
    toast.error('Failed to edit terms of use: ' + formatErrorMessage(error), {
        position: 'top-center',
        autoClose: false,
    });
}
