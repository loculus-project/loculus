{{/*
Pod scheduling configuration (nodeSelector, tolerations, affinity).
Allows pods to be scheduled on specific node pools with custom taints.
*/}}
{{- define "loculus.podScheduling" -}}
{{- include "loculus.podSchedulingWithAffinity" (list . .Values.podScheduling.affinity) }}
{{- end -}}

{{/*
Same as loculus.podScheduling, with the affinity passed in: (list $ $affinity).
*/}}
{{- define "loculus.podSchedulingWithAffinity" -}}
{{- $affinity := index . 1 }}
{{- with index . 0 }}
{{- if .Values.podScheduling.nodeSelector }}
nodeSelector:
{{- toYaml .Values.podScheduling.nodeSelector | nindent 2 }}
{{- end }}
{{- if .Values.podScheduling.tolerations }}
tolerations:
{{- toYaml .Values.podScheduling.tolerations | nindent 2 }}
{{- end }}
{{- if $affinity }}
affinity:
{{- toYaml $affinity | nindent 2 }}
{{- end }}
{{- end }}
{{- end -}}
