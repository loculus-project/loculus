---
title: Getting started
description: How to deploy a Loculus instance
---

This section of the documentation is for administrators of a Loculus instance. Below, we describe how you can set up a new instance.

## Before you start

Although Loculus is in principle stable and can be used in production, we plan to refactor the schema of the configuration files and the API of the backend server. This means that if you set up an instance at the moment, future updates will require significant effort. Additionally, until we have finalized the configuration schemas and APIs, **the documentation will be very sparse**. You can read more about the [current state of Loculus](../../introduction/current-state-and-roadmap).

As presented in the [system overview](../../introduction/system-overview) (which we recommend reading), Loculus consists of numerous sub-services which need to be configured and wired together. All services are available as Docker images. For local development and the preview instances, we use Kubernetes and Helm for deployment but it is also possible to deploy Loculus without Kubernetes.

## With Kubernetes

Here is a [guide to deploy Loculus with Kubernetes](../setup-with-kubernetes).

## With Docker Compose

We do not have a guide to deploy Loculus with Docker Compose at the moment but you can check out the [GenSpectrum configuration](https://github.com/GenSpectrum/loculus-config) where we have configured this.

## Without Docker

You can compile and run Loculus from source code if you do not want to use Docker. We do not have a dedicated guide for this at the moment and recommend reading the [Docker Compose example](#with-docker-compose) to understand how the sub-services should be connected and the (developer) documentation of the individual services for getting them running:

-   [Loculus backend](https://github.com/loculus-project/loculus/tree/main/backend)
-   [Loculus website](https://github.com/loculus-project/loculus/tree/main/website)
-   [PostgreSQL](https://www.postgresql.org/docs/)
-   [Keycloak](https://www.keycloak.org/guides)
-   [SILO](https://github.com/GenSpectrum/LAPIS-SILO)
-   [LAPIS](https://github.com/GenSpectrum/LAPIS)
-   Use the [Nextclade preprocessing pipeline](https://github.com/loculus-project/loculus/tree/main/preprocessing/nextclade) or follow the [preprocessing pipeline specifications](https://github.com/loculus-project/loculus/blob/main/preprocessing/specification.md) to build your own custom pipeline

Please let us know if you are interested in using Loculus without Docker or Kubernetes! Your feedback will motivate us to create a guide. You are of course also very welcome to contribute to the documentation if you have successfully deployed a Loculus instance and have written down the steps.
