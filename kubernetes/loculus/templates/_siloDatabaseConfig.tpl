{{- define "loculus.siloDatabaseShared" -}}
{{- $type := default "string" .type -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if .generateIndex }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if .lineageSystem }}
  generateIndex: true
  generateLineageIndex: true
  {{- end }}
{{- end }}

{{- /* SILO 0.9.x specific version with filename for generateLineageIndex */ -}}
{{- define "loculus.siloDatabaseSharedForSilo" -}}
{{- $type := default "string" .type -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if .generateIndex }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if .lineageSystem }}
  generateIndex: true
  generateLineageIndex: lineage_definitions.yaml
  {{- end }}
{{- end }}


{{- define "loculus.siloDatabaseConfig" }}
{{- $schema := .schema }}
{{- $rawUniqueSegments := (include "loculus.extractUniqueRawNucleotideSequenceNames" .referenceGenomes | fromYaml).segments }}
{{- $isSegmented := gt (len $rawUniqueSegments) 1 }}
schema:
  instanceName: {{ $schema.organismName }}
  opennessLevel: OPEN
  metadata:
  {{- range (concat .commonMetadata $schema.metadata) }}
  {{- $currentItem := . }}
  {{- if and $isSegmented .perSegment }}
    {{- range $segment := $rawUniqueSegments }}
    {{- with $currentItem }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ printf "%s_%s" .name $segment | quote}}
    {{- end }}
    {{- end }}
  {{- else }}
    {{- include "loculus.siloDatabaseShared" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- end }}
  {{- if $schema.files }}
  {{- range $schema.files }}
    - type: string
      name: {{ .name }}
  {{- end }}
  {{- end }}
  primaryKey: accessionVersion
  features:
    - name: generalizedAdvancedQuery
{{- end }}

{{- /* SILO 0.9.x specific database config with filename for generateLineageIndex */ -}}
{{- define "loculus.siloDatabaseConfigForSilo" }}
{{- $schema := .schema }}
{{- $rawUniqueSegments := (include "loculus.extractUniqueRawNucleotideSequenceNames" .referenceGenomes | fromYaml).segments }}
{{- $isSegmented := gt (len $rawUniqueSegments) 1 }}
schema:
  instanceName: {{ $schema.organismName }}
  opennessLevel: OPEN
  metadata:
  {{- range (concat .commonMetadata $schema.metadata) }}
  {{- $currentItem := . }}
  {{- if and $isSegmented .perSegment }}
    {{- range $segment := $rawUniqueSegments }}
    {{- with $currentItem }}
    {{- include "loculus.siloDatabaseSharedForSilo" . | nindent 4 }}
      name: {{ printf "%s_%s" .name $segment | quote}}
    {{- end }}
    {{- end }}
  {{- else }}
    {{- include "loculus.siloDatabaseSharedForSilo" . | nindent 4 }}
      name: {{ .name }}
  {{- end }}
  {{- end }}
  {{- if $schema.files }}
  {{- range $schema.files }}
    - type: string
      name: {{ .name }}
  {{- end }}
  {{- end }}
  primaryKey: accessionVersion
  features:
    - name: generalizedAdvancedQuery
{{- end }}
