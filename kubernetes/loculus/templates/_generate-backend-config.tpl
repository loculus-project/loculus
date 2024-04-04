{{/* Generate backend config from passed config object */}}
{{- define "loculus.generateBackendConfig" }}
accessionPrefix: {{$.Values.accessionPrefix}}
name: {{ $.Values.name }}
dataUseTermsUrls:
  {{$.Values.dataUseTermsUrls | toYaml | nindent 2}}
organisms:
  {{- range $key, $instance := (.Values.organisms | default .Values.defaultOrganisms) }}
  {{ $key }}:
    schema:
      {{- with $instance.schema }}
      instanceName: {{ .instanceName }}
      metadata:
        {{ $metadata := include "loculus.generateBackendMetadata" .metadata | fromYaml }}
        {{ $metadata.fields | toYaml | nindent 8 }}
      {{- end }}
    referenceGenomes:
      {{ $instance.referenceGenomes | toYaml | nindent 6 }}
  {{- end }}
{{- end }}