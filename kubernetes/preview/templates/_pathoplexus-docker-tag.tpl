{{- define "pathoplexus.dockerTag" }}
{{- $dockerTag := (eq (. | default "main") "main") | ternary "latest" . -}}
{{- regexReplaceAll "/" $dockerTag "-" }}
{{- end }}