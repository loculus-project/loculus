---
title: Configuring pipelines in the admin panel
description: Optionally store a preprocessing pipeline's config file in Loculus and serve it over the public config API
---

Loculus can optionally store a preprocessing pipeline's **config file** in its database, per organism and per pipeline version, and serve it over the public config API. You can edit this file in the admin panel.

:::caution[This is entirely optional]
You do **not** have to use the admin panel — or store any pipeline config in Loculus at all — to run a preprocessing pipeline. Pipelines are [external to Loculus and fully customizable](../pipeline-concept/): how you configure and run them is up to you. This feature is just a convenient place to keep a pipeline's config so it can be edited without redeploying. The Loculus-maintained [Nextclade pipeline](../existing-preprocessing-pipelines/) does use it, but that is a choice of that pipeline — your own pipeline can ignore it completely and take its configuration from environment variables, command-line arguments, a baked-in file, or anywhere else.
:::

## What it is

- **One free-form text config file per (organism, pipeline version).** The format is whatever your pipeline expects (YAML, JSON, TOML, plain text — anything).
- **Loculus stores it verbatim and never parses or interprets it.** It is an opaque text channel; the meaning is entirely between you and your pipeline.
- **Served over a public, unauthenticated endpoint:** `GET /api/config/organisms/{organismKey}/preprocessing/{pipelineVersion}` returns the raw text (404 if none is configured). A pipeline fetches it itself.
- **Edited in the admin panel** (requires the `loculus_administrator` role). Editing is a **direct save** — there is no draft/publish/version flow and no history; the current text is simply what the endpoint serves.
- **It is not versioned** as part of the organism config, so it is independent of the SILO/LAPIS config rollout.

:::danger[Never put secrets in the config file]
The endpoint is public. Credentials (e.g. the pipeline's Keycloak password), API keys, and certificates must **never** be placed here — they belong in your deployment's secret mechanism (in our Helm chart, a Kubernetes Secret passed as an argument).
:::

## Storing config here does not run anything

This is the most important point:

:::caution[Adding a config file is not enough to run preprocessing]
Adding a pipeline version and a config file in the admin panel only **stores text**. It does not start, schedule, or deploy any pipeline. You must separately **run** a preprocessing pipeline — a process authenticated with the [`preprocessing_pipeline` role](../build-new-preprocessing-pipeline/#authentication) — that polls the backend for unprocessed data, processes it, and submits the results back. Whether and how that pipeline reads the config file you stored here is up to the pipeline.
:::

Running and hosting the pipeline is the administrator's responsibility, by whatever means you prefer:

- Our Helm chart deploys the in-repo pipelines as Kubernetes Deployments, and the [config loader](../configuration-system/) seeds these config files into the backend from fixtures. This is how our previews work — but it is **one option, not a requirement**.
- You can equally run your pipeline as a long-running service, a scheduled job, a different orchestrator, or a managed/cloud service — anywhere it can reach the backend — and feed it configuration however you like.

## Using the editor

1. Open `/admin/config/` on your Loculus host (requires the `loculus_administrator` realm role in Keycloak).
2. Go to **Organisms**, choose an organism, and open the **Preprocessing** section.
3. **Add a pipeline version** — the number must match the `--pipeline-version` your running pipeline uses (the backend tracks which version processed which sequences, and several versions can run in parallel, e.g. during a reprocessing migration).
4. Paste the config text into the editor and **Save**. The change takes effect immediately; the public endpoint serves it right away.
5. Your running pipeline picks it up the next time it fetches its config (typically on start-up).

To remove a config file, use **Remove** on that version. An organism may have no config files at all — that is perfectly valid (for example, the [dummy pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/dummy) reads none).

## How the Nextclade pipeline uses it

For reference, the Loculus-maintained Nextclade pipeline opts in to this feature. When deployed by our Helm chart it is started with `--organism`, `--pipeline-version`, and `--backend-host`; from those it derives the backend root and fetches `GET /api/config/organisms/{organism}/preprocessing/{pipelineVersion}`, parsing the result (nextclade dataset, alignment settings, metadata processing specs, …) as its configuration. It also fetches the organism's metadata from the public config API and applies identity processing to any field the config file does not explicitly handle. See [Existing pipelines](../existing-preprocessing-pipelines/) and [Building your own pipeline](../build-new-preprocessing-pipeline/).
