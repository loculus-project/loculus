{{/* Get common metadata fields */}}
{{- define "loculus.commonMetadata" }}
fields:
  - name: accession
    type: string
    notSearchable: true
  - name: version
    type: int
    notSearchable: true
  - name: submissionId
    type: string
  - name: accessionVersion
    type: string
    notSearchable: true
  - name: isRevocation
    type: string
    notSearchable: true
  - name: submitter
    type: string
  - name: group
    type: string
  - name: submittedAt
    type: timestamp
  - name: releasedAt
    type: timestamp
  - name: dataUseTerms
    type: string
    generateIndex: true
    autocomplete: true
    customDisplay:
      type: dataUseTerms
  - name: versionStatus
    type: string
    notSearchable: true
{{- end}}

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
    {{- if .displayName }}
    displayName: {{ .displayName }}
    {{- end }}
    {{- if .customDisplay }}
    customDisplay:
      type: {{ .customDisplay.type }}
      url: {{ .customDisplay.url }}
    {{- end }}
{{- end}}
{{- end}}

{{/* Generate backend config from passed config object */}}
{{- define "loculus.generateBackendConfig" }}
accessionPrefix: {{$.Values.accessionPrefix}}
name: {{ $.Values.name }}
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
