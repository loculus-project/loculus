---
title: User administration
description: How to manage (technical and non-technical) users
---

User accounts are managed by [Keycloak](https://www.keycloak.org/) which offers a web interface for managing users. It can be used to manage both technical and non-technical users.

## Accessing the Keycloak admin console

### Find out your Keycloak admin URL

Click the 'My account' button on the website, and then 'Edit account information' to find the base URL of your authentication server.
This is often something like `authentication.<website-url.org>` (followed by further `/`s).

Combine the 'base url' (just up to the `.com`, `.org`, etc) with `admin/master/console/`. The end result may look something like:

```
https://authentication.mywebsite.com/admin/master/console/
```

And navigate to this URL.

### Log in

Use the Keycloak admin password that you have configured previously

## Ensure you're using the right realm

The Loculus-specific users are stored in the `loculus` realm which can be selected in the selection box in the left navigation bar.

## Update browser authentication settings on an existing realm

The Helm chart imports the `loculus` realm when Keycloak first creates it, but does not overwrite a realm that already exists in Keycloak's database. After upgrading an existing deployment to the protected browser authentication flow, update the `backend-client` in the Keycloak admin console:

1. Open **Clients**, then select **backend-client**.
2. Under **Settings**, replace wildcard **Valid redirect URIs** with `https://<your-host>/auth/callback`.
3. Under **Settings**, set **Valid post logout redirect URIs** to `https://<your-host>/logout`.
4. Under **Advanced**, set **Proof Key for Code Exchange Code Challenge Method** to `S256`.
5. Save the client.

Use the corresponding `http://` URLs only for a development deployment explicitly configured to use insecure cookies. Existing deployments continue to authenticate without this update, but do not gain the narrowed redirect allowlists or server-side PKCE requirement. See the [browser authentication flow](../../reference/browser-authentication-flow/) for the application-side protections.

## How to create users

1. Go to 'Users' on the left-hand menu
2. Click ‘Add user’ button
3. Add the username
4. Note that new users cannot have the same emails as existing users
5. Go to ‘Credentials’ and ‘Set password’
6. Set a password and leave ‘temporary’ on, which forces them to set a new one on log-in

## Superusers/curators

Superusers have the privilege to submit, revise, revoke and approve sequences on behalf of other groups. This role is envisioned to be assigned to curators.

1. Click on 'Users' on the left-hand menu
2. Click on the user you want and go to ‘Role mapping’
3. Click ‘Assign role’ button
4. Tick `super_user`
5. Click ‘Assign’

You can similarly unassign a role by selecting it from the current roles of the user, and clicking 'Unassign' (next to the 'Assign role' button)

## Processing pipeline

The processing pipeline requires a technical user to authenticate with the Loculus API. To create a new technical user, you can use the usual user registration form on the website. Afterwards, go to the Keycloak admin console, click on "Users" in the left navigation bar, select the user, click on "Role Mappings" and assign the `preprocessing_pipeline` role.
