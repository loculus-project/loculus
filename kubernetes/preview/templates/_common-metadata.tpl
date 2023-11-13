{{/* Get common metadata fields */}}
{{- define "pathoplexus.commonMetadata" }}
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
  - name: versionStatus
    type: string
    notSearchable: true
{{- end}}

{{/* Generate website config from passed config object */}}
{{- define "pathoplexus.generateWebsiteConfig" }}
{{- $commonMetadata := (include "pathoplexus.commonMetadata" . | fromYaml).fields }}
instances:
  {{- range $key, $instance := .instances }}
  {{ $key }}:
    schema:
      {{- with $instance.schema }}
      instanceName: {{ .instanceName }}
      primaryKey: accessionVersion
      metadata:
        {{ $metadata := concat $commonMetadata .metadata
            | include "pathoplexus.generateWebsiteMetadata"
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

{{/* Generate backend config from passed config object */}}
{{- define "pathoplexus.generateBackendConfig" }}
instances:
  {{- range $key, $instance := .instances }}
  {{ $key }}:
    schema:
      {{- with $instance.schema }}
      instanceName: {{ .instanceName }}
      metadata:
        {{ $metadata := include "pathoplexus.generateWebsiteMetadata" .metadata | fromYaml }}
        {{ $metadata.fields | toYaml | nindent 8 }}
      {{- end }}
    referenceGenomes:
      {{ $instance.referenceGenomes | toYaml | nindent 6 }}
  {{- end }}
{{- end }}

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
