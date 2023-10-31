/// <reference types="astro/client" />

type TokenSet = {
    access_token?: string;
    expires_at?: number;
    id_token?: string;
    refresh_token?: string;
    token_type?: string;
    session_state?: string;
    scope?: string;
};

type Session = {
    isLoggedIn: boolean;
    user?: {
        name?: string;
    };
    token?: TokenSet;
};

declare namespace App {
    interface Locals {
        session: Session;
    }
}
