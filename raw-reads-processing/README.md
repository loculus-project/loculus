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

1. **Format validation** (`raw_reads_processing.file_format_validation`) — is the submission well-formed, gzip-compressed FASTQ?
2. **Human Host Contamination** (`raw_reads_processing.deacon`) - run deacon to confirm that the submission does not contain human reads (thresholds and parameters used by deacon are defined below).

## Raw reads format validation

Only gzip-compressed FASTQ is accepted: file names must end in `.fastq.gz` or `.fq.gz`
(`ACCEPTED_FASTQ_EXTENSIONS`, matched case-insensitively). Anything else — uncompressed
`.fastq`/`.fq`, other compression such as `.bz2` or `.zst`, or an unrelated extension — is
rejected before anything is downloaded.

Requiring exactly one compression format saves storage and bandwidth, makes downloads
uniform for everyone, and matches what ENA requires of submitted read files anyway. It is
also what lets `ena-submission` upload what it downloads without recompressing it.

Once files are downloaded, `validate_compression` confirms the contents agree with the
name: the file really is gzip (checked by magic bytes, since readtools infers compression
from content and would accept a mislabelled file) and is **not** gzipped more than once.
Truncated and corrupt gzip streams are reported to the submitter; anything else is treated
as our own failure and surfaces as a 500.

They are then validated using ENA's own validator,
[readtools](https://github.com/loculus-project/readtools), which checks structural/content
correctness (valid headers, IUPAC bases, matching sequence/quality lengths, etc.) and rejects
truly duplicate read names within a single file:

```sh
READTOOLS_JAR=readtools.jar java -jar readtools.jar read1.fastq.gz [read2.fastq.gz] --format FASTQ
```
## Validate sequences have been dehosted (deacon)

Files that pass format validation are screened for human host reads with
[deacon](https://github.com/bede/deacon), run against a custom index that we generate (see details below).
We compare the results against two configured thresholds:

- `deacon_max_host_reads_proportion` — proportion of reads mapping to the host genome
- `deacon_max_host_bp` — absolute number of host base pairs

Exceeding either threshold is a hard error (`DEACON_ERROR_PROMPT`).

The index is expected at `/data/deacon.idx` by default; set `DEACON_INDEX_PATH` to point at a
different location, e.g. for local development:

```sh
DEACON_INDEX_PATH=./deacon.idx
```

## Deacon index

We use a custom deacon index from https://objectstorage.uk-london-1.oraclecloud.com/n/lrbvkel2wjot/b/human-genome-bucket/o/deacon/misc/panhuman-1.k31w15c8.idx.

It uses deacon's default panhuman-1.k31w15c8 index (which excludes k-mers occurring in refSeq virus sequences) with a complexity filter of kdust 0.8.