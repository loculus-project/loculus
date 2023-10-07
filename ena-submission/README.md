# ENA submission service

This service implements the ENA submission. A general description of the submission process is available at [ena-submission.md](./ena-submission.md).

A sample pipeline is implemented in the snakemake file [Snakefile](./Snakefile).

## Prior art

- <https://github.com/bigey/ena-submit>
- <https://github.com/ukhsa-collaboration/ena_submission>
- <https://github.com/sanger-pathogens/Bio-ENA-DataSubmission>
- <https://github.com/sholt6/ena_webin_bioproject_study_set_validation_submission/blob/master/study_subs.py>
- <https://github.com/happykhan/subhelper>
- <https://github.com/maximilianh/multiSub> (SARS-CoV-2 only)

## Blocking issues

- Can't test ENA submissions on test server due to ["missing center name" issue](https://github.com/enasequence/read_docs/issues/161)