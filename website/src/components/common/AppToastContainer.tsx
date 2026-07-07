import { ToastContainer } from 'react-toastify';

import 'react-toastify/dist/ReactToastify.css';

// Wrapping `ToastContainer` in a local component (rather than using
// `react-toastify`'s `ToastContainer` directly as a `client:*` island in an
// `.astro` file) keeps it on the same react-toastify module instance as the
// `toast()` callers.
//
// In `astro dev`, a bare framework import referenced directly by a client
// directive in an `.astro` file is served as raw source
// (`/node_modules/react-toastify/dist/index.mjs`), while imports inside
// `.tsx`/`.jsx` islands go through Vite's dependency optimizer
// (`/node_modules/.vite/deps/react-toastify.js`). Those are two different
// module instances, each with its own module-level toast store, so
// `toast()` calls never reach the `ToastContainer` and no toast is shown.
// The production build bundles everything into one chunk, so it only breaks
// in dev. See https://github.com/loculus-project/loculus/issues/6850
export default function AppToastContainer() {
    return <ToastContainer />;
}
