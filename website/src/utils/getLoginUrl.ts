import { routes } from '../routes/routes';

export const getLoginUrl = (returnTo: string) => {
    const returnToPath = new URL(returnTo, 'https://loculus.invalid').pathname;
    if ([routes.logout(), routes.authLoginFailed()].includes(returnToPath)) {
        returnTo = routes.userOverviewPage();
    }
    return routes.authLogin(returnTo);
};
