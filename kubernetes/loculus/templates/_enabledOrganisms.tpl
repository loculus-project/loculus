{{- define "loculus.enabledOrganisms" -}}
{{- $allOrganisms := (.Values.organisms | default .Values.defaultOrganisms) -}}
{{- $enabledList := list -}}
{{- range $key := (keys $allOrganisms | sortAlpha) -}}
  {{- $organism := get $allOrganisms $key -}}
  {{- if ne $organism.enabled false -}}
{{- /*
    Organism keys are substituted verbatim into `metadata.name` of many per-organism
    resources (ConfigMaps, Deployments, Services, CronJobs, ingress middleware), so each
    key must be a valid RFC 1123 DNS label.
*/ -}}
    {{- if not (regexMatch "^[a-z0-9]([-a-z0-9]*[a-z0-9])?$" $key) -}}
      {{- fail (printf "Invalid organism key %q: organism keys must be a lower-case RFC 1123 DNS label (lower-case alphanumeric characters or '-', starting and ending with an alphanumeric character, e.g. 'chikungunya'). Rename this key in your organism config." $key) -}}
    {{- end -}}
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
