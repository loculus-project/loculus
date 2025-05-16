# Config Processor

## Overview

The Loculus Config Processor is a utility container designed to dynamically process configuration files in Kubernetes deployments. It serves as an init container that transforms configuration files by:

1. Fetching and inserting external content from URLs
2. Substituting environment variables for sensitive information (passwords, secrets)

This allows configuration files to reference large external assets (like reference genomes) and inject sensitive data without storing them directly in ConfigMaps.

## How It Works

The Config Processor operates in three main steps:

1. **Copy**: Duplicates the entire directory structure from input to output
2. **Fetch URLs**: Finds and replaces `[[URL:https://example.com/file.txt]]` patterns with the actual content from those URLs
3. **Substitute Secrets**: Replaces `[[KEY]]` placeholders with values from environment variables prefixed with `LOCULUSSUB_`

## Usage in Kubernetes

The Config Processor is integrated into deployments using two Helm templates:

### 1. `loculus.configProcessor` Template

This template adds the Config Processor as an init container:

```yaml
initContainers:
{{- include "loculus.configProcessor" (dict "name" "your-config-name" "dockerTag" $dockerTag) | nindent 8 }}
```

Parameters:
- `name`: The name of your configuration (used for volume names)
- `dockerTag`: The Docker image tag to use

### 2. `loculus.configVolume` Template

This template sets up the required volumes:

```yaml
volumes:
{{- include "loculus.configVolume" (dict "name" "your-config-name") | nindent 8 }}
```

or with a custom ConfigMap name:

```yaml
{{- include "loculus.configVolume" (dict "name" "your-config-name" "configmap" "your-custom-configmap") | nindent 8 }}
```

Parameters:
- `name`: The name of your configuration (used for volume names)
- `configmap` (optional): A custom ConfigMap name if it differs from `name`

### Implementation Example

1. Define a ConfigMap with your configuration files:
```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: your-config-name
data:
  config.json: |
    {
      "referenceGenome": "[[URL:https://example.com/genome.fasta]]",
      "smtpPassword": "[[smtpPassword]]"
    }
```

2. Add the Config Processor to your deployment:
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: your-app
spec:
  template:
    spec:
      initContainers:
        {{- include "loculus.configProcessor" (dict "name" "your-config-name" "dockerTag" $dockerTag) | nindent 8 }}
      containers:
        - name: your-app
          # ...
          volumeMounts:
            - name: your-config-name-processed
              mountPath: /config
      volumes:
        {{- include "loculus.configVolume" (dict "name" "your-config-name") | nindent 8 }}
```

## Environment Variables

The Config Processor looks for environment variables prefixed with `LOCULUSSUB_` to replace `[[KEY]]` placeholders:

- `LOCULUSSUB_smtpPassword` → replaces `[[smtpPassword]]`
- `LOCULUSSUB_backendUserPassword` → replaces `[[backendUserPassword]]`

These environment variables are typically sourced from Kubernetes secrets as shown in the `.tpl` template.
