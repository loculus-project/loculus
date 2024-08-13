---
title: User administration
description: How to manage (technical and non-technical) users
---

User accounts are managed by [Keycloak](https://www.keycloak.org/) which offers a web interface for managing users. It can be used to manage both technical and non-technical users.

## Accessing the Keycloak admin console

TODO: Describe how to find the admin console.

TODO: How to get the initial admin credentials.

The Loculus-specific users are stored in the `loculus` realm which can be selected in the selection box in the left navigation bar.

## Superusers/curators

Superusers have the privilege to submit, revise, revoke and approve sequences on behalf of other groups. This role is envisioned to be assigned to curators.

To grant superuser privileges to a user, click on "Users" in the left navigation bar, select the user, click on "Role Mappings" and assign the `super_user` role.

## Processing pipeline

The processing pipeline requires a technical user to authenticate with the Loculus API. To create a new technical user, you can use the usual user registration form on the website. Afterwards, go to the Keycloak admin console, click on "Users" in the left navigation bar, select the user, click on "Role Mappings" and assign the `preprocessing_pipeline` role.
