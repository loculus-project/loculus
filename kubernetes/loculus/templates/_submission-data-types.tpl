{{- define "loculus.submissionDataTypes" -}}
submissionDataTypes:
  {{- if (hasKey . "submissionDataTypes") }}
  {{- with .submissionDataTypes }}
  consensusSequences: {{ (hasKey . "consensusSequences") | ternary .consensusSequences "true" }}
  alignedNucleotideSequences: {{ (hasKey . "alignedNucleotideSequences") | ternary .alignedNucleotideSequences "true" }}
  {{- if (hasKey . "maxSequencesPerEntry") }}
  maxSequencesPerEntry: {{ .maxSequencesPerEntry }}
  {{- end }}
  {{- if (hasKey . "files") }}
  files: {{ .files | toJson }}
  {{- end }}
  {{- end }}
  {{- else }}
  consensusSequences: true
  alignedNucleotideSequences: true
  {{- end }}
{{- end }}
