# Submitting to ENA

## Overview

Three routes:

- Interactive web form: not what we want because we want to automate
- Webin command line tool: only one that allows assembly submission
- HTTP API: Only one that allows study and sample submission

## Metadata model

We have to map the Pathoplexus metadata model to the [ENA metadata model](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/metadata.html). If ENA requires certain metadata, Pathoplexus needs to request it during submission or impute it.

At the time of writing (October 2023), in contrast to ENA, Pathoplexus has no hierarchy of study/sample/sequence: every sequence is its own study and sample. Thus, each sequence will have to be submitted to ENA as its own study and sample. Alternatively, each submitter could have exactly _one_ study.

![ENA metadata model](https://ena-docs.readthedocs.io/en/latest/_images/metadata_model_whole.png)

### Mapping sequences and studies

The following could be implement as post-MVP features:

- Let submitters decide whether each sequence should be its own study or whether all sequences should be one study.
- Allow submitters to group their sequences into studies.
- ORCID can be linked to studies/projects (see [citing ENA](https://www.ebi.ac.uk/ena/browser/about/citing-ena))

## Promises made to ENA

- "I confirm that the data submitted through this account is NOT sensitive, restricted-access or human-identifiable." -> We will want to mirror this into Pathoplexus submissions, at least the sensitive and human-identifiable parts.

## Links

- [ENA submission portal docs](https://www.ebi.ac.uk/ena/browser/submit)
- [General Guide to ENA Data Submission](https://ena-docs.readthedocs.io/en/latest/submit/general-guide.html)
- [Updating Metadata](https://ena-docs.readthedocs.io/en/latest/update/metadata.html)
- [Updating Assemblies](https://ena-docs.readthedocs.io/en/latest/update/assembly.html)
- [Brokering Data to ENA](https://ena-docs.readthedocs.io/en/latest/faq/data_brokering.html)
- [Spatiotemporal Metadata Standards](https://ena-docs.readthedocs.io/en/latest/faq/spatiotemporal-metadata.html)