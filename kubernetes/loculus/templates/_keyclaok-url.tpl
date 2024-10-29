{{- define "loculus.keycloakUrl" -}}
{{- $publicRuntimeConfig := (($.Values.website).runtimeConfig).public }}
  {{- if $publicRuntimeConfig.keycloakUrl }}
    {{- $publicRuntimeConfig.keycloakUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://authentication%s%s" $.Values.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- "http://localhost:8083" -}}
  {{- end -}}
{{- end -}}
