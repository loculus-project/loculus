import { defineMiddleware } from 'astro/middleware';

export const LOCULUS_ADMINISTRATOR_ROLE = 'loculus_administrator';

export function isAdminPath(pathname: string): boolean {
    if (pathname === '/admin/logs.txt') return false;
    return pathname === '/admin' || pathname.startsWith('/admin/');
}

export function isSessionAuthorizedForAdmin(session: Session | undefined): boolean {
    return session?.isLoggedIn === true && session.roles.includes(LOCULUS_ADMINISTRATOR_ROLE);
}

export const adminRoleMiddleware = defineMiddleware(async (context, next) => {
    if (!isAdminPath(context.url.pathname)) {
        return next();
    }
    if (!isSessionAuthorizedForAdmin(context.locals.session)) {
        return new Response('Forbidden', { status: 403 });
    }
    return next();
});
