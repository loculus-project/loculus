# Kubernetes setup

This directory contains a Helm chart to deploy Loculus instances for several purposes.
The Helm variable `environment` reflects those purposes:

- `local`: Running locally with ports
- `server`: Running on a server with domain name

## Deploying on a Kubernetes cluster (e.g. for production)

_For development, follow the k3d instructions lower down the page._

### Prerequisites

Install [helm](https://helm.sh/) and use [traefik](https://traefik.io/traefik/) for ingress.

Create a long-lived managed database: [to be documented as part of: https://github.com/loculus-project/loculus/issues/793]

Create your own configuration, by copying the `loculus/values.yaml` file and editing it as appropriate.

### Deployment

Install the Helm chart:

```shell
helm install loculus kubernetes/loculus -f my-values.yaml
```

## Local development/testing with k3d

### Prerequisites

Install [k3d](https://k3d.io/v5.6.0/) and [helm](https://helm.sh/).


We deploy to kubernetes via the `../deploy.py` script. It requires you to have `pyyaml` and `requests` installed.

### Setup for local development

#### TLDR

```shell
../deploy.py cluster --dev
../deploy.py helm --dev
```

Start the [backend](/backend/README.md) and the [website](/website/README.md) locally.

##### The `deploy.py` script

The `deploy.py` script wraps the most important `k3d` and `helm` commands.
Check the help for more information:

```shell
../deploy.py --help
```

Basic cluster management should be done with this script.
Use `kubectl` to interact with the running cluster in full power (e.g. accessing individual pods, getting logs, etc.).

#### Details

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
kubectl get pods
```

If something goes wrong,

```shell
kubectl get events
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

With helm based commands you can customise the values yaml file with `--values [file.yaml]`.

## Full deployment for E2E testing

There is a `local` environment intended for E2E testing in GitHub Actions.
It can also be used locally (though note caveats below for ARM-based mac systems).

Create a cluster with ports for all services exposed:

```shell
../deploy.py cluster
```

Install the chart to deploy the services:

```shell
../deploy.py helm --branch [your_branch]
```

## Argo CD

ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].loculus.org`. Long branch names are shortened, and some special characters are not supported. You can find the exact URL in the ArgoCD UI: https://argocd.k3s.pathoplexus.org/ (login details are on [Slack](https://loculus.slack.com/archives/C05G172HL6L/p1698940904615039).

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed.

We do not currently support branch names containing underscores and other characters that can't go in domain names.

## Secrets

For preview instances this repo contains [sealed secrets](https://sealed-secrets.netlify.app/) that allow the loculus-bot to access the GitHub container registry and (separately) the GitHub repository. These are encrypted such that they can only be decrypted on our cluster but are cluster-wide so can be used in any namespace.

## Setting up kubeconfig locally to access the remote cluster

To access the remote cluster without `ssh`ing to the containing machine, you need to set up your `kubeconfig` file.

You can get the `kubeconfig` file from the server by sshing to the server and running:

```shell
sudo kubectl config view --raw
```

However this configuration will specify the server as `127.0.0.1`, which you need to replace with the real IP of the server to which you SSHed.

You need to add each of the clusters, users, and contexts to your local `~/.kube/config` file. You can change the `user`/`cluster`/`context` `name`s, but the `context` must contain the correct `user` and `cluster` names.

The key information to add are the `client-certificate-data` and `client-certificate-data` for the user, and `certificate-authority-data` and `server` for the cluster.

You can then switch between contexts, first listing them with:

```shell
kubectl config get-contexts
```

And then switching with:

```shell
kubectl config use-context [context_name]
```

You can confirm that you are connected to the correct cluster with:

```shell
kubectl cluster-info
```

See [kubeconfig docs](https://kubernetes.io/docs/concepts/configuration/organize-cluster-access-kubeconfig/) for more information.

## Tips

You can find frequently used `kubectl` commands in the [KUBECTL_FAQ.md](./KUBECTL_FAQ.md) file.

### Debugging failed deployments with kubectl

If a deployment fails, you can use `kubectl` to get more information. For example, to see the status of the pods:

```shell
kubectl get pods
```

Or to see the events which might give you more information about why a pod failed to start:

```shell
kubectl get events
```

### Required resources

If you are on macOS, you need to give Docker Desktop sufficient system resources, otherwise local deployments will fail with warnings such as `node.kubernetes.io/disk-pressure` and `FreeDiskSpaceFailed`.

As of March 2024, you need to give at least 3GB of RAM (6GB recommended) and 75GB of (virtual) disk space (100-150GB recommended). You can do this in the Docker Desktop settings under Resources > Advanced.
