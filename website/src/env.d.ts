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
        roles: string[];
    };
    token?: TokenCookie;
};

declare namespace App {
    interface Locals {
        session?: Session;
    }
}
