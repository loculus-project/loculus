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

### Restricting the admin console to cluster administrators

By default the admin console is reachable from the internet, protected only by the admin password. We recommend restricting it so that it is only reachable via `kubectl`:

```yaml
adminAllowedSourceRanges:
  - 127.0.0.1/32
  - ::1/128
```

With this set, requests to `/admin` (the admin console and admin REST API) and `/realms/master` (where admins log in) on the authentication host are rejected with `403 Forbidden` unless they come from an allowed source range. Logging in to and using Loculus itself (the `loculus` realm) is unaffected, as are Loculus services, which reach Keycloak inside the cluster.

To use the admin console, tunnel to Traefik with `kubectl` and point the authentication hostname at your own machine. The browser then connects with the real hostname and a valid TLS certificate, and Traefik sees the request as coming from localhost:

1. Forward local port 443 to Traefik (binding to port 443 typically requires root on Linux). On k3s Traefik runs in the `kube-system` namespace; adjust the namespace and service name to your cluster:

   ```bash
   sudo kubectl --kubeconfig "$HOME/.kube/config" -n kube-system port-forward svc/traefik 443:443
   ```

2. Temporarily add a line to `/etc/hosts` for your authentication host:

   ```
   127.0.0.1 authentication.mywebsite.com
   ```

3. Open `https://authentication.mywebsite.com/admin/master/console/` and log in as usual.

4. When you are done, remove the `/etc/hosts` line and stop the port-forward.

Traefik must see the real client IP address for the allowlist to work. Requests via `kubectl port-forward` arrive from localhost; you can check this in the Traefik access log. You can also list other ranges, such as a VPN's egress IP, instead of or in addition to localhost.

## Ensure you're using the right realm

The Loculus-specific users are stored in the `loculus` realm which can be selected in the selection box in the left navigation bar.

<a id="update-browser-authentication-settings-on-an-existing-realm"></a>

:::caution[One-time upgrade: browser authentication settings]

Existing deployments upgrading to the browser authentication changes in PR #6994 need a one-time Keycloak client update. Follow the [browser authentication upgrade guide](../../reference/upgrade-guides/browser-authentication/) for rollout, verification and rollback instructions.

:::

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
