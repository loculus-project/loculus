{{- define "pathoplexus.dockerTag" }}
{{- if .sha }}
{{- print "commit-sha" }}
{{- else }}
{{- $dockerTag := (eq (.branch | default "main") "main") | ternary "latest" .branch -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}
{{- end }}
