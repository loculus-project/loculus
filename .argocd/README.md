# argocd

This directory contains configuration for the continuous deployment system with [ArgoCD](https://argo-cd.readthedocs.io/en/stable/) which should provide automated previews for our pull requests.


## GitHub Integration
ArgoCD will aim to build preview instances for any open PR with the `preview` label. It may take 5 minutes for an instance to appear. The preview will appear at `[branch_name].preview.pathoplexus.org`. Very long branch names, and some special characters, are not supported.

The preview is intended to simulate the full backend and associated containers. It may be necessary to update this directory when changes are made to how containers need to be deployed.