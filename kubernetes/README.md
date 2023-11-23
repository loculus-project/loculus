# Kubernetes setup

This directory contains a Helm chart to deploy Pathoplexus instances for several purposes. 
The Helm variable `environment` reflects those purposes:
* `local`: Running locally with ports
* `server`: Running on a server with domain name
## Prerequisites

Install [k3d](https://k3d.io/v5.6.0/) and [helm](https://helm.sh/).

## Setup for local development

### TLDR

```shell
../deploy.py cluster --dev
../deploy.py helm --dev
```
Start the [backend](/backend/README.md) and the [website](/website/README.md) locally.

### Details

Create a cluster that doesn't expose the ports of the backend and the website:
```shell
../deploy.py cluster --dev
```

Install the chart with some port forwarding disabled to link to local manual runs of the backend and website:
```shell
../deploy.py helm --dev
```

Start the website and the backend locally. 
Check the README of the backend and the website for more information on how to do that.

Check whether the services are already deployed (it might take some time to start, especially for the first time):
```shell
kubectl get pods -n pathoplexus
```

If something goes wrong,
```shell
kubectl get events -n pathoplexus
```
might help to see the reason.

Redeploy after changing the Helm chart:
```shell
../deploy.py upgrade
```

You can also delete the cluster with:
```shell
../deploy.py cluster --delete
```

## Argo CD
ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].preview.k3s.pathoplexus.org`. Very long branch names, and some special characters, are not supported.

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed.

We do not currently support branch names containing underscores and other characters that can't go in domain names.

### Secrets

For preview instances this repo contains [sealed secrets](https://sealed-secrets.netlify.app/) that allow the pathoplexus-bot to access the GitHub container registry and (separately) the GitHub repository. These are encrypted such that they can only be decrypted on our cluster but are cluster-wide so can be used in any namespace.

## Full deployment for E2E testing

There is an `e2e` environment intended for E2E testing in GitHub Actions.
It can also be used locally on x64 systems.

Create a cluster with ports for all services exposed:
```shell
../deploy.py cluster
```

Install the chart to deploy the services:
```shell
../deploy.py helm --branch [your_branch] --dockerconfigjson [base64 encoded ~/.docker/config.json]
```
