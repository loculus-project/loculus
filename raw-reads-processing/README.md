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

## Testing

```sh
pytest
```

You can skip tests requiring external tools (`readtools`, `samtools`, and `deacon`) with:

```sh
pytest --skip-missing-deps
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
`POST /process-files` (`raw_reads_processing.process_files.validate_raw_reads_submission`).

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

1. Validate format, compression, and contents with readtools.
2. For BAM, extract and account for primary reads with samtools.
3. Screen for human contamination with Deacon.

readtools and Deacon are existing dependencies used for FASTQ validation and human-read
screening. BAM support reuses both and adds samtools to fully read the BAM and extract
temporary FASTA inputs for Deacon.

## Raw reads format validation

Accepts one or two gzip-compressed FASTQ files (`.fastq.gz`, `.fq.gz`) or one binary
BAM (`.bam`), case-insensitively. SAM, CRAM, and mixed formats are unsupported.
BAM needs neither an index nor coordinate sorting.

`validate_compression` checks single gzip compression for FASTQ and BGZF/BAM magic for BAM.

They are then validated using ENA's own validator,
[readtools](https://github.com/loculus-project/readtools), which checks structural/content
correctness (valid headers, IUPAC bases, matching sequence/quality lengths, etc.) and rejects
truly duplicate read names within a single file:

```sh
READTOOLS_JAR=readtools.jar java -jar readtools.jar read1.fastq.gz [read2.fastq.gz] --format FASTQ
```

### BAM limitations

readtools uses `--format BAM`, requires qualities, may reject missing sequences,
and checks the first 100,000 records. samtools then counts the primary reads and
extracts them into gzip-compressed temporary FASTA for Deacon. The original BAM is
preserved for deposition.

Primary reads must have complete sequences and unique read-name/mate identifiers.
Hard-clipped primaries are rejected.

The original BAM is published and sent to ENA unchanged, including its header.
Remove paths and identifiers from `@PG`, `@CO` and `@RG` records before uploading.

## Validate sequences have been dehosted (deacon)

Files that pass format validation are screened for human host reads with
[deacon](https://github.com/bede/deacon), run against a custom index that we generate (see details below).
We compare the results against two configured thresholds:

- `deacon_max_host_reads_proportion` — proportion of reads mapping to the host genome
- `deacon_max_host_bp` — absolute number of host base pairs

Exceeding either threshold is a hard error (`DEACON_ERROR_PROMPT`).

The index is expected at `/data/deacon.idx` by default. Set `DEACON_INDEX_PATH` to point at a
different location, e.g. for local development:

```sh
DEACON_INDEX_PATH=./deacon.idx
```

## Deacon index

We use a custom deacon index from https://objectstorage.uk-london-1.oraclecloud.com/n/lrbvkel2wjot/b/human-genome-bucket/o/deacon/misc/panhuman-1.k31w15c8.idx.

It uses deacon's default panhuman-1.k31w15c8 index (which excludes k-mers occurring in refSeq virus sequences) with a complexity filter of kdust 0.8.
