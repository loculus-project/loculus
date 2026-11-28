import React from 'react';

import { routes } from '../../routes/routes';

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
