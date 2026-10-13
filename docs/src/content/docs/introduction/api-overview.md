---
title: API overview
---

Loculus has been designed with an API-first approach: everything that you can do on the website, you can also access through an API.

As shown in the [system overview](../system-overview/), Loculus consists of several sub-services which have their own APIs. Please note that the API interface has not been finalized yet and may change rapidly until Loculus 1.0 is officially released (see [current state and roadmap](../current-state-and-roadmap/)). In particular, we have plans to unify the APIs more (see [GitHub ticket](https://github.com/loculus-project/loculus/issues/855)).

## Where are the APIs?

You can find the exact API host URLs on the "API Documentation" page of the instance that you are using. There is a link to the page in the footer of the website, you can also find it under `<URL of the website>/api-documentation`.

## Which APIs should you use?

- **Backend:** The backend service is the central service. It should be used for data submission and submitting group management and is also the API that the preprocessing pipeline talks to.
- **LAPIS:** The [LAPIS service](https://github.com/GenSpectrum/LAPIS) contains the released data and should be used to query and download data. Depending on the configuration of the instance, requests to the LAPIS API require authentication with a Bearer token (see [Authentication](#authentication) below and [Programmatic access](../reference/programmatic-access/)).
- **Keycloak:** The [Keycloak](https://www.keycloak.org/) service is used for authentication and should be used to obtain authentication tokens (for the backend and, if enabled, for LAPIS) and user profile management.

## Authentication

Some Loculus APIs require authentication: endpoints of the backend that manage submissions or user data require a Bearer token, and instances can be configured to also require a Bearer token for all LAPIS requests (see [Programmatic access](../reference/programmatic-access/) for details and examples).

To obtain a token, request one from the Keycloak service of the instance using your Loculus user credentials. The canonical example lives in [Authenticate via API](../for-users/authenticate-via-api/); for machine-to-machine access and LAPIS-specific details, see [Programmatic access](../reference/programmatic-access/).

Once you have a token, use it in the `Authorization` header of API requests, e.g. to query LAPIS:

```bash
LAPIS_URL="<Your_LAPIS_URL>"
ACCESS_TOKEN="<Your_Access_Token>"
curl -H "Authorization: Bearer $ACCESS_TOKEN" "$LAPIS_URL/sample/details?limit=1"
```

When LAPIS authentication is enabled, the data pages of the website require logging in — the website then forwards the logged-in user's token to LAPIS. Only direct API access (e.g. via `curl`, scripts or [lapisR](https://github.com/GenSpectrum/lapisR)) always requires a token.
