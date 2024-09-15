{{- define "loculus.resources" -}}
{{- $args := . -}}
{{- $containerName := index $args 0 -}}
{{- $values := index $args 1 -}}
{{- $resources := index $values.resources $containerName }}
{{- if $resources }}
  resources:
{{ toYaml $resources | indent 6 }}
{{- else }}
  resources:
{{ toYaml $values.defaultResources | indent 6 }}
{{- end }}
{{- end }}