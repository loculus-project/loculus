# Kubernetes Directory

## Formatting values.schema.json

After editing `kubernetes/loculus/values.schema.json`, run prettier to format it:

```bash
npx prettier@3.6.2 --write kubernetes/loculus/values.schema.json
```

## Testing schema and values changes

After changing values.schema.json or values.yaml, run helm lint to validate:

```bash
helm lint kubernetes/loculus -f kubernetes/loculus/values.yaml
```
