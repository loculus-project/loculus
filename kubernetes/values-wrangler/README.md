# Values Wrangler Script

Takes in a yaml file and outputs a processed yaml file

Turns the following:

```yaml
schema:
  metadata:
    - name: collection_date
      displayName: Collection date
      type: date
      required: true
      initiallyVisible: true
      header: Sample details
      inputGuidance: "Lorem"
    - name: ncbi_release_date
      displayName: NCBI release date
      type: date
      header: "INSDC"
      input: false
    - name: country
      type: string
      required: true
      generateIndex: true
      autocomplete: true
      initiallyVisible: true
      header: Sample details
      inputGuidance: "Lorem"
      inputExample: "Ipsum"
    - name: total_unknown_nucs
      type: int
      header: "Alignment states and QC metrics"
      input: false # Generated without submitter
    - name: speciment_collector_sample_id
      displayName: Specimen Collector Sample Id
      type: string
      header: Sample details
      ingest: ncbi_isolate_name
extraInputFields:
  - name: submissionId
    displayName: Submission ID
    definition: FASTA ID
    guidance: Used to match the sequence(s) to the metadata
    position: first
```

And outputs the following files

inputFields.yaml

```yaml
- name: collection_date
  displayName: Collection date
  inputGuidance: "Lorem"
- name: country
  displayName: Country
  inputGuidance: "Lorem"
  inputExample: "Ipsum"
- name: speciment_collector_sample_id
  displayName: Specimen Collector Sample Id
```
