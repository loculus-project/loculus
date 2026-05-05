{{/*
Shared pod spec contents for both the ingest CronJob and ingest Deployment.
Usage: include "loculus.ingest.podSpecContents" (list $key $dockerTag $organismContent $root) | nindent N
*/}}
{{- define "loculus.ingest.podSpecContents" -}}
{{- $args := . -}}
{{- $key := index $args 0 -}}
{{- $dockerTag := index $args 1 -}}
{{- $organismContent := index $args 2 -}}
{{- $root := index $args 3 -}}
initContainers:
  - name: version-check
    image: busybox
    {{- include "loculus.resources" (list "ingest-init" $root.Values) | nindent 4 }}
    command: ['sh', '-c', '
      CONFIG_VERSION=$(grep "verify_loculus_version_is:" /package/config/config.yaml | sed "s/verify_loculus_version_is: //;");
      DOCKER_TAG="{{ $dockerTag }}";
      echo "Config version: $CONFIG_VERSION";
      echo "Docker tag: $DOCKER_TAG";
      if [ "$CONFIG_VERSION" != "$DOCKER_TAG" ]; then
        echo "Version mismatch: ConfigMap version $CONFIG_VERSION does not match docker tag $DOCKER_TAG";
        exit 1;
      else
        echo "Version match confirmed";
      fi
    ']
    volumeMounts:
      - name: loculus-ingest-config-volume-{{ $key }}
        mountPath: /package/config/config.yaml
        subPath: config.yaml
containers:
  - name: ingest-{{ $key }}
    image: {{ $organismContent.ingest.image }}:{{ $dockerTag }}
    imagePullPolicy: {{ $root.Values.imagePullPolicy }}
    {{- include "loculus.resources" (list "ingest" $root.Values) | nindent 4 }}
    env:
      - name: KEYCLOAK_INGEST_PASSWORD
        valueFrom:
          secretKeyRef:
            name: service-accounts
            key: insdcIngestUserPassword
      - name: SLACK_HOOK
        valueFrom:
          secretKeyRef:
            name: slack-notifications
            key: slack-hook
      - name: NCBI_API_KEY
        valueFrom:
          secretKeyRef:
            name: ingest-ncbi
            key: api-key
    args:
      - snakemake
      - results/submitted
      - results/revised
      - results/approved
      - --all-temp # Reduce disk usage by not keeping files around
    {{- if $organismContent.ingest.configFile }}
    volumeMounts:
      - name: loculus-ingest-config-volume-{{ $key }}
        mountPath: /package/config/config.yaml
        subPath: config.yaml
    {{- end }}
{{- if $organismContent.ingest.configFile }}
volumes:
  - name: loculus-ingest-config-volume-{{ $key }}
    configMap:
      name: loculus-ingest-config-{{ $key }}
{{- end }}
{{- end }}
