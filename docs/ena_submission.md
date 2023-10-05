# Submitting to ENA

## Overview

Three routes:

- Interactive web form: not what we want because we want to automate ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html))
- Webin command line tool: only one that allows assembly submission ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/webin-cli.html))
- HTTP XML-based API: Only one that allows study and sample submission ([docs](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/programmatic.html))

## Metadata model

We have to map the Pathoplexus metadata model to the [ENA metadata model](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/metadata.html). If ENA requires certain metadata, Pathoplexus needs to request it during submission or impute it.

At the time of writing (October 2023), in contrast to ENA, Pathoplexus has no hierarchy of study/sample/sequence: every sequence is its own study and sample. Thus, each sequence will have to be submitted to ENA as its own study and sample. Alternatively, each submitter could have exactly _one_ study.

![ENA metadata model](https://ena-docs.readthedocs.io/en/latest/_images/metadata_model_whole.png)

### Mapping sequences and studies

The following could be implement as post-MVP features:

- Let submitters decide whether each sequence should be its own study or whether all sequences should be one study.
- Allow submitters to group their sequences into studies.
- ORCID can be linked to studies/projects (see [citing ENA](https://www.ebi.ac.uk/ena/browser/about/citing-ena))

## Submission process

### Interactive web form

It's possible to do interactive test submissions here: <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html>.
This is useful for testing as the interactive submission might have better error messages than the command line tool. See <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/interactive.html>

### Webin CLI

Submission stages:

1. Register Study, Register Sample (needs to be done with XML API)
2. Prepare Files
3. Validate Files, Submit Files

Each submission must be associated with an existing study and sample.

### Programmatically

Schemas: <https://ena-docs.readthedocs.io/en/latest/submit/general-guide/programmatic.html#types-of-xml>

## Registering a study programatically

Every submission must be associated with a study. The study can't be created using the CLI. At the time of writing (October 2023) it's unclear whether each sequence should be its own study or whether all sequences from a submitter should belong to one study.

1. Create the study XML ([schema](https://ftp.ebi.ac.uk/pub/databases/ena/doc/xsd/sra_1_5/ENA.project.xsd)):

    ```xml
    <!--filename: project.xml-->
    <PROJECT_SET>
    <PROJECT alias="iranensis_wgs">
        <NAME>WGS Streptomyces iranensis</NAME>
        <TITLE>Whole-genome sequencing of Streptomyces iranensis</TITLE>
        <DESCRIPTION>The genome sequence of Streptomyces iranensis (DSM41954) was obtained using Illumina HiSeq2000. The genome was assembled using a hybrid assembly approach based on Velvet and Newbler. The resulting genome has been annotated with a specific focus on secondary metabolite gene clusters.</DESCRIPTION>
        <SUBMISSION_PROJECT>
            <SEQUENCING_PROJECT/>
        </SUBMISSION_PROJECT>
        <PROJECT_LINKS>
            <PROJECT_LINK>
                <XREF_LINK>
                <DB>PUBMED</DB>
                <ID>25035323</ID>
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

## Registering a sample programatically

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

    and contains the accession number(s).


## Promises made to ENA

- "I confirm that the data submitted through this account is NOT sensitive, restricted-access or human-identifiable." -> We will want to mirror this into Pathoplexus submissions, at least the sensitive and human-identifiable parts.

## FAQs

### What's the difference between `assemblies` and `annotated sequences`?

### What would the end-to-end flow of submitting sequences for pathoplexus look like?

1. [Register study programatically](https://ena-docs.readthedocs.io/en/latest/submit/study/programmatic.html)
2. Upload sequences using what route? Which files are needed?

### What information do we give to the original submitter?

- There are "Webin Portal Reports" that we could share with original submitters?

## Links

- [ENA submission portal docs](https://www.ebi.ac.uk/ena/browser/submit)
- [General Guide to ENA Data Submission](https://ena-docs.readthedocs.io/en/latest/submit/general-guide.html)
- [Updating Metadata](https://ena-docs.readthedocs.io/en/latest/update/metadata.html)
- [Updating Assemblies](https://ena-docs.readthedocs.io/en/latest/update/assembly.html)
- [Brokering Data to ENA](https://ena-docs.readthedocs.io/en/latest/faq/data_brokering.html)
- [Spatiotemporal Metadata Standards](https://ena-docs.readthedocs.io/en/latest/faq/spatiotemporal-metadata.html)