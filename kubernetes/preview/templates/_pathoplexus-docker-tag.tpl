{{- define "pathoplexus.dockerTag" }}
{{- if .Values.sha }}
{{- print "commit-sha" }}
{{- else }}
{{- $dockerTag := (eq (. | default "main") "main") | ternary "latest" . -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}
{{- end }}
