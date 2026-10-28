---
title: Programmatic access
description: How to access Loculus data programmatically, including instances that require authentication for data access
---

The primary way to query and download released data programmatically is the [LAPIS](https://github.com/GenSpectrum/LAPIS) API. There is one LAPIS instance per [organism](../glossary/#organism); you can find the LAPIS URLs on the "API Documentation" page of the instance (linked in the website footer, also available under `<URL of the website>/api-documentation`).

Instances can require authentication for data access (Helm value `auth.requireAuthenticationForData`, see the [Helm chart config](../helm-chart-config/#authenticated-data-access)). Then every LAPIS request, and every request to the backend's data endpoints, must carry a Bearer token issued by the instance's [Keycloak](../glossary/#keycloak). Any valid token of the instance is accepted; no special roles are needed. The LAPIS API documentation (Swagger UI) stays accessible without a token.

If you use the Loculus command-line interface, you don't need to handle tokens yourself: after `loculus auth login`, the CLI sends your token with its LAPIS requests.

## Checking whether authentication is required

Send a request without a token:

```bash
curl -i "$LAPIS_URL/sample/details?limit=1"
```

- `200 OK`: no authentication is required.
- `401 Unauthorized`: obtain a token as described below.

## Obtaining a token

### With user credentials

If you have an account on the instance, request a token from Keycloak with your username and password as described in [Authenticate via API](../../for-users/authenticate-via-api/). The token works for both the backend and LAPIS of that instance.

:::note
Tokens are valid for a limited time (10 hours by default, configured per instance). Expired tokens are rejected with `401 Unauthorized`; request a new one.
:::

### For automated access

For scripts and pipelines that should not use personal credentials, use the OAuth2 _client credentials_ grant. This needs a confidential Keycloak client with a service account; ask the administrators of the instance for a client ID and secret. Administrators can create such a client in the Keycloak admin console (enable _Client authentication_ and _Service accounts roles_).

```bash
KEYCLOAK_TOKEN_URL="<Your_Keycloak_URL>/realms/loculus/protocol/openid-connect/token"

token_response=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body \
  -H 'Content-Type: application/x-www-form-urlencoded' \
  -d "grant_type=client_credentials&client_id=$CLIENT_ID&client_secret=$CLIENT_SECRET")
access_token=$(echo "$token_response" | jq -r '.access_token')
```

## Using the token

Send the token in the `Authorization` header. This works for all LAPIS endpoints, `GET` and `POST` requests, and all output formats:

```bash
curl -H "Authorization: Bearer $access_token" \
  "$LAPIS_URL/sample/details?country=Switzerland&dataFormat=tsv" \
  -o metadata.tsv
```

The same applies to the backend's data endpoints:

- `GET /<organism>/get-released-data`
- `GET /data-use-terms/<accession>`
- `GET /groups/<groupId>`
- `GET` and `HEAD /files/get/...`
- `GET /get-seqset`, `/get-seqset-records`, `/get-seqset-citations`, `/get-sequence-citations` and `/get-author` (on instances with seqsets enabled)

```bash
curl -H "Authorization: Bearer $access_token" "$BACKEND_URL/<organism>/get-released-data"
```

File links in released data (`<URL of the website>/seq/<accessionVersion>/<fileCategory>/<fileName>`) and download links copied from the website's download dialog also accept the token in the `Authorization` header.

## Using LAPIS from R

With [httr2](https://httr2.r-lib.org/), add the header to each request (for example if your version of [lapisR](https://github.com/GenSpectrum/lapisR) cannot send it):

```r
library(httr2)

access_token <- "<Your_Access_Token>"

request("<Your_LAPIS_URL>") |>
  req_url_path_append("sample", "details") |>
  req_url_query(limit = 1) |>
  req_headers(Authorization = paste("Bearer", access_token)) |>
  req_perform() |>
  resp_body_json()
```
