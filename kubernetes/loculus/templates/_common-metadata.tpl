{{- define "loculus.websiteUrl" -}}
{{- $websiteHost := "" }}
{{- if $.Values.codespaceName }}
  {{- $websiteHost = printf "https://%s-3000.app.github.dev" $.Values.codespaceName }}
{{- else if eq $.Values.environment "server" }}
  {{- $websiteHost = printf "https://%s" $.Values.host }}
{{- else }}
  {{- $websiteHost = "http://localhost:3000" }}
{{- end }}
{{- printf $websiteHost }}
{{- end }}


{{/* Get common metadata fields */}}
{{- define "loculus.commonMetadata" }}
fields:
  - name: accession
    type: string
    notSearchable: true
    hideOnSequenceDetailsPage: true
  - name: version
    type: int
    notSearchable: true
    hideOnSequenceDetailsPage: true
  - name: version_comments
    type: string
    notSearchable: true
    header: Submission details
  - name: submissionId
    type: string
    header: Submission details
  - name: accessionVersion
    type: string
    notSearchable: true
    hideOnSequenceDetailsPage: true
  - name: isRevocation
    type: boolean
    notSearchable: true
    hideOnSequenceDetailsPage: true
  - name: submitter
    type: string
    generateIndex: true
    autocomplete: true
    header: Submission details
  - name: groupId
    type: int
    autocomplete: true
    header: Submission details
    customDisplay:
      type: link
      url: {{ include "loculus.websiteUrl" $ -}} /group/__value__
  - name: groupName
    type: string
    generateIndex: true
    autocomplete: true
    header: Submission details
  - name: submittedAtTimestamp
    type: timestamp
    displayName: Date submitted (timestamp)
    header: Submission details
  - name: submittedDate
    type: string
    displayName: Date submitted
    header: Submission details
  - name: releasedAtTimestamp
    type: timestamp
    displayName: Date released (timestamp)
    header: Submission details
  - name: releasedDate
    type: string
    displayName: Date released
    header: Submission details
  - name: dataUseTerms
    type: string
    generateIndex: true
    autocomplete: true
    displayName: Data use terms
    initiallyVisible: true
    customDisplay:
      type: dataUseTerms
    header: Data use terms
  - name: dataUseTermsRestrictedUntil
    type: date
    displayName: Data use terms restricted until
    hideOnSequenceDetailsPage: true
    header: Data use terms
  - name: versionStatus
    type: string
    notSearchable: true
    hideOnSequenceDetailsPage: true
  {{- if $.Values.dataUseTermsUrls }}
  - name: dataUseTermsUrl
    type: string
    notSearchable: true
    header: Data use terms
    customDisplay:
      type: link
      url: "__value__"
  {{- end}}
{{- end}}

{{/* Patches schema by adding to it */}}
{{- define "loculus.patchMetadataSchema" -}}
{{- $patchedSchema := deepCopy . }}
{{- $toAdd := . | dig "metadataAdd" list -}}
{{- $patchedMetadata := concat .metadata $toAdd -}}
{{- set $patchedSchema "metadata" $patchedMetadata | toYaml -}}
{{- end -}}

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
      {{- with ($instance.schema | include "loculus.patchMetadataSchema" | fromYaml) }}
      organismName: {{ quote .organismName }}
      loadSequencesAutomatically: {{ .loadSequencesAutomatically | default false }}
      {{- $nucleotideSequences := .nucleotideSequences | default (list "main")}}
      {{ if .image }}
      image: {{ .image }}
      {{ end }}
      {{ if .description }}
      description: {{ quote .description }}
      {{ end }}
      primaryKey: accessionVersion
      inputFields: {{- include "loculus.inputFields" . | nindent 8 }}
      metadata:
        {{- $args := dict "metadata" (concat $commonMetadata .metadata) "nucleotideSequences" $nucleotideSequences}}
        {{ $metadata := include "loculus.generateWebsiteMetadata" $args | fromYaml }}
        {{ $metadata.fields | toYaml | nindent 8 }}
      {{ .website | toYaml | nindent 6 }}
      {{- end }}
    referenceGenomes:
      {{ $instance.referenceGenomes | toYaml | nindent 6 }}
  {{- end }}
{{- end }}

{{- define "loculus.standardWebsiteMetadata" }}
- type: {{ .type | default "string" | quote }}
  {{- if .autocomplete }}
  autocomplete: {{ .autocomplete }}
  {{- end }}
  {{- if .notSearchable }}
  notSearchable: {{ .notSearchable }}
  {{- end }}
  {{- if .initiallyVisible }}
  initiallyVisible: {{ .initiallyVisible }}
  {{- end }}
  {{- if or (or (eq .type "timestamp") (eq .type "date")) .rangeSearch }}
  rangeSearch: true
  {{- end }}
  {{- if .hideOnSequenceDetailsPage }}
  hideOnSequenceDetailsPage: {{ .hideOnSequenceDetailsPage }}
  {{- end }}
  {{- if .truncateColumnDisplayTo }}
  truncateColumnDisplayTo: {{ .truncateColumnDisplayTo }}
  {{- end }}
  {{- if .customDisplay }}
  customDisplay:
    type: {{ quote .customDisplay.type }}
    url: {{ .customDisplay.url }}
  {{- end }}
{{- end }}

{{/* Generate website metadata from passed metadata array */}}
{{- define "loculus.generateWebsiteMetadata" }}
fields:
{{- $metadataList := .metadata }}
{{/* A segmented organism is defined by having more than 1 segment */}}
{{- $segments := .nucleotideSequences }}
{{- $is_segmented := gt (len $segments) 1 }}
{{- range $metadataList }}
{{- if and $is_segmented .perSegment }}
{{- $currentItem := . }}
{{- range $segment := $segments }}
{{- with $currentItem }}
{{ include "loculus.standardWebsiteMetadata" . }}
  name: {{ printf "%s_%s" .name $segment | quote }}
  {{- if .displayName }}
  displayName: {{ printf "%s %s" .displayName $segment | quote }}
  {{- end }}
  {{- if (default false .oneHeader)}}
  header: {{ (default "Other" .header) | quote }}
  {{- else }}
  header: {{ printf "%s %s" (default "Other" .header) $segment | quote }}
  {{- end }}
{{- end }}
{{- end }}
{{- else }}
{{ include "loculus.standardWebsiteMetadata" . }}
  name: {{ quote .name }}
  {{- if .displayName }}
  displayName: {{ quote .displayName }}
  {{- end }}
  header: {{ default "Other" .header }}
{{- end}}
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
      {{- $nucleotideSequences := .nucleotideSequences | default (list "main")}}
      organismName: {{ quote .organismName }}
      metadata:
        {{- $args := dict "metadata" (include "loculus.patchMetadataSchema" . | fromYaml).metadata "nucleotideSequences" $nucleotideSequences}}
        {{ $metadata := include "loculus.generateBackendMetadata" $args | fromYaml }}
        {{ $metadata.fields | toYaml | nindent 8 }}
      externalMetadata:
        {{- $args := dict "metadata" (include "loculus.patchMetadataSchema" . | fromYaml).metadata "nucleotideSequences" $nucleotideSequences}}
        {{ $metadata := include "loculus.generateBackendExternalMetadata" $args | fromYaml }}
        {{ $metadata.fields | default list | toYaml | nindent 8 }}
      {{- end }}
    referenceGenomes:
      {{ $referenceGenomes:= include "loculus.generateReferenceGenome" $instance.referenceGenomes | fromYaml }}
      {{ $referenceGenomes | toYaml |nindent 8}}
  {{- end }}
{{- end }}

{{- define "loculus.generateReferenceGenome" }}
nucleotideSequences:
  {{ $nucleotideSequences := include "loculus.generateSequences" .nucleotideSequences | fromYaml }}
  {{ $nucleotideSequences.fields | toYaml | nindent 8 }}
genes:
  {{ $genes := include "loculus.generateSequences" .genes | fromYaml }}
  {{ $genes.fields | toYaml | nindent 8 }}
{{- end }}

{{- define "loculus.generateSequences" }}
{{- $sequences := . }}
fields:
  {{- range $sequence := $sequences }}
    - name: {{ printf "%s" $sequence.name | quote}}
      sequence: {{ printf "%s" $sequence.sequence | quote }}
  {{- end }}
{{- end }}

{{/* Generate backend metadata from passed metadata array */}}
{{- define "loculus.generateBackendMetadata" }}
fields:
{{- $metadataList := .metadata }}
{{- $segments := .nucleotideSequences }}
{{- $is_segmented := gt (len $segments) 1 }}
{{- range $metadataList }}
{{- $currentItem := . }}
{{- if and $is_segmented .perSegment }}
{{- range $segment := $segments }}
{{- with $currentItem }}
  - name: {{ printf "%s_%s" .name $segment | quote }}
    type: {{ .type | default "string" | quote }}
{{- end }}
{{- end}}
{{- else }}
  - name: {{ quote .name }}
    type: {{ .type | default "string" | quote }}
{{- end}}
{{- end}}
{{- end}}

{{/* Generate backend metadata from passed metadata array */}}
{{- define "loculus.generateBackendExternalMetadata" }}
fields:
{{- $metadataList := .metadata }}
{{- $segments := .nucleotideSequences }}
{{- $is_segmented := gt (len $segments) 1 }}
{{- range $metadataList }}
{{- $currentItem := . }}
{{- if eq .header "INSDC" }}
{{- if and $is_segmented .perSegment }}
{{- range $segment := $segments }}
{{- with $currentItem }}
  - name: {{ printf "%s_%s" .name $segment | quote }}
    type: {{ .type | default "string" | quote }}
    {{- if .required }}
    required: {{ .required }}
    {{- end }}
    externalMetadataUpdater: "ena"
{{- end }}
{{- end}}
{{- else }}
  - name: {{ quote .name }}
    type: {{ .type | default "string" | quote }}
    {{- if .required }}
    required: {{ .required }}
    {{- end }}
    externalMetadataUpdater: "ena"
{{- end}}
{{- end}}
{{- end}}
{{- end}}

{{- define "loculus.publicRuntimeConfig" }}
            {{- if $.Values.codespaceName }}
            "backendUrl": "https://{{ .Values.codespaceName }}-8079.app.github.dev",
            {{- else if eq $.Values.environment "server" }}
            "backendUrl": "https://{{ printf "backend%s%s" .Values.subdomainSeparator .Values.host }}",
            {{- else }}
            "backendUrl": "http://localhost:8079",
            {{- end }}
            "lapisUrls": {{- include "loculus.generateExternalLapisUrls" .externalLapisUrlConfig | fromYaml | toJson }},
            "keycloakUrl":  "https://{{ (printf "authentication%s%s" $.Values.subdomainSeparator $.Values.host) }}"
{{- end }}


{{/* Generate ENA submission config from passed config object */}}
{{- define "loculus.generateENASubmissionConfig" }}
organisms:
  {{- range $key, $instance := (.Values.organisms | default .Values.defaultOrganisms) }}
  {{- if $instance.ingest }}
  {{ $key }}:
    {{- with $instance.schema }}
    {{- $nucleotideSequences := .nucleotideSequences | default (list "main")}}
    ingest: {{- $instance.ingest.configFile | toYaml | nindent 8 }}
    organismName: {{ quote .organismName }}
    externalMetadata:
      {{- $args := dict "metadata" (include "loculus.patchMetadataSchema" . | fromYaml).metadata "nucleotideSequences" $nucleotideSequences}}
      {{ $metadata := include "loculus.generateBackendExternalMetadata" $args | fromYaml }}
      {{ $metadata.fields | default list | toYaml | nindent 8 }}
    {{- end }}
  {{- end }}
  {{- end }}
{{- end }}