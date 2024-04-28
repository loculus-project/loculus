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
    generateIndex: true
    autocomplete: true
  - name: groupId
    type: int
    autocomplete: true
  - name: groupName
    type: string
    generateIndex: true
    autocomplete: true
  - name: submittedAt
    type: timestamp
    displayName: Date submitted
  - name: releasedAt
    type: timestamp
    displayName: Date released
  - name: dataUseTerms
    type: string
    generateIndex: true
    autocomplete: true
    displayName: Data use terms
    initiallyVisible: true
    customDisplay:
      type: dataUseTerms
  - name: dataUseTermsRestrictedUntil
    type: date
    displayName: Data use terms restricted until
  - name: versionStatus
    type: string
    notSearchable: true
  {{- if $.Values.dataUseTermsUrls }}
  - name: dataUseTermsUrl
    type: string
    notSearchable: true
  {{- end}}
{{- end}}

{{/* Generate website config from passed config object */}}
{{- define "loculus.generateWebsiteConfig" }}
name: {{ quote $.Values.name }}
logo: {{ $.Values.logo | toYaml | nindent 6 }}
{{ if $.Values.bannerMessage }}
bannerMessage: {{ quote $.Values.bannerMessage }}
{{ end }}
{{ if $.Values.additionalHeadHTML }}
additionalHeadHTML: {{ quote $.Values.additionalHeadHTML }}
{{end}}

accessionPrefix: {{ quote $.Values.accessionPrefix }}
{{- $commonMetadata := (include "loculus.commonMetadata" . | fromYaml).fields }}
organisms:
  {{- range $key, $instance := (.Values.organisms | default .Values.defaultOrganisms) }}
  {{ $key }}:

    schema:
      {{- with $instance.schema }}
      instanceName: {{ quote .instanceName }}
      {{ if .image }}
      image: {{ .image }}
      {{ end }}
      {{ if .description }}
      description: {{ quote .description }}
      {{ end }}
      primaryKey: accessionVersion
      inputFields:
        {{ $instance.schema.inputFields | toYaml | nindent 8}}
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
  - name: {{ quote .name }}
    type: {{ quote .type }}
    {{- if .autocomplete }}
    autocomplete: {{ .autocomplete }}
    {{- end }}
    {{- if .notSearchable }}
    notSearchable: {{ .notSearchable }}
    {{- end }}
    {{- if .initiallyVisible }}
    initiallyVisible: {{ .initiallyVisible }}
    {{- end }}
    {{- if .displayName }}
    displayName: {{ quote .displayName }}
    {{- end }}
    {{- if .truncateColumnDisplayTo }}
    truncateColumnDisplayTo: {{ .truncateColumnDisplayTo }}
    {{- end }}
    {{- if .customDisplay }}
    customDisplay:
      type: {{ quote .customDisplay.type }}
      url: {{ .customDisplay.url }}
    {{- end }}
    {{- if .header }}
    header: {{ .header }}
    {{- end }}
{{- end}}
{{- end}}

{{/* Generate backend config from passed config object */}}
{{- define "loculus.generateBackendConfig" }}
accessionPrefix: {{ quote $.Values.accessionPrefix }}
name: {{ quote $.Values.name }}
dataUseTermsUrls:
  {{$.Values.dataUseTermsUrls | toYaml | nindent 2}}
organisms:
  {{- range $key, $instance := (.Values.organisms | default .Values.defaultOrganisms) }}
  {{ $key }}:
    schema:
      {{- with $instance.schema }}
      instanceName: {{ quote .instanceName }}
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
  - name: {{ quote .name }}
    type: {{ quote .type }}
    {{- if .required }}
    required: {{ .required }}
    {{- end }}
{{- end}}
{{- end}}

{{- define "loculus.publicRuntimeConfig" }}
            {{- if .Values.codespaceName }}
            "backendUrl": "https://{{ .Values.codespaceName }}-8079.app.github.dev",
            {{- else if eq .Values.environment "server" }}
            "backendUrl": "https://{{ printf "backend-%s" .Values.host }}",
            {{- else }}
            "backendUrl": "http://localhost:8079",
            {{- end }}
            "lapisUrls": {{- include "loculus.generateExternalLapisUrls" .externalLapisUrlConfig | fromYaml | toJson }},
            "keycloakUrl":  "https://{{ printf "authentication-%s" .Values.host }}"
{{- end }}

