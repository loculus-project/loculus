{{/*
Pod scheduling configuration (nodeSelector, tolerations, affinity).
Allows pods to be scheduled on specific node pools with custom taints.
*/}}
{{- define "loculus.podScheduling" -}}
{{- if .Values.nodeSelector }}
nodeSelector:
{{ toYaml .Values.nodeSelector | indent 2 }}
{{- end }}
{{- if .Values.tolerations }}
tolerations:
{{ toYaml .Values.tolerations | indent 2 }}
{{- end }}
{{- if .Values.affinity }}
affinity:
{{ toYaml .Values.affinity | indent 2 }}
{{- end }}
{{- end -}}
