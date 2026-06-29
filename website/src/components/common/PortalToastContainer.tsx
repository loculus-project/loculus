import { createPortal } from 'react-dom';
import { ToastContainer } from 'react-toastify';

import useClientFlag from '../../hooks/isClient';

/**
 * Renders the global toast container as a direct child of the body element.
 *
 * Required for compatibility with Headless UI dialogs - when a dialog opens it
 * inerts the page, but its inert walk stops at <body> and never touches
 * <body>'s direct children. Portalling the toasts straight to <body> keeps
 * them interactive and dismissable while a dialog is open.
 */

export const PortalToastContainer = () => {
    const isClient = useClientFlag();
    if (!isClient) return null;
    return createPortal(<ToastContainer />, document.body);
};
