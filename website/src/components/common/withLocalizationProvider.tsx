import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterLuxon } from '@mui/x-date-pickers/AdapterLuxon';
import type { FC, JSX } from 'react';

// eslint-disable-next-line @typescript-eslint/naming-convention
export function withLocalizationProvider<Props>(WrappedComponent: FC<Props & JSX.IntrinsicAttributes>) {
    return (props: Props & JSX.IntrinsicAttributes) => {
        return (
            <LocalizationProvider dateAdapter={AdapterLuxon}>
                <WrappedComponent {...props} />
            </LocalizationProvider>
        );
    };
}
