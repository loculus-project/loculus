import {routes} from "../routes"
export const bottomNavigationItems = [
    {
        text: 'About',
        path: routes.aboutPage(),
    },
    {
        text: 'Docs',
        path: 'https://loculus-project.github.io/loculus/',
    },
    {
        text: 'API docs',
        path: routes.apiDocumentationPage(),
    },
    {
        text: 'Governance',
        path: routes.governancePage(),
    },
    {
        text: 'Status',
        path: routes.statusPage(),
    },
]