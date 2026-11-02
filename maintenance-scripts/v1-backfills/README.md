# Backfills supporting v1

These are explicitly invoked operator tools, not startup tasks or Flyway migrations.
Never commit reports, credentials or database exports. Reports contain account identifiers.

## Identity and membership backfill

`backfill-identities-and-memberships.sh` imports accounts from the configured Keycloak realm
and fills missing `user_groups_table.user_id` links. It never edits Keycloak, merges accounts,
deletes rows, rewrites usernames, or replaces established identity/membership links.

### Prerequisites and rollout

1. Deploy the additive schema and dual-write backend. Wait for **all** backend replicas to update.
2. Build the backend jar (`cd backend && ./gradlew bootJar`) or supply the matching deployed
   jar with `LOCULUS_BACKEND_JAR`. The launcher requires Java 25; it does not build automatically.
3. Supply configuration through the execution environment, using existing secret provisioning:
   `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`,
   `KEYCLOAK_URL`, `KEYCLOAK_REALM`, `KEYCLOAK_CLIENT`, `KEYCLOAK_USER`, `KEYCLOAK_PASSWORD`,
   and `SPRING_SECURITY_OAUTH2_RESOURCESERVER_JWT_ISSUER_URI`.
   Use the backend technical account's existing `view-users` access. The issuer is the trusted
   public realm issuer, **not** the internal Keycloak URL. No secret values belong in arguments.
4. Run dry-run, inspect the report, then apply. Use a new report path for each run.
5. Rerun dry-run to verify; resolve reported exceptions and repeat as needed.

```bash
bash maintenance-scripts/v1-backfills/backfill-identities-and-memberships.sh --dry-run --report ./identity-dry-run.json
bash maintenance-scripts/v1-backfills/backfill-identities-and-memberships.sh --apply --report ./identity-apply.json
```

No arguments or `--help` prints usage without starting Java or connecting anywhere. Both modes
at once are rejected. Dry-run does not write to the database (even temporarily) and can use
read-only database credentials. Apply needs identity inserts and membership updates. Report files
are created with mode `0600`, must not already exist, and are the only dry-run output written to disk.

The command starts an explicitly selected set of backend beans: no HTTP server, scheduled jobs,
consumers or automatic schema migrations. It does not read the normal backend JSON configuration;
`--apply` is explicit maintenance write authority. Do not run it during an operational write freeze.

### Matching and reruns

- Import all realm accounts, including disabled and technical accounts. This grants no permissions
  and does not enable accounts. A dedicated paginated attribute search includes client service accounts.
- Identity matching uses `(issuer, subject)`. Username snapshots are not refreshed on reruns.
- Membership matching uses exact usernames after lowercasing, without trimming or email fallback.
- Missing/ambiguous matches, duplicate identity memberships and conflicting established links are
  reported and left unchanged. A reused username cannot prove historical ownership: review the dry-run.
- Each identity and each membership update is atomic. Partial progress is retained; no resume token
  is required. Conditional updates and constraints protect against concurrent writes. A failed group
  operation can leave a valid, provisioned identity behind, but not a partially created group.
- Keycloak offset pagination is not a snapshot. Avoid bulk account churn during a run and rerun after
  concurrent changes. Duplicate IDs during enumeration stop the run before writes. API membership
  deletions are never recreated; concurrently changed rows are reported for a fresh run.
- A report describes that run, not a guarantee that no later rows can appear. Unlinked historical rows
  remain valid. v0 reads/authorization stay username-based; this does not perform the ID-only cutover.

### Results

The JSON report includes mode, trusted issuer, counts and per-record reasons. No passwords, tokens,
email addresses or full provider profiles are included. `identitiesNeedingProvisioning` counts missing
identities observed; `identitiesEnsured` includes concurrent JIT winners. Dry-run's `membershipsToLink`
is a proposal, not a promise about a later run. Apply rechecks before writing.

Exit codes: `0` complete (dry-run may still propose work); `2` scan finished with unresolved records;
`1` fatal failure, possibly after partial progress. Missing configuration is reported by variable name
only, never its value. Other fatal report reasons omit exception messages to avoid leaking HTTP/SQL
data. Confirm connectivity, permissions, schema and report path before retrying.
An abrupt process termination may leave an incomplete report; the database can still be safely rescanned.

Future backfill launchers belong in this folder; document each one's modes, configuration and reports here.
