{{- define "loculus.sharedPreproSpecs" -}}
args:
  {{- if .segment }}
  segment: {{ .segment }}
  {{- end }}
  {{- if .type }}
  type: {{ .type }}
  {{- end }}
  {{- if .noInput }}
  no_warn: {{ .noInput }}
  {{- end }}
{{- if .preprocessing }}
{{- if hasKey .preprocessing "function" }}
function: {{ index .preprocessing "function" }}
{{- else }}
function: identity
{{- end }}
{{- if hasKey .preprocessing "inputs" }}
inputs:
  {{- with index .preprocessing "inputs" }}
  {{- . | toYaml | nindent 2 }}
  {{- end }}
{{- end }}
{{- else }}
function: identity
inputs:
  {{- if .segment }}
  input: {{ printf "%s_%s" .name .segment }}
  {{- else }}
  input: {{ .name }}
  {{- end }}
{{- end }}
{{- end }}

{{- define "loculus.preprocessingSpecs" -}}
{{- $metadata := .metadata }}
{{- $segments := .nucleotideSequences}}
{{- $use_segments := false }} # Default to false
{{- $is_segmented := gt (len $segments) 1 }}

{{- range $metadata }}
{{- $currentItem := . }}
{{- if and $is_segmented .perSegment }}
{{- range $segment := $segments }}
{{- $args := deepCopy $currentItem | merge (dict "segment" $segment) }}
{{ printf "%s_%s:" $currentItem.name $segment}}
{{- include "loculus.sharedPreproSpecs" $args | nindent 2 }}
{{- end }}
{{- else }}
{{- $args := deepCopy $currentItem | merge (dict "segment" "") }}
{{ printf "%s:" .name }}
{{- include "loculus.sharedPreproSpecs" $args | nindent 2 }}
{{- end }}
{{- end }}

{{- end }}