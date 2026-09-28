# Keep the Java version in sync with the other Java versions (backend/build.gradle, CI workflows)
FROM eclipse-temurin:25-jre-alpine

# async-profiler, to profile a live backend: kubectl exec <pod> -- /opt/async-profiler/bin/asprof -e itimer -d 60 -f /tmp/profile.html 1
ARG TARGETARCH
ARG ASYNC_PROFILER_VERSION=4.1
RUN AP_ARCH=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) \
 && mkdir -p /opt/async-profiler \
 && wget -qO- "https://github.com/async-profiler/async-profiler/releases/download/v${ASYNC_PROFILER_VERSION}/async-profiler-${ASYNC_PROFILER_VERSION}-linux-${AP_ARCH}.tar.gz" \
    | tar -xz -C /opt/async-profiler --strip-components=1

WORKDIR /app

COPY build/libs/backend.jar app.jar
COPY entrypoint.sh entrypoint.sh
RUN chmod +x entrypoint.sh

EXPOSE 8079

ENTRYPOINT ["./entrypoint.sh"]
