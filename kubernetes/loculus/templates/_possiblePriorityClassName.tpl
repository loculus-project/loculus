{{- define "possiblePriorityClassName" -}}
{{- if .Values.priorityClassName }}
priorityClassName: {{ .Values.priorityClassName }}
{{- end -}}
{{- end -}}
