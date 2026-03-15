{{- define "loculus.siloDatabaseShared" -}}
{{- $type := default "string" .type -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if .generateIndex }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if .lineageSystem }}
  generateIndex: true
  generateLineageIndex: {{ .lineageSystem }} {{- /* must match the file name in the lineageDefinitionFilenames */}}
  {{- end }}
{{- end }}


{{- define "loculus.siloDatabaseConfig" }}
{{- $schema := .schema }}
{{- $rawUniqueSegments := (include "loculus.getNucleotideSegmentNames" .referenceGenomes | fromYaml).segments }}
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
