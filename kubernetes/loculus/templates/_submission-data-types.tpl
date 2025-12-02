{{- define "loculus.submissionDataTypes" -}}
submissionDataTypes:
  {{- if (hasKey . "submissionDataTypes") }}
  {{- with .submissionDataTypes }}
  consensusSequences: {{ (hasKey . "consensusSequences") | ternary .consensusSequences "true" }}
  {{- if (hasKey . "maxSequencesPerEntry") }}
  maxSequencesPerEntry: {{ .maxSequencesPerEntry }}
  {{- end }}
  {{- if (hasKey . "files") }}
  files: {{ .files | toJson }}
  {{- end }}
  {{- end }}
  {{- else }}
  consensusSequences: true
  {{- end }}
{{- end }}
