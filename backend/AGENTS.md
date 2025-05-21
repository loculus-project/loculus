To run tests:

USE_LOCAL_BINARIES=true DISABLE_DOCKER_CHECK=true ./gradlew test

The backend tests will take quite a while to run fully.


To lint

./gradlew ktlintFormat

and

./gradlew ktlintCheck

Always do these things before committing.