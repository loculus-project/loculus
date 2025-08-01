---
title: Authenticate via API
---

Some Loculus endpoints require authentication in order to use them. In order to use these endpoints you need to get a JSON web token.

To determine the URL to the [Keycloak](../../reference/glossary/#keycloak) server, see [Where are the APIs?](../../introduction/api-overview/#where-are-the-apis). Given the URL, you can get the token with the following cURL call:

```bash
KEYCLOAK_TOKEN_URL="<Your_Keycloak_URL>/realms/loculus/protocol/openid-connect/token"
USERNAME_LOCULUS="YOUR_USERNAME"
PASSWORD_LOCULUS="YOUR_PASSWORD"

jwt_keycloak=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body -H 'Content-Type: application/x-www-form-urlencoded' -d "username=$USERNAME_LOCULUS&password=$PASSWORD_LOCULUS&grant_type=password&client_id=backend-client")
echo "$jwt_keycloak"
```

This will print the JSON web token. The access token is in the field `access_token`.
