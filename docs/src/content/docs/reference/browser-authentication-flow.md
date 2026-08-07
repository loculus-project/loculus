---
title: Browser authentication flow
description: How the Loculus website signs users in through OpenID Connect
---

Loculus uses [Keycloak](https://www.keycloak.org/) as its OpenID Connect (OIDC) provider. Keycloak authenticates the user, while the Loculus website starts the login transaction, validates the response and establishes the website session.

This page describes browser login. It does not change [authentication via the API](../../for-users/authenticate-via-api/), which uses a separate flow.

## Login flow

```mermaid
sequenceDiagram
    autonumber
    actor User
    participant Browser
    participant Website as Loculus website (Astro)
    participant Keycloak

    User->>Browser: Open a page that requires login
    Browser->>Website: Request page
    Website->>Website: Create state, nonce and PKCE values
    Website-->>Browser: Set encrypted transaction cookie
    Website-->>Browser: Redirect to Keycloak
    Browser->>Keycloak: Send authorization request
    User->>Keycloak: Sign in
    Keycloak-->>Browser: Redirect to fixed /auth/callback
    Browser->>Website: Send code and state with transaction cookie
    Website->>Website: Validate state and consume transaction
    Website->>Keycloak: Exchange code using PKCE verifier
    Keycloak-->>Website: Return tokens
    Website->>Website: Validate nonce and establish session
    Website-->>Browser: Redirect to original same-origin page
```

The browser is redirected to Keycloak to enter credentials. Keycloak then returns an authorization code to the fixed `/auth/callback` endpoint on the Loculus website. Astro processes that callback on the server before the final page is rendered.

The requested destination is stored as `returnTo`. Loculus accepts only destinations on the same origin as the website, preventing the login flow from being used to redirect a user to an arbitrary external site.

## Security values

- **State** is a random, single-use value that links the callback to the browser that started the login. It protects the login flow against cross-site request forgery.
- **Nonce** is a random value included in the authentication request and checked in the returned identity token. It prevents a response from another login transaction from being accepted.
- **PKCE** creates a one-time secret verifier and sends only its derived challenge with the initial request. The verifier is required when the website exchanges the authorization code, so an intercepted code is not sufficient to complete the login.

Loculus stores these values, together with `returnTo`, in an authenticated and encrypted HTTP-only cookie. The cookie:

- is valid for five minutes;
- is sent only over HTTPS, except in explicitly configured local development environments;
- uses `SameSite=Lax`;
- can hold up to three concurrent login transactions; and
- consumes the selected transaction when its callback is received.

The transaction cookie does not contain the user's password or access token.

## Callback validation failures

The `/auth/callback` endpoint deliberately returns `Authentication callback could not be validated` when the middleware cannot complete the transaction. Common causes include:

- the login was started more than five minutes earlier;
- the callback was refreshed or reused after its transaction had already been consumed;
- the transaction cookie is missing or cannot be decrypted; or
- OIDC validation or retrieval of the user's information failed.

Start a new login instead of refreshing or reopening a failed callback URL. Server logs record a non-secret transaction identifier and one of the following reasons:

- `missing_or_expired_transaction`
- `provider_error`
- `validation_failed`
- `userinfo_failed`

The transaction identifier is a truncated hash of `state`; the raw `state`, authorization code and tokens are not logged.
