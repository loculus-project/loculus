{{- define "loculus.enabledOrganisms" -}}
{{- $allOrganisms := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- $enabledList := list -}}
{{- range $key := (keys $allOrganisms | sortAlpha) -}}
  {{- $organism := get $allOrganisms $key -}}
  {{- if ne $organism.enabled false -}}
    {{- $organismWithKey := dict "name" $key -}}
    {{- range $k, $v := $organism -}}
       {{- $_ := set $organismWithKey $k $v -}}
    {{- end -}}
    {{- $enabledList = append $enabledList $organismWithKey -}}
  {{- end -}}
{{- end -}}
{{- dict "organisms" $enabledList | toJson -}}
{{- end -}}