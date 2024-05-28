{{- define "loculus.preprocessingSpecs" -}}

{{- $metadata := .metadata }}
{{- $use_segments := .segmented }}
{{- $segments := .nucleotideSequences}}

{{- range $metadata }}
{{- $currentItem := . }}
{{- if and $use_segments .segmented }}
{{- range $segment := $segments }}
{{ printf "%s_%s :" $currentItem.name $segment}}
  {{- if $currentItem.type }}
  args:
    type: {{ $currentItem.type }}
  {{- end }}
  {{- if $currentItem.preprocessing }}
  {{- if hasKey $currentItem.preprocessing "function" }}
  function: {{ index $currentItem.preprocessing "function" }}
  {{- else }}
  function: identity
  {{- end }}
  {{- if hasKey $currentItem.preprocessing "inputs" }}
  inputs: 
    {{- with index $currentItem.preprocessing "inputs" }}
    {{- . | toYaml | nindent 4 }}
    {{- end }}
  {{- end }}
  {{- else }}
  function: identity
  inputs: 
    input: {{ printf "%s_%s" $currentItem.name $segment }}
  {{- end }}
{{- end}}

{{- else }}
{{ printf "%s :" .name }}
  {{- if .type }}
  args:
    type: {{ .type }}
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
    {{- . | toYaml | nindent 4 }}
    {{- end }}
  {{- end }}
  {{- else }}
  function: identity
  inputs: 
    input: {{ .name }}
  {{- end }}
  {{- end }}

{{- end }}
{{- end }}
