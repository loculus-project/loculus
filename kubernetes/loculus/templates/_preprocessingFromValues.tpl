{{- define "my-library-chart.specs" -}}
{{- $data := .Values }}
{{- $metadata := index $data.defaultOrganisms "ebola-zaire" "schema" "metadata" }}
{{- $specs := dict }}

{{- range $field := $metadata }}
{{- $name := index $field "name" }}
{{- $spec := dict "function" "identity" "inputs" (dict "input" $name) }}

{{- if hasKey $field "type" }}
  {{- $type := index $field "type" }}
  {{- if eq $type "int" }}
    {{- $_ := set $spec "args" (dict "type" "int") }}
  {{- else if eq $type "float" }}
    {{- $_ := set $spec "args" (dict "type" "float") }}
  {{- end }}
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

{{- $output := dict "specs" $specs }}
{{- toYaml $output | nindent 4 }}
{{- end -}}