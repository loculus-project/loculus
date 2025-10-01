import type { lapisClientHooks } from '../../services/serviceHooks.ts';
import ErrorBox from '../common/ErrorBox.tsx';

type LapisHooks = ReturnType<typeof lapisClientHooks>['zodiosHooks'];
type AggregatedHook = ReturnType<LapisHooks['useAggregated']>;
type DetailsHook = ReturnType<LapisHooks['useDetails']>;

interface SearchErrorDisplayProps {
    detailsHook: DetailsHook;
    aggregatedHook: AggregatedHook;
}

export const SearchErrorDisplay = ({ detailsHook, aggregatedHook }: SearchErrorDisplayProps) => {
    if (detailsHook.isError || aggregatedHook.isError) {
        const error = aggregatedHook.error;
        const hasResponse = error && typeof error === 'object' && 'response' in error;
        const response = hasResponse ? (error as { response?: { status?: number } }).response : null;
        const is503Error = response?.status === 503;

        if (is503Error) {
            return (
                <div className='p-3 rounded-lg text-lg text-gray-700 text-italic'>
                    The retrieval database is currently initializing – please check back later.
                </div>
            );
        }
        return (
            <div className='bg-red-400 p-3 rounded-lg'>
                <p>There was an error loading the data</p>
                <details>
                    <summary className='text-xs cursor-pointer py-2'>More details</summary>
                    <p className='text-xs'>{JSON.stringify(detailsHook.error)}</p>
                    <p>{detailsHook.error?.message}</p>
                    <p>{aggregatedHook.error?.message}</p>
                </details>
            </div>
        );
    }

    if ((detailsHook.isPaused || aggregatedHook.isPaused) && (!detailsHook.isSuccess || !aggregatedHook.isSuccess)) {
        return (
            <ErrorBox title='Connection problem'>
                The browser thinks you are offline. This will affect site usage, and many features may not work. If you
                are actually online, please try using a different browser. If the problem persists, feel free to create
                an issue in <a href='https://github.com/pathoplexus/pathoplexus/issues'>our Github repo</a> or email us
                at <a href='mailto:bug@pathoplexus.org'>bug@pathoplexus.org</a>.
            </ErrorBox>
        );
    }

    return null;
};
