import CircularProgress from '@mui/material/CircularProgress';
import { useQuery } from '@tanstack/react-query';
import { type FC, useState, useEffect } from 'react';

import { getClientLogger } from '../../api';
import type { ClientConfig } from '../../types';
import { CitationPlot } from '../Datasets/CitationPlot';
import { fetchAuthorCitations } from '../Datasets/api';
import { ManagedErrorFeedback } from '../common/ManagedErrorFeedback';
import { withQueryProvider } from '../common/withQueryProvider';

const clientLogger = getClientLogger('UserCitations');

type Props = {
    userId: string;
    clientConfig: ClientConfig;
};

const UserCitationsInner: FC<Props> = ({ userId, clientConfig }) => {
    const [isErrorOpen, setIsErrorOpen] = useState(false);
    const [errorMessage, setErrorMessage] = useState('');

    const handleOpenError = (message: string) => {
        setErrorMessage(message);
        setIsErrorOpen(true);
    };
    const handleCloseError = () => {
        setErrorMessage('');
        setIsErrorOpen(false);
    };

    const {
        data: userCitations,
        isLoading: isLoadingCitationData,
        error: userCitationsError,
    } = useQuery(['citations', userId], () => fetchAuthorCitations(userId, clientConfig));

    useEffect(() => {
        const handleError = async () => {
            handleOpenError(`fetchDataset failed with error: ${(userCitationsError as Error).message}`);
            await clientLogger.error(`fetchDataset failed with error: ${(userCitationsError as Error).message}`);
        };
        if (userCitationsError !== null) {
            // eslint-disable-next-line @typescript-eslint/no-floating-promises
            handleError();
        }
    }, [userCitationsError]);

    return (
        <div>
            <ManagedErrorFeedback message={errorMessage} open={isErrorOpen} onClose={handleCloseError} />
            {userCitationsError !== null ? null : (
                <>
                    <h1 className='text-2xl font-medium pb-8'>Cited By</h1>
                    {isLoadingCitationData ? (
                        <CircularProgress />
                    ) : userCitations ? (
                        <CitationPlot citationData={userCitations} />
                    ) : null}
                </>
            )}
        </div>
    );
};

export const UserCitations = withQueryProvider(UserCitationsInner);
