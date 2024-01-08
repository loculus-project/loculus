{{- define "loculus.dockerTag" }}
{{- if .sha }}
{{- printf "commit-%v" .sha }}
{{- else }}
{{- $dockerTag := (eq (.branch | default "main") "main") | ternary "latest" .branch -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}
{{- end }}
