{{- define "loculus.preprocessingSpecs" -}}
{{- $metadata := .metadata }}
{{- $use_segments := .segmented }}
{{- $specs := dict }}

{{- range $field := $metadata }}
{{- $name := index $field "name" }}
{{- $spec := dict "function" "identity" "inputs" (dict "input" $name) }}

{{- $args := dict }}
{{- if hasKey $field "type" }}
  {{- $type := index $field "type" }}
  {{- $args := set $args "type" $type }}
{{- end }}

{{- if and $use_segments (hasKey $field "segmented") }}
  {{- $segmented := index $field "segmented" }}
  {{- if eq $segmented true }}
    {{- $args := set $args "segmented" true }}
  {{- end }}
{{- end }}

{{- if ne (len $args) 0 }}
  {{- $_ := set $spec "args" $args }}
{{- end }}

{{- if hasKey $field "preprocessing" }}
  {{- $preprocessing := index $field "preprocessing" }}
  {{- if eq (typeOf $preprocessing) "string" }}
    {{- $_ := set $spec "inputs" (dict "input" $preprocessing) }}
  {{- else }}
    {{- if hasKey $preprocessing "function" }}
      {{- $_ := set $spec "function" (index $preprocessing "function") }}
    {{- end }}
    {{- if hasKey $preprocessing "args" }}
      {{- $_ := set $spec "args" (index $preprocessing "args") }}
    {{- end }}
    {{- if hasKey $preprocessing "inputs" }}
      {{- $_ := set $spec "inputs" (index $preprocessing "inputs") }}
    {{- end }}
  {{- end }}
{{- end }}

{{- $_ := set $specs $name $spec }}
{{- end }}

{{- toYaml $specs }}
{{- end -}}