{{/*
Pod scheduling configuration (nodeSelector, tolerations, affinity).
Allows pods to be scheduled on specific node pools with custom taints.
*/}}
{{- define "loculus.podScheduling" -}}
{{- if .Values.podScheduling.nodeSelector }}
nodeSelector:
{{- toYaml .Values.podScheduling.nodeSelector | nindent 2 }}
{{- end }}
{{- if .Values.podScheduling.tolerations }}
tolerations:
{{- toYaml .Values.podScheduling.tolerations | nindent 2 }}
{{- end }}
{{- if .Values.podScheduling.affinity }}
affinity:
{{- toYaml .Values.podScheduling.affinity | nindent 2 }}
{{- end }}
{{- end -}}
