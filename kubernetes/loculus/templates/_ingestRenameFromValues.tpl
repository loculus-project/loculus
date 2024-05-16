{{- define "my-library-chart.ingestRename" -}}
{{- $data := .Values }}
{{- $metadata := index $data.defaultOrganisms "ebola-zaire" "schema" "metadata" }}
{{- $ingestRename := dict }}
{{- /* Create ingestRename dictionary */}}
{{- range $field := $metadata }}
  {{- if hasKey $field "ingest" }}
    {{- $_ := set $ingestRename (index $field "ingest") (index $field "name") }}
  {{- end }}
{{- end }}
{{- $output := dict "ingestRename" $ingestRename }}
{{- toYaml $output | nindent 4 }}
{{- end -}}