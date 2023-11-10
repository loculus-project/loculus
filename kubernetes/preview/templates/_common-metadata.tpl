{{/* Get common metadata fields */}}
{{- define "pathoplexus.commonMetadata" }}
fields:
  - name: sequenceId
    type: string
  - name: version
    type: int
    notSearchable: true
  - name: customId
    type: string
  - name: sequenceVersion
    type: string
  - name: isRevocation
    type: string
    notSearchable: true
  - name: submitter
    type: string
  - name: submittedAt
    type: string
  - name: versionStatus
    type: string
    notSearchable: true
{{- end}}

{{/* Generate website metadata from passed metadata array */}}
{{- define "pathoplexus.generateWebsiteMetadata" }}
fields:
{{- range . }}
  - name: {{ .name }}
    type: {{ .type }}
    {{- if .generateIndex }}
    autocomplete: {{ .autocomplete }}
    {{- end }}
    {{- if .notSearchable }}
    notSearchable: {{ .notSearchable }}
    {{- end }}
{{- end}}
{{- end}}

{{/* Generate backend metadata from passed metadata array */}}
{{- define "pathoplexus.generateBackendMetadata" }}
fields:
{{- range . }}
  - name: {{ .name }}
    type: {{ .type }}
    {{- if .required }}
    required: {{ .required }}
    {{- end }}
{{- end}}
{{- end}}
