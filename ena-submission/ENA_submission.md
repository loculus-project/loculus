# Submitting to ENA

## Overview

Three routes:

### Interactive web form

Not what we want because we want to automate ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html)).
But it's possible to do interactive test submissions here: <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html>.
This is useful for testing as the interactive submission might have better error messages than the command line tool. See <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html>

### Programmatically

HTTP XML-based API: Can be used for study and sample submission ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/programmatic.html))

Schemas: <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/programmatic.html#types-of-xml>

### Webin CLI

Each submission must be associated with an existing study and sample. This means that the XML-based API must be used first.
Then the Webin CLI can be used for assembly submission ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/webin-cli.html))

## Metadata model

We have to map the Pathoplexus metadata model to the [ENA metadata model](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/metadata.html).

![ENA metadata model](https://ena-docs.readthedocs.io/en/latest/_images/metadata_model_whole.png)

We require the following components:

- Study: A study (project) groups together data submitted to the archive and **controls its release date**. A study accession is typically used when citing data submitted to ENA. Note that all associated data and other objects are made public when the study is released.

- Sample: A sample contains information about the sequenced source material. Samples are associated with checklists, which define the fields used to annotate the samples. Samples are always associated with a taxon.

- Analysis: An analysis contains secondary analysis results derived from sequence reads (e.g. a genome assembly).

In contrast to ENA, Pathoplexus has no hierarchy of study/sample/sequence. Therefore the pipeline creates _one_ default study per Pathoplexus submission group and organism (we also accept user supplied studies/bioprojects). For each Pathoplexus sequence entry it creates one sample (with metadata) and one assembly (with the sequence), plus a run and experiment if raw reads are attached. (We will also link assemblies to user supplied biosamples and runs where applicable).

### URLs

- Test service URL: https://wwwdev.ebi.ac.uk/ena/submit/webin/login
- Production service URL: https://www.ebi.ac.uk/ena/submit/webin/login

## Submission process

### 1. Registering a study programmatically

1. Create the study XML ([schema](https://ftp.ebi.ac.uk/pub/databases/ena/doc/xsd/sra_1_5/ENA.project.xsd)). This is what `create_project.py` generates, with values filled in from the organism's `enaDeposition` config (`scientific_name`, `taxon_id`) and the Pathoplexus group (`group_name`, `institution`, `address`):

   ```xml
   <!--filename: project.xml-->
   <PROJECT_SET>
   <PROJECT alias="{group_id}:{organism}:{unique_project_suffix}" center_name="{institution}">
        <NAME>{scientific_name}: Genome sequencing by {group_name}, {institution}</NAME>
        <TITLE>{scientific_name}: Genome sequencing by {group_name}, {institution}, {city}, {country}</TITLE>
        <DESCRIPTION>Automated upload of {scientific_name} sequences submitted by {group_name}, {institution}, {city}, {country} to {db_name}</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
            <ORGANISM>
            <TAXON_ID>{taxon_id}</TAXON_ID>
            <SCIENTIFIC_NAME>{scientific_name}</SCIENTIFIC_NAME>
            </ORGANISM>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                <DB>{db_name}</DB>
                <ID>{group_id}</ID>
                </XREF_LINK>
            </PROJECT_LINK>
        </PROJECT_LINKS>
    </PROJECT>
    </PROJECT_SET>
   ```

2. Create the submission XML:

   ```xml
   <!--filename: submission.xml-->
   <SUBMISSION>
   <ACTIONS>
       <ACTION>
           <ADD/>
       </ACTION>
       <ACTION>
           <HOLD HoldUntilDate="2023-11-01"/>
       </ACTION>
   </ACTIONS>
   </SUBMISSION>
   ```

   `HoldUntilDate` controls when the study (and all data associated with it) becomes public. The pipeline sets it to the current date (`get_submission_dict` in `ena_submission_helper.py`), so data is released immediately.

3. Submit with e.g. `curl`:

   ```bash
   curl -u username:password \
       -F "SUBMISSION=@submission.xml" \
       -F "PROJECT=@project.xml" \
       "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit/"
   ```

4. Check success. The receipt XML looks like this:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <?xml-stylesheet type="text/xsl" href="receipt.xsl"?>
   <RECEIPT receiptDate="2017-05-09T16:58:08.634+01:00" submissionFile="submission.xml" success="true">
   <PROJECT accession="PRJEB20767" alias="cheddar_cheese" status="PRIVATE" />
   <SUBMISSION accession="ERA912529" alias="cheese" />
   <MESSAGES>
       <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
   </MESSAGES>
   <ACTIONS>ADD</ACTIONS>
   </RECEIPT>
   ```

   This is where one gets the accession from.

### 2. Registering a sample programmatically

[Docs](https://ena-docs.readthedocs.io/en/latest/submit/samples.html)

1. Samples are validated against a [checklist](https://www.ebi.ac.uk/ena/browser/checklists) that defines the "minimal metadata" fields. The checklist is configured per organism via `ena_checklist` in the `enaDeposition` config, e.g. the [ENA virus pathogen reporting standard checklist](https://www.ebi.ac.uk/ena/browser/view/ERC000033) or the more specific one for [Influenza](https://www.ebi.ac.uk/ena/browser/view/ERC000032). If none is set, no `ENA-CHECKLIST` attribute is sent and ENA uses its [default checklist](https://www.ebi.ac.uk/ena/browser/view/ERC000011).
2. Create the sample XML (multiple samples can be in one sample set). The example below is taken from the ENA docs:

   ```xml
   <!--filename: sample.xml-->
   <SAMPLE_SET>
       <SAMPLE alias="MT5176" center_name="">
           <TITLE>human gastric microbiota, mucosal</TITLE>
           <SAMPLE_NAME>
               <TAXON_ID>1284369</TAXON_ID>
               <SCIENTIFIC_NAME>stomach metagenome</SCIENTIFIC_NAME>
               <COMMON_NAME></COMMON_NAME>
           </SAMPLE_NAME>
           <SAMPLE_ATTRIBUTES>
               <SAMPLE_ATTRIBUTE>
                   <TAG>investigation type</TAG>
                   <VALUE>mimarks-survey</VALUE>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>sequencing method</TAG>
                   <VALUE>pyrosequencing</VALUE>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>geographic location (latitude)</TAG>
                   <VALUE>1.81</VALUE>
                   <UNITS>DD</UNITS>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>geographic location (longitude)</TAG>
                   <VALUE>-78.76</VALUE>
                   <UNITS>DD</UNITS>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>geographic location (country and/or sea)</TAG>
                   <VALUE>Colombia</VALUE>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>geographic location (region and locality)</TAG>
                   <VALUE>Tumaco</VALUE>
               </SAMPLE_ATTRIBUTE>
               <SAMPLE_ATTRIBUTE>
                   <TAG>ENA-CHECKLIST</TAG>
                   <VALUE>ERC000014</VALUE>
               </SAMPLE_ATTRIBUTE>
           </SAMPLE_ATTRIBUTES>
       </SAMPLE>
   </SAMPLE_SET>
   ```

3. Create the submission.xml as above:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <SUBMISSION>
       <ACTIONS>
           <ACTION>
               <ADD/>
           </ACTION>
       </ACTIONS>
   </SUBMISSION>
   ```

4. Submit with e.g. `curl`:

   ```bash
   curl -u username:password \
       -F "SUBMISSION=@submission.xml" \
       -F "SAMPLE=@sample.xml" \
       "https://wwwdev.ebi.ac.uk/ena/submit/drop-box/submit/"
   ```

5. Check success. The receipt XML looks like this:

   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <?xml-stylesheet type="text/xsl" href="receipt.xsl"?>
   <RECEIPT receiptDate="2017-07-25T16:07:50.248+01:00" submissionFile="submission.xml" success="true">
       <SAMPLE accession="ERS1833148" alias="MT5176" status="PRIVATE">
           <EXT_ID accession="SAMEA104174130" type="biosample"/>
       </SAMPLE>
       <SUBMISSION accession="ERA979927" alias="MT5176_submission"/>
       <MESSAGES>
           <INFO>This submission is a TEST submission and will be discarded within 24 hours</INFO>
       </MESSAGES>
       <ACTIONS>ADD</ACTIONS>
   </RECEIPT>
   ```

   and contains the sample accession number(s).

### 3. Submitting sequences (assembly)

[Docs](https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html)

1. Create [manifest file](https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html#manifest-files) for assembly metadata and file specification (manifest.tsv). The pipeline (`create_manifest_object` in `create_assembly.py`) sets the following metadata rows:

   - STUDY: Study accession - mandatory
   - SAMPLE: Sample accession - mandatory
   - ASSEMBLYNAME: Unique assembly name - mandatory. Generated as `{accession}.{version}_{timestamp}_{random}`, as every revision needs a new name
   - ASSEMBLY_TYPE: always `isolate` - mandatory
   - COVERAGE: The estimated depth of sequencing coverage - mandatory
   - PROGRAM: The assembly program - mandatory
   - PLATFORM: The sequencing platform, or comma-separated list of platforms - mandatory
   - MOLECULETYPE: from the organism config (`genomic RNA`, `viral cRNA` or `genomic DNA`)
   - DESCRIPTION: `Original sequence submitted to {db_name} with accession: {accession}, version: {version}`
   - RUN_REF: run accession from the `raw_reads_table`, only if raw reads were submitted for this sequence
   - AUTHORS and ADDRESS: only when submitting as a broker (`is_broker`), see [authorship](https://ena-docs.readthedocs.io/en/latest/faq/data_brokering.html#authorship). ADDRESS is built from the Pathoplexus group's institution and address

   COVERAGE, PROGRAM, PLATFORM and AUTHORS are taken from the sequence metadata as configured in `assembly_manifest_fields_mapping`.

   The file specification rows are:

   - FLATFILE: sequences in EMBL flatfile format (the pipeline always uses this; ENA also accepts FASTA)
   - CHROMOSOME_LIST: list of chromosomes

   An example manifest.tsv:

   ```tsv
   STUDY	PRJEBxxxxxx
   SAMPLE	SAMEAxxxxxx
   ASSEMBLYNAME	PP_000001.1_20250101_120000_aB3x
   ASSEMBLY_TYPE	isolate
   COVERAGE	100
   PROGRAM	iVar
   PLATFORM	Illumina
   MOLECULETYPE	genomic RNA
   DESCRIPTION	Original sequence submitted to Pathoplexus with accession: PP_000001, version: 1
   FLATFILE	genome.embl.gz
   CHROMOSOME_LIST	chromosome_list.gz
   ```

2. Create the chromosome list file. Columns are object name (must match the sequence ID in the flatfile), chromosome name and `{topology}-{chromosome_type}`. For multi-segment organisms each segment is listed as `segmented`:

   ```tsv
   PP_000001_L	L	linear-segmented
   PP_000001_M	M	linear-segmented
   PP_000001_S	S	linear-segmented
   ```

   For single-segment organisms there is one `monopartite` entry named `genome`:

   ```tsv
   PP_000001	genome	linear-monopartite
   ```

   Topology (`linear` or `circular`) comes from the organism config.

3. Create the EMBL flatfile (`create_flatfile` in `ena_submission_helper.py`), see the [flatfile example](https://ena-docs.readthedocs.io/en/latest/submit/fileprep/flat-file-example.html). Each sequence gets a `source` feature with `mol_type`, `organism`, `geo_loc_name` (country), `collection_date`, and `authors` (reformatted as the INSDC expects) as a reference. The flatfile does not yet contain gene or CDS annotations, see section 4 and [#3739](https://github.com/loculus-project/loculus/issues/3739).

   ENA also accepts a plain FASTA file instead.

4. Submit the files using the webin-cli:

   ```sh
   ena-webin-cli -[validate|submit] \
       -context genome \
       -manifest manifest.tsv \
       -username Webin-XXXXX \
       -password YYYYYY
   ```

5. Save ERZ accession numbers (these will be returned by the webin-cli)
6. Wait to receive GCA accession numbers (assigned later, once the assembly has been processed). This can be retrieved via https://wwwdev.ebi.ac.uk/ena/submit/report/swagger-ui/index.html

```
curl -X 'GET' \
  'https://www.ebi.ac.uk/ena/submit/report/analysis-process/{erz_accession}?format=json&max-results=100' \
  -H 'accept: */*' \
  -H 'Authorization: Basic KEY'
```

When processing is finished the response should look like:

```
[
  {
    "report": {
      "id": "{erz_accession}",
      "analysisType": "SEQUENCE_ASSEMBLY",
      "acc": "chromosomes:OZ076380-OZ076381,genome:GCA_964187725.1",
      "processingStatus": "COMPLETED",
      "processingStart": "14-06-2024 05:07:40",
      "processingEnd": "14-06-2024 05:08:19",
      "processingError": null
    },
    "links": []
  }
]
```

### 4. Submitting annotated assemblies to ENA

ENA docs say they require pre-registration of a [locus_tag_prefix](https://ena-docs.readthedocs.io/en/latest/faq/locus_tags.html) in order to submit annotated assemblies - however we have succeeded in submitting annotated EMBL files without these tags.

The flatfiles submitted by the pipeline currently do not contain gene or CDS annotations. Adding annotations from Nextclade is tracked in [#3739](https://github.com/loculus-project/loculus/issues/3739). Options considered:

- Use the `annotation` object in the `nextclade.json` output (genes with their CDS segments, ranges and qualifiers such as `product` and `protein_id`) to add features to the EMBL flatfile (already done in preprocessing just needs to be used for ENA deposition).
- [EMBLmyGFF3](https://github.com/NBISweden/EMBLmyGFF3) converts a GFF3 file into an EMBL flatfile, but on Nextclade's GFF3 output it produces errors and warnings caused by non-standard annotations (e.g. `region` and `seq_index`), and it cannot add the `country` and `collection_date` qualifiers we need. We decided against using it.

### 5. Submitting raw reads to ENA

In order to submit raw reads you must:

1. Create a bioproject object (see above)
2. Create a biosample object (see above)
3. Create a run object. The run submission holds information about the raw read files generated in a run of sequencing as well as their location on an FTP server.
4. Create an experiment object. The experiment submission holds metadata that describe the methods used to sequence the sample.

Webin will report two unique accession numbers for each read submission. The first starts with ERR and is called the Run accession. The other starts with ERX and is called the Experiment accession.

#### Submission via webin-cli

1. Create a [manifest.tsv](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#manifest-file) file.

You can see the permitted values of all permitted fields by following the links below or running

```sh
ena-webin-cli -context reads -fields
```

- STUDY: Study accession or unique name (alias)
- SAMPLE: Sample accession or unique name (alias)
- NAME: Unique experiment name
- PLATFORM: See [permitted values](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#permitted-values-for-platform). Not needed if INSTRUMENT is provided. e.g. ILLUMINA
- INSTRUMENT: See [permitted values](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#permitted-values-for-instrument) e.g. Illumina Genome Analyzer - can be set to `unspecified`
- INSERT_SIZE: Insert size for paired reads
- LIBRARY_NAME: Library name (optional)
- LIBRARY_SOURCE: See [permitted values](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#permitted-values-for-library-source) -> should always be `VIRAL RNA` for us
- LIBRARY_SELECTION: See [permitted values](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#permitted-values-for-library-selection) e.g. PCR - can be set to `unspecified`
- LIBRARY_STRATEGY: See [permitted values](https://ena-docs.readthedocs.io/en/latest/submit/reads/webin-cli.html#permitted-values-for-library-strategy) e.g. WGS or WGA - can be set to `OTHER`
- DESCRIPTION: free text library description (optional)

and then link (local location of raw reads file):

- BAM: Single BAM file
- CRAM: Single CRAM file
- FASTQ: Single fastq file

2. Get read files: 1 BAM file, 1 CRAM file, 1-2 Fastq files or multiple fastq files

Note For CRAM files ENA will validate that the reference sequence exists

3. submit using the webin-cli:

  ```sh
  ena-webin-cli -[validate|submit] \
    -context reads \
    -manifest manifest.tsv \
    -username Webin-XXXXX \
    -password YYYYYY
  ```

You will get a response with the run and experiment accessions, e.g.:

```
INFO : Submission(s) validated successfully.
INFO : Connecting to FTP server : webin2.ebi.ac.uk
INFO : Uploading file: run/ERR17356121.part_001.fastq.gz
INFO : Uploading file: run/ERR17356121.part_002.fastq.gz
INFO : Files have been uploaded to webin2.ebi.ac.uk. 
INFO : The submission has been completed successfully. The following experiment accession was assigned to the submission: ERX16796961
INFO : The submission has been completed successfully. The following run accession was assigned to the submission: ERR17408527
```

#### Programmatic submission

There is also a way to submit using XMLs and curl (see https://ena-docs.readthedocs.io/en/latest/submit/reads/programmatic.html), however this requires registering each run and experiment object individually via curl and additionally pre-uploading the files to our webin account, so it seems easier to use the webin-cli.

## Revising Submissions to ENA

### 1. [Revising Studies (Projects) and Samples](https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-study.html)

Revisions to a study or sample should be submitted the same way as original sequences were submitted, with the `ADD` action in the submission request should be changed to a `MODIFY`. However, the alias must BE THE SAME as the previous version or the assigned accession number must be added for the correct sample/study to be updated.

### 2. [Revising Assemblies](https://ena-docs.readthedocs.io/en/latest/update/assembly.html)

Study and sample accessions must stay the same in a revision and chromosome names cannot be changed (but new ones can be added). In the past, all metadata fields that were set via the manifest had to be revised via an email. ENA has now informed us we can revise these fields in a normal automated revision but we have had issues with it, so we have a `allow_revision_with_manifest_changes` flag which can enable/disable automated manifest revisions.
However, unlike the alias a NEW `ASSEMBLYNAME` is required (cannot be the same as the assemblyname of the previous version).

The pipeline automates revisions of samples (using `MODIFY`) and assemblies. Projects are never revised: there is one per group and organism and it is reused by all sequences. If an assembly revision requires a manifest update and `allow_revision_with_manifest_changes` is disabled, the pipeline does not update the assembly but sets the assembly submission to `HAS_ERRORS` and stores the reason in the database. We then receive a slack notification and have to email ENA to update the manifest.

The `RUN_REF` in the assembly manifest is taken from the `raw_reads_table` (the run accession deposited for the same accession version), not from the sequence metadata. If a revision replaces or adds raw read files, a new run accession is created and the `RUN_REF` changes even if the consensus sequence and all other metadata are unchanged. This is treated like any other manifest change: with `allow_revision_with_manifest_changes` enabled the assembly is resubmitted with the new `RUN_REF`, otherwise the assembly is set to `HAS_ERRORS` for manual revision. The previous assembly result is only reused if the `RUN_REF` is unchanged as well.

### 3. [Revising Raw Reads](https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-read.html)

It is not possible to revise run files after they have been submitted, see [docs](https://ena-docs.readthedocs.io/en/latest/update/metadata/interactive.html#common-run-updates). 
ENA allows the automated revision of run and experiment metadata submitted as XMLs - [docs](https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-read.html), we opted to submit raw reads using the webin-cli which creates these XMLs for us - thus we cannot yet revise raw reads metadata fields. Revision requirements for the alias are: `Please note that the new experiment or run XML must either contain the original alias or the assigned accession number for the correct object to be updated.`

## Promises made to ENA

- "I confirm that the data submitted through this account is NOT sensitive, restricted-access or human-identifiable." -> We will want to mirror this into Pathoplexus submissions, at least the sensitive and human-identifiable parts.

## FAQs

### What's the difference between `assemblies` and `annotated sequences`?

In ENA, sequences submitted with their chromosome structure are considered genome assemblies, which are Analysis objects in the metadata model. The pipeline submits them as genome assemblies (`-context genome` in the webin-cli), see [the docs](https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html).

### What is the centre name?

This is not unique, for non-brokers this is taken from the submitter metadata (i.e. it is set in our webin account) and used to autofill the center_name field in all XMLs. Brokers can change the center_name dynamically -> i.e. they can set it to anything that they want but this should be linked to the institution/lab that "owns" the data. Brokers can actually change ALL sequences even if they do not own them. Although formally brokers do not own the data they upload the data owners can only modify the data by getting in touch with the broker or alternatively getting in touch with ENA and after proving their identity ENA can modify their data. In ENA permission to modify data is defined by the WebIn account that submitted the data.

### Project vs Study

Every Project in ENA has a secondary Study accession. Before ENA was combined as a single archive, it was a separate archive for raw data (ERA which used the Study accession) and constructed assemblies/sequences (EMBL-Bank which used the Project accession). The Project and Study in ENA have since been merged and you may find the terms used interchangeably for both types of accession numbers, as both can be used to access the same data in the browser. To remain compatible with the other INSDC partners services which remain as separate archives for raw data/assemblies/sequences, we continue to provide both accessions on registration.

### Which accessions should be cited?

- Project PRJEB...
- Assemblies GCA...
- BioSamples (in the context of associated data) SAMEA...
- Assembled/Annotated Sequences A...

### Why can't I search for ERZ accessions?

Note ERZ accessions for genome assemblies are not searchable and they are "private" (however this same type of accession is used for other objects e.g. covid specific files, AMR etc. and these can go public), this is also why on the analysis report one column always showed as private because it was the state of the ERZ accession.

Instead you should use the GCA accession. GCA accessions are only assigned once the assembly goes live and has been processed; historically they were assigned by NCBI, but ENA can now assign them itself. NCBI has actually stopped publicly publishing GCAs, so now these can only be found on ENA.

### Can we move sequences from one project to another?

It is not possible to move samples from one study to another once public. As soon as an assembly goes public the tuple (projectId, sampleId, submitterId, assemblyId) MUST stay unique (this is required for versioning to work). Because of this it is not possible to change the projectId an assembly is in if it is public. Even when the sequences are not public there is a placeholder GCA for the assembly.

### How long does it take for a sequence to become public?

Getting a public accession is not the final step - until the sequences are visible in the browser it will need to go through search Indexing and other processing and only then will it be visible. ENA suggests giving assemblies at least 48hours before worrying.

### What happens if a private accession is made public?

If an insdc accession (e.g. for a project/assembly) is published publicly e.g. in a publication or on twitter this will launch a manual review process for making the data public - even if it is still private.

## Links

- [ENA submission portal docs](https://www.ebi.ac.uk/ena/browser/submit)
- [General Guide to ENA Data Submission](https://ena-docs.readthedocs.io/en/latest/submit/general-guide.html)
- [Updating Metadata](https://ena-docs.readthedocs.io/en/latest/update/metadata.html)
- [Updating Assemblies](https://ena-docs.readthedocs.io/en/latest/update/assembly.html)
- [Brokering Data to ENA](https://ena-docs.readthedocs.io/en/latest/faq/data_brokering.html)
- [Spatiotemporal Metadata Standards](https://ena-docs.readthedocs.io/en/latest/faq/spatiotemporal-metadata.html)
