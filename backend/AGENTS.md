Kotlin dependent packages have already been installed for you.

First check whether Docker is present (e.g. `docker info`). If it is, prefer running tests through Docker:

./gradlew test --console=plain

Only fall back to the non-Docker route if Docker is not present or the Docker-based run fails (e.g. when running inside a cloud environment):

USE_NONDOCKER_INFRA=true ./gradlew test --console=plain

The backend tests will take quite a while to run fully - give them some time.

To lint:

./gradlew ktlintFormat


Always ensure the tests and lint pass before committing.


Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.
