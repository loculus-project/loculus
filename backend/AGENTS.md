Kotlin dependent packages have already been installed for you.

To run tests:

USE_NONDOCKER_INFRA=true ./gradlew test --console=plain

The backend tests will take quite a while to run fully - give them some time.

To lint:

./gradlew ktlintFormat


Always ensure the tests and lint pass before committing.


Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.