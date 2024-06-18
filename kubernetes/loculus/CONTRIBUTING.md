# Developer guide

## How to debug helm templates with `yq`

To get a particular helm template from the output of `helm template` command, you can use `yq`.

For example, to get the `website_config.json` from the `loculus-website-config` ConfigMap, you can use the following command:

```bash
helm template loculus kubernetes/loculus \
| yq e 'select(.metadata.name == "loculus-website-config") | .data."website_config.json"'
```
