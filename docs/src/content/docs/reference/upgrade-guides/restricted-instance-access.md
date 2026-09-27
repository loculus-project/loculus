---
title: Restricted instance access
description: Configure login-only reads and explicit contribution permissions.
---

## Status and scope

This is a first implementation under review, not a production-verified deployment recipe.
`requireLogin` defaults to false. Public instances retain their existing access rules.
In restricted mode, operator-created accounts can read released data for every configured
organism. The `contributor` realm role additionally permits contribution operations, subject
to existing submitting-group and sequence-lifecycle checks. `super_user` retains its existing
administrative and contribution capabilities. Contributors may approve their own submissions.

Groups and membership are provisioned by operators through the backend API using a super-user
account. There is no new administration UI, local user database, fine-grained organism permission
model, or change to CLI login in this implementation. Viewers cannot access draft submissions,
even if they retain an existing group membership.

## Configuration

```yaml
requireLogin: true
s3:
  enabled: false
disableEnaSubmission: true
auth:
  registrationAllowed: false
```

Restricted mode rejects S3 file sharing, ENA deposition, read-only mode (which disables login),
a disabled website, and a custom public LAPIS URL. The public landing page does not query or
render sequence statistics for signed-out visitors. About/documentation and authentication
routes remain reachable.

Self-registration must also be disabled in the live realm. An account in that realm is an
admitted reader: do not enable restricted mode on a realm containing unapproved accounts.
Disabling registration does not remove existing accounts or prevent upstream identity-provider
auto-provisioning; review both before granting access to protected data.

## Request boundaries

The backend's `InstanceAccessPolicy` owns read/contribution decisions. A small actor adapter
maps existing Keycloak roles to capabilities; this is the replacement point for future
Loculus-owned identity and permission storage. Existing resource-level checks remain in force.

The website uses `/access/capabilities` for UI and page gating. Its `/lapis/{organism}/...`
proxy accepts a website session or an explicit bearer access token, asks the backend for access,
and streams results from the configured internal LAPIS. It does not forward user credentials
to LAPIS. Both public LAPIS ingress routes are removed in restricted mode. Internal LAPIS is
trusted cluster infrastructure; do not expose it through another ingress, load balancer or tunnel.
This implementation does not add network policies or enable LAPIS JWT authentication.

Only query paths under `/sample/`, `/component/` and `/query/parse` are forwarded. Query bodies
are bounded to 1 MiB; responses stream without whole-response buffering. Restricted website
responses are private/no-store. Review external CDN/cache configuration separately.

The experimental CLI still uses password-grant authentication. Its backend calls retain their
existing token handling, but its released-data query client does not attach tokens and therefore
does not support restricted queries yet. Direct API callers can use bearer tokens with the
query proxy. No browser redirects are returned for anonymous proxy requests.

## Machine identities

The `silo_import` account has `get_released_data`, not Contributor privileges. Its generated
password reaches the importer through the `service-accounts` Secret. Existing sealed/static
secrets need a `siloImportPassword` entry; generating a new value does not update an existing
Keycloak account automatically.

INSDC ingestion uses a separate `ingestion_pipeline` role for its existing submit/revise,
approval/revocation and submitted-data workflows, including group creation. Existing resource
checks remain active. Preprocessing and external metadata update roles retain their dedicated
endpoints; these roles do not imply general human contribution permission.

## Existing deployments

1. Review the account inventory, upstream provisioning, enabled integrations and storage exposure.
   Do not treat switching a previously public instance to restricted as retracting published data.
2. Back up realm configuration and the deployment values. Keep the existing OIDC settings from
   the browser-authentication upgrade guide, including callback/logout allowlists and PKCE.
3. Create `contributor` and `ingestion_pipeline` realm roles. Assign Contributor only to approved
   contributors, and the ingestion role only to the ingest account. Do not make either a default role.
4. Create/configure `silo_import`, assign `get_released_data`, and synchronize its password with
   the deployment Secret. Assign the ingestion role to `insdc_ingest_user` if ingestion is enabled.
5. Disable realm self-registration and set the access-token lifespan to five minutes. Existing
   longer-lived tokens remain valid until expiry unless separately invalidated. Realm imports on
   Helm upgrades do not change these settings in an existing realm database.
6. Deploy matching backend, website and importer images with the restricted chart configuration.
   Keep new private data unavailable until all replicas and ingress changes are verified; mixed
   versions during rollout are not a secure restricted deployment.
7. Verify direct backend/LAPIS access, anonymous website paths, viewer/contributor behaviour,
   service ingestion, and downloads before admitting users.

JWT validation is not an online account-status lookup. Role removal and account disabling may
take up to the remaining access-token lifetime to affect direct API requests. Website login
checks and provider session invalidation do not revoke every already-issued bearer token.

## Rollback and remaining verification

No application database migration is introduced. Helm rollback does not restore realm settings.
Rolling back to publicly accessible software/configuration may expose data: take the instance
offline or remove external ingress before rollback. Never use public-mode fallback to recover
from an authorization-service failure.

Before production use, complete the backend endpoint suite, public/restricted browser tests,
an existing-realm upgrade rehearsal, service pipeline checks, and large/zstd download tests.
Do not enable S3 sharing until public object policies and release-time publication are redesigned.

Restricted mode also disables `create_embl_file` in preprocessing configurations: the EMBL
output requires an S3 upload and otherwise causes processing errors. After upgrading an affected
preview, restart the preprocessing workers with the new configuration and explicitly reprocess
failed records through the normal administrator workflow. Do not approve errored records to
work around this failure.

### Test accounts and automated smoke tests

When `createTestAccounts` is enabled, `testcontributor` (password `testcontributor`) has the
Contributor role without super-user privileges. `testuser` remains a viewer in restricted mode.
These known credentials are exclusively for disposable environments with synthetic/public data.
The realm seed does not add this account to an existing realm: an operator must provision it
explicitly, or use a fresh disposable preview. No submitting-group membership is granted by the seed.

An opt-in integration suite checks browser and API gates without creating application data:

```sh
RESTRICTED_ACCESS_TESTS=true \
PLAYWRIGHT_TEST_BASE_URL=https://your-preview.loculus.org \
RESTRICTED_BACKEND_URL=https://backend-your-preview.loculus.org \
RESTRICTED_ISSUER_URL=https://authentication-your-preview.loculus.org/realms/loculus \
BROWSER=chromium TEST_SUITE=browser \
npx playwright test tests/restricted-access.spec.ts --reporter=list
```

Run this from `integration-tests` after provisioning the test accounts. Ordinary public-mode
CI skips this suite. Backend endpoint tests separately exercise successful contributor submission,
cross-group denial, viewer denial despite group membership, and operator-only membership changes.
Successful release and non-empty downloads still require a pipeline test with disposable sequences.

## Implementation provenance

Configuration, importer authentication and authenticated backend-client plumbing were adapted
from Richard Neher's experimental `wip/db-authentication` branch (PR #7362). The access policy,
contribution gate and query-proxy authorization boundary are developed separately here.
