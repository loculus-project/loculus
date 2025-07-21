import { routes } from './routes';

export function getExtraTopNavigationItems(isSuperuser: boolean) {
    if (isSuperuser) {
        return [
            {
                text: 'Admin',
                path: routes.adminDashboard(),
            },
        ];
    }
    return [];
}
