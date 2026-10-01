---
title: Browser authentication upgrade
description: Upgrade existing deployments to the browser authentication flow introduced in PR 6994
---

This guide covers the one-time operator steps for [PR #6994](https://github.com/loculus-project/loculus/pull/6994). For an explanation of login, transaction cookies, state, nonce and PKCE, see the [browser authentication flow](../../browser-authentication-flow/).

The Helm chart imports the `loculus` realm when Keycloak first creates it, but does not overwrite a realm that already exists in Keycloak's database. Existing realms therefore need a manual client update. Newly created realms receive these settings from the chart.

Backend API and password-based CLI authentication remain unchanged. No database schema migration is required.

## Rollout order

1. Record the current website and chart versions and the existing `backend-client` redirect and PKCE settings before upgrading.
2. Deploy the updated chart and website. Confirm that the website has its `website-oidc-cookie-secret` available and that all website replicas have completed the rollout.
3. Update the existing Keycloak client as described below. Deploy the website first: the previous website did not use the fixed callback or send a PKCE challenge.
4. Verify login and logout before considering the upgrade complete.

## Update an existing Keycloak realm

Open the [Keycloak admin console](../../../for-administrators/user-administration/#accessing-the-keycloak-admin-console) and select the `loculus` realm.

1. Open **Clients**, then select **backend-client**.
2. Under **Settings**, replace wildcard **Valid redirect URIs** with `https://<your-host>/auth/callback`.
3. Under **Settings**, set **Valid post logout redirect URIs** to `https://<your-host>/logout`.
4. Under **Advanced**, set **Proof Key for Code Exchange Code Challenge Method** to `S256`.
5. Save the client.

For the deployed host, add corresponding `http://` URLs only for a development deployment explicitly configured with `insecureCookies=true`. In production, remove any localhost redirect and post-logout entries left over from an earlier configuration. For previews or local development, retain or add the exact localhost destinations below when local website development is enabled.

Until these settings are updated, an existing realm does not gain the narrowed redirect allowlists or Keycloak's requirement to use PKCE. The application-side protections are described in the [browser authentication flow](../../browser-authentication-flow/).

## Local website development

The chart setting `allowLocalhostAuthRedirects` defaults to `false`. The preview values (`values_preview_server.yaml`) and local development/integration-test values (`values_e2e_and_dev.yaml`) set it to `true`, adding these exact destinations:

- **Valid redirect URIs:** `http://localhost:3000/auth/callback`
- **Valid post logout redirect URIs:** `http://localhost:3000/logout`

For a fully local installation, use the local development values or explicitly set `allowLocalhostAuthRedirects=true` in your Helm values. For a local Astro website using a preview through `generate_local_test_config.sh --from-live`, the **preview's Keycloak realm** must allow these destinations: Keycloak returns the browser to the local Astro server, which validates the callback and exchanges the authorization code. Generating local configuration does not change the remote realm's allowlist. Use a preview rather than production for this workflow.

This setting is independent of `insecureCookies`; an HTTPS preview can support localhost callbacks without enabling insecure cookies on the preview. These are exact destinations, not a `http://localhost:3000/*` wildcard.

The chart applies the setting only when creating a realm. For an existing preview realm, manually add these entries to `backend-client` when enabling local development, or remove them when disabling it. Setting `allowLocalhostAuthRedirects=false` does not remove entries already stored in Keycloak's database.

## Verify the upgrade

- Sign in from a protected page and confirm that login returns to that page.
- Sign out and confirm that the browser returns to the website's `/logout` page.
- Check that the saved client settings contain the exact redirect destinations and require `S256`.
- In production, confirm that neither redirect allowlist contains localhost destinations.
- If local website development is supported, test localhost login and logout against the updated realm.

For failed callbacks, consult [callback validation failures](../../browser-authentication-flow/#callback-validation-failures).

## Rollback checklist

Keycloak stores client settings in its database. Updating or rolling back the Helm chart does not overwrite settings in an existing realm. If you roll back to the previous website, you must also restore compatible redirect and PKCE settings in Keycloak; otherwise, browser login may fail.

Prefer a forward fix. Rolling back this change removes the new application-side login protections; restoring the previous client settings also removes the new Keycloak-side restrictions.

1. Confirm the previous working website and chart versions and the client settings recorded before the upgrade. Check whether the release contains other changes that require their own rollback procedure; this checklist covers only the browser authentication changes.
2. Before restoring the previous website, open **Clients → backend-client** in the `loculus` realm. Restore the recorded **Valid redirect URIs**, **Valid post logout redirect URIs** and **Proof Key for Code Exchange Code Challenge Method**, then save. Keep destinations needed by the currently running website allowed until its replicas have been replaced. If the client settings were never changed, verify that they remain compatible with the previous website.
3. Restore the previous website and chart versions through the deployment's normal release process. For GitOps-managed instances, update the declared versions so reconciliation does not immediately reapply the upgrade. Wait for all website replicas to become ready. Do not delete or recreate the Keycloak realm or database for this rollback.
4. Start a fresh login from a protected page, confirm that it returns to the expected page, and test logout. Also test localhost login/logout if supported. Users with interrupted login attempts should start again rather than reuse a callback URL from before the rollback.
5. Confirm that the final client settings match the restored deployment, record the rollback and arrange a follow-up to restore the security fixes.
