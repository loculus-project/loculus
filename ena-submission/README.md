# ENA Submission

## Developing Locally

### Database

The ENA submission service creates a new schema in the Loculus Postgres DB, managed by flyway. To develop locally you will have to start the postgres DB locally e.g. by using the `../deploy.py` script or using

```sh
docker run -d \
   --name loculus_postgres \
   -e POSTGRES_DB=loculus \
   -e POSTGRES_USER=postgres \
   -e POSTGRES_PASSWORD=unsecure \
   -p 5432:5432 \
   postgres:latest
```

### Install and run flyway

In our kubernetes pod we run flyway in a docker container, however when running locally it is [download the flyway CLI](https://documentation.red-gate.com/fd/command-line-184127404.html) (or `brew install flyway` on macOS).

You can then create the schema using the following command:

```sh
flyway -user=postgres -password=unsecure -url=jdbc:postgresql://127.0.0.1:5432/loculus -schemas=ena-submission -locations=filesystem:./flyway/sql migrate
```

If you want to test the docker image locally. It can be built and run using the commands:

```sh
docker build -t ena-submission-flyway .
docker run -it -e FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/loculus -e FLYWAY_USER=postgres -e FLYWAY_PASSWORD=unsecure ena-submission-flyway flyway migrate
```

### Setting up micromamba environment

<details>

<summary> Setting up micromamba </summary>

The rest of the ena-submission pod uses micromamba:

```sh
brew install micromamba
micromamba shell init --shell zsh --root-prefix=~/micromamba
source ~/.zshrc
```

</details>

Then activate the loculus-ena-submission environment

```sh
micromamba create -f environment.yml --rc-file .mambarc
micromamba activate loculus-ena-submission
```

### Using ENA's webin-cli

In order to submit assemblies you will also need to install ENA's `webin-cli.jar`. Their [webpage](https://ena-docs.readthedocs.io/en/latest/submit/general-guide/webin-cli.html) offers more instructions. This pipeline has been tested with `WEBIN_CLI_VERSION=7.3.1`.

```sh
wget -q "https://github.com/enasequence/webin-cli/releases/download/${WEBIN_CLI_VERSION}/webin-cli-${WEBIN_CLI_VERSION}.jar" -O /package/webin-cli.jar
```

### Running snakemake

Then run snakemake using `snakemake` or `snakemake {rule}`.

### Run tests

```sh
micromamba activate loculus-ena-submission
python3 scripts/test_ena_submission.py
```

### Testing submission locally

ENA-submission currently is only triggered after manual approval.

The `get_ena_submission_list` runs as a cron-job. It queries Loculus for new sequences to submit to ENA (these are sequences that are in state OPEN, were not submitted by the INSDC_INGEST_USER, do not include ena external_metadata fields and are not yet in the submission_table of the ena-submission schema). If it finds new sequences it sends a notification to slack with all sequences.

It is then the reviewer's turn to review these sequences. [TODO: define review criteria] If these sequences meet our criteria they should be uploaded to [pathoplexus/ena-submission](https://github.com/pathoplexus/ena-submission/blob/main/approved/approved_ena_submission_list.json) (currently we read data from the [test folder](https://github.com/pathoplexus/ena-submission/blob/main/test/approved_ena_submission_list.json) - but this will be changed to the `approved` folder in production). The `trigger_submission_to_ena` rule is constantly checking this folder for new sequences and adding them to the submission_table if they do not exist. Note we cannot yet handle revisions so these should not be added to the approved list [TODO: do not allow submission of revised sequences in `trigger_submission_to_ena`]- revisions will still have to be performed manually.

If you would like to test `trigger_submission_to_ena` while running locally you can also use the `trigger_submission_to_ena_from_file` rule, this will read in data from `results/approved_ena_submission_list.json` (see the test folder for an example). You can also upload data to the [test folder](https://github.com/pathoplexus/ena-submission/blob/main/test/approved_ena_submission_list.json) - note that if you add fake data with a non-existent group-id the project creation will fail, additionally the `upload_to_loculus` rule will fail if these sequences do not actually exist in your loculus instance.

All other rules query the `submission_table` for projects/samples and assemblies to submit. Once successful they add accessions to the `results` column in dictionary format. Finally, once the entire process has succeeded the new external metadata will be uploaded to Loculus.

Note that ENA's dev server does not always finish processing and you might not receive a gcaAccession for your dev submissions. If you would like to test the full submission cycle on the ENA dev instance it makes sense to manually alter the gcaAccession in the database using `ERZ24784470`. You can connect to a preview instance via port forwarding to these changes on local database tool such as pgAdmin:

1. Apply the preview `~/.kube/config`
2. Find the database POD using `kubectl get pods -A | grep database`
3. Connect via port-forwarding `kubectl port-forward $POD -n $NAMESPACE 5432:5432`
4. If necessary find password using `kubectl get secret`
