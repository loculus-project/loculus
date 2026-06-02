---
title: Building your own pipeline
---

:::note
As the API interface and config structure have not been finalized and may change rapidly until Loculus 1.0 is officially released (see [current state and roadmap](../../introduction/current-state-and-roadmap/)), this guide might be not fully accurate and complete.
:::

Using an [existing pipeline](../existing-preprocessing-pipelines/) is the fastest way to get started with Loculus, but it is also easy to develop new pipelines that use custom tooling and logic. You can take a look at the code of the ["dummy pipeline"](https://github.com/loculus-project/loculus/tree/main/preprocessing/dummy) and the [Nextclade-based pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) (both examples are written in Python but it is possible to implement preprocessing pipelines in any programming language). If you would like to use Python to build your own pipeline, you might consider forking the Nextclade-based pipeline (which is released under the AGPL 3.0 license) and adapting it.

## Authentication

To call the backend, the preprocessing pipeline needs to use an account with the `preprocessing_pipeline` role. See [here](../user-administration/#processing-pipeline) for instructions on how to assign an account with the role in Keycloak. The pipeline can [retrieve an authentication token via the API](../../for-users/authenticate-via-api/).

## Preprocessing pipeline specification

The [preprocessing pipeline specification](https://github.com/loculus-project/loculus/blob/main/preprocessing/specification.md) describes the interface between a pipeline and the [Loculus backend server](../../reference/glossary.md#backend).

## Deployment

A preprocessing pipeline is simply a process that authenticates with the `preprocessing_pipeline` role, polls the backend for unprocessed data, processes it, and submits the results back. **How and where you run it is entirely up to you** — a long-running service, a scheduled job, any orchestrator, or a managed/cloud service. It only needs network access to the backend (and Keycloak). The sections below describe how _our_ Helm chart does it, but none of this is mandatory.

### With Kubernetes and Helm

If you use [Kubernetes and Helm to deploy Loculus](../setup-with-kubernetes/) and have a Docker image of your pipeline, you can configure it in the `preprocessing` field ([reference](../../reference/helm-chart-config/#organism-type)). Specify the `version` of the pipeline and the `image` name, and optionally a list of `args`.

The pipeline will be started with the following arguments:

```
{ values from the args field }
--backend-host={ backend host }/{ organism }
--keycloak-host={ Keycloak host }
--pipeline-version={ pipeline version }
--organism={ organism }
--keycloak-password={ Keycloak password }
```

The Loculus Helm chart creates a user for the pipeline (username `preprocessing_pipeline`); its password is provided through the `--keycloak-password` argument shown above. For further detail you can view the [Helm template code](https://github.com/loculus-project/loculus/blob/main/kubernetes/loculus/templates/loculus-preprocessing-deployment.yaml).

### Providing per-organism configuration

Loculus does **not** mount a config file into your pipeline. (Earlier versions generated a `preprocessing-config.yaml` from a `configFile` field in `values.yaml` and mounted it via `--config`; that mechanism has been removed.) If your pipeline needs per-organism configuration, it can fetch it from the backend's public config API — see [Configuring pipelines in the admin panel](../configure-pipeline-admin-panel/). That, too, is optional: many pipelines need no per-organism config (the [dummy pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/dummy) reads none), and you can equally bake configuration into your image or pass it through `args`/environment variables. Whatever config you store in the admin panel is opaque text that the backend serves verbatim; your pipeline decides what to do with it.
