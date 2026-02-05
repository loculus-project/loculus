---
title: 'Tutorial: My first loculus'
description: Experimenting with a Loculus interface running in a local mini Kubernetes cluster
---

This tutorial will guide you through setting up a test instance for Loculus locally, running on a mini Kubernetes cluster. You'll learn how to install dependencies, deploy Loculus, configure a custom organism, and submit sample data. By the end, you'll have a Loculus database running on your machine, providing hands-on experience of how things work (but the setup will not be suitable for production use).

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

## Reconfiguring Loculus

Now that we know we can get Loculus working we can tweak it.

Let's create a new configuration.

Create a new file (for now we will call it `custom_values.yaml` and it can be in your current working directory) with the following content:

```yaml
name: 'My awesome database'
```

Now we can "upgrade" the existing Loculus with this configuration:

```bash
helm upgrade loculus ./kubernetes/loculus --set environment=local --set branch=latest --set disableIngest=true --set disableEnaSubmission=true -f custom_values.yaml
```

Again you can check the status of the pods with `kubectl get pods` and once they are all running you can check the website again at `http://127.0.0.1:3000`.

You should find that the name of the database has changed to "My awesome database"!

### Configuring an organism

Loculus ships with some default organisms, but you probably want to overwrite these with your own.

Let's edit the `custom_values.yaml` file to the following:

<!-- prettier-ignore-start -->
```yaml
name: 'Angelovirus DB'
organisms:
  angelovirus:
    schema:
      organismName: 'Angelovirus'
      metadata:
        - name: country
          type: string
          initiallyVisible: true
        - name: city
          type: string
          initiallyVisible: true
      website:
        tableColumns:
          - country
          - city
        defaultOrder: descending
        defaultOrderBy: country
    preprocessing:
      - version: 1
        image: ghcr.io/loculus-project/preprocessing-nextclade
        args:
          - 'prepro'
        configFile:
          log_level: DEBUG
          batch_size: 100
          segments:
            - name: main
              references:
              - name: singleReference
                genes: []
    referenceGenomes: [] # We are not performing alignment
createTestAccounts: true
```
<!-- prettier-ignore-end -->

Because we have enabled the `createTestAccounts` option, we need to delete the existing keycloak database to ensure that the test users are added.

First we need to run `kubectl get pods` to get the name of the keycloak pod, which will be something like `loculus-keycloak-database-665b964c6b-gm9t5` (but with the random string at the end being different).

Then we can delete the pod with `kubectl delete pod loculus-keycloak-database-[the rest of the pod name]`.

:::tip

If you struggled with deleting the pod, an alternative approach would be to delete the entire helm release with `helm delete loculus` and then re-run the `helm install` command (`helm install loculus ./kubernetes/loculus --set environment=local --set branch=latest --set disableIngest=true --set disableEnaSubmission=true -f custom_values.yaml`).

:::

Now we can upgrade the Loculus installation again:

```bash
helm upgrade loculus ./kubernetes/loculus --set environment=local --set branch=latest --set disableIngest=true --set disableEnaSubmission=true -f custom_values.yaml
```

### Testing it out with some data

While that's getting ready, let's create some data to submit.

First let's make our sequence file, which we might name `sequences.fasta`:

```txt
>sample1
ATGGGATTTTGGCATATATATACGA
>sample2
GCAGAGAGAGATACGTATATATATA
```

Then our metadata file, which we might name `metadata.tsv`:

<div class="font-mono">
<pre>
id	city	country
sample1	Paris	France
sample2	Bogota	Colombia
</pre>
</div>

:::warning

The metadata file must be tab-separated (TSV) -- sometimes code editors will try to convert tabs to a number of spaces, causing confusion.

:::

Now we can check everything is running with `kubectl get pods` and once it is, we can open up the website at `http://localhost:3000` again. Because we enabled the `createTestAccounts` option, you should be able to log in with the username `testuser` and password `testuser`.

You can then go to `Submit`. You will be prompted to create a submitting group.

:::note
To successfully create a submitting group you will need to be able to access `127.0.0.1` on port `8079` (if you are running this on a remote machine you will need to set up port forwarding for this port too!).
:::

Once you have created a submitting group, you can submit your data. You will need to upload the `sequences.fasta` and `metadata.tsv` files. You can then select the organism you created earlier (`Angelovirus`) and submit the data.

You should find that they appear on your Review page and you can choose to release them. If you wait a minute and then refresh the Search page you should find your sequences have appeared! **🎉 We've released the first data for our new database!**

### Cleaning up

When you are done with experimenting, you can delete the cluster with the following command:

```bash
./deploy.py cluster --delete
```

:::caution

While the pattern that was described in this tutorial is a good way to get started with Loculus, it is not suitable for production use. For a production deployment, you should use a production focused cluster -- either one from a managed service like Vultr, Digital Ocean, AWS, GCP, Azure, or more -- or a self managed cluster, which you can run using [k3s](https://k3s.io/), which is related to k3d.

Also, for production use you must never run the databases within the Loculus chart, as used here, because these will be wiped whenever the pods are restarted (as we took advantage of above). Instead, you should use a managed database service like AWS RDS, Google Cloud SQL, or Digital Ocean Managed Databases (or you can provision your own database, but **outside** the Loculus chart)

:::
