---
title: 'Tutorial: My first loculus'
description: Experimenting with a Loculus interface running in a local mini Kubernetes cluster
---

This tutorial will guide you through setting up a test instance for Loculus locally, running on a mini Kubernetes cluster. You'll learn how to install dependencies, deploy Loculus, configure a custom organism, and submit sample data. By the end, you'll have a Loculus database running on your machine, providing hands-on experience of how things work (but the setup will not be suitable for production use).

:::tip[Want a feature-complete dev instance?]
If you just want a local Loculus instance that matches the dev/preview environments (all 8 default organisms, ingest, preprocessing, the admin dashboard), follow [Local development instance](../local-dev-instance) instead. That guide gets you a working full-stack instance in a few commands without writing any custom YAML.

This page stays useful if you want to learn the system by walking through it manually.
:::

:::note[System requirements]
This tutorial is intended for Linux. It has been tested on a fresh Ubuntu installation running on a DigitalOcean droplet (though you will find it simpler if you are able to run it locally.)

Loculus has considerable resource requirements. We would recommend at least 6 GB of RAM and 6 cores for even this test deployment.
:::

## Setting up the dependencies

For this example we will be deploying Loculus using its [Helm](https://helm.sh/) chart, which is deployed on a Kubernetes cluster. There are many different ways of installing Kubernetes, including on managed Cloud Services, but for these purposes we will run Kubernetes on our own machine, using [k3d](https://k3d.io/), which relies on [Docker](https://www.docker.com/).

#### Docker

First, if we don't have Docker installed, we need to install it. You should do this by following the instructions on the [Docker website](https://docs.docker.com/get-started/get-docker/).

#### K3d

Next, we need to install [k3d](https://k3d.io/), which is a lightweight wrapper to run [K3s](https://k3s.io/) (a lightweight Kubernetes distribution) in Docker. To install k3d, run the following command:

```bash
curl -s https://raw.githubusercontent.com/k3d-io/k3d/main/install.sh | bash
```

#### kubectl

To manage this cluster we will need [kubectl](https://kubernetes.io/docs/reference/kubectl/overview/), which is the Kubernetes command-line tool. You can do this by running the following commands:

```bash
curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
chmod +x kubectl
sudo mv kubectl /usr/local/bin/

```

#### Helm

We deploy Loculus we also need [Helm](https://helm.sh/), which is a package manager for Kubernetes. You can do this by running the following commands:

```bash
curl -fsSL -o get_helm.sh https://raw.githubusercontent.com/helm/helm/master/scripts/get-helm-3
chmod 700 get_helm.sh
./get_helm.sh
```

## Our first Loculus instance

Now we need to get the Loculus Helm chart and some helper scripts. You can do this by cloning the Loculus repository:

```bash
git clone https://github.com/loculus-project/loculus.git
cd loculus
```

### Creating a cluster

We have a wrapper script which can help with creating a cluster with the correct ports forwarded and to ensure some useful Helm charts get installed. To create a cluster, run the following command:

```bash
 ./deploy.py --verbose cluster
```

(If you ever need to delete the cluster you can run `./deploy.py cluster --delete`)

### Deploying Loculus onto the cluster

Now we can install Loculus using the Helm chart. To do this, run the following command:

```bash
helm install loculus ./kubernetes/loculus --set environment=local --set branch=latest --set disableIngest=true --set disableEnaSubmission=true
```

#### Checking the status

That command may complete relatively quickly, but it may take a few minutes for the Loculus pods to be fully running. You can check the status of the pods by running the following command:

```bash
kubectl get pods
```

The limiting factor in the pods starting is typically the `loculus-keycloak` pod.

Until it starts, other pods will crash because they need it for authentication.

Once it starts, the other pods should follow: initially the `website` and `backend`, and then `lapis` which depends on the `backend` pod.

### Accessing Loculus

Once the pods are running, you can access Loculus locally - the website will be accessible on port `3000`. If you have been running these commands on your local machine, you can access Loculus by visiting [http://127.0.0.1:3000](http://127.0.0.1:3000) in your browser. If not you will need to use port forwarding but you can check you can access the page using the following command:

```bash
curl http://127.0.0.1:3000
```

## Customizing the configuration

Your instance already ships with a set of default organisms — you'll see them in the organism dropdown on the website. Beyond that you can customize the instance: change its name and branding, and add or edit organisms.

Configuration like this is **no longer set in `values.yaml`**. Organism and instance domain config now lives in Loculus's database-backed configuration system, edited through the **admin dashboard** at `/admin/config/`:

- To understand how configuration is structured (the config layers, versioning, and where each component reads it), read [Configuration system](../configuration-system/).
- For the step-by-step admin workflow — changing the instance name, creating and publishing a new organism, and rolling it out to SILO/LAPIS — see [Managing configuration](../managing-configuration/).

The admin dashboard requires a user with the `loculus_administrator` role. The quickest way to get a fully-featured local instance that already includes such an account (`loculus_administrator` / `loculus_administrator`) along with all the default organisms, ingest, and preprocessing is the [Local development instance](../local-dev-instance/) guide — that is the recommended path once you want to go beyond this minimal walkthrough.

## Submitting some data

Let's submit a little data and watch it flow through the system. For that we need a login, so enable the built-in test accounts. Create a `custom_values.yaml`:

```yaml
createTestAccounts: true
```

The accounts are created when Keycloak first initialises, so delete the Keycloak database pod to have it re-seeded (find its name with `kubectl get pods`), then upgrade:

```bash
kubectl delete pod loculus-keycloak-database-<...>
helm upgrade loculus ./kubernetes/loculus --set environment=local --set branch=latest --set disableIngest=true --set disableEnaSubmission=true -f custom_values.yaml
```

:::tip
If deleting the pod is fiddly, you can instead `helm delete loculus` and re-run the original `helm install ... -f custom_values.yaml`.
:::

Once the pods are running again, open `http://localhost:3000` and log in with username `testuser`, password `testuser`.

Go to **Submit** and choose one of the default organisms. The submission page offers a **metadata template** download for the selected organism — that lists exactly the columns the organism expects and is the easiest way to prepare a valid metadata file. Fill in a row or two, and prepare a matching FASTA, e.g. `sequences.fasta`:

```txt
>sample1
ATGGGATTTTGGCATATATATACGA
>sample2
GCAGAGAGAGATACGTATATATATA
```

:::warning
The metadata file must be tab-separated (TSV) — some editors silently convert tabs to spaces, which causes confusing errors.
:::

:::note
You will first be prompted to create a submitting group. To create one you need to be able to reach the backend on `127.0.0.1:8079` (set up port forwarding too if you're on a remote machine).
:::

Upload the metadata and sequence files and submit. Your sequences appear on the **Review** page, where you can release them. After a moment, refresh the **Search** page and your data should appear. **🎉 You've submitted and released your first sequences!**

(If the organism dropdown is empty, the config loader that seeds the default organisms didn't run in this minimal install — the [Local development instance](../local-dev-instance/) guide is the reliable way to get a fully-seeded instance.)

### Cleaning up

When you are done with experimenting, you can delete the cluster with the following command:

```bash
./deploy.py cluster --delete
```

:::caution

While the pattern that was described in this tutorial is a good way to get started with Loculus, it is not suitable for production use. For a production deployment, you should use a production focused cluster -- either one from a managed service like Vultr, Digital Ocean, AWS, GCP, Azure, or more -- or a self managed cluster, which you can run using [k3s](https://k3s.io/), which is related to k3d.

Also, for production use you must never run the databases within the Loculus chart, as used here, because these will be wiped whenever the pods are restarted (as we took advantage of above). Instead, you should use a managed database service like AWS RDS, Google Cloud SQL, or Digital Ocean Managed Databases (or you can provision your own database, but **outside** the Loculus chart)

:::
