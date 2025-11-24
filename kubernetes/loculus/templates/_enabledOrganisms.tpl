{{- define "loculus.enabledOrganisms" -}}
{{- $enabled := list -}}
{{- $source := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- range $key := sortAlpha (keys $source) -}}
{{- $organism := index $source $key -}}
{{- if ne $organism.enabled false -}}
{{- $entry := dict "key" $key "values" $organism -}}
{{- $enabled = append $enabled $entry -}}
{{- end -}}
{{- end -}}
{{- $enabled | toJson -}}
{{- end -}}
