FROM eclipse-temurin:21-jdk-alpine@sha256:1ff763083f2993d57d0bf374ab10bb3e2cb873af6c13a04458ebbd3e0337dc76 AS build

WORKDIR /source
COPY . .
RUN --mount=type=cache,target=/root/.gradle \
    ./gradlew bootJar --no-daemon

FROM scratch AS artifact
COPY --from=build /source/build/libs/backend.jar /backend.jar
