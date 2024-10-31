{{- define "loculus.inputFields" -}}
{{- $data := . }}
{{- $metadata := $data.metadata }}
{{- $extraFields := append $data.extraInputFields (dict "name" "versionComment" "displayName" "Version comment" "position" "last") }}
{{- $TO_KEEP := list "name" "displayName" "definition" "guidance" "example" "required" "noEdit"}}


{{- $fieldsDict := dict }}
{{- $index := 0 }}

{{- /* Add fields with position "first" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "first" }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add filtered metadata fields to the dict */}}
{{- range $field := $metadata }}
  {{- if not (hasKey $field "noInput") }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Add fields with position "last" to the dict */}}
{{- range $field := $extraFields }}
  {{- if eq $field.position "last" }}
    {{- $_ := set $fieldsDict (printf "%03d" $index) $field }}
    {{- $index = add $index 1 }}
  {{- end }}
{{- end }}

{{- /* Iterate over sorted index to get list of values (sorted by key) */}}
{{- $inputFields := list }}
{{- range $k:= keys $fieldsDict | sortAlpha }}
  {{- $toAdd := dict }}
  {{- range $k, $v := (index $fieldsDict $k) }}
    {{- if has $k $TO_KEEP }}
      {{- $_ := set $toAdd $k $v }}
    {{- end }}
  {{- end }}
  {{- $inputFields = append $inputFields $toAdd }}
{{- end }}

{{- $inputFields = append $inputFields "versionComment" }}
{{- toYaml $inputFields }}
{{- end -}}
