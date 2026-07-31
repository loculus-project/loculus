{{- define "loculus.podSecurityContext" -}}
{{- $args := . -}}
{{- $componentName := index $args 0 -}}
{{- $values := index $args 1 -}}

{{- if and $values.podSecurityContext (index $values.podSecurityContext $componentName) }}
securityContext:
{{ toYaml (index $values.podSecurityContext $componentName) | indent 2 }}
{{- else if and $values.podSecurityContext $values.podSecurityContext.default }}
securityContext:
{{ toYaml $values.podSecurityContext.default | indent 2 }}
{{- end }}
{{- end }}

{{- define "loculus.containerSecurityContext" -}}
{{- $args := . -}}
{{- $componentName := index $args 0 -}}
{{- $values := index $args 1 -}}

{{- if and $values.containerSecurityContext (index $values.containerSecurityContext $componentName) }}
securityContext:
{{ toYaml (index $values.containerSecurityContext $componentName) | indent 2 }}
{{- else if and $values.containerSecurityContext $values.containerSecurityContext.default }}
securityContext:
{{ toYaml $values.containerSecurityContext.default | indent 2 }}
{{- end }}
{{- end }}