# 7. Deployment View

## Kubernetes shape

Each configured view key produces:

- one `loculus-silo-{view}` deployment;
- one `loculus-lapis-{view}` deployment;
- one config-adapter init container in each deployment;
- one importer container alongside SILO for materialization.

## Helm values

`values.yaml` controls which view deployments exist. The SQL and schema come from the DB-backed instance config seeded by fixtures in previews.

The legacy `overview` deployment setting is still supported and merged into the `views` map under key `overview`.

