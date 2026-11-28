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

By default, the admin console is open to the internet behind only the admin password. We recommend restricting it so it is only reachable via `kubectl`:

```yaml
adminAllowedSourceRanges:
  - 127.0.0.1/32
  - ::1/128
```

Requests to `/admin` (admin console and admin REST API) and `/realms/master` (admin login) on the authentication host from outside the listed ranges get `403 Forbidden`. Normal Loculus use (`loculus` realm) and Loculus services talking to Keycloak inside the cluster are unaffected.

To access the console, tunnel to Traefik with `kubectl` and resolve the authentication hostname locally so your browser uses the real hostname and a valid TLS certificate while Traefik sees the connection from localhost:

1. Forward local port 443 to Traefik. It must be port 443: on any other local port, the HTTPS redirect sends the browser back to the public URL. On k3s Traefik runs in `kube-system`; adjust the namespace and service name for your cluster.

   **macOS / Linux** (binding port 443 on localhost needs root; `--kubeconfig` points `sudo` at your own kubeconfig instead of root's):

   ```bash
   sudo kubectl --kubeconfig "$HOME/.kube/config" -n kube-system port-forward svc/traefik 443:443
   ```

   **Windows** (PowerShell; fails if something else on the machine is already using port 443):

   ```powershell
   kubectl -n kube-system port-forward svc/traefik 443:443
   ```

   Leave this running.

2. In another terminal, start a separate Chrome instance that resolves your authentication host to `127.0.0.1`. Only that hostname goes through the tunnel; every other site in this window loads normally.

   First set `KC_HOST` to your authentication hostname: `authentication`, then your `subdomainSeparator` (`.` by default), then your `host`. For example, `authentication.mywebsite.com`, or `authentication-mywebsite.com` with `subdomainSeparator: "-"`. It is the hostname part of the Keycloak URL your site already uses for login.

   **macOS**:

   ```bash
   KC_HOST=authentication.mywebsite.com
   open -na "Google Chrome" --args \
     --user-data-dir=/tmp/kc-admin-chrome \
     --host-resolver-rules="MAP $KC_HOST 127.0.0.1" \
     "https://$KC_HOST/admin/master/console/"
   ```

   **Linux** (use `chromium` instead of `google-chrome` if needed):

   ```bash
   KC_HOST=authentication.mywebsite.com
   google-chrome \
     --user-data-dir=/tmp/kc-admin-chrome \
     --host-resolver-rules="MAP $KC_HOST 127.0.0.1" \
     "https://$KC_HOST/admin/master/console/"
   ```

   **Windows** (PowerShell):

   ```powershell
   $KcHost = "authentication.mywebsite.com"
   & "C:\Program Files\Google\Chrome\Application\chrome.exe" `
     --user-data-dir="$env:TEMP\kc-admin-chrome" `
     --host-resolver-rules="MAP $KcHost 127.0.0.1" `
     "https://$KcHost/admin/master/console/"
   ```

   The separate `--user-data-dir` is required. Without it, Chrome hands the URL to an already-running Chrome and ignores `--host-resolver-rules`. Your normal browser profile is unaffected. Chrome shows a banner saying `--host-resolver-rules` is an unsupported command-line flag; this is expected and the flag still works.

   Quote the URL if you add a fragment such as `#/loculus` (to open the `loculus` realm directly); otherwise some shells treat `#` as the start of a comment.

3. Log in with the Keycloak admin credentials. Opening the same URL in your normal browser should return `403 Forbidden`.

4. When done, close that Chrome window and stop the port-forward (`Ctrl-C`).

Other browsers can use a temporary `/etc/hosts` entry (`127.0.0.1 authentication.mywebsite.com`) instead of step 2, removed afterwards.

**Troubleshooting**

- **`403 Forbidden` in the tunnelled window**: the request did not go through the port-forward. Check that the port-forward is still running and shows `Handling connection` lines when you reload. Check that the `MAP` hostname exactly matches the hostname in the URL. Chrome only reads the flags when the instance starts: if the `kc-admin-chrome` instance was already running (for example from an earlier attempt with a different hostname), rerunning the command reuses it with the old flags. Fully quit it (`Cmd-Q` on macOS; closing the window is not enough) and run the command again.
- **`bind: permission denied` when starting the port-forward**: you ran it without `sudo` on macOS or Linux.
- **`bind: address already in use`**: something else on your machine is using port 443. Stop it while you use the console.
  You can also list other ranges, such as a VPN egress IP, instead of or alongside localhost. The allowlist requires Traefik to see the real client IP (`kubectl port-forward` requests arrive from localhost; check the Traefik access log to verify).

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
