{{- define "loculus.siloDatabaseShared" -}}
{{- $type := default "string" .type -}}
- type: {{ ($type | eq "timestamp") | ternary "int" (($type | eq "authors") | ternary "string" $type) }}
  {{- if .generateIndex }}
  generateIndex: {{ .generateIndex }}
  {{- end }}
  {{- if (eq .enableRegex true) }}
  lapisAllowsRegexSearch: true
  {{- end }}
{{- end }}


{{- define "loculus.siloDatabaseConfig" }}
schema:
  {{- $segments := .nucleotideSequences | default (list "main")}}
  {{- $is_segmented := gt (len $segments) 1 }}
  instanceName: {{ .organismName }}
  opennessLevel: OPEN
  metadata:
  {{- range (concat .commonMetadata .metadata) }}
  {{- $currentItem := . }}
  {{- if and $is_segmented .perSegment }}
    {{- range $segment := $segments }}
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
  primaryKey: accessionVersion
{{ if .silo}}
  {{- .silo | toYaml | nindent 2 }}
{{ end }}
{{- end }}
