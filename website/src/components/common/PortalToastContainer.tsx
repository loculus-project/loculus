import { createPortal } from 'react-dom';
import { ToastContainer } from 'react-toastify';

import useClientFlag from '../../hooks/isClient';

/**
 * Renders the global toast container as a direct child of the body element.
 *
 * Required for compatibility with Headless UI dialogs - when a dialog opens it
 * inerts the portion of the DOM where the dialog was defined. Portalling the
 * toasts straight to <body> places them outside that subtree, so they stay
 * interactive and dismissable while a dialog is open.
 */

export const PortalToastContainer = () => {
    const isClient = useClientFlag();
    if (!isClient) return null;
    return createPortal(<ToastContainer />, document.body);
};
