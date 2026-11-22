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
# Don't echo $ARGS: it contains secrets (passwords, keys) injected from Kubernetes secrets
echo "Starting backend with JVM_OPTS: ${JVM_OPTS:-<none>}"
$CMD
