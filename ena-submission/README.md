## ENA Submission

### Flyway

We use flyway via the CLI. To test flyway locally, [download flyway](https://documentation.red-gate.com/fd/command-line-184127404.html) and have the loculus postgres instance running.

```sh
   docker run -d \
   --name loculus_postgres \
   -e POSTGRES_DB=loculus \
   -e POSTGRES_USER=postgres \
   -e POSTGRES_PASSWORD=unsecure \
   -p 5432:5432 \
   postgres:latest
```

You can then run flyway using the

```
 flyway -user=postgres -password=unsecure -url=jdbc:postgresql://127.0.0.1:5432/loculus -configFiles=./flyway.conf -locations=filesystem:./sql migrate
```

Locally the docker image can be created by

```
docker build -t ena-submission-flyway .
docker run -it -e FLYWAY_URL=jdbc:postgresql://127.0.0.1:5432/loculus -e FLYWAY_USER=postgres -e FLYWAY_PASSWORD=unsecure ena-submission-flyway migrate
```
