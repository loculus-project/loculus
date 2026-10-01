/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type TokenCookie = {
    accessToken: string;
    refreshToken: string;
};

type Session = {
    isLoggedIn: boolean;
    user?: {
        name?: string;
        username?: string;
        email?: string;
        emailVerified?: boolean;
    };
    token?: TokenCookie;
};

declare namespace App {
    interface Locals {
        session?: Session;
        /** Set by a page whose anonymous render may be kept in the page cache: the organism whose data it shows. */
        pageCacheOrganism?: string;
    }
}
