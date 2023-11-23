{{/* generates LAPIS urls from given config object */}}
{{ define "pathoplexus.generateLapisUrls"}}
{{ range $key, $_ := .instances }}
"{{ $key -}}": "http://{{ template "pathoplexus.lapisServiceName" $key }}:8080"
{{ end }}
{{ end }}

{{/* generates the LAPIS service name for a given organism key */}}
{{- define "pathoplexus.lapisServiceName"}}
{{- printf "pathoplexus-lapis-service-%s" . }}
{{- end }}
