import React from 'react';

import ErrorBox from './ErrorBox';

const RestrictedUseWarning: React.FC = () => {
    return (
        <ErrorBox title='Restricted-Use sequence' level='warning'>
            This sequence is only available under the
             Restricted Use Terms
        </ErrorBox>
    );
};

export default RestrictedUseWarning;
