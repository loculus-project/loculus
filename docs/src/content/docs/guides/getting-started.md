---
title: Deploying a loculus instance
description: How to deploy a loculus instance
---

# Prerequisites

Before you get started with deploying Loculus, there are a few prerequisites you'll need to ensure are in place.

## Kubernetes Cluster with Traefik

To deploy Loculus, you'll currently need a Kubernetes cluster with Traefik installed. Kubernetes is an open-source container orchestration system that automates the deployment, scaling, and management of containerized applications. Traefik is a modern reverse proxy and load balancer that integrates seamlessly with Kubernetes.

### Production Environment

For a production environment, we recommend using [k3s](https://k3s.io/). K3s is a lightweight, certified Kubernetes distribution designed for production workloads.

### Local Development

If you're working on local development or testing, [k3d](https://k3d.io/) is a great choice. K3d allows you to run Kubernetes clusters using Docker containers. It provides a convenient way to create and manage local Kubernetes clusters for development purposes.

## Helm

Helm is a package manager for Kubernetes that simplifies the deployment and management of applications. It uses charts, which are packages of pre-configured Kubernetes resources, to define and install applications in a Kubernetes cluster.

To deploy Loculus, you'll need to have Helm installed. Helm will be used to manage the dependencies and deploy the Loculus application using the provided Helm chart.

## Sealed Secrets

Sealed Secrets is a Kubernetes controller and tool for encrypting and storing sensitive information, such as passwords and API keys, as Kubernetes Secrets. It allows you to securely store and manage sensitive data in version control systems without exposing the actual values.

Eventually Loculus will support various ways of managing secrets, but for now we mostly need sealed secrets. You'll need to install [Sealed Secrets](https://github.com/bitnami-labs/sealed-secrets) in your Kubernetes cluster. Sealed Secrets will be used to encrypt and manage sensitive information required by the Loculus application.

## External Database (Optional)

By default, the provided Helm chart will create temporary databases for testing and development purposes. These temporary databases are suitable for initial setup and experimentation.

However, for a production deployment, it is highly recommended to use managed databases. (The temporary databases may be wiped at any time).

To use an external database, you'll need to provide the necessary connection details, such as the database URL, username, and password. These details should be encrypted using Sealed Secrets and specified in the `values.yaml` file of the Helm chart.

Here's an example of how the external database configuration might look in the `values.yaml` file:

```yaml
externalDatabase:
 urlSealedSecret: "ag..."
 usernameSealedSecret: "abc..
 passwordSealedSecret: "abc.."
```

Make sure to replace the sealed secret values with your own encrypted values.

## Clone the repository

The helm chart for deploying pathoplexus is within the Loculus repo, in the `kubernetes` subdirectory. You can adjust the `kubernetes/loculus/values.yaml` file to change the default values.

## Configure ingress

[We need to write about how to do this]

## Organism Configuration

Loculus supports multiple organisms, each with its own configuration. The organisms section in the values.yaml file allows you to define the specific settings for each organism.

Here's an example of how the organism configuration might look:

```yaml
organisms:
  ebolavirus-sudan:
    schema:
      image: "https://cdn.britannica.com/01/179201-050-FED1B381/filamentous-ebolavirus-particles-scanning-electron-micrograph-cell.jpg?w=400&h=300&c=crop"
      instanceName: "Ebolavirus Sudan"
      metadata:
        - name: date
          type: date
          header: "Collection Data"
        - name: region
          type: string
          generateIndex: true
          autocomplete: true
          header: "Collection Data"
        - name: country
          type: string
          generateIndex: true
          autocomplete: true
          header: "Collection Data"
        - name: division
          type: string
          generateIndex: true
          autocomplete: true
          header: "Collection Data"
        - name: host
          type: string
          autocomplete: true
        - name: pango_lineage
          type: pango_lineage
          autocomplete: true
          required: true
        - name: insdc_accession_full
          type: string
          displayName: INSDC accession
          customDisplay:
            type: link
            url: "https://www.ncbi.nlm.nih.gov/nuccore/{{value}}"
      website:
        tableColumns:
          - country
          - division
          - date
          - pango_lineage
        defaultOrder: descending
        defaultOrderBy: date
      silo:
        dateToSortBy: date
        partitionBy: pango_lineage
    preprocessing:
      image: ghcr.io/loculus-project/preprocessing-dummy
      args:
        - "--watch"
      warnings: true
      errors: true
      randomWarnError: true
    referenceGenomes:
      nucleotideSequences:
        - name: "main"
          sequence: "[[URL:https://cov2tree.nyc3.cdn.digitaloceanspaces.com/reference.txt]]"
      genes: []
```

In this example, the configuration for the "ebolavirus-sudan" organism is defined. It includes schema settings, website display options, silo configuration, preprocessing details, and reference genome information.

Note the metadata section includes various fields for how the metadata of specific sequences should be displayed. Each metadata item must have a `name` which will also be displayed on the page unless `displayName` is also set. The `type` of the data, as well as if the field is `required` and if `autoComplete` is enabled can also be added. Additionally, links from metadata entries to external websites can be added using the `customDisplay` option. We also allow metadata to be grouped in sections, specified by the `header` field.

Additionally, the `tableColumns` section defines which metadata fields are shown as columns in the search results.

You can add multiple organisms under the organisms section, each with its own unique configuration.

## Ready to Deploy?

Once you have the prerequisites in place and have configured the `values.yaml` file according to your requirements, you're ready to deploy Loculus using the provided Helm chart.

Run `helm install loculus kubernetes/loculus -f kubernetes/loculus/values.yaml`

You can use `helm status loculus` to see how the deployment has gone.
