---
title: API overview
---

Loculus has been designed with an API-first approach: everything that you can do on the website, you can also access through an API.

As shown in the [system overview](../system-overview/), Loculus consists of several sub-services which have their own APIs. Please note that the API interface has not been finalized yet and may change rapidly until Loculus 1.0 is officially released (see [current state and roadmap](../current-state-and-roadmap/)). In particular, we have plans to unify the APIs more (see [GitHub ticket](https://github.com/loculus-project/loculus/issues/855)).

## Where are the APIs?

You can find the exact API host URLs on the "API Documentation" page of the instance that you are using. There is a link to the page in the footer of the website, you can also find it under `<URL of the website>/api-documentation`.

## Which APIs should you use?

- **Backend:** The backend service is the central service. It should be used for data submission and submitting group management and is also the API that the preprocessing pipeline talks to.
- **LAPIS:** The [LAPIS service](https://github.com/GenSpectrum/LAPIS) contains the released data and should be used to query and download data.
- **Keycloak:** The [Keycloak](https://www.keycloak.org/) service is used for authentication and should be used to obtain authentication tokens and user profile management.
