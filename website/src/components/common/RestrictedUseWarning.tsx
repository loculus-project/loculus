import React from 'react';

import ErrorBox from './ErrorBox';

const RestrictedUseWarning: React.FC = () => {
    return (
        <ErrorBox title='Restricted-Use sequence' level='warning'>
            This sequence is only available under the{' '}
            <a href='https://pathoplexus.org/about/terms-of-use/restricted-data' className='underline'>
                Restricted Use Terms
            </a>
            . This prohibits publications that use this sequence as focal data during the restricted-use period, except
            with the consent of the sequence submitters.
        </ErrorBox>
    );
};

export default RestrictedUseWarning;
