{{/* Generate website config from passed config object */}}
{{- define "loculus.generateWebsiteConfig" }}
name: {{ $.Values.name }}
logo: {{ $.Values.logo | toYaml | nindent 6 }}
accessionPrefix: {{ $.Values.accessionPrefix }}
{{- $commonMetadata := (include "loculus.commonMetadata" . | fromYaml).fields }}
organisms:
  {{- range $key, $instance := (.Values.organisms | default .Values.defaultOrganisms) }}
  {{ $key }}:

    schema:
      {{- with $instance.schema }}
      instanceName: {{ .instanceName }}
      {{ if .image }}
      image: {{ .image }}
      {{ end }}
      {{ if .description }}
      description: {{ .description }}
      {{ end }}
      primaryKey: accessionVersion
      metadata:
        {{ $metadata := concat $commonMetadata .metadata
            | include "loculus.generateWebsiteMetadata"
            | fromYaml
         }}
        {{ $metadata.fields | toYaml | nindent 8 }}
      {{ .website | toYaml | nindent 6 }}
      {{- end }}
    referenceGenomes:
      {{ $instance.referenceGenomes | toYaml | nindent 6 }}
  {{- end }}
{{- end }}