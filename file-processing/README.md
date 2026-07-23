# File Processing Service

## Local development

Create an activate the micromamba environment using:

```
micromamba create -f environment.yml
micromamba activate loculus-file-processing
pip install -e .
```

Download validation jar using:

```
curl -L -o readtools.jar \
  https://github.com/loculus-project/readtools/releases/download/v1.0.0/readtools-2.15.1-all.jar
READTOOLS_JAR="readtools.jar"
```

## What this service does

The file processing service is a small FastAPI app (`file_processing.api`) with a single real
endpoint, `POST /process-files` (`file_processing.functions.process_submitted_files`). The backend
sends it a `Files` payload:

```json
{<FileCategory>: [{fileId: <UUID>, name: <fileName>, url: <fileURL>}]}
```

The service downloads the files, validates the files and runs the deacon service to see if the files contain reads that map to the human genome. The service responds with a

```json
{
  files: Files,
  errors: [{fileName: <fileName>, fileCategory: <fileCategory>, message: <str>}],
  warnings: [{fileName, fileCategory, message }]
}
```

Only the `RAW_READS` FileCategory is currently handled. Raw reads submissions go through
`validate_raw_reads_submission`, which runs two checks in order:

1. **Format validation** (`file_processing.file_validation`) — is the submission well-formed FASTQ?
2. **Host decontamination** (`file_processing.deacon`) — does it contain too many human reads?

Only after both checks pass does a submission come back with no errors.

## Raw reads format validation

Only FASTQ is currently accepted (`ACCEPTED_FORMATS`). If the file extension is not supported the function errors early.

Once files are downloaded, each one is validated using ENA's own validator,
[readtools](https://github.com/loculus-project/readtools), which checks structural/content
correctness (valid headers, IUPAC bases, matching sequence/quality lengths, etc.) and rejects
truly duplicate read names within a single file:

```
java -jar readtools.jar reads.fastq --format FASTQ
```

**Interleaved FASTQ is explicitly rejected**
Readtools does not check for interleaved FASTQ files, treating them as single, non-paired files. Readtools will still error if there are duplicate read names (e.g. as produced by SRA's `fasterq-dump` defaults) but otherwise does not perform the same tests it otherwise performs when paired-end reads are submitted as separate files (i.e. that the files are indeed paired and have enough matching read names). Hence, we explicitly ask for submitters to submit paired reads as two (or more) separate files.

**Local dev: running the validation jar directly**

For local testing outside Docker, point `READTOOLS_JAR` at the jar downloaded above:

```
READTOOLS_JAR=readtools.jar java -jar readtools.jar reads.fastq --format FASTQ
```

`test/test_file_validation.py`'s integration tests locate the jar the same way.

## Host decontamination (deacon)

Files that pass format validation are screened for human host reads with
[deacon](https://github.com/bede/deacon), run against a custom index that we generate (see details below).
We compare the results against two configured thresholds:

- `deacon_max_host_reads_proportion` — proportion of reads mapping to the host genome
- `deacon_max_host_bp` — absolute number of host base pairs

Exceeding either threshold is a hard error (`DEACON_ERROR_PROMPT`); a submission with _some_ host
reads under the threshold gets a warning instead (`DEACON_WARNING_PROMPT`) so it can still be
accepted while flagging it for review.

## Deacon index

We use a custom deacon index, generated during a manual build action in `loculus/file-processing/build-index.sh`.

It uses deacon's default panhuman-1 index with a complexity filter of c0.8 and additionally filters out all k-mers that are found in consensus sequences on PPX to further avoid accidental flagging of viral genomes.
