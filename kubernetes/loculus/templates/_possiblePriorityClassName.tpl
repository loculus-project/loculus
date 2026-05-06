{{- define "possiblePriorityClassName" -}}
{{- if hasKey .Values "podPriorityValue" }}
priorityClassName: {{ .Release.Namespace }}-priority
{{- end -}}
{{- end -}}
