{{/* generates internal LAPIS urls from given config object */}}
{{ define "pathoplexus.generateInternalLapisUrls"}}
{{ range $key, $_ := .instances }}
"{{ $key -}}": "http://{{ template "pathoplexus.lapisServiceName" $key }}:8080"
{{ end }}
{{ end }}

{{/* generates external LAPIS urls from { config, host } */}}
{{ define "pathoplexus.generateExternalLapisUrls"}}
{{ $host := .host }}
{{ range $key, $_ := .config.instances }}
"{{ $key -}}": "{{ $host }}/{{ $key }}"
{{ end }}
{{ end }}

{{/* generates the LAPIS service name for a given organism key */}}
{{- define "pathoplexus.lapisServiceName"}}
{{- printf "pathoplexus-lapis-service-%s" . }}
{{- end }}
