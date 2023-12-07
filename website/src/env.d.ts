/// <reference types="astro/client" />

type TokenCookie = {
    accessToken: string;
    refreshToken: string;
};

type Session = {
    isLoggedIn: boolean;
    user?: {
        name?: string;
    };
    token?: TokenCookie;
};

declare namespace App {
    interface Locals {
        session: Session;
    }
}
