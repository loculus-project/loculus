# ENA Submission

## Cronjob

### get_ena_submission_list

This script runs daily in a cron job, it calls the loculus backend (`get-released-data`), obtains a new list of sequences that are ready for submission to ENA and sends this list as a compressed json file to our slack channel. Sequences are ready for submission IF:

- data in state APPROVED_FOR_RELEASE:
- data must be state "OPEN" for use
- data must not already exist in ENA or be in the submission process, this means:
  - data was not submitted by the `config.ingest_pipeline_submitter`
  - data is not in the `ena-submission.submission_table`
  - as an extra check we discard all sequences with `ena-specific-metadata` fields

## Threads

The ena_deposition package, runs the following subfunctions in parallel:

#### trigger_submission_to_ena

Download file in `github_url` every 30s. If data is not in submission table already (and not a revision) upload data to `ena-submission.submission_table`.

#### create_project

In a loop:

- Get sequences in `submission_table` in state READY_TO_SUBMIT
  - if (there exists an entry in the project_table for the corresponding (group_id, organism)):
    - if (entry is in status SUBMITTED): update `submission_table` to SUBMITTED_PROJECT.
    - else: update submission_table to SUBMITTING_PROJECT.
  - else: create project entry in `project_table` for (group_id, organism).
- Get sequences in `submission_table` in state SUBMITTING_PROJECT
  - if (corresponding `project_table` entry is in state SUBMITTED): update entries to state SUBMITTED_PROJECT.
- Get sequences in `project_table` in state READY, prepare submission object, set status to SUBMITTING
  - if (submission succeeds): set status to SUBMITTED and fill in results: the result of a successful submission is `bioproject_accession` and an ena-internal `ena_submission_accession`.
  - else: set status to HAS_ERRORS and fill in errors
- Get sequences in `project_table` in state HAS_ERRORS for over 15min and sequences in status SUBMITTING for over 15min: send slack notification

##### Known limitations

Group info can be updated in loculus after the project has been created in ENA. This is not currently handled by the pipeline. Issue: <https://github.com/loculus-project/loculus/issues/2939>

#### create_sample

Maps loculus metadata to ena metadata using template: https://www.ebi.ac.uk/ena/browser/view/ERC000033

In a loop

- Get sequences in `submission_table` in state SUBMITTED_PROJECT
  - if (there exists an entry in the `sample_table` for the corresponding (accession, version)):
    - if (entry is in status SUBMITTED): update `submission_table` to SUBMITTED_SAMPLE.
    - else: update submission_table to SUBMITTING_SAMPLE.
  - else: create sample entry in `sample_table` for (accession, version).
- Get sequences in `submission_table` in state SUBMITTING_SAMPLE
  - if (corresponding `sample_table` entry is in state SUBMITTED): update entries to state SUBMITTED_SAMPLE.
- Get sequences in `sample_table` in state READY, prepare submission object, set status to SUBMITTING
  - if (submission succeeds): set status to SUBMITTED and fill in results, the results of a successful submission are an `sra_run_accession` (starting with ERS) , a `biosample_accession` (starting with SAM) and an ena-internal `ena_submission_accession`.
  - else: set status to HAS_ERRORS and fill in errors
- Get sequences in `sample_table` in state HAS_ERRORS for over 15min and sequences in status SUBMITTING for over 15min: send a slack notification

#### create_assembly

In a loop:

- Get sequences in `submission_table` in state SUBMITTED_SAMPLE
  - if (there exists an entry in the `assembly_table` for the corresponding (accession, version)):
    - if (entry is in status SUBMITTED): update `assembly_table` to SUBMITTED_ASSEMBLY.
    - else: update `assembly_table` to SUBMITTING_ASSEMBLY.
  - else: create assembly entry in `assembly_table` for (accession, version).
- Get sequences in `submission_table` in state SUBMITTING_SAMPLE
  - if (corresponding `assembly_table` entry is in state SUBMITTED): update entries to state SUBMITTED_ASSEMBLY.
- Get sequences in `assembly_table` in state READY, prepare files: we need chromosome_list, fasta files and a manifest file, set status to WAITING
  - if (submission succeeds): set status to WAITING and fill in results: ena-internal `erz_accession`
  - else: set status to HAS_ERRORS and fill in errors
- Get sequences in `assembly_table` in state WAITING, every 5minutes (to not overload ENA) check if ENA has processed the assemblies and assigned them `gca_accession`. If so update the table to status SUBMITTED and fill in results
- Get sequences in `assembly_table` in state HAS_ERRORS for over 15min and sequences in status SUBMITTING for over 15min, or in state WAITING for over 48hours: send slack notification

#### upload_to_loculus

- Get sequences in `submission_table` state SUBMITTED_ALL.
- Get the results of all the submissions (from all other tables)
- Create a POST request to the submit-external-metadata with the results in the expected format.
  - if (successful): set sequences to state SENT_TO_LOCULUS
  - else: set sequences to state HAS_ERRORS_EXT_METADATA_UPLOAD
- Get sequences in `submission_table` in state HAS_ERRORS_EXT_METADATA_UPLOAD for over 15min and sequences in status SUBMITTED_ALL for over 15min: send slack notification

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

In our kubernetes pod we run flyway in a docker container, however when running locally it is best to [download the flyway CLI](https://documentation.red-gate.com/fd/command-line-184127404.html) (or `brew install flyway` on macOS).

You can then create the schema using the following command:

```sh
flyway -user=postgres -password=unsecure -url=jdbc:postgresql://127.0.0.1:5432/loculus -schemas=ena_deposition_schema -locations=filesystem:./flyway/sql migrate
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

## Testing

> [!WARNING]
> When testing always submit to ENA's test/dev instance. This means for XML post requests (i.e. for project and sample creation), sending them to `https://wwwdev.ebi.ac.uk/ena` and for webin-cli requests (i.e. assembly creation) adding the `-test` flag. This is done automatically when the `submit_to_ena_prod` is set to False (which is the default). Do not change this flag locally unless you know what you are doing.
> Using our ENA test account does **not** affect which ENA instance you submit to, if you use our test account and submit to ENA production you will have officially submitted samples to ENA.

### Run tests

```sh
micromamba activate loculus-ena-submission
python3 scripts/test_ena_submission.py
```

You can also use the `deposition_dry_run.py` script to produce the same output files/XMLs that the pipeline would produce in order to submit to ENA. This is a good test if you would like to first verify what your submission to ENA will look like. Make sure that you have the same config.yaml that will be used in production (use deploy.py to generate this). Also note that the generator can only produce output for one submission at a time.

```
python scripts/deposition_dry_run.py --log-level=DEBUG --data-to-submit=results/approved_ena_submission_list.json --mode=assembly --center-name="Yale" --config-file=config/config.yaml
```

### Testing submission locally

1. Run loculus locally (need prepro, backend and ena-submission pod), e.g.

```sh
../deploy.py cluster --dev
../deploy.py helm --dev --enablePreprocessing
../generate_local_test_config.sh
cd ../backend
./start_dev.sh &
cd ../ena-submission
micromamba activate loculus-ena-submission
pip install -e .
flyway -user=postgres -password=unsecure -url=jdbc:postgresql://127.0.0.1:5432/loculus -schemas=ena_deposition_schema -locations=filesystem:./flyway/sql migrate
```

2. Submit data to the backend as test user (create group, submit and approve), e.g. using [example data](https://github.com/pathoplexus/example_data). (To test the full submission cycle with insdc accessions submit cchf example data with only 2 segments.)

```sh
KEYCLOAK_TOKEN_URL="http://localhost:8083/realms/loculus/protocol/openid-connect/token"
KEYCLOAK_CLIENT_ID="backend-client"
usernameAndPassword="testuser"
jwt_keycloak=$(curl -X POST "$KEYCLOAK_TOKEN_URL" --fail-with-body -H 'Content-Type: application/x-www-form-urlencoded' -d "username=$usernameAndPassword&password=$usernameAndPassword&grant_type=password&client_id=$KEYCLOAK_CLIENT_ID")
JWT=$(echo "$jwt_keycloak" | jq -r '.access_token')
curl -X 'POST' 'http://localhost:8079/groups' \
  -H 'accept: application/json' \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{
  "groupName": "ENA submission Group",
  "institution": "University of Loculus",
  "address": {
    "line1": "1234 Loculus Street",
    "line2": "Apt 1",
    "city": "Dortmund",
    "state": "NRW",
    "postalCode": "12345",
    "country": "Germany"
  },
  "contactEmail": "something@loculus.org"}'
LOCULUS_ACCESSION=$(curl -X 'POST' \
  'http://localhost:8079/cchf/submit?groupId=1&dataUseTermsType=OPEN' \
  -H 'accept: application/json' \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: multipart/form-data' \
  -F 'metadataFile=@../../example_data/example_files/cchfv_test_metadata.tsv;type=text/tab-separated-values' \
  -F 'sequenceFile=@../../example_data/example_files/cchfv_test_sequences.fasta' | jq -r '.[0].accession')
curl -X 'POST' 'http://localhost:8079/cchf/approve-processed-data' \
  -H 'accept: application/json' \
  -H "Authorization: Bearer ${JWT}" \
  -H 'Content-Type: application/json' \
  -d '{"scope": "ALL"}'
```

3. Get list of sequences ready to submit to ENA, locally this will write `results/ena_submission_list.json`.

```sh
python scripts/get_ena_submission_list.py --config-file=config/config.yaml --output-file=results/ena_submission_list.json
```

4. Check contents and then rename to `results/approved_ena_submission_list.json`, trigger ena submission by adding entries to the submission table and using the `--input-file` flag

```sh
cp results/ena_submission_list.json results/approved_ena_submission_list.json
ena_deposition --config-file=config/config.yaml --input-file=results/approved_ena_submission_list.json
```

Alternatively you can upload data to the [test folder](https://github.com/pathoplexus/ena-submission/blob/main/test/approved_ena_submission_list.json) and run:

```sh
ena_deposition --config-file=config/config.yaml
```

Note that if you use data that you have not uploaded to Loculus the final step (uploading the results of ENA submission to Loculus) will fail as the accession will be unknown.

6. Note that ENA's dev server does not always finish processing and you might not receive a `gcaAccession` for your dev submissions. If you would like to test the full submission cycle on the ENA dev instance it makes sense to manually alter the gcaAccession in the database to `ERZ24784470` (a known test submission with 2 chromosomes/segments - sadly ERZ accessions are private so I do not have other test examples). You can do this after connecting via pgAdmin or connecting via the CLI:

```sh
psql -h 127.0.0.1:5432 -U postgres -d loculus
```

Then perform the update:

```sql
SET search_path TO "ena-submission";
UPDATE assembly_table
SET result = '{"erz_accession": "ERZ24784470", "segment_order": ["L", "M"]}'::jsonb
WHERE accession = '$LOCULUS_ACCESSION';
```

Exit `psql` using `\q`.

If you experience issues you can look at the database locally using pgAdmin. On local instances the password is `unsecure`.

### Testing submission on a preview instance

1. Upload data to the [test folder](https://github.com/pathoplexus/ena-submission/blob/main/test/approved_ena_submission_list.json) - note that if you add fake data with a non-existent group-id the project creation will fail, additionally the `upload_to_loculus` rule will fail if these sequences do not actually exist in your loculus instance.

2. Connect to the database of the preview instance via port forwarding using a database tool such as pgAdmin:

- Apply the preview `~/.kube/config`
- Find the database POD using `kubectl get pods -A | grep database`
- Connect via port-forwarding `kubectl port-forward $POD -n $NAMESPACE 5432:5432`
- If necessary find password using `kubectl get secret`
