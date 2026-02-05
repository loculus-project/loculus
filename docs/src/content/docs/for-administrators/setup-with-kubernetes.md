---
title: Setup with Kubernetes
description: How to deploy a Loculus instance with Kubernetes
---

# Prerequisites

Before you get started with deploying Loculus, there are a few prerequisites you'll need to ensure are in place.

## Kubernetes Cluster with Traefik

To deploy Loculus, you'll currently need a Kubernetes cluster with Traefik installed. Kubernetes is an open-source container orchestration system, and Traefik is a HTTP reverse proxy and load balancer that is used to route traffic to the Loculus application.

### Production Environment

For a production environment, if you are deploying on a bare server you can use [k3s](https://k3s.io/). K3s is a lightweight, certified Kubernetes distribution designed for production workloads. You could also use a managed Kubernetes environment at a cloud provider like Digital Ocean, Vultr, AWS, etc.

### Local Development

If you're working on local development or testing, you can use [k3d](https://k3d.io/) to instantly create a disposable k3s like cluster using Docker.

## Helm

Helm is a package manager for Kubernetes that simplifies the deployment and management of applications. It uses charts, which are packages of pre-configured Kubernetes resources, to define and install applications in a Kubernetes cluster.

To deploy Loculus, you'll need to have Helm installed. Helm will be used to manage the dependencies and deploy the Loculus application using the provided Helm chart.

## External Database

By default, the provided Helm chart will create temporary databases for testing and development purposes. These temporary databases are suitable for initial setup and experimentation.

However, for a production deployment, you must use a permanent database. We recommend using a managed database service like Amazon RDS, Google Cloud SQL, or DigitalOcean Managed Databases, or you can run your own database server, but you must not use the built in database for production.

To use an external database, you'll need to provide the necessary connection details, such as the database URL, username, and password.

These details are configured in the `secrets` section of the `values.yaml` file.

```yaml
secrets:
  database:
    type: raw
    data:
      url: 'jdbc:postgresql://loculus-database-service/loculus'
      username: 'postgres'
      password: 'password'
  keycloak-database:
    type: raw
    data:
      addr: 'loculus-keycloak-database-service'
      database: 'keycloak'
      username: 'postgres'
      password: 'unsecure'
      port: '5432'
```

You can also use sealed secrets, see the [Sealed Secrets](#sealedsecret) section for more information.

## Clone the repository

The helm chart for deploying pathoplexus is within the Loculus repo, in the `kubernetes` subdirectory. You can adjust the `kubernetes/loculus/values.yaml` file to change the default values.

## Configure ingress

[We need to write about how to do this]

## Organism Configuration

Loculus supports multiple organisms, each with its own configuration. The organisms section in the values.yaml file allows you to define the specific settings for each organism. See [here](../../reference/helm-chart-config/) for a list of the available config fields.

Here's an example of how the organism configuration might look:

```yaml
organisms:
  ebolavirus-sudan:
    schema:
      image: 'https://cdn.britannica.com/01/179201-050-FED1B381/filamentous-ebolavirus-particles-scanning-electron-micrograph-cell.jpg?w=400&h=300&c=crop'
      organismName: 'Ebolavirus Sudan'
      metadata:
        - name: date
          type: date
          header: 'Collection Data'
        - name: region
          type: string
          generateIndex: true
          autocomplete: true
          header: 'Collection Data'
        - name: country
          type: string
          generateIndex: true
          autocomplete: true
          header: 'Collection Data'
        - name: division
          type: string
          generateIndex: true
          autocomplete: true
          header: 'Collection Data'
        - name: host
          type: string
          autocomplete: true
        - name: pangoLineage
          type: string
          autocomplete: true
          required: true
        - name: insdcAccessionFull
          type: string
          displayName: INSDC accession
          customDisplay:
            type: link
            url: 'https://www.ncbi.nlm.nih.gov/nuccore/__value__'
      website:
        tableColumns:
          - country
          - division
          - date
          - pangoLineage
        defaultOrder: descending
        defaultOrderBy: date
    preprocessing:
      - version: 1
        image: ghcr.io/loculus-project/preprocessing-nextclade
        args:
          - 'prepro'
    referenceGenomes:
      singleReference:
        nucleotideSequences:
          - name: 'main'
            sequence: '[[URL:https://cov2tree.nyc3.cdn.digitaloceanspaces.com/reference.txt]]'
        genes: []
```

In this example, the configuration for the "ebolavirus-sudan" organism is defined. It includes schema settings, website display options, silo configuration, preprocessing details, and reference genome information.

Note the metadata section includes various fields for how the metadata of specific sequences should be displayed. Each metadata item must have a `name` which will also be displayed on the page unless `displayName` is also set. The `type` of the data, as well as if the field is `required` and if `autoComplete` is enabled can also be added. Additionally, links from metadata entries to external websites can be added using the `customDisplay` option. We also allow metadata to be grouped in sections, specified by the `header` field. The `noInput` parameter specifies that a parameter is generated internally by loculus (can be specified in the preprocessing pipeline) and should not be expected as input. You can optionally add a `columnWidth` for the column in the search table, in pixels, which will be the minimal width for the column.

Your preprocessing pipeline can be customized for each organism. Currently, we use `nextclade run` in our preprocessing pipeline and we suggest it as a fast option to do basic checks on your input sequences. Given a `nextclade dataset` (in its simplest form a reference sequence and a gene_annotation file) nextclade tries to align new sequences to the reference and will discard sequences that cannot be aligned. It will also compute mutations, insertions and deletions for the nucleotide sequence as well as for the corresponding genes. If you would like to use our preprocessing set-up you can add a nextclade dataset to your `values.yaml` as follows:

```yaml
preprocessing:
  - version: 1
    image: ghcr.io/loculus-project/preprocessing-nextclade
    args:
      - 'prepro'
    configFile:
      log_level: DEBUG
      nextclade_sequence_and_datasets:
        - name: 'main'
          nextclade_dataset_name: nextstrain/ebola/zaire
          genes: [NP, VP35, VP40, GP, sGP, ssGP, VP30, VP24, L]
      batch_size: 100
```

Additionally, the `tableColumns` section defines which metadata fields are shown as columns in the search results.

You can add multiple organisms under the organisms section, each with its own unique configuration.

### Multi-segmented pathogens

In Loculus, sequence data from multi-segmented viruses is stored in accessioned sequence entries which group together the segments from a particular sample or isolate. Multi-segmented organisms should be annotated with a list with the names of the segments supplied as `nucleotideSequences`. For CCHFV this looks like:

```yaml
organisms:
  cchf:
    schema:
      organismName: 'Crimean-Congo Hemorrhagic Fever Virus'
      nucleotideSequences: [L, M, S]
      metadata:
        - name: length
          type: int
          header: 'Length'
          perSegment: true
```

Additionally, if you are using the preprocessing or ingest pipelines, `nucleotideSequences` must also be defined in those sections of the config.

Metadata fields can be isolate- or segment-specific. By default we assume metadata fields are isolate-specific (i.e. are shared across all segments), therefore segment-specific fields must be marked as `perSegment` in the config file. Marking a field as `perSegment` will result in that field existing for each segment. In the example above, instead of there being one metadata field called `length` there will now be three fields called `length_L`, `length_M` and `length_S`.

Loculus expects multi-segmented pathogen sequences to be submitted in a specific format. Fasta files should have a separate entry/record for each segment, with a Fasta header of `>[ID]_[segmentName]`, e.g. `>sample123_L` for the `L` segment of the sample with the ID `sample123`. Metadata is uploaded for an entire sequence entry, rather than per segment, i.e. there will be only one row for each `ID`.

## Secrets

Our secrets configuration supports three types of secrets.

### `raw`

This is the simplest type of secret, it is just a key value pair.

```yaml
secrets:
  database:
    type: raw
    data:
      url: 'jdbc:postgresql://loculus-database-service/loculus'
      username: 'postgres'
      password: 'password'
```

### `sealedsecret`

This is a sealed secret, it is encrypted and can only be decrypted by the cluster.

```yaml
secrets:
  database:
    type: sealedsecret
    clusterWide: 'false' # If true the secret can be decrypted in any namespace, but must have been created with this setting enabled
    encryptedData:
      url: '[Encrypted Data]'
      username: '[Encrypted Data]'
      password: '[Encrypted Data]'
```

### `autogen`

This is a secret that is automatically generated by the helm chart.

```yaml
secrets:
  secretKey:
    type: autogen
    data:
      myKey: ''
```

## Ready to Deploy?

Once you have the prerequisites in place and have configured the `values.yaml` file according to your requirements, you're ready to deploy Loculus using the provided Helm chart.

Run `helm install loculus kubernetes/loculus -f kubernetes/loculus/values.yaml`

You can use `helm status loculus` to see how the deployment has gone.
