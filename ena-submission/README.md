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

In our kubernetes pod we run flyway in a docker container, however when running locally it is  [download the flyway CLI](https://documentation.red-gate.com/fd/command-line-184127404.html) (or `brew install flyway` on macOS).

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

<details>

Then activate the loculus-ena-submission environment

```sh
micromamba create -f environment.yml --rc-file .mambarc
micromamba activate loculus-ena-submission
```

### Running snakemake

Then run snakemake using `snakemake` or `snakemake {rule}`.
