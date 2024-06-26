## Things to keep in mind:

- Submission Account must be made using Webin submission account.
- Otherwise recommended to use the Webin CLI
- Centre name: note that the value will be applied irrevocably to all submissions you make from this account. Always make sure your account’s centre name is correct before you perform a submission.

### Metadata Model

Study: A study (project) groups together data submitted to the archive and **controls its release date**. A study accession is typically used when citing data submitted to ENA. Note that all associated data and other objects are made public when the study is released.

Sample: A sample contains information about the sequenced source material. Samples are associated with checklists, which define the fields used to annotate the samples. Samples are always associated with a taxon.

Experiment: An experiment contains information about a sequencing experiment including library and instrument details.

Run: A run is part of an experiment and refers to data files containing sequence reads.

Analysis: An analysis contains secondary analysis results derived from sequence reads (e.g. a genome assembly).

Submission: A submission contains submission actions to be performed by the archive. A submission can add more objects to the archive, update already submitted objects or make objects publicly available.

### Project vs Study

Every Project in ENA has a secondary Study accession. Before ENA was combined as a single archive, it was a separate archive for raw data (ERA which used the Study accession) and constructed assemblies/sequences (EMBL-Bank which used the Project accession). The Project and Study in ENA have since been merged and you may find the terms used interchangeably for both types of accession numbers, as both can be used to access the same data in the browser. To remain compatible with the other INSDC partners services which remain as separate archives for raw data/assemblies/sequences, we continue to provide both accessions on registration.

### Accession to cite

- Project PRJEB...
- Assemblies GCA...
- BioSamples (in the context of associated data) SAMEA...
- Assembled/Annotated Sequences A...

### URLs

- Test service URL: https://wwwdev.ebi.ac.uk/ena/submit/webin/login
- Production service URL: https://www.ebi.ac.uk/ena/submit/webin/login

### FASTA files

In ENA aligned fasta files are considered assemblies of chromosomes, these are in the Analysis field of the metadata model. I further believe this should be submitted as part of Genome Assemblies (`-context genome` flag in webin CLI)

I believe this doc should cover all the steps: https://ena-docs.readthedocs.io/en/latest/submit/assembly/genome.html I am still not quite sure if we use chromosome assembly or just contig assembly - here is the information on the submission CLI: https://ena-docs.readthedocs.io/en/latest/submit/general-guide/webin-cli.html.

To make a sequence public I believe we will need to update which study/project the analysis is associated with: https://ena-docs.readthedocs.io/en/latest/update/metadata/programmatic-read.html.
