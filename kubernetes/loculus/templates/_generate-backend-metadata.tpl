{{/* Generate backend metadata from passed metadata array */}}
{{- define "loculus.generateBackendMetadata" }}
fields:
{{- range . }}
  - name: {{ .name }}
    type: {{ .type }}
    {{- if .required }}
    required: {{ .required }}
    {{- end }}
{{- end}}
{{- end}}