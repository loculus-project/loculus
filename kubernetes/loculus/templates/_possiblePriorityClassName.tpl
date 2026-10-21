{{- define "possiblePriorityClassName" -}}
{{- if hasKey .Values.podScheduling "podPriorityValue" }}
priorityClassName: {{ .Release.Namespace }}-priority
{{- end -}}
{{- end -}}
