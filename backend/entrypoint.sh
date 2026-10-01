#!/bin/sh
JVM_OPTS=${JVM_OPTS:-}
# Take script arguments
ARGS="${*}"

# EnableDynamicAgentLoading: async-profiler attaches to the running JVM; JEP 451 will otherwise disallow that by default
DEFAULT_JVM_FLAGS="--enable-native-access=ALL-UNNAMED -XX:+EnableDynamicAgentLoading"
if [ -n "$JVM_OPTS" ]; then
    CMD="java $DEFAULT_JVM_FLAGS $JVM_OPTS -jar app.jar --spring.profiles.active=docker $ARGS"
else
    CMD="java $DEFAULT_JVM_FLAGS -jar app.jar --spring.profiles.active=docker $ARGS"
fi
echo Running:
echo "$CMD"
# exec: java runs as PID 1, receives SIGTERM directly and is what `asprof ... 1` targets
exec $CMD
