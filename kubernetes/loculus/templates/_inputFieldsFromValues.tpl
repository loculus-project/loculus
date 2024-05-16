{{- define "my-library-chart.inputFields" -}}
{{- $data := .Values }}
{{- $metadata := index $data.defaultOrganisms "ebola-zaire" "schema" "metadata" }}
{{- $extraFields := index $data.defaultOrganisms "ebola-zaire" "extraInputFields" }}
{{- $TO_KEEP := list "name" "displayName" "definition" "guidance" }}

{{- $fieldsDict := dict }}
{{- $index := 0 }}

{{- /* Add fields with position "first" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "first" }}
    {{- $_ := set $fieldsDict (printf "%d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add filtered metadata fields to the dict */}}
{{- range $field := $metadata }}
  {{- if not (hasKey $field "noInput") }}
    {{- $toAdd := dict }}
    {{- range $k, $v := $field }}
      {{- if has $k $TO_KEEP }}
        {{- $_ := set $toAdd $k $v }}
      {{- end }}
    {{- end }}
    {{- $_ := set $fieldsDict (printf "%d" $index) $toAdd }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add fields with position "last" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "last" }}
    {{- $_ := set $fieldsDict (printf "%d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- $inputFields := values $fieldsDict }}
{{- $output := dict "inputFields" $inputFields }}
{{- toYaml $output | nindent 4 }}
{{- end -}}