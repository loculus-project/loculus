# Preprocessing Pipeline: Specification

## Introduction

The preprocessing pipeline prepares the data uploaded by the submitters for release. It is a separate program and communicates with the core Pathoplexus backend server through an HTTP interface that we specify in this document. The pipeline can have organism-specific logic and different pipelines can be used for different Pathoplexus instances.

**Note:** The requirements levels (must, should, can, etc.) in this document currently ARE NOT consistent with [RFC 2119](https://www.ietf.org/rfc/rfc2119.txt).

### Tasks

In following, we list a series of tasks that the preprocessing pipeline would usually perform. Hereby, the developers of a preprocessing pipeline has much flexibility in deciding how and to which extent the pipeline does the tasks. The only rule is that the output of the pipeline has to conform to the format expected by the Pathoplexus backend. For example, a preprocessing pipeline can be very "generous and intelligent" and accept a wide range of values for a date (e.g., it may map "Christmas 2020" to "2020-12-25") or be very restrictive and throw an error for any value that does not follow the ISO-8601 format.

**Parsing:** The preprocessing pipeline receives the input data as strings and transforms them into the right format. For example, assuming there is a field `age` of type `integer`, given an input `{"age": "2"}` the preprocessing pipeline should transform it to `{"age": 2}` (simple type conversion). In another case, assuming there is a field `sequencingDate` of type `date`, the preprocessing pipeline might transform `{"sequencingDate": "30 August 2023"}` to the expected format of `{"sequencingDate": "2023-08-30"}`.

**Validation:** The preprocessing pipeline checks the input data and emits errors or warnings. As mentioned above, the only constraint is that the output of the preprocessing pipeline conforms to the right (technical) format. Otherwise, a pipeline may be generous (e.g., allow every value in the "country" field) or be more restrictive (e.g., only allow a fixed set of values in the "country" field).

**Alignment and translations:** The submitter only provides unaligned nucleotide sequences. To allow searching by nucleotide and amino acid mutations, the preprocessing pipeline must perform the alignment and compute the translations to amino acid sequences. 

**Annotation:** The preprocessing pipeline can add annotations such as clade/lineage classifications.

**Quality control (QC):** The preprocessing pipeline should check the quality of the sequences (and the metadata).

### Glossary

- **Pathoplexus instance:** one Pathoplexus installation consisting of potentially multiple organism instances
- **Organism instance:** one organism-specific instance with a fixed set of possible metadata and a fixed reference genome
- **Organism instance schema:** the definition of the accepted metadata fields and information about the reference genome (names of the segments and genes/peptides). Each organism instance has a schema.
- **Backend:** The backend server is developed by the Pathoplexus team. The same backend software is used across Pathoplexus and organism instances. To support different organisms and metadata fields, it can be configured through a configuration file.
- **Preprocessing pipeline:** The preprocessing pipeline takes unpreprocessed data and generates preprocessed data. The Pathoplexus team provides reference implementations but Pathoplexus can be used with other implementations as long as they follow the specification detailed in this document.
- **LAPIS and SILO:** the data querying engine and API used by Pathoplexus.
- **Sequence entry:** A sequence entry consists of a genome sequence (or sequences if the organisms has a segmented genome) and associated metadata. It is the main entity of the Pathoplexus application. Users submit sequence entries and search for sequence entries. Each sequence entry has its own accession. Changes to sequence entries are versioned, meaning that a sequence entry can have multiple versions.
- **Unpreprocessed data:** sequence entries as provided by the submitters
- **Preprocessed data:** sequence entries after being processed by the preprocessing pipeline. The preprocessed data must be consistent with the organism instance schema and will be passed to LAPIS and SILO.
- **Nucleotide sequence segment:** A nucleotide sequence consists of one or multiple segments. If there is only a single segment (e.g., as in SARS-CoV-2), the segment name should be `main`. For multi-segmented sequences, the segment names must match the corresponding reference genomes.

## Workflow overview

1. The preprocessing pipeline calls the backend and receives some unpreprocessed data.
2. The preprocessing pipeline performs its tasks on the data.
3. The preprocessing pipeline sends the backend the preprocessed data along with a list of errors and warnings.

Sequence entry versions without an error will be released. Sequence entry versions with an error will not be released and require fixing by the submitter. Sequence entry versions without an error but with a warning will be released. The warning will be shown to the submitter (and maybe also to other users).

## Technical specification

Also see the Swagger UI available in the backend at `<backendUrl>/swagger-ui/index.html`.

### Pulling unpreprocessed data

To retrieve unpreprocessed data, the preprocessing pipeline sends a POST request to the backend's `/extract-unprocessed-data` with the request parameter `numberOfSequenceEntries` (integer). This returns a response in [NDJSON](http://ndjson.org/) containing at most the specified number of sequence entries. If there are no entries that require preprocessing, an empty file is returned.

In the unprocessed NDJSON, each line contains a sequence entry represented as a JSON object and looks as follows:

```
{"accession": 1, "version": 1, "data": {"metadata": {...}, "unalignedNucleotideSequences": {...}}}
{"accession": 2, "version": 1, "data": {"metadata": {...}, "unalignedNucleotideSequences": {...}}}
```

The `metadata` field contains a flat JSON object in which all values are strings. The fields and values correspond to the columns and values as provided by the submitter.

The primary key is `[accession,version]`. The preprocessing pipeline must be able to handle getting the same sequence entry twice with different versions.

One JSON object has the following fields:

```js
{
    accession: integer,
    version: integer,
    data: {
        metadata: Record<string, string>,
        unalignedNucleotideSequences: Record<string, string>
    }
}
```

### Returning preprocessed data

To send back the preprocessed data, the preprocessing pipeline sends a POST request to the backend's `/submit-processed-data` endpoint with NDJSON in the request body.

In the NDJSON, each row contains a sequence entry version and a list of errors and a list of warnings represented as a JSON object. One JSON object has the following fields:

```js
{
    accession,
    version,
    errors,
    warnings,
    data: {
        metadata,
        unalignedNucleotideSequences,
        alignedNucleotideSequences,
        nucleotideInsertions,
        alignedAminoAcidSequences,
        aminoAcidInsertions
    }
}
```

The response may not contain any unused/unspecified field.

#### Errors and warnings

The `errors` and `warnings` fields contain an array of objects of the following schema:

```js
{
    source: {
        type: "Metadata" | "NucleotideSequence",
        name: string
    }[],
    message: string
}
```

The `source` field specifies the source of the error. It can be empty if the error is very general or if it is not possible to pinpoint a specific source. If the error is caused by the value in a metadata field, the `name` field should contain the name of a metadata field. If a nucleotide sequence caused the error, the `name` field should contain the (segment) name of the nucleotide sequence.

The `message` should contain a human-readable message describing the error.

#### Metadata

The `metadata` field should contain a flat object consisting of the fields specified in the organism instance schema. The values must be correctly typed. Currently, the following types are available:

- `string`
- `integer`
- `float`
- `date` (supplied as a string with complete ISO-8601 date, e.g., "2023-08-30")
- `pangoLineage` (supplied as a string with a properly formatted SARS-CoV-2 Pango lineage, e.g., "B.1.1.7")

#### Sequences

The `unalignedNucleotideSequences`, `alignedNucleotideSequences`, and `alignedAminoAcidSequences` fields contain objects with the segment/gene name as key and the sequence as value. If there is only a single segment (e.g., as in SARS-CoV-2), the segment name of the nucleotide sequence should be `main`. Examples:

SARS-CoV-2 nucleotide sequence:

```
{
    "main": "..."
}
```

SARS-CoV-2 amino acid sequences:

```
{
    "S": "...",
    "N": "...",
    ...
}
```

#### Insertions

This is not yet specified.
