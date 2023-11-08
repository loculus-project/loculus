# Kubernetes

This directory contains a Helm chart to deploy previews of Pathoplexus, and a version for E2E testing (eventually this will be the production instance as well).

## GitHub Integration
ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].preview.k3s.pathoplexus.org`. Very long branch names, and some special characters, are not supported.

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed.

We do not currently support branch names containing underscores and other characters that can't go in domain names.

### Secrets

For preview instances this repo contains [sealed secrets](https://sealed-secrets.netlify.app/) that allow the pathoplexus-bot to access the GitHub container registry and (separately) the GitHub repository. These are encrypted such that they can only be decrypted on our cluster but are cluster-wide so can be used in any namespace.

## E2E mode

There is also an `e2e` mode intended for E2E testing not on the main Kubernetes cluster. This is used for CI. It can also be used locally on x64 systems.

Install [k3d](https://k3d.io/v5.6.0/) and [helm](https://helm.sh/).

Create a cluster with ports exposed and the current directory mounted as `/repo`:
```shell
k3d cluster create mycluster -p "3000:30081@agent:0"  -p "8079:30082@agent:0" -v "$(pwd):/repo"  --agents 2 
```

Install the chart:
```
helm install preview kubernetes/preview --set mode=e2e --set branch=latest --set namespace=test --set dockerconfigjson=[mysecret]
```

You will need to replace `[mysecret]` with a base64 encoded version of your `~/.docker/config.json` file containing credentials for ghcr.io. You can get this by running `cat ~/.docker/config.json | base64` and copying the output.