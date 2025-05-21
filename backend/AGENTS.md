Kotlin dependent packages have already been installed for you.

To run tests:

USE_LOCAL_BINARIES=true DISABLE_DOCKER_CHECK=true ./gradlew test --console=plain

The backend tests will take quite a while to run fully - give them some time.

To lint:

./gradlew ktlintFormat

Always ensure the tests and lint pass before committing.