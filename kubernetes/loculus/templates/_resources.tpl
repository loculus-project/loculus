{{- define "loculus.resources" -}}
{{- $args := . -}}
{{- $containerName := index $args 0 -}}
{{- $values := index $args 1 -}}
{{- if and $values.resources (index $values.resources $containerName) }}
resources:
{{ toYaml (index $values.resources $containerName) | indent 2 }}
{{- else if $values.defaultResources }}
resources:
{{ toYaml $values.defaultResources | indent 2 }}
{{- end }}
{{- end }}
