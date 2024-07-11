FROM flyway/flyway:latest

# Copy configuration and SQL files
COPY conf /flyway/conf
COPY sql /flyway/sql

# Set the entrypoint to a shell command that echoes a message and then runs flyway
ENTRYPOINT ["/bin/bash", "-c", "echo 'Starting Flyway migration' && flyway \"$@\""]