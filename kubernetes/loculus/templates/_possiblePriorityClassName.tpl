{{- define "possiblePriorityClassName" -}}
{{- if hasKey .Values "podPriorityValue" }}
priorityClassName: {{ .Release.Namespace }}
{{- end -}}
{{- end -}}
