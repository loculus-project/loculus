{{- define "loculus.enabledOrganisms" -}}
{{- $enabled := dict -}}
{{- range $key, $organism := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- if ne ($organism.enabled | default true) false -}}
{{- $_ := set $enabled $key $organism -}}
{{- end -}}
{{- end -}}
{{- $enabled | toJson -}}
{{- end -}}
