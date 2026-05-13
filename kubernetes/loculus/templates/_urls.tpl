{{- define "loculus.backendUrl" -}}
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.backendUrl }}
    {{- $publicRuntimeConfig.backendUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://backend%s%s" $.Values.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8079" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{- define "loculus.websiteUrl" -}}
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.websiteUrl }}
    {{- $publicRuntimeConfig.websiteUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://%s" $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:3000" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{- define "loculus.s3Url" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- if eq $.Values.environment "server" -}}
        {{- (printf "https://s3%s%s" $.Values.subdomainSeparator $.Values.host) -}}
    {{- else -}}
        {{- printf "http://%s:8084" $.Values.localHost -}}
    {{- end -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}

{{- define "loculus.s3UrlInternal" -}}
  {{- if $.Values.runDevelopmentS3 }}
    {{- "http://loculus-minio-service:8084" -}}
  {{- else -}}
    {{- $.Values.s3.bucket.endpoint }}
  {{- end -}}
{{- end -}}

{{- define "loculus.keycloakUrl" -}}
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.keycloakUrl }}
    {{- $publicRuntimeConfig.keycloakUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- (printf "https://authentication%s%s" $.Values.subdomainSeparator $.Values.host) -}}
  {{- else -}}
    {{- printf "http://%s:8083" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{/* internal query-service base URL (used by website server-side calls) */}}
{{- define "loculus.queryServiceUrlInternal" -}}
  {{- if not $.Values.disableWebsite -}}
    http://loculus-query-service:8080
  {{- else -}}
    http://{{ $.Values.localHost }}:8080
  {{- end -}}
{{- end -}}

{{/* public query-service base URL (used by browser, CLI, external API users) */}}
{{- define "loculus.queryServiceUrlPublic" -}}
{{- $publicRuntimeConfig := $.Values.public }}
  {{- if $publicRuntimeConfig.queryServiceUrl -}}
    {{- $publicRuntimeConfig.queryServiceUrl -}}
  {{- else if eq $.Values.environment "server" -}}
    {{- printf "https://lapis%s%s" $.Values.subdomainSeparator $.Values.host -}}
  {{- else -}}
    {{- printf "http://%s:8080" $.Values.localHost -}}
  {{- end -}}
{{- end -}}

{{/* generates the LAPIS service name for a given organism key */}}
{{- define "loculus.lapisServiceName"}}
{{- printf "loculus-lapis-service-%s" . }}
{{- end }}
