# Raw Reads Processing Service

## Local development

Create an activate the micromamba environment using:

```sh
micromamba create -f environment.yml
micromamba activate loculus-raw-reads-processing
pip install -e .
```

Download validation jar using:

```sh
curl -L -o readtools.jar \
  https://github.com/loculus-project/readtools/releases/download/v1.0.0/readtools-2.15.1-all.jar
```

## How to configure the service

Preprocessing is currently configured to send raw read files to the `rawReadsProcessingService` and requires the `values.yaml` to contain:

```yaml
disableRawReadsProcessingService: false
rawReadsProcessingService:
  raw_reads_processing_service_url: http://loculus-raw-reads-processing:5000
```

Preprocessing receives original-data from the backend, the backend creates read-only presigned file URLs and the preprocessing service sends these on to the raw-reads-processing service.

## What this service does

The raw reads processing service is a small FastAPI app (`raw_reads_processing.api`) with one endpoint:
`POST /process-files` (`raw_reads_processing.functions.validate_raw_reads_submission`).

It receives a `RequestWithFiles` payload:

```json
{
  "files": [{fileId: <fileId>, name: <fileName>, url: <fileURL>}],
  "accessionVersion": <str>
}
```

The service downloads the files and validates their structure. The service responds with a

```json
{
  "errors": [{fileNames: [<fileName>, ...], message: <str>}],
}
```

Raw reads submissions go through `validate_raw_reads_submission`, which checks:

1. **Format validation** (`raw_reads_processing.file_format_validation`) — is the submission well-formed FASTQ?

## Raw reads format validation

Only FASTQ is currently accepted (`ACCEPTED_FORMATS`). If the file extension is not supported the function errors early.

Once files are downloaded, they are validated using ENA's own validator,
[readtools](https://github.com/loculus-project/readtools), which checks structural/content
correctness (valid headers, IUPAC bases, matching sequence/quality lengths, etc.) and rejects
truly duplicate read names within a single file:

```sh
READTOOLS_JAR=readtools.jar java -jar readtools.jar read1.fastq [read2.fastq] --format FASTQ
```
