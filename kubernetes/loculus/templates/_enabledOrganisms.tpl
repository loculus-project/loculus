{{- define "loculus.enabledOrganisms" -}}
{{- $allOrganisms := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- $enabledList := list -}}
{{- range $key := (keys $allOrganisms | sortAlpha) -}}
  {{- $organism := get $allOrganisms $key -}}
  {{- if ne $organism.enabled false -}}
{{- $enabledList = append $enabledList (dict "key" $key "contents" $organism) -}}
  {{- end -}}
{{- end -}}
{{- /*
    Helm's `fromJson` function (used in consuming templates) expects a single top-level object
    when parsing the JSON output. Wrapping the list of enabled organisms in a dictionary
    under the key "organisms" ensures `fromJson` can parse it correctly, which then allows
    consuming templates to access the list via `.organisms`.
*/ -}}
{{- dict "organisms" $enabledList | toJson -}}
{{- end -}}
