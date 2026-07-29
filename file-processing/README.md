# File Processing Service

## Local development

Create an activate the micromamba environment using:

``sh
micromamba create -f environment.yml
micromamba activate loculus-file-processing
pip install -e .
```

Download validation jar using:

```sh
curl -L -o readtools.jar \
  https://github.com/loculus-project/readtools/releases/download/v1.0.0/readtools-2.15.1-all.jar
```

## How to configure the service

Preprocessing is currently configured to send files to the `fileProcessingService` and requires the `values.yaml` to contain:

```yaml
disableFileProcessingService: false
fileProcessingService:
  file_processing_service_url: http://loculus-file-processing:5000
```

Preprocessing receives original-data from the backend, the backend creates read-only presigned file URLs and the preprocessing service sends these on to the file-processing service.

## What this service does

The file processing service is a small FastAPI app (`file_processing.api`) with one endpoint:
`POST /process-files` (`file_processing.functions.process_submitted_files`).

It receives a `Files` payload:

```json
{<FileCategory>: [{fileId: <fileId>, name: <fileName>, url: <fileURL>}]}
```

The service downloads the files and validates their structure. The service responds with a

```json
{
  files: Files,
  errors: [{fileName: <fileName>, fileCategory: <fileCategory>, message: <str>}],
  warnings: [{fileName: <fileName>, fileCategory: <fileCategory>, message: <str>}]
}
```

Only the `RAW_READS` FileCategory is currently handled. Raw reads submissions go through
`validate_raw_reads_submission`, which checks:

1. **Format validation** (`file_processing.file_validation`) — is the submission well-formed FASTQ?

## Raw reads format validation

Only FASTQ is currently accepted (`ACCEPTED_FORMATS`). If the file extension is not supported the function errors early.

Once files are downloaded, they are validated using ENA's own validator,
[readtools](https://github.com/loculus-project/readtools), which checks structural/content
correctness (valid headers, IUPAC bases, matching sequence/quality lengths, etc.) and rejects
truly duplicate read names within a single file:

```sh
READTOOLS_JAR=readtools.jar java -jar readtools.jar read1.fastq [read2.fastq] --format FASTQ
```
