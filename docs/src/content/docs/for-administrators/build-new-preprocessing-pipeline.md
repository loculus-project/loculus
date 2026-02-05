---
title: Building your own pipeline
---

:::note
As the API interface and config structure have not been finalized and may change rapidly until Loculus 1.0 is officially released (see [current state and roadmap](../../introduction/current-state-and-roadmap/)), this guide might be not fully accurate and complete.
:::

Using an [existing pipeline](../existing-preprocessing-pipelines/) is the fastest way to get started with Loculus, but it is also easy to develop new pipelines that use custom tooling and logic. You can take a look at the code of the [Nextclade-based pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) (written in Python, but it is possible to implement preprocessing pipelines in any programming language). If you would like to use Python to build your own pipeline, you might consider forking the Nextclade-based pipeline (which is released under the AGPL 3.0 license) and adapting it.

## Authentication

To call the backend, the preprocessing pipeline needs to use an account with the `preprocessing_pipeline` role. See [here](../user-administration/#processing-pipeline) for instructions on how to assign an account with the role in Keycloak. The pipeline can [retrieve an authentication token via the API](../../for-users/authenticate-via-api/).

## Preprocessing pipeline specification

The [preprocessing pipeline specification](https://github.com/loculus-project/loculus/blob/main/preprocessing/specification.md) describes the interface between a pipeline and the [Loculus backend server](../../reference/glossary.md#backend).

## Deployment with Kubernetes and Helm

If you use [Kubernetes and Helm to deploy Loculus](../setup-with-kubernetes/) and have a Docker image of your pipeline, you can configure it to be used in the `preprocessing` field ([reference](http://localhost:4321/reference/helm-chart-config/#organism-type)). In that field, you have to specify the `version` of the pipeline and the `image` name. Additionally, you can provide a list of `args` and values for the `configFile`.

The pipeline will be started with the following arguments

```
{ values from the args field }
--backend-host={ backend host }/{ organism }
--keycloak-host={ Keycloak host }
--pipeline-version={ pipeline version }
--keycloak-password={ Keycloak password }
```

If `configFile` is set, the `preprocessing-config.yaml` will be created, mounted onto the container and added as an argument. [This template](https://github.com/loculus-project/loculus/blob/c723c562ed2ca4a0252b3899fd375dab9a652c5a/kubernetes/loculus/templates/loculus-preprocessing-config.yaml#L12) specifies how the content of the file will be generated.

The config is then added as an argument using

```
 --config=/etc/config/preprocessing-config.yaml
```

For further information on how arguments are passed you can view the [Helm template code](https://github.com/loculus-project/loculus/blob/c723c562ed2ca4a0252b3899fd375dab9a652c5a/kubernetes/loculus/templates/loculus-preprocessing-deployment.yaml#L43) where this is defined.

The Loculus Helm chart will create a user for the pipeline. The username is `preprocessing_pipeline` and the password will be provided, as shown above, through the arguments.
