{{- define "loculus.submissionDataTypes" -}}
submissionDataTypes:
  {{- if (hasKey . "submissionDataTypes") }}
  {{- with .submissionDataTypes }}
  consensusSequences: {{ (hasKey . "consensusSequences") | ternary .consensusSequences "true" }}
  rawReads: {{ (hasKey . "rawReads") | ternary .rawReads "false" }}
  {{- end }}
  {{- else }}
  consensusSequences: true
  rawReads: false
  {{- end}}
{{- end }}
