# The version number is also used in the ena-submission-workflow-tests.yml file to extract the Flyway version dynamically.
# We thus require a specific major.minor.patch version here
FROM ghcr.io/loculus-project/flyway:11.10.0-alpine-mongo

# Copy configuration and SQL files
COPY conf /flyway/conf
COPY sql /flyway/sql

# Set the entrypoint to a shell command that echoes a message and then runs flyway
ENTRYPOINT ["/bin/bash", "-c", "echo 'Starting Flyway migration' && flyway \"$@\""]