---
title: Programmatic access
description: How to access Loculus data programmatically, including authenticated LAPIS access
---

The primary way to query and download released Loculus data programmatically is the [LAPIS](https://github.com/GenSpectrum/LAPIS) API. There is one LAPIS instance per [organism](./glossary/#organism); you can find the exact LAPIS host URLs on the "API Documentation" page of the instance you are using (linked in the footer of the website, also available under `<URL of the website>/api-documentation`).

Depending on the configuration of the instance, LAPIS requires authentication: every request must carry a valid Bearer token issued by the instance's [Keycloak](./glossary/#keycloak) server. The API documentation pages (Swagger UI, OpenAPI docs) and health endpoints remain accessible without a token.

The website of an instance is also affected: when LAPIS authentication is enabled, the pages that display released data (homepage, search, sequence pages, seqsets, group pages) require logging in, and the website forwards the logged-in user's token to LAPIS. Other pages of the website (e.g. documentation, submission pages) remain accessible without an account.

If you use the Loculus command-line interface, no manual token handling is required: after `loculus auth login`, the CLI attaches your token to LAPIS requests automatically (the `get` commands query LAPIS directly).

## Checking whether authentication is required

Send a request without a token and inspect the response:

```bash
curl -i "$LAPIS_URL/sample/details?limit=1"
```

- `200 OK` — the instance does not require LAPIS authentication.
- `401 Unauthorized` — LAPIS authentication is enabled; obtain a token as described below.

## Obtaining a token

### With user credentials

If you have a user account on the instance, you can request a token from Keycloak using your username and password. Follow the instructions in [Authenticate via API](../for-users/authenticate-via-api/) — that page is the canonical description of this flow, including a ready-to-use `curl` example.

A token obtained this way can be used for both the backend API and the LAPIS API of the same instance.

:::note
Tokens are only valid for a limited time (the exact lifetime is configured per instance). When a token expires, request a new one; an expired token results in a `401 Unauthorized` response.
:::

### For automated access (client credentials grant)

For scripts, pipelines and other machine-to-machine access that should not use personal credentials, use the OAuth2 _client credentials_ grant. This requires a dedicated confidential Keycloak client with a service account; ask the administrators of the instance to register one for you and provide you with its client ID and secret.

If you administer your own instance, you can create such a client in the Keycloak admin console (or via the Keycloak admin API): create a client with _Client authentication_ enabled and _Service accounts roles_ activated. Then obtain a token as follows:

```bash
KEYCLOAK_TOKEN_URL="<Your_Keycloak_URL>/realms/loculus/protocol/openid-connect/token"
CLIENT_ID="YOUR_CLIENT_ID"
CLIENT_SECRET="YOUR_CLIENT_SECRET"

token_response=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET")
access_token=$(echo "$token_response" | jq -r '.access_token')
```

Note that the response is first stored in a variable and only then passed to `jq`: with `curl --fail-with-body` an error response makes `curl` exit with a non-zero status (so the script stops there), whereas piping the output straight into `jq` would silently produce the string `null`.

## Using the token

Attach the token to every LAPIS request in the `Authorization` header:

```bash
curl -H "Authorization: Bearer $access_token" "$LAPIS_URL/sample/details?limit=1"
```

The same header works for `POST` requests (LAPIS accepts filters both as query parameters and as a JSON request body) and for all output formats, e.g. downloading data as FASTA or TSV:

```bash
curl -H "Authorization: Bearer $access_token" \
  "$LAPIS_URL/sample/details?country=Switzerland&dataFormat=tsv" \
  -o sequences.tsv
```

## Using LAPIS from R

The [lapisR](https://github.com/GenSpectrum/lapisR) package is the most convenient way to query LAPIS from R. At the time of writing, it does not yet support attaching authentication headers, so it cannot be used directly against instances with LAPIS authentication enabled (upstream support is being coordinated). Until then, you can query LAPIS from R with [httr2](https://httr2.r-lib.org/), adding the header manually:

```r
library(httr2)

keycloak_token_url <- "<Your_Keycloak_URL>/realms/loculus/protocol/openid-connect/token"
lapis_url <- "<Your_LAPIS_URL>"

resp <- keycloak_token_url |>
  request() |>
  req_body_form(
    username = "YOUR_USERNAME",
    password = "YOUR_PASSWORD",
    grant_type = "password",
    client_id = "backend-client"
  ) |>
  req_perform()

access_token <- resp_body_json(resp)$access_token

# Query LAPIS with the token attached
request(lapis_url) |>
  req_url_path("sample", "details") |>
  req_url_query(limit = 1) |>
  req_headers(Authorization = paste("Bearer", access_token)) |>
  req_perform() |>
  resp_body_json()
```

## Enabling LAPIS authentication on your own instance

Whether LAPIS requires a Bearer token is configured per deployment through the Helm chart flag `lapis.auth.enabled` (see the [Helm chart config](./helm-chart-config/)). When enabled, LAPIS validates tokens against the Keycloak realm of the instance; no role or audience checks are performed — any valid token issued by the realm is accepted. Flipping the flag back to `false` disables the requirement again.
