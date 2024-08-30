{{- define "possiblePriorityClassName" -}}
{{- if .Values.podPriorityClassName }}
priorityClassName: {{ .Values.podPriorityClassName }}
{{- end -}}
{{- end -}}
