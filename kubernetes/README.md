# Kubernetes setup

This directory contains the CDK8s (TypeScript) configuration to deploy Loculus instances for several purposes.
The `environment` variable reflects those purposes:

- `local`: Running locally with ports
- `server`: Running on a server with domain name

## Deploying on a Kubernetes cluster (e.g. for production)

_For development, follow the k3d instructions lower down the page._

### Prerequisites

Install [helm](https://helm.sh/) (needed for the secret generator dependency), [Node.js](https://nodejs.org/) (for CDK8s), and use [traefik](https://traefik.io/traefik/) for ingress.

Create a long-lived managed database: [to be documented as part of: https://github.com/loculus-project/loculus/issues/793]

Create your own configuration, by copying the `loculus/values.yaml` file and editing it as appropriate.

### Deployment

Deploy using the deploy script:

```shell
./deploy.py deploy --values my-values.yaml
```

## Local development/testing with k3d

### Prerequisites

Install [k3d](https://k3d.io/v5.6.0/), [helm](https://helm.sh/) (for the secret generator), and [Node.js](https://nodejs.org/).
We also recommend installing [k9s](https://k9scli.io/) to inspect cluster resources.

Install the CDK8s dependencies:

```shell
cd cdk8s && npm ci && cd ..
```

We deploy to kubernetes via the `../deploy.py` script. It requires you to have python 3.9 or higher and the packages `pyyaml` and `requests` installed. To create a virtual environment with the required dependencies run:

```shell
python3 -m venv .venv
source .venv/bin/activate
pip install requests pyyaml
```

NOTE: On MacOS, make sure that you have configured enough RAM in Docker, we recommend 8GB.

### Setup for local development

#### TLDR

```shell
../deploy.py cluster --dev
../deploy.py deploy --dev
```

Start the [backend](/backend/README.md) and the [website](/website/README.md) locally. Note that by default the deploy script will also start a Loculus deployment without preprocessing and ingest, to add preprocessing and ingest add the `--enablePreprocessing` and `--enableIngest` flags. To run either of these deployments locally you will need to use the generated configs.

##### The `deploy.py` script

The `deploy.py` script wraps the most important `k3d` and CDK8s commands.
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

Deploy the chart with some port forwarding disabled to link to local manual runs of the backend and website:

```shell
../deploy.py deploy --dev
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

Redeploy after changing the CDK8s code:

```shell
../deploy.py upgrade
```

You can also delete the cluster with:

```shell
../deploy.py cluster --delete
```

You can customise the values yaml file with `--values [file.yaml]`.

## Full deployment for E2E testing

There is a `local` environment intended for E2E testing in GitHub Actions.
It can also be used locally (though note caveats below for ARM-based mac systems).

Create a cluster with ports for all services exposed:

```shell
../deploy.py cluster
```

Deploy the services:

```shell
../deploy.py deploy --branch [your_branch]
```

## Argo CD

ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].loculus.org`. Long branch names are shortened, and some special characters are not supported. You can find the exact URL in the ArgoCD UI: https://argocd.k3s.pathoplexus.org/ (login details are on [Slack](https://loculus.slack.com/archives/C05G172HL6L/p1698940904615039)).

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed. It you would like to test your changes on a persistent DB add `developmentDatabasePersistence: true` to your `values.yaml`.

We do not currently support branch names containing characters that can't go in domain names with the exception of '/' and '\_' (see [kubernetes/appset.yaml](https://github.com/loculus-project/loculus/blob/main/kubernetes/appset.yaml) for details).

## Secrets

For preview instances this repo contains [sealed secrets](https://sealed-secrets.netlify.app/) that allow the loculus-bot to access the GitHub container registry and (separately) the GitHub repository. These are encrypted such that they can only be decrypted on our cluster but are cluster-wide so can be used in any namespace.

### Adding a sealed secret

Create a secret, for example like this:

    kubectl create secret generic my-secret --from-literal=accessKey=<secret> --from-literal=secretKey=<secret> --dry-run=client -o yaml > my-secret.yaml

This will create a `my-secret.yaml` file. Now, ensure that you have correctly configured kubectl to point to the preview cluster. Then seal your secret like this:

    kubeseal --scope cluster-wide --format=yaml < my-secret.yaml > my-sealed-secret.yaml

You now have a file `my-sealed-secret.yaml` with `spec.encryptedData` in it. You can now add this `encryptedData` to the `values.yaml` under `secrets.<yoursecretname>`. See `values_preview_server.yaml` for examples.

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
