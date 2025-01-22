{{- define "loculus.submissionDataTypes" -}}
submissionDataTypes:
  {{- if (hasKey . "submissionDataTypes") }}
  {{- with .submissionDataTypes }}
  consensusSequences: {{ (hasKey . "consensusSequences") | ternary .consensusSequences "true" }}
  {{- end }}
  {{- else }}
  consensusSequences: true
  {{- end}}
{{- end }}
