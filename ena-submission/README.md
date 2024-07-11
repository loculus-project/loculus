## ENA Submission

### Developing Locally

The ENA submission pod creates a new schema in the loculus DB, this is managed by flyway. This means to develop locally you will have to start the postgres DB locally e.g. by using the ../deploy.py script or using

```sh
   docker run -d \
   --name loculus_postgres \
   -e POSTGRES_DB=loculus \
   -e POSTGRES_USER=postgres \
   -e POSTGRES_PASSWORD=unsecure \
   -p 5432:5432 \
   postgres:latest
```

In our kubernetes pod we run flyway in a docker container, however when running locally it is best to [download the flyway CLI](https://documentation.red-gate.com/fd/command-line-184127404.html).

You can then run flyway using the

```
 flyway -user=postgres -password=unsecure -url=jdbc:postgresql://127.0.0.1:5432/loculus -schemas=ena-submission -locations=filesystem:./sql migrate
```

If you want to test the docker image locally. It can be built and run using the commands:

```
docker build -t ena-submission-flyway .
docker run -it -e FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/loculus -e FLYWAY_USER=postgres -e FLYWAY_PASSWORD=unsecure ena-submission-flyway flyway migrate
```

The rest of the ena-submission pod uses micromamba:

```bash
brew install micromamba
micromamba shell init --shell zsh --root-prefix=~/micromamba
source ~/.zshrc
```

Then activate the loculus-ena-submission environment

```bash
micromamba create -f environment.yml --platform osx-64 --rc-file .mambarc
micromamba activate loculus-ena-submission
```

Then run snakemake using `snakemake` or `snakemake {rule}`.
