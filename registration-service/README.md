# Loculus registration service

Small FastAPI service that renders a registration form and creates users in
[lldap](https://github.com/lldap/lldap) via its GraphQL admin API.

Deployed alongside lldap when `auth.bundledLdap.enabled` is true in the Helm
chart. In BYO-LDAP mode (operator points Authelia at an existing LDAP) this
service is not deployed, and registration is managed out-of-band.

## Environment

| Variable               | Purpose                                                      |
| ---------------------- | ------------------------------------------------------------ |
| `LLDAP_URL`            | lldap HTTP base URL, e.g. `http://loculus-lldap-service:17170` |
| `LLDAP_ADMIN_USERNAME` | admin username (typically `admin`)                            |
| `LLDAP_ADMIN_PASSWORD` | admin password                                                |
| `LOGIN_URL`            | Authelia URL used in success redirect + login link            |
| `TERMS_MESSAGE`        | HTML terms-of-service blurb shown above the form              |
| `DEFAULT_GROUP`        | Group new users are added to (defaults to `user`)             |

## Run locally

```sh
LLDAP_URL=http://localhost:17170 \
LLDAP_ADMIN_USERNAME=admin \
LLDAP_ADMIN_PASSWORD=admin-password \
  uvicorn main:app --reload --port 8090
```
