# Developer guide

## How to debug helm templates with `yq`

To get a particular helm template from the output of `helm template` command, you can use `yq`.

For example, to get the `website_config.json` from the `loculus-website-config` ConfigMap, you can use the following command:

```bash
helm template loculus kubernetes/loculus \
| yq e 'select(.metadata.name == "loculus-website-config") | .data."website_config.json"'
```

## Diffing produced Kubernetes manifests

To diff produced manifests, you can use the `diff` command and to specifically compare metadata fields you can use the `kubernetes/loculus/utils/yamldiff_script.py` script.

1. Install yamldiff: `go install github.com/sahilm/yamldiff@latest`
2. Create the manifests to diff: `helm template loculus kubernetes/loculus > /tmp/new.yaml`
3. Create manifests to diff against, e.g. from main and put into `/tmp/old.yaml`
4. Run script to diff: `python kubernetes/loculus/utils/yamldiff_script.py /tmp/old.yaml /tmp/new.yaml`
