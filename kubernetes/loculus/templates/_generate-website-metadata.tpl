{{/* Generate website metadata from passed metadata array */}}
{{- define "loculus.generateWebsiteMetadata" }}
fields:
{{- range . }}
  - name: {{ .name }}
    type: {{ .type }}
    {{- if .autocomplete }}
    autocomplete: {{ .autocomplete }}
    {{- end }}
    {{- if .notSearchable }}
    notSearchable: {{ .notSearchable }}
    {{- end }}
    {{- if .displayName }}
    displayName: {{ .displayName }}
    {{- end }}
    {{- if .truncateColumnDisplayTo }}
    truncateColumnDisplayTo: {{ .truncateColumnDisplayTo }}
    {{- end }}
    {{- if .customDisplay }}
    customDisplay:
      type: {{ .customDisplay.type }}
      url: {{ .customDisplay.url }}
    {{- end }}
{{- end}}
{{- end}}