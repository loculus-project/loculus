Kotlin dependent packages have already been installed for you.

Run tests like this (if you have Docker set up properly):

./gradlew test --console=plain

If that doesn't work due to Docker issues because you're running inside a cloud environment, try this:

USE_NONDOCKER_INFRA=true ./gradlew test --console=plain

The backend tests will take quite a while to run fully - give them some time.

To lint:

./gradlew ktlintFormat


Always ensure the tests and lint pass before committing.


Use conventional commits as titles for PRs, e.g. feat(deployment):xx, fix!(website):xx, chore(backend):xx.
Components include: website, backend, deployment, preprocessing, ingest, deposition.
