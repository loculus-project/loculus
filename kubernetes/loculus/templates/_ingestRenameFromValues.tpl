{{- define "loculus.ingestRename" -}}
{{- $metadata := . }}
{{- $ingestRename := dict }}
{{- range $field := $metadata }}
  {{- if hasKey $field "ingest" }}
    {{- $_ := set $ingestRename (index $field "ingest") (index $field "name") }}
  {{- end }}
{{- end }}
{{- $output := dict "rename" $ingestRename }}
{{- toYaml $output }}
{{- end -}}