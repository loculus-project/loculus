{{- define "loculus.resources" -}}
{{- $args := . -}}
{{- $containerName := index $args 0 -}}
{{- $values := index $args 1 -}}
{{- $organism := "" -}}
{{- if gt (len $args) 2 -}}
  {{- $organism = index $args 2 -}}
{{- end -}}

{{- if and $organism 
         $values.resources.organismSpecific 
         (index $values.resources.organismSpecific $organism) 
         (index (index $values.resources.organismSpecific $organism) $containerName) }}
resources:
{{ toYaml (index (index $values.resources.organismSpecific $organism) $containerName) | indent 2 }}
{{- else if and $values.resources (index $values.resources $containerName) }}
resources:
{{ toYaml (index $values.resources $containerName) | indent 2 }}
{{- else if $values.defaultResources }}
resources:
{{ toYaml $values.defaultResources | indent 2 }}
{{- end }}
{{- end }}
