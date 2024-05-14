#!/bin/sh
JVM_OPTS=${JVM_OPTS:-}
# Take script arguments
ARGS="${*}"

if [ -n "$JVM_OPTS" ]; then
    CMD="java $JVM_OPTS -jar app.jar --spring.profiles.active=docker $ARGS"
else
    CMD="java -jar app.jar --spring.profiles.active=docker $ARGS"
fi
echo Running:
echo "$CMD"
$CMD
