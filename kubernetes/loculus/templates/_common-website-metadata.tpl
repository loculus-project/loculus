{{/* Get common metadata fields */}}
{{- define "loculus.commonMetadata" }}
fields:
  - name: accession
    type: string
    notSearchable: true
  - name: version
    type: int
    notSearchable: true
  - name: submissionId
    type: string
  - name: accessionVersion
    type: string
    notSearchable: true
  - name: isRevocation
    type: string
    notSearchable: true
  - name: submitter
    type: string
    generateIndex: true
    autocomplete: true
  - name: groupId
    type: int
    autocomplete: true
  - name: groupName
    type: string
    generateIndex: true
    autocomplete: true
  - name: submittedAt
    type: timestamp
  - name: releasedAt
    type: timestamp
  - name: dataUseTerms
    type: string
    generateIndex: true
    autocomplete: true
    customDisplay:
      type: dataUseTerms
  - name: versionStatus
    type: string
    notSearchable: true
  {{- if $.Values.dataUseTermsUrls }}
  - name: dataUseTermsUrl
    type: string
    notSearchable: true
  {{- end}}
{{- end}}
