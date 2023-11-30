{{- define "pathoplexus.dockerTag" }}
{{- if .sha }}
commit-{{- .sha }}
{{- else }}
{{- $dockerTag := (eq (.branch | default "main") "main") | ternary "latest" .branch -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}
{{- end }}
