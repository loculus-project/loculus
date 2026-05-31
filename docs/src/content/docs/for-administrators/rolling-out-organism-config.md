---
title: Rolling out organism config changes
description: How to apply published organism config versions to SILO and LAPIS
---

Publishing an organism config writes a new immutable version to the Loculus backend database. The backend and website read the latest published config directly from the backend API, so they do not need a rollout for ordinary config publishes. SILO and LAPIS are different: each organism's SILO/LAPIS pods are pinned to one organism config version by Helm values, and their `config-adapter` init container fetches that pinned version when a pod starts.

That means an organism config change has two steps when it affects SILO/LAPIS: publish the new version in the admin dashboard, then update the deployment's pinned `configVersion` and roll the organism's SILO/LAPIS pods. Instance-level config changes and display-only organism changes usually do not need this second step.

## What value to change

After publishing an organism config, the admin dashboard shows:

- the organism key, for example `cchf-multi-ref`;
- the newly published config version, for example `3`;
- the value to update, for example `organisms.cchf-multi-ref.configVersion=3`.

The chart templates read `.Values.organisms` when it is set, otherwise they fall back to `.Values.defaultOrganisms`. Most production-style installations should keep instance-specific organism deployment settings in their own values file under `organisms`. The in-repository default fixtures live under `defaultOrganisms`.

For an existing organism, update only the deployment-level pin:

```yaml
organisms:
  cchf-multi-ref:
    configVersion: 3
```

If your deployment still uses `defaultOrganisms`, update the same field there:

```yaml
defaultOrganisms:
  cchf-multi-ref:
    configVersion: 3
```

Do not copy the organism schema, metadata fields, reference sequences, or link-outs into Helm values. Those are domain config and live in the database-backed configuration system. Helm values only hold deployment-level scaffolding such as the config pin, enabled flag, pipeline deployments, replicas, and resource settings.

## GitOps / ArgoCD workflow

For GitOps-managed deployments, do not run `helm upgrade` by hand. Change the values file in the repository that ArgoCD watches:

1. Find the values file for the environment, for example a preview values file or a Pathoplexus environment values file.
2. Update the organism's `configVersion` to the newly published version.
3. Commit and push the change through the normal review process.
4. Let ArgoCD sync the application, or trigger a sync if your process requires it.
5. Watch the organism's SILO and LAPIS deployments until their new pods are ready.

For a newly created organism, add the organism's deployment scaffolding as well as `configVersion: 1`. At minimum, the chart needs enough information to template the per-organism SILO/LAPIS deployments and any enabled preprocessing or ingest deployments. Reuse the shape already used by neighbouring organisms in that environment. New organisms stay hidden from the public organism list until an administrator marks them deployed after the rollout.

## Direct Helm workflow

For a manually managed Helm release, you can set the pin from the command line:

```bash
helm upgrade <release> <chart-path> \
  --reuse-values \
  --set organisms.cchf-multi-ref.configVersion=3
```

Replace `<release>` with your Helm release name and `<chart-path>` with the chart path or chart reference you actually deploy. In this repository's local preview workflow, the release is usually `preview` and the chart path is `kubernetes/loculus`, so the command looks like:

```bash
helm upgrade preview kubernetes/loculus \
  --reuse-values \
  --set organisms.cchf-multi-ref.configVersion=3
```

If your deployment relies on `defaultOrganisms` rather than `organisms`, set `defaultOrganisms.<key>.configVersion` instead.

## Local previews in this repository

For the k3d previews created from this repository, `deploy.py` installs the chart from `kubernetes/loculus` and normally uses the Helm release name `preview`. For an existing organism, either run a Helm upgrade with the new pin or edit the values used by your local deployment and redeploy.

On a populated preview, avoid re-running fresh-only install hooks unless you intentionally want to reseed the database. If you are only changing a Helm value for running pods, a direct `helm upgrade preview kubernetes/loculus --reuse-values --set ...` is usually enough.

For a newly created organism, publishing the config in the backend is not sufficient. The chart also needs an entry for the organism so Kubernetes creates SILO/LAPIS deployments for it. Add the organism to the values used by the preview, set `configVersion: 1`, and run a Helm upgrade. Until those deployments exist and become ready, the public organism list hides the organism. After the LAPIS endpoint is healthy, open **Admin → Organisms** and use **Mark deployed** for that organism.

## What happens during rollout

When the Helm value changes, Kubernetes rolls the organism's SILO and LAPIS deployments. Each new pod starts with the `config-adapter` init container, which fetches `/api/config/organisms/<key>?version=<configVersion>` from the backend and renders the files SILO and LAPIS expect. SILO then imports data using the new rendered config, and LAPIS starts against the updated SILO service.

If the new config is bad, the init container or SILO import should fail visibly and the new pod will not become ready. Revert by pinning the organism back to the previous published config version and rolling the deployment again.

## Marking a new organism deployed

Publishing v1 creates the config version that the deployment layer can pin, but it does not by itself prove that SILO and LAPIS exist. For this reason, new organisms start as **not deployed** in the admin organism list and are hidden from public organism navigation and submission organism lists.

After the Helm/GitOps rollout has created the organism's SILO and LAPIS deployments, check the organism's LAPIS endpoint and the Kubernetes readiness state. Once the endpoint is healthy, click **Mark deployed** in **Admin → Organisms**. This changes only the backend deployment-readiness flag; it does not roll pods or edit Helm values.

Existing organisms in upgraded installations are marked deployed by default during migration, so current previews and production organisms remain visible immediately.

## When no rollout is needed

No SILO/LAPIS rollout is needed for instance config changes such as branding, banners, feature flags, and data-use-terms text. The website reads those from the backend on request.

Some organism changes are website-only, such as display names, descriptions, documentation text, and ordering of fields on the details page. These can be published without bumping the SILO/LAPIS pin, as long as they do not change what SILO indexes, what LAPIS exposes, or how preprocessing and ingest interpret data.
