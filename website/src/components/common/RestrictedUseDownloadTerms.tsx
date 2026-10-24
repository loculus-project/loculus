import React from 'react';

import { routes } from '../../routes/routes';

/**
 * Wording shown in the confirmation dialog before downloading restricted-use data.
 * Kept in its own file so that deployments can override it like `RestrictedUseWarning`.
 */
const RestrictedUseDownloadTerms: React.FC = () => {
    return (
        <>
            This sequence is only available under the Restricted Use Terms. By downloading it, you agree to follow the{' '}
            <a href={routes.datauseTermsPage()} target='_blank' className='underline'>
                Restricted Use Terms
            </a>
            .
        </>
    );
};

export default RestrictedUseDownloadTerms;
