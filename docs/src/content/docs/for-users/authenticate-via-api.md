---
title: Authenticate via API
---

Some Loculus endpoints require authentication in order to use them. In order to use these endpoints you need to get a JSON web token.

First, you need determine the URL to the [Keycloak](../../introduction/glossary/#keycloak) server and you can find it if you go to the Sign In page or [edit your account](../edit-account/). Given the URL, you can get the token with the following cURL call:

```bash
KEYCLOAK_TOKEN_URL="https://<Your_Keycloak_URL>/realms/loculus/protocol/openid-connect/token"
USERNAME_LOCULUS="YOUR_USERNAME"
PASSWORD_LOCULUS="YOUR_PASSWORD"

jwt_keycloak=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body -H 'Content-Type: application/x-www-form-urlencoded' -d "username=$USERNAME_LOCULUS&password=$PASSWORD_LOCULUS&grant_type=password&client_id=backend-client")
echo "$jwt_keycloak"
```

This will print the JSON web token. The access token is in the field `access_token`.
