# Kubernetes setup

This directory contains a Helm chart to deploy Loculus instances for several purposes. 
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

### The `deploy.py` script

The `deploy.py` script wraps the most important `k3d` and `helm` commands.
Check the help for more information:

```shell
../deploy.py --help
```

Basic cluster management should be done with this script.
Use `kubectl` to interact with the running cluster in full power (e.g. accessing individual pods, getting logs, etc.).

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
kubectl get pods -n loculus
```

If something goes wrong,

```shell
kubectl get events -n loculus
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

ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].preview.k3s.loculus.org`. Very long branch names, and some special characters, are not supported.

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed.

We do not currently support branch names containing underscores and other characters that can't go in domain names.

### Secrets

For preview instances this repo contains [sealed secrets](https://sealed-secrets.netlify.app/) that allow the loculus-bot to access the GitHub container registry and (separately) the GitHub repository. These are encrypted such that they can only be decrypted on our cluster but are cluster-wide so can be used in any namespace.

## Full deployment for E2E testing

There is a `local` environment intended for E2E testing in GitHub Actions.
It can also be used locally (though note caveats below for ARM-based mac systems).


Create a cluster with ports for all services exposed:

```shell
../deploy.py cluster
```

Install the chart to deploy the services:

```shell
../deploy.py helm --branch [your_branch] --dockerconfigjson [base64 encoded ~/.docker/config.json]
```

## Tips

### How to get dockerconfigjson if ~/.docker/config.json doesn't work

Your `~/.docker/config.json` may not contain the necessary credentials for the GitHub container registry. E.g. `cat ~/.docker/config.json` may return:

```json
{
  "auths": {
    "ghcr.io": {}
  },
  "credsStore": "desktop",
  "currentContext": "colima"
}
```

This won't work for the `--dockerconfigjson` argument. Instead, you can use the following command to get the necessary credentials:

```shell
$ kubectl create secret docker-registry ghcr \
--docker-server="https://ghcr.io" \
--docker-username=YOURUSERNAME \
--docker-password=ghp_XXXXXXXX \
-o jsonpath="{.data.\.dockerconfigjson}" \
--dry-run=client

eyXXXXXX%
```

This will return a base64 encoded string similar to the one you can see above that starts with `ey` that you can use as `--dockerconfigjson` argument. Make sure not to copy the trailing `%` character that is added by `zsh`.

### How to set up locally on ARM64 macOS (M1, M2, etc.)

Using Docker desktop as your container runtime won't work on ARM64 macOS. Instead, you will need to use `colima` to run an AMD64 VM which will host AMD64 docker containers.

This will be quite slow due to QEMU emulation but it will work nonetheless (you may need to [adjust timeouts](https://github.com/loculus-project/loculus/pull/583).

First, install `colima`:

```shell
brew install colima
```

Then, start an AMD64 VM:

```shell
colima start --cpu 5 --memory 10 --runtime docker -p amd64 --arch x86_64
```

Colima automatically configures docker to use the VM as its runtime. You can check this with:

```shell
docker info
```

Then follow the instructions above to set up the cluster and deploy the Helm chart.
