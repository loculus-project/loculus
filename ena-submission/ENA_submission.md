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

In contrast to ENA, Pathoplexus has no hierarchy of study/sample/sequence. Therefore we have decided to create _one_ study per Loculus submission group and organism. For each Loculus sample we will create one sample (with metadata) and one sequence (with the sequence).

### Mapping sequences and studies

The following could be implement as post-MVP features:

- Let submitters decide whether each sequence should be its own study or whether all sequences should be one study.
- Allow submitters to group their sequences into studies.

### URLs

- Test service URL: https://wwwdev.ebi.ac.uk/ena/submit/webin/login
- Production service URL: https://www.ebi.ac.uk/ena/submit/webin/login

## Submission process

## 1. Registering a study programmatically

1. Create the study XML ([schema](https://ftp.ebi.ac.uk/pub/databases/ena/doc/xsd/sra_1_5/ENA.project.xsd)):

   ```xml
   <!--filename: project.xml-->
   <PROJECT_SET>
   <PROJECT alias={group_accession}:{organism}>
        <NAME>{ncbiVirusName}</NAME>
        <TITLE>{ncbiVirusName} Genome sequencing</TITLE>
        <DESCRIPTION>Automated upload of {ncbiVirusName} sequences submitted by {Institution} from {db}.</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
            <ORGANISM>
            <TAXON_ID>{taxon_id}</TAXON_ID>
            <SCIENTIFIC_NAME>{ncbiVirusName}</SCIENTIFIC_NAME>
            </ORGANISM>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                <DB>{db}</DB>
                <ID>{group_accession}</ID>
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

## 2. Registering a sample programmatically

[Docs](https://ena-docs.readthedocs.io/en/latest/submit/samples.html)

1. Find correct "minimal metadata" set defined by an appropriate [checklist](https://www.ebi.ac.uk/ena/browser/checklists). In our case, probably the [ENA virus pathogen reporting standard checklist](https://www.ebi.ac.uk/ena/browser/view/ERC000033). There's a more specific one for [Influenza](https://www.ebi.ac.uk/ena/browser/view/ERC000032) and a general [default](https://www.ebi.ac.uk/ena/browser/view/ERC000011) one. This in fact should be reflected in the Pathoplexus metadata model.
2. Create the sample XML (multiple samples can be in one sample set):

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

## 3. Submitting sequences (assembly)

[Docs](https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html)

1. Create [manifest file](https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html#manifest-files) for assembly metadata and file specification (manifest.tsv). The metadata rows are (relevant ones for us):

   - STUDY: Study accession - mandatory
   - SAMPLE: Sample accession - mandatory
   - ASSEMBLYNAME: Unique assembly name, user-provided - mandatory
   - ASSEMBLY_TYPE: ‘clone or isolate’ - mandatory
   - COVERAGE: The estimated depth of sequencing coverage - mandatory
   - PROGRAM: The assembly program - mandatory
   - PLATFORM: The sequencing platform, or comma-separated list of platforms - mandatory

   The file specification rows are:

   - FLATFILE: sequences in embl flatfile format (alternatively use FASTA)
   - CHROMOSOME_LIST: list of chromosomes

   An example manifest.tsv:

   ```tsv
   STUDY	PRJEBxxxxxx
   SAMPLE	SAMEAxxxxxx
   ASSEMBLYNAME	Standard assembly
   ASSEMBLY_TYPE	isolate
   COVERAGE	100
   PROGRAM	iVar
   PLATFORM	Illumina
   FLATFILE	genome.embl.gz
   CHROMOSOME_LIST	chromosome_list.tsv
   ```

2. Create chromosome list file (chromosome_list.tsv)

   ```tsv
   sequence_id	chromosome_name	chromosome_type
   ha	ha	segmented
   na	na	segmented
   ```

3. Create the assembly

a. Create fasta file (genome.fasta) containing all the sequences in fasta format:

```fasta
>ha
ACGT
>na
ACGT
```

b. Or create flatfiles: https://ena-docs.readthedocs.io/en/latest/submit/fileprep/flat-file-example.html, which can include annotations: https://www.ebi.ac.uk/ena/WebFeat/ (see section 4 for more details). As we are submitting as a broker it is important that we add the AUTHORS and ADDRESS to the assembly manifest file: https://ena-docs.readthedocs.io/en/latest/faq/data_brokering.html#authorship.

4. Submit the files using the webin-cli:

   ```sh
   ena-webin-cli -[validate|submit] \
       -context genome \
       -manifest manifest.tsv \
       -username Webin-XXXXX \
       -password YYYYYY
   ```

5. Save ERZ accession numbers (these will be returned by the webin-cli)
6. Wait to receive GCA accession numbers (returned later after assignment by NCBI). This can be retrieved via https://wwwdev.ebi.ac.uk/ena/submit/report/swagger-ui/index.html

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

## 4 Submitting annotated assemblies to ENA

ENA docs say they require pre-registration of a [locus_tag_prefix](https://ena-docs.readthedocs.io/en/latest/faq/locus_tags.html) in order to submit annotated assemblies - however we have succeeded in submitted annotated embl files without these tags.

Given a nextclade dataset and a sequence, nextclade can be used to generate GFF3 files and/or tab-separated feature tables (tbl) files, these must still be converted into the required embl-annotation format.

```
nextclade run {sequence.fasta}  --output-all annotations --server {server} --output-annotation-tbl annotations.embl --dataset-name {dataset}
```

The nextclade.json that is produced also contains annotations - we are [working](https://github.com/loculus-project/loculus/issues/3739) on using this annotation object to add annotations to the .embl flat files we submit:

```json
"annotation": {
        "genes": [
          {
            "index": 0,
            "id": "NS1",
            "name": "NS1",
            "range": {
              "begin": 56,
              "end": 476
            },
            "cdses": [
              {
                "id": "NS1",
                "name": "NS1",
                "product": "nonstructural protein 1",
                "segments": [
                  {
                    "index": 1,
                    "id": "NS1",
                    "name": "NS1",
                    "range": {
                      "begin": 56,
                      "end": 476
                    },
                    "rangeLocal": {
                      "begin": 0,
                      "end": 420
                    },
                    "landmark": null,
                    "wrappingPart": "non-wrapping",
                    "strand": "+",
                    "frame": 2,
                    "phase": 0,
                    "truncation": "none",
                    "exceptions": [],
                    "attributes": {
                      "locus_tag": [
                        "NS1"
                      ],
                      "seq_index": [
                        "0"
                      ],
                      "product": [
                        "nonstructural protein 1"
                      ],
                      "protein_id": [
                        "QPB74302.1"
                      ],
                      "Name": [
                        "NS1"
                      ],
                      "ID": [
                        "CDS-0-NS1"
                      ],
                      "Parent": [
                        "Gene-0-NS1"
                      ]
                    },
                    "compatIsGene": false,
                    "color": null,
                    "gffSeqid": "LOC_0011LRU.1",
                    "gffSource": "feature",
                    "gffFeatureType": "CDS"
                  }
                ],
                "proteins": [],
                "exceptions": [],
                "attributes": {
                  "locus_tag": [
                    "NS1"
                  ],
                  "codon_start": [
                    "1"
                  ],
                  "product": [
                    "nonstructural protein 1"
                  ],
                  "protein_id": [
                    "QPB74302.1"
                  ],
                  "Name": [
                    "NS1"
                  ],
                  "seq_index": [
                    "0"
                  ]
                },
                "compatIsGene": false,
                "color": null
              }
            ],
            "exceptions": [],
            "attributes": {
              "seq_index": [
                "0"
              ],
              "ID": [
                "Gene-0-NS1"
              ],
              "Name": [
                "NS1"
              ],
              "product": [
                "NS1"
              ]
            },
            "compatIsCds": true,
            "color": null,
            "gffSeqid": "LOC_0011LRU.1",
            "gffSource": "feature",
            "gffFeatureType": "CDS"
          },
          ...
        ]
      }
```

Another way to add annotations to the .embl flat file is to reformat the .tbl file produced by nextclade (using the python Bio.SeqFeatures class for this is quite useful). Alternatively, https://github.com/NBISweden/EMBLmyGFF3 will generate an .embl flat file given a sequence's gff3 file. However, when used on the GFF3 file produced by nextclade it adds ERRORS and WARNINGS (to the resulting output .embl flat file) making the files un-submittable without further processing. This is due to the gff3 files containing non-standard annotations (e.g. `region` and `seq_index`). A work around would be removing them from the GFF3 file before using the package. The package also does not give an option to add additional `country` and `collection_date` qualifiers to the .embl flat files which we typically add when submitting to ENA. So I decided against using it.

## Submitting raw reads to ENA

In order to submit raw reads you must:

1. Create a bioproject object (see above)
2. Create a biosample object (see above)
3. Create a run object. The run submission holds information about the raw read files generated in a run of sequencing as well as their location on an FTP server.
4. Create an experiment object. The experiment submission holds metadata that describe the methods used to sequence the sample.

Webin will report two unique accession numbers for each read submission. The first starts with ERR and is called the Run accession. The other starts with ERX and is called the Experiment accession.

### Submission via webin-cli

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

### Programmatic submission

There is also a way to submit using XMLs and curl (see https://ena-docs.readthedocs.io/en/latest/submit/reads/programmatic.html), however this requires registering each run and experiment object individually via curl and additionally pre-uploading the files to our webin account, so it seems easier to use the webin-cli.

# Revising Submissions to ENA

## 1. [Revising Studies (Projects) and Samples](https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-study.html)

Revisions to a study or sample should be submitted the same way as original sequences were submitted, with the `ADD` action in the submission request should be changed to a `MODIFY`. However, the alias must BE THE SAME as the previous version or the assigned accession number must be added for the correct sample/study to be updated.

## 2. [Revising Assemblies](https://ena-docs.readthedocs.io/en/latest/update/assembly.html)

It appears that all fields that were explicitly set via the manifest must be updated via an email. This includes changes to any field that is in the `manifest_fields_mapping` field of the default.yaml. Additionally, study and sample reference must stay the same and chromosome names cannot be changed (but new ones can be added).
However, unlike the alias a NEW `ASSEMBLYNAME` is required (cannot be the same as the assemblyname of the previous version).

Currently we automate revision of studies and assemblies, if a manifest update is required the pipeline will not update the assembly but set the state of assembly submission to `HAS_ERRORS` and document the reason for the errors in the database. We will then receive a slack notification and will have to manually send an email to ENA to update the manifest.

## Promises made to ENA

- "I confirm that the data submitted through this account is NOT sensitive, restricted-access or human-identifiable." -> We will want to mirror this into Pathoplexus submissions, at least the sensitive and human-identifiable parts.

## FAQs

### What's the difference between `assemblies` and `annotated sequences`?

In ENA aligned fasta files are considered assemblies of chromosomes, these are in the Analysis field of the metadata model. I further believe this should be submitted as part of Genome Assemblies (`-context genome` flag in webin CLI)

I believe this doc should cover all the steps: https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html I am still not quite sure if we use chromosome assembly or just contig assembly - here is the information on the submission CLI: https://ena-docs.readthedocs.io/en/latest/submit/general-guide/webin-cli.html.

To make a sequence public I believe we will need to update which study/project the analysis is associated with: https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-read.html.

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

Note ERZ accessions for genome assembles are not searchable and they are "private" (however this same type of accession is used for other objects e.g. covid specific files, AMR etc. and these can go public), this is also why on the analysis report one column always showed as private because it was the state of the ERZ accession.

Instead you should use the GCA accession. These are distributed by NCBI (this is now changing as ENA has now gotten permission to assign these programmatically) and are only assigned when the assembly goes live and is processed by NCBI. There are some delays here still in the display as ENA is changing to using their own assignment.

### What would the end-to-end flow of submitting sequences for pathoplexus look like?

1. [Register study programmatically](https://ena-docs.readthedocs.io/en/latest/submit/study/programmatic.html)
2. Upload sequences using what route? Which files are needed?

### What information do we give to the original submitter?

- There are "Webin Portal Reports" that we could share with original submitters?

### Can we move sequences from one project to another?

It is not possible to more samples from one study to another once public. As soon as a assembly goes public the tuple (projectId, sampleId, submitterId, assemblyId) MUST stay unique (this is required for versioning to work). Because of this it is not possible to change the projectId an assembly is in if it is public. Even when the sequences are not public there is a placeholder GCA for the assembly.

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
