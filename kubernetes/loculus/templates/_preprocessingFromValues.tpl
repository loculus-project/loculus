{{- define "loculus.sharedPreproSpecs" }}
{{ .key }}:
  {{- if .preprocessing }}
  {{- if hasKey .preprocessing "function" }}
  function: {{ index .preprocessing "function" }}
  {{- else }}
  function: identity
  {{- end }}
  {{- if hasKey .preprocessing "inputs" }}
  inputs:
    {{- with index .preprocessing "inputs" }}
    {{- . | toYaml | nindent 4 }}
    {{- end }}
  {{- end }}
  args:
    {{- if .segment }}
    segment: {{ .segment }}
    {{- end }}
    {{- if .type }}
    type: {{ .type }}
    {{- end }}
    {{- with (get .preprocessing "args") }}
    {{ toYaml . | nindent 4 }}
    {{- end }}
  {{- else }}
  function: identity
  inputs:
    {{- if .segment }}
    input: {{ printf "%s_%s" .name .segment }}
    {{- else }}
    input: {{ .name }}
    {{- end }}
  args:
    {{- if .segment }}
    segment: {{ .segment }}
    {{- end }}
    {{- if .type }}
    type: {{ .type }}
    {{- end }}
  {{- end }}
  {{- if .required}}
  required: true
  {{- end }}
{{- end }}

{{- define "loculus.preprocessingSpecs" -}}
{{- $metadata := .metadata }}
{{- $segments := .nucleotideSequences}}
{{- $is_segmented := gt (len $segments) 1 }}
{{- range $metadata }}
{{- $currentItem := . }}
{{- if and $is_segmented .perSegment }}
{{- range $segment := $segments }}
{{- with $currentItem }}
{{- $args := deepCopy . | merge (dict "segment" $segment "key" (printf "%s_%s" .name $segment)) }}
{{- include "loculus.sharedPreproSpecs" $args }}
{{- end }}
{{- end }}
{{- else }}
{{- $args := deepCopy . | merge (dict "segment" "" "key" .name) }}
{{- include "loculus.sharedPreproSpecs" $args }}
{{- end }}
{{- end }}
{{- end }}