type BaseSubmissionRoute<Name> = {
    name: Name;
    organism: string;
    groupId: number;
};

type PortalPageRoute = BaseSubmissionRoute<'portal'>;
type SubmitPageRoute = BaseSubmissionRoute<'submit'>;
type RevisePageRoute = BaseSubmissionRoute<'revise'>;
type ReviewPageRoute = BaseSubmissionRoute<'review'>;
type ReleasedPageRoute = BaseSubmissionRoute<'released'> & {
    searchParams: URLSearchParams;
};

type SubmissionRoute = PortalPageRoute | SubmitPageRoute | RevisePageRoute | ReviewPageRoute | ReleasedPageRoute;

export const SubmissionRouteUtils = {
    /**
     * @param pathname window.location.pathname
     * @param search window.location.search
     */
    parseToRoute(pathname: string, search: string): SubmissionRoute | undefined {
        /* eslint-disable @typescript-eslint/no-unnecessary-condition */
        /* Because indexed array access is not typed as potentially undefined because we don't use
        "noUncheckedIndexedAccess" */

        if (!pathname.startsWith('/')) {
            return undefined;
        }
        const [organism, urlConst, groupIdStr, ...remaining] = pathname.substring(1).split('/');
        if (organism === undefined || urlConst !== 'submission' || groupIdStr === null || !/^\d+$/.test(groupIdStr)) {
            return undefined;
        }
        const baseRoute = { organism, groupId: parseInt(groupIdStr, 10) };

        const [subpage, ...remaining2] = remaining;
        if (subpage === undefined) {
            return { ...baseRoute, name: 'portal' };
        }
        if (remaining2.length > 0) {
            return undefined;
        }
        switch (subpage) {
            case 'submit':
                return { ...baseRoute, name: 'submit' };
            case 'revise':
                return { ...baseRoute, name: 'revise' };
            case 'review':
                return { ...baseRoute, name: 'review' };
            case 'released': {
                const searchParams = new URLSearchParams(search);
                return { ...baseRoute, name: 'released', searchParams };
            }
        }
        return undefined;
        /* eslint-enable @typescript-eslint/no-unnecessary-condition */
    },
    toUrl(route: SubmissionRoute): string {
        const baseUrl = `/${route.organism}/submission/${route.groupId}`;

        switch (route.name) {
            case 'portal':
                return baseUrl;
            case 'submit':
            case 'revise':
            case 'review':
                return `${baseUrl}/${route.name}`;
            case 'released':
                return `${baseUrl}/released?${route.searchParams}`;
        }
    },
};
