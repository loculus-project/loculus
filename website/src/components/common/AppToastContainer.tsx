import { ToastContainer } from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';

// Wrapping `ToastContainer` in a local component (rather than using
// `react-toastify`'s `ToastContainer` directly as a `client:*` island in an
// `.astro` file) keeps it on the same react-toastify module instance as the
// `toast()` callers when running in dev mode.
//
export default function AppToastContainer() {
    return <ToastContainer />;
}
