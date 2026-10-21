#!/bin/sh
JVM_OPTS=${JVM_OPTS:-}
# Take script arguments
ARGS="${*}"

NATIVE_ACCESS_FLAG="--enable-native-access=ALL-UNNAMED"
if [ -n "$JVM_OPTS" ]; then
    CMD="java $NATIVE_ACCESS_FLAG $JVM_OPTS -jar app.jar --spring.profiles.active=docker $ARGS"
else
    CMD="java $NATIVE_ACCESS_FLAG -jar app.jar --spring.profiles.active=docker $ARGS"
fi
echo Running:
echo "$CMD"
$CMD
