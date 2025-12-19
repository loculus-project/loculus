# The version number is also used in the ena-submission-workflow-tests.yml file to extract the Flyway version dynamically.
# We thus require a specific major.minor.patch version here
FROM ghcr.io/loculus-project/flyway@sha256:1398d6a9223ae0f2164d15282c029614d60df826c500f6b78d86498422837945

# Copy configuration and SQL files
COPY conf /flyway/conf
COPY sql /flyway/sql

# Set the entrypoint to a shell command that echoes a message and then runs flyway
ENTRYPOINT ["/bin/bash", "-c", "echo 'Starting Flyway migration' && flyway \"$@\""]