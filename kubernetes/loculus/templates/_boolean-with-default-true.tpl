{{/* "default true" can't be used, because "false | default true" will be true (but we would need the result false) */}}
{{- define "loculus.booleanWithDefaultTrue" -}}
{{ eq . false | ternary false true }}
{{- end -}}
