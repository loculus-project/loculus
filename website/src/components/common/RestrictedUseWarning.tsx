import { type FC } from 'react';

import ErrorBox from './ErrorBox';
import { routes } from '../../routes/routes';

const RestrictedUseWarning: FC = () => {
    return (
        <ErrorBox title='Restricted-Use sequence' level='warning'>
            This sequence is only available under the Restricted Use Terms. If you make use of this data, you must
            follow the{' '}
            <a href={routes.datauseTermsPage()} className='underline'>
                terms of use
            </a>
            .
        </ErrorBox>
    );
};

export default RestrictedUseWarning;
