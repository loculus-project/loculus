{{/* Get common metadata fields */}}
{{- define "loculus.commonMetadata" }}
fields:
  - name: accession
    type: string
  - name: version
    type: int
    notSearchable: true
  - name: submissionId
    type: string
  - name: accessionVersion
    type: string
  - name: isRevocation
    type: string
    notSearchable: true
  - name: submitter
    type: string
  - name: submittedAt
    type: string
  - name: releasedAt
    type: string
  - name: versionStatus
    type: string
    notSearchable: true
{{- end}}

{{/* Generate website config from passed config object */}}
{{- define "loculus.generateWebsiteConfig" }}
{{- $commonMetadata := (include "loculus.commonMetadata" . | fromYaml).fields }}
instances:
  {{- range $key, $instance := .instances }}
  {{ $key }}:
    schema:
      {{- with $instance.schema }}
      instanceName: {{ .instanceName }}
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

{{/* Generate website metadata from passed metadata array */}}
{{- define "loculus.generateWebsiteMetadata" }}
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

{{/* Generate backend config from passed config object */}}
{{- define "loculus.generateBackendConfig" }}
instances:
  {{- range $key, $instance := .instances }}
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
