{{- define "loculus.backendUrl" }}
{{- $publicRuntimeConfig := (($.Values.website).runtimeConfig).public }}
{{- if $publicRuntimeConfig.backendUrl }}
{{ $publicRuntimeConfig.backendUrl }}
{{- else if eq $.Values.environment "server" }}
https://{{ printf "backend%s%s" $.Values.subdomainSeparator $.Values.host }}
{{- else }}
http://localhost:8079
{{- end }}
{{- end }}
