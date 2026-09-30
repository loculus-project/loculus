/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

type TokenCookie = {
    accessToken: string;
    refreshToken: string;
};

type Session = {
    isLoggedIn: boolean;
    access?: import('./utils/instanceAccess').InstanceAccess;
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
    }
}
