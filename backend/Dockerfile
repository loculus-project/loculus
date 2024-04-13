# Build Stage
FROM eclipse-temurin:21-jdk as build

WORKDIR /app

# Copy gradle wrapper and configuration files
COPY gradlew gradle.properties build.gradle settings.gradle /app/
COPY gradle /app/gradle

# Load all project dependencies. This utilizes the Gradle Daemon to speed up initialization,
# which can be killed immediately after running to keep the container clean.
RUN ./gradlew --no-daemon dependencies \
    -x test \
    -x ktlintCheck \
    -x ktlintFormat \
    -x runKtlintCheckOverTestSourceSet \
    -x ktlintMainSourceSetCheck \
    -x runKtlintCheckOverTestSourceSet \
    -x check

# Copy the application source code
COPY src /app/src

# Build the application, excluding test execution to streamline build process in the Docker environment
RUN ./gradlew --no-daemon build \
    -x test \
    -x ktlintCheck \
    -x ktlintFormat \
    -x runKtlintCheckOverTestSourceSet \
    -x ktlintMainSourceSetCheck \
    -x runKtlintCheckOverTestSourceSet \
    -x check

# Run Stage
FROM eclipse-temurin:21-jre

WORKDIR /app

# Copy only the built artifact and necessary resources from the Build stage
COPY --from=build /app/build/libs/*.jar /app/spring-boot-application.jar

EXPOSE 8079

# CMD ["java", "-jar", "spring-boot-application.jar"]
ENTRYPOINT ["java", "-jar", "spring-boot-application.jar"]
